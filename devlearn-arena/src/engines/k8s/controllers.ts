import { pod as makePod } from './factory';
import { isReady } from './kubelet';
import { CHANGE_CAUSE_KEY, REVISION_KEY } from './rollout';
import { bindClaims } from './storage';
import { reconcileWorkloads } from './workloads';
import type { ClusterState, Deployment, EventRecord, Pod, ReplicaSet } from './types';
import { key } from './types';

/** ラベルがセレクタを満たすか */
export function matches(labels: Record<string, string>, selector: Record<string, string>): boolean {
  const entries = Object.entries(selector);
  if (entries.length === 0) return false;
  return entries.every(([k, v]) => labels[k] === v);
}

/**
 * テンプレートの内容から、その世代を表す短い識別子を作る（乱数を使わない）。
 *
 * テンプレートのどこか1つでも変われば別の世代になる、というのが本物の約束。
 * 拾い漏らすと「設定を変えたのに古い Pod のまま」という嘘の挙動になるので、
 * 効き目のある欄は並び順を固定して全て混ぜる。
 */
export function templateHash(template: Deployment['spec']['template'], real = false): string {
  const text = JSON.stringify([
    template.labels,
    template.containers.map((c) => [
      c.name, c.image, c.requests, c.limits, c.env, c.envFrom, c.ports,
      c.readyAfter, c.failing, c.crashing,
      c.livenessProbe, c.readinessProbe, c.startupProbe, c.volumeMounts,
    ]),
    template.nodeSelector,
  ]);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  // 本物の形: 数を 10 進の字にし、1 字ずつ安全な字（SAFE）に置き換える（7c5ddbdf54 のような形）
  if (real) return [...String(hash)].map((d) => SAFE[d.charCodeAt(0) % SAFE.length] ?? 'b').join('');
  return hash.toString(36).slice(0, 6);
}

/** 本物の Kubernetes が名前の印に使う字（読み違えやすい母音・0・1・3 を除いた 27 字） */
const SAFE = 'bcdfghjklmnpqrstvwxz2456789';

/** Service の住所（10.96.0.0/12 の中。名前から決める。kube-dns の 10.96.0.10 などの決まった住所は避ける） */
function clusterIPFor(id: string): string {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  return `10.${String(96 + (h % 16))}.${String((h >>> 4) % 256)}.${String(((h >>> 12) % 250) + 2)}`;
}

/** 本物の形の名前を使うクラスタか（クラスタを操作する機械。窓口の住所を持つ） */
export const realNames = (state: ClusterState): boolean => state.server !== undefined;

/** ReplicaSet が作る Pod の名前の後ろの 5 字。本物は乱数。模擬は名前と通し番号から決める（同じ操作から同じ名前） */
function podSuffix(rsName: string, counter: number): string {
  let h = 2166136261;
  for (const c of `${rsName}#${String(counter)}`) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  let out = '';
  for (let i = 0; i < 5; i += 1) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    out += SAFE[h % SAFE.length] ?? 'b';
  }
  return out;
}

function ownedPods(state: ClusterState, rs: ReplicaSet): Pod[] {
  return [...state.pods.values()]
    .filter(
      (p) =>
        p.metadata.namespace === rs.metadata.namespace &&
        p.metadata.ownerReferences.some((o) => o.kind === 'ReplicaSet' && o.name === rs.metadata.name),
    )
    .sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1));
}

export interface ReconcileResult {
  state: ClusterState;
  events: EventRecord[];
}

/**
 * 宣言的ループ。
 * 望ましい状態（spec）と現状の差を、コントローラが tick ごとに埋める。
 * 「Pod を消すと作り直される」は、ここで特別扱いせずとも自然に起きる。
 */
export function reconcile(state: ClusterState): ReconcileResult {
  const events: EventRecord[] = [];
  let pods = new Map(state.pods);
  let replicaSets = new Map(state.replicaSets);
  const deployments = new Map(state.deployments);
  const services = new Map(state.services);
  let nameCounter = state.nameCounter;
  const tick = state.tick;

  const real = realNames(state);

  // 1. Deployment → ReplicaSet
  for (const deployment of [...deployments.values()]) {
    const hash = templateHash(deployment.spec.template, real);
    const rsName = `${deployment.metadata.name}-${hash}`;
    const rsId = key(deployment.metadata.namespace, rsName);

    const mine = [...replicaSets.values()].filter((rs) =>
      rs.metadata.namespace === deployment.metadata.namespace &&
      rs.metadata.ownerReferences.some(
        (o) => o.kind === 'Deployment' && o.name === deployment.metadata.name,
      ),
    );

    if (!replicaSets.has(rsId)) {
      // 世代番号は、その Deployment の既存 ReplicaSet の最大値 + 1
      const revision =
        mine.reduce((max, rs) => Math.max(max, Number(rs.metadata.annotations[REVISION_KEY] ?? '0')), 0) + 1;
      const created: ReplicaSet = {
        kind: 'ReplicaSet',
        metadata: {
          name: rsName,
          namespace: deployment.metadata.namespace,
          labels: { ...deployment.spec.template.labels, 'pod-template-hash': hash },
          annotations: {
            [REVISION_KEY]: String(revision),
            [CHANGE_CAUSE_KEY]:
              deployment.metadata.annotations[CHANGE_CAUSE_KEY] ??
              `image ${deployment.spec.template.containers[0]?.image ?? ''}`,
          },
          resourceVersion: 1,
          createdAt: tick,
          ownerReferences: [{ kind: 'Deployment', name: deployment.metadata.name }],
        },
        spec: {
          replicas: 0,
          selector: { ...deployment.spec.selector, 'pod-template-hash': hash },
          template: {
            ...deployment.spec.template,
            labels: { ...deployment.spec.template.labels, 'pod-template-hash': hash },
          },
        },
        status: { replicas: 0, readyReplicas: 0 },
      };
      replicaSets.set(rsId, created);
      // 本物の Deployment は「作った」とは知らせず、数を合わせた時に知らせる（下の Scaled up）
      if (!real) events.push({
        tick,
        type: 'Normal',
        reason: 'ScalingReplicaSet',
        object: `deployment/${deployment.metadata.name}`,
        message: `Created new replica set ${rsName}`,
      });
    }

    // 2. ローリングアップデート。maxSurge / maxUnavailable を守って新旧を入れ替える
    const desired = deployment.spec.replicas;
    const { maxSurge, maxUnavailable } = deployment.spec.strategy;
    const current = replicaSets.get(rsId);
    // 古い側の、動けていない（Ready でない）Pod の分は先に縮める（本物の cleanupUnhealthyReplicas）。
    // 止まった入れ替え（設定の誤り）を直して送り直した時、止まった世代の Pod が枠を塞がない
    for (const rs of mine) {
      if (rs.metadata.name === rsName || rs.spec.replicas === 0) continue;
      const unready = ownedPods({ ...state, pods }, rs).filter((p) => !isReady(p)).length;
      if (unready === 0) continue;
      const to = Math.max(0, rs.spec.replicas - unready);
      replicaSets.set(key(rs.metadata.namespace, rs.metadata.name), { ...rs, spec: { ...rs.spec, replicas: to } });
      if (real) events.push({
        tick, type: 'Normal', reason: 'ScalingReplicaSet', object: `deployment/${deployment.metadata.name}`,
        message: `Scaled down replica set ${rs.metadata.name} from ${String(rs.spec.replicas)} to ${String(to)}`,
      });
    }
    const olds = mine
      .map((rs) => replicaSets.get(key(rs.metadata.namespace, rs.metadata.name)) ?? rs)
      .filter((rs) => rs.metadata.name !== rsName && rs.spec.replicas > 0);

    if (current) {
      const oldReplicas = olds.reduce((n, rs) => n + rs.spec.replicas, 0);
      const readyNew = ownedPods({ ...state, pods }, current).filter(isReady).length;
      const readyOld = olds.reduce(
        (n, rs) => n + ownedPods({ ...state, pods }, rs).filter(isReady).length,
        0,
      );

      const totalAllowed = desired + maxSurge;
      const minAvailable = Math.max(0, desired - maxUnavailable);

      // 新しい側を、上限を超えない範囲で増やす
      let newReplicas = current.spec.replicas;
      if (real && oldReplicas === 0 && newReplicas !== desired) {
        // 入れ替える古い側が無ければ、本物と同じく一度にあるべき数にする
        events.push({
          tick, type: 'Normal', reason: 'ScalingReplicaSet', object: `deployment/${deployment.metadata.name}`,
          message: `Scaled ${newReplicas < desired ? 'up' : 'down'} replica set ${rsName} from ${String(newReplicas)} to ${String(desired)}`,
        });
        newReplicas = desired;
      } else if (newReplicas < desired && newReplicas + oldReplicas < totalAllowed) {
        newReplicas += 1;
      } else if (newReplicas > desired) {
        // replicas を減らされたときは、新しい側も 1 tick ずつ目標まで縮める
        newReplicas -= 1;
      }
      replicaSets.set(rsId, { ...current, spec: { ...current.spec, replicas: newReplicas } });

      // 新しい側が十分揃ってから、古い側を減らす
      if (oldReplicas > 0 && readyNew + readyOld - 1 >= minAvailable && readyNew > 0) {
        const victim = olds[0];
        if (victim) {
          const victimId = key(victim.metadata.namespace, victim.metadata.name);
          replicaSets.set(victimId, {
            ...victim,
            spec: { ...victim.spec, replicas: victim.spec.replicas - 1 },
          });
        }
      }
    }
  }

  // 3. ReplicaSet → Pod（数を合わせる）
  for (const [rsId, rs] of replicaSets) {
    const mine = ownedPods({ ...state, pods }, rs);
    const diff = rs.spec.replicas - mine.length;

    if (diff > 0) {
      for (let i = 0; i < diff; i += 1) {
        nameCounter += 1;
        const name = `${rs.metadata.name}-${real ? podSuffix(rs.metadata.name, nameCounter) : nameCounter.toString(36).padStart(5, '0')}`;
        const created = makePod(name, rs.spec.template.containers, {
          namespace: rs.metadata.namespace,
          labels: rs.spec.template.labels,
          nodeSelector: rs.spec.template.nodeSelector,
          owner: { kind: 'ReplicaSet', name: rs.metadata.name },
          createdAt: tick,
        });
        pods.set(key(created.metadata.namespace, created.metadata.name), created);
        events.push({
          tick,
          type: 'Normal',
          reason: 'SuccessfulCreate',
          object: `replicaset/${rs.metadata.name}`,
          message: `Created pod: ${name}`,
        });
      }
    } else if (diff < 0) {
      // 新しいものから削る（本物は削除コストで選ぶが、決定論を優先する）
      for (const victim of mine.slice(diff)) {
        pods.delete(key(victim.metadata.namespace, victim.metadata.name));
        events.push({
          tick,
          type: 'Normal',
          reason: 'SuccessfulDelete',
          object: `replicaset/${rs.metadata.name}`,
          message: `Deleted pod: ${victim.metadata.name}`,
        });
      }
    }

    const after = ownedPods({ ...state, pods }, rs);
    replicaSets.set(rsId, {
      ...rs,
      status: { replicas: after.length, readyReplicas: after.filter(isReady).length },
    });
  }

  // 使われなくなった ReplicaSet は残す（rollout undo のため）が、status は更新する
  replicaSets = new Map(replicaSets);

  // 4. Deployment の status
  for (const [id, deployment] of deployments) {
    const mine = [...replicaSets.values()].filter((rs) =>
      rs.metadata.namespace === deployment.metadata.namespace &&
      rs.metadata.ownerReferences.some(
        (o) => o.kind === 'Deployment' && o.name === deployment.metadata.name,
      ),
    );
    const all = mine.flatMap((rs) => ownedPods({ ...state, pods }, rs));
    const hash = templateHash(deployment.spec.template, real);
    const updated = mine
      .filter((rs) => rs.metadata.labels['pod-template-hash'] === hash)
      .flatMap((rs) => ownedPods({ ...state, pods }, rs));
    deployments.set(id, {
      ...deployment,
      status: {
        replicas: all.length,
        readyReplicas: all.filter(isReady).length,
        updatedReplicas: updated.length,
      },
    });
  }

  // 5. Service → Endpoints（Ready な Pod だけが載る）
  for (const [id, service] of services) {
    // 本物の形の名前を使うクラスタでは、Service ごとに住所（ClusterIP）を配る（10.96.0.1 は窓口の kubernetes の物）
    if (real && service.spec.clusterIP === '10.96.0.1' && id !== 'default/kubernetes') {
      services.set(id, { ...service, spec: { ...service.spec, clusterIP: clusterIPFor(id) } });
    }
  }
  for (const [id, service] of services) {
    // セレクタの無い Service（kubernetes など）は、宛先を手で持つ（本物と同じく、係は触らない）
    if (Object.keys(service.spec.selector).length === 0) continue;
    const endpoints = [...pods.values()]
      .filter(
        (p) =>
          p.metadata.namespace === service.metadata.namespace &&
          matches(p.metadata.labels, service.spec.selector) &&
          isReady(p),
      )
      .map((p) => p.status.podIP)
      .filter((ip): ip is string => ip !== null)
      .sort();
    services.set(id, { ...service, status: { endpoints } });
  }

  pods = new Map(pods);
  return {
    state: { ...state, pods, replicaSets, deployments, services, nameCounter },
    events,
  };
}

/** 1 tick 進める（PV 束ね → コントローラ → kubelet の順） */
export function advanceCluster(state: ClusterState, tickPods: (s: ClusterState) => {
  pods: Map<string, Pod>;
  events: EventRecord[];
  ipCounter: number;
}): ClusterState {
  const bound = bindClaims(state);
  const withStorage: ClusterState = {
    ...state,
    persistentVolumes: bound.persistentVolumes,
    persistentVolumeClaims: bound.persistentVolumeClaims,
    nameCounter: bound.nameCounter,
  };

  const workloads = reconcileWorkloads(withStorage);
  const withWorkloads: ClusterState = {
    ...withStorage,
    pods: workloads.pods,
    statefulSets: workloads.statefulSets,
    daemonSets: workloads.daemonSets,
    jobs: workloads.jobs,
    cronJobs: workloads.cronJobs,
    persistentVolumeClaims: workloads.persistentVolumeClaims,
    autoscalers: workloads.autoscalers,
    deployments: workloads.deployments,
    nameCounter: workloads.nameCounter,
  };

  const reconciled = reconcile(withWorkloads);
  const ticked = tickPods(reconciled.state);
  return {
    ...reconciled.state,
    tick: state.tick + 1,
    pods: ticked.pods,
    ipCounter: ticked.ipCounter,
    events: [
      ...state.events,
      ...bound.events,
      ...workloads.events,
      ...reconciled.events,
      ...ticked.events,
    ].slice(-200),
  };
}
