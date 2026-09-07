import { pod as makePod } from './factory';
import { isReady } from './kubelet';
import type { ClusterState, Deployment, EventRecord, Pod, ReplicaSet } from './types';
import { key } from './types';

/** ラベルがセレクタを満たすか */
export function matches(labels: Record<string, string>, selector: Record<string, string>): boolean {
  const entries = Object.entries(selector);
  if (entries.length === 0) return false;
  return entries.every(([k, v]) => labels[k] === v);
}

/** テンプレートの内容から、その世代を表す短い識別子を作る（乱数を使わない） */
export function templateHash(template: Deployment['spec']['template']): string {
  const text = JSON.stringify([
    template.labels,
    template.containers.map((c) => [c.image, c.requests, c.env, c.ports]),
    template.nodeSelector,
  ]);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return hash.toString(36).slice(0, 6);
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

  // 1. Deployment → ReplicaSet
  for (const deployment of [...deployments.values()]) {
    const hash = templateHash(deployment.spec.template);
    const rsName = `${deployment.metadata.name}-${hash}`;
    const rsId = key(deployment.metadata.namespace, rsName);

    const mine = [...replicaSets.values()].filter((rs) =>
      rs.metadata.ownerReferences.some(
        (o) => o.kind === 'Deployment' && o.name === deployment.metadata.name,
      ),
    );

    if (!replicaSets.has(rsId)) {
      const created: ReplicaSet = {
        kind: 'ReplicaSet',
        metadata: {
          name: rsName,
          namespace: deployment.metadata.namespace,
          labels: { ...deployment.spec.template.labels, 'pod-template-hash': hash },
          annotations: {},
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
      events.push({
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
    const olds = mine.filter((rs) => rs.metadata.name !== rsName && rs.spec.replicas > 0);

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
      if (newReplicas < desired && newReplicas + oldReplicas < totalAllowed) {
        newReplicas += 1;
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
        const name = `${rs.metadata.name}-${nameCounter.toString(36).padStart(5, '0')}`;
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
      rs.metadata.ownerReferences.some(
        (o) => o.kind === 'Deployment' && o.name === deployment.metadata.name,
      ),
    );
    const all = mine.flatMap((rs) => ownedPods({ ...state, pods }, rs));
    const hash = templateHash(deployment.spec.template);
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

/** 1 tick 進める（reconcile → kubelet の順） */
export function advanceCluster(state: ClusterState, tickPods: (s: ClusterState) => {
  pods: Map<string, Pod>;
  events: EventRecord[];
  ipCounter: number;
}): ClusterState {
  const reconciled = reconcile(state);
  const ticked = tickPods(reconciled.state);
  return {
    ...reconciled.state,
    tick: state.tick + 1,
    pods: ticked.pods,
    ipCounter: ticked.ipCounter,
    events: [...state.events, ...reconciled.events, ...ticked.events].slice(-200),
  };
}
