import { meta, pod as makePod } from './factory';
import { isReady } from './kubelet';
import type {
  ClusterState, CronJob, DaemonSet, EventRecord, HorizontalPodAutoscaler, Job,
  PersistentVolumeClaim, Pod, PodTemplate, StatefulSet,
} from './types';
import { key } from './types';

export interface WorkloadResult {
  pods: Map<string, Pod>;
  statefulSets: Map<string, StatefulSet>;
  daemonSets: Map<string, DaemonSet>;
  jobs: Map<string, Job>;
  cronJobs: Map<string, CronJob>;
  persistentVolumeClaims: Map<string, PersistentVolumeClaim>;
  autoscalers: Map<string, HorizontalPodAutoscaler>;
  deployments: ClusterState['deployments'];
  events: EventRecord[];
  nameCounter: number;
}

function ownedBy(pods: Map<string, Pod>, kind: string, name: string, namespace: string): Pod[] {
  return [...pods.values()]
    .filter(
      (p) =>
        p.metadata.namespace === namespace &&
        p.metadata.ownerReferences.some((o) => o.kind === kind && o.name === name),
    )
    .sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1));
}

function spawn(
  template: PodTemplate,
  name: string,
  namespace: string,
  owner: { kind: string; name: string },
  tick: number,
  extra: { volumes?: Pod['spec']['volumes'] } = {},
): Pod {
  return makePod(name, template.containers, {
    namespace,
    labels: template.labels,
    nodeSelector: template.nodeSelector,
    owner,
    createdAt: tick,
    volumes: extra.volumes,
  });
}

/**
 * Deployment 以外のワークロードを1 tick ぶん進める。
 *
 * どれも「望ましい姿と現状の差を埋める」という同じ形をしている。
 * 違うのは何を数えるか（StatefulSet は順番、DaemonSet はノード、Job は完了数）だけ。
 */
export function reconcileWorkloads(state: ClusterState): WorkloadResult {
  const pods = new Map(state.pods);
  const statefulSets = new Map(state.statefulSets);
  const daemonSets = new Map(state.daemonSets);
  const jobs = new Map(state.jobs);
  const cronJobs = new Map(state.cronJobs);
  const claims = new Map(state.persistentVolumeClaims);
  const autoscalers = new Map(state.autoscalers);
  const deployments = new Map(state.deployments);
  const events: EventRecord[] = [];
  let nameCounter = state.nameCounter;
  const tick = state.tick;

  // 1. StatefulSet。名前は 0 から連番、増やすときは前が Ready になってから
  for (const [id, set] of statefulSets) {
    const namespace = set.metadata.namespace;
    const mine = ownedBy(pods, 'StatefulSet', set.metadata.name, namespace);
    const byIndex = new Map(mine.map((p) => [p.metadata.name, p]));

    for (let i = 0; i < set.spec.replicas; i += 1) {
      const name = `${set.metadata.name}-${String(i)}`;
      if (byIndex.has(name)) continue;
      // 前の番号が Ready になるまで次を作らない（順序保証）
      const previous = i === 0 ? null : byIndex.get(`${set.metadata.name}-${String(i - 1)}`);
      if (i > 0 && (previous === undefined || previous === null || !isReady(previous))) break;

      const volumes: Pod['spec']['volumes'] = [];
      for (const template of set.spec.volumeClaimTemplates) {
        const claimName = `${template.name}-${name}`;
        const claimId = key(namespace, claimName);
        if (!claims.has(claimId)) {
          claims.set(claimId, {
            kind: 'PersistentVolumeClaim',
            metadata: meta(claimName, { namespace, createdAt: tick }),
            spec: {
              requestGi: template.requestGi,
              accessModes: ['ReadWriteOnce'],
              storageClassName: template.storageClassName,
            },
            status: { phase: 'Pending', volumeName: null, message: null },
          });
        }
        volumes.push({ name: template.name, kind: 'persistentVolumeClaim', claimName });
      }

      const created = spawn(set.spec.template, name, namespace, { kind: 'StatefulSet', name: set.metadata.name }, tick, { volumes });
      pods.set(key(namespace, name), created);
      events.push({
        tick, type: 'Normal', reason: 'SuccessfulCreate',
        object: `statefulset/${set.metadata.name}`,
        message: `create Pod ${name} in StatefulSet ${set.metadata.name} successful`,
      });
      break;
    }

    // 減らすときは番号の大きい方から
    for (const p of mine) {
      const index = Number(p.metadata.name.slice(set.metadata.name.length + 1));
      if (Number.isFinite(index) && index >= set.spec.replicas) {
        pods.delete(key(namespace, p.metadata.name));
      }
    }

    const after = ownedBy(pods, 'StatefulSet', set.metadata.name, namespace);
    statefulSets.set(id, {
      ...set,
      status: { replicas: after.length, readyReplicas: after.filter(isReady).length },
    });
  }

  // 2. DaemonSet。対象になるノード1台につき Pod 1つ
  for (const [id, set] of daemonSets) {
    const namespace = set.metadata.namespace;
    const targets = [...state.nodes.values()]
      .filter((n) =>
        Object.entries(set.spec.nodeSelector).every(([k, v]) => n.metadata.labels[k] === v),
      )
      .sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1));

    const mine = ownedBy(pods, 'DaemonSet', set.metadata.name, namespace);
    const covered = new Set(mine.map((p) => p.status.nodeName));

    for (const node of targets) {
      if (covered.has(node.metadata.name)) continue;
      const name = `${set.metadata.name}-${node.metadata.name}`;
      if (pods.has(key(namespace, name))) continue;
      const created = spawn(set.spec.template, name, namespace, { kind: 'DaemonSet', name: set.metadata.name }, tick);
      // DaemonSet はノードを指定して置く
      pods.set(key(namespace, name), {
        ...created,
        spec: { ...created.spec, nodeSelector: { 'kubernetes.io/hostname': node.metadata.name } },
      });
      events.push({
        tick, type: 'Normal', reason: 'SuccessfulCreate',
        object: `daemonset/${set.metadata.name}`,
        message: `Created pod: ${name}`,
      });
    }

    // 対象から外れたノードの Pod は消す
    const wanted = new Set(targets.map((n) => n.metadata.name));
    for (const p of mine) {
      const on = p.status.nodeName;
      if (on !== null && !wanted.has(on)) pods.delete(key(namespace, p.metadata.name));
    }

    const after = ownedBy(pods, 'DaemonSet', set.metadata.name, namespace);
    daemonSets.set(id, {
      ...set,
      status: { desiredNumberScheduled: targets.length, numberReady: after.filter(isReady).length },
    });
  }

  // 3. Job。parallelism ぶん同時に走らせ、completions に届いたら終わり
  for (const [id, job] of jobs) {
    const namespace = job.metadata.namespace;
    const mine = ownedBy(pods, 'Job', job.metadata.name, namespace);
    const succeeded = mine.filter((p) => p.status.phase === 'Succeeded').length;
    const failed = mine.filter((p) => p.status.phase === 'Failed').length;
    const active = mine.filter((p) => p.status.phase !== 'Succeeded' && p.status.phase !== 'Failed').length;

    const completed = succeeded >= job.spec.completions;
    const givenUp = failed > job.spec.backoffLimit;

    if (!completed && !givenUp) {
      const remaining = job.spec.completions - succeeded - active;
      const room = Math.min(job.spec.parallelism - active, remaining);
      for (let i = 0; i < room; i += 1) {
        nameCounter += 1;
        const name = `${job.metadata.name}-${nameCounter.toString(36).padStart(5, '0')}`;
        const created = spawn(job.spec.template, name, namespace, { kind: 'Job', name: job.metadata.name }, tick);
        // Job の Pod は完了したら終わる。再起動しない
        pods.set(key(namespace, name), {
          ...created,
          spec: { ...created.spec, restartPolicy: 'OnFailure' },
        });
        events.push({
          tick, type: 'Normal', reason: 'SuccessfulCreate',
          object: `job/${job.metadata.name}`,
          message: `Created pod: ${name}`,
        });
      }
    }

    if (completed && job.status.completed === false) {
      events.push({
        tick, type: 'Normal', reason: 'Completed',
        object: `job/${job.metadata.name}`,
        message: 'Job completed',
      });
    }
    jobs.set(id, { ...job, status: { active, succeeded, failed, completed } });
  }

  // 4. CronJob。周期が来たら Job を1つ作る
  for (const [id, cron] of cronJobs) {
    if (cron.spec.suspend) continue;
    const last = cron.status.lastScheduleTick;
    const due = last === null ? tick >= cron.spec.everyTicks : tick - last >= cron.spec.everyTicks;
    if (!due) continue;

    const namespace = cron.metadata.namespace;
    const running = [...jobs.values()].some(
      (j) =>
        j.metadata.namespace === namespace &&
        j.metadata.ownerReferences.some((o) => o.kind === 'CronJob' && o.name === cron.metadata.name) &&
        !j.status.completed,
    );
    if (running && cron.spec.concurrencyPolicy === 'Forbid') {
      events.push({
        tick, type: 'Warning', reason: 'JobAlreadyActive',
        object: `cronjob/${cron.metadata.name}`,
        message: 'Not starting job because prior execution is running and concurrency policy is Forbid',
      });
      cronJobs.set(id, { ...cron, status: { ...cron.status, lastScheduleTick: tick } });
      continue;
    }

    const count = cron.status.createdCount + 1;
    const name = `${cron.metadata.name}-${String(count)}`;
    jobs.set(key(namespace, name), {
      kind: 'Job',
      metadata: meta(name, {
        namespace,
        createdAt: tick,
        ownerReferences: [{ kind: 'CronJob', name: cron.metadata.name }],
      }),
      spec: cron.spec.jobTemplate,
      status: { active: 0, succeeded: 0, failed: 0, completed: false },
    });
    events.push({
      tick, type: 'Normal', reason: 'SuccessfulCreate',
      object: `cronjob/${cron.metadata.name}`,
      message: `Created job ${name}`,
    });
    cronJobs.set(id, { ...cron, status: { lastScheduleTick: tick, createdCount: count } });
  }

  // 5. HPA。観測した負荷と目標の比から必要な数を出し、Deployment の replicas を動かす
  for (const [id, hpa] of autoscalers) {
    const targetId = key(hpa.metadata.namespace, hpa.spec.targetName);
    const target = deployments.get(targetId);
    if (target === undefined) continue;
    const current = state.load.get(targetId) ?? 0;
    const ratio = hpa.spec.targetCpuPercent === 0 ? 1 : current / hpa.spec.targetCpuPercent;
    const desired = Math.min(
      hpa.spec.maxReplicas,
      Math.max(hpa.spec.minReplicas, Math.ceil(target.spec.replicas * ratio)),
    );
    autoscalers.set(id, {
      ...hpa,
      status: { currentCpuPercent: current, desiredReplicas: desired },
    });
    if (desired !== target.spec.replicas) {
      deployments.set(targetId, { ...target, spec: { ...target.spec, replicas: desired } });
      events.push({
        tick, type: 'Normal', reason: 'SuccessfulRescale',
        object: `horizontalpodautoscaler/${hpa.metadata.name}`,
        message: `New size: ${String(desired)}; reason: cpu resource utilization above target`,
      });
    }
  }

  return {
    pods, statefulSets, daemonSets, jobs, cronJobs,
    persistentVolumeClaims: claims, autoscalers, deployments, events, nameCounter,
  };
}
