import { pod as makePod } from './factory';
import { isReady } from './kubelet';
import { CHANGE_CAUSE_KEY, REVISION_HISTORY_KEY, REVISION_KEY } from './rollout';
import { syncIngresses } from './ingress';
import { bindClaims } from './storage';
import { reconcileWorkloads } from './workloads';
import type { ClusterState, Deployment, EventRecord, PersistentVolume, Pod, ReplicaSet } from './types';
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
    // ボリュームは書いた時だけ混ぜる（書かない設計図の世代の名前を変えない）
    ...(template.volumes === undefined ? [] : [template.volumes]),
  ]);
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  // 本物の形: 数を 10 進の字にし、1 字ずつ安全な字（SAFE）に置き換える（7c5ddbdf54 のような形）
  if (real) return [...String(hash)].map((d) => SAFE[d.charCodeAt(0) % SAFE.length] ?? 'b').join('');
  return hash.toString(36).slice(0, 6);
}

/**
 * 入れ替えの幅を数にする（本物の ResolveFenceposts）。割合は desired に掛け、増やす側は切り上げ・減らす側は切り捨て。
 * 両方が 0 になる時は、本物と同じく減らす側を 1 にする（入れ替えが進まなくならないように）
 */
export function fenceposts(d: Deployment): { surge: number; unavailable: number } {
  const of = (v: number | string, round: (n: number) => number): number =>
    typeof v === 'number' ? v : round((Number.parseInt(v, 10) * d.spec.replicas) / 100);
  const surge = of(d.spec.strategy.maxSurge, Math.ceil);
  const unavailable = of(d.spec.strategy.maxUnavailable, Math.floor);
  return surge === 0 && unavailable === 0 ? { surge, unavailable: 1 } : { surge, unavailable };
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
    const ownedBy = (rs: ReplicaSet): boolean =>
      rs.metadata.namespace === deployment.metadata.namespace &&
      rs.metadata.ownerReferences.some((o) => o.kind === 'Deployment' && o.name === deployment.metadata.name);
    const mine = (): ReplicaSet[] => [...replicaSets.values()].filter(ownedBy);
    const revisionOf = (rs: ReplicaSet): number => Number(rs.metadata.annotations[REVISION_KEY] ?? '0');
    const maxRevision = mine().reduce((max, rs) => Math.max(max, revisionOf(rs)), 0);
    const cause = deployment.metadata.annotations[CHANGE_CAUSE_KEY];

    const existing = replicaSets.get(rsId);
    if (existing === undefined) {
      // 世代番号は、その Deployment の既存 ReplicaSet の最大値 + 1
      const created: ReplicaSet = {
        kind: 'ReplicaSet',
        metadata: {
          name: rsName,
          namespace: deployment.metadata.namespace,
          labels: { ...deployment.spec.template.labels, 'pod-template-hash': hash },
          annotations: {
            [REVISION_KEY]: String(maxRevision + 1),
            // 本物は Deployment の注釈（change-cause）を写す。書いていなければ無い（履歴は <none>）。
            // 本物の形でないクラスタ（任務の練習場）は、読みやすさのためにイメージを書く
            ...(cause !== undefined ? { [CHANGE_CAUSE_KEY]: cause } : real ? {} : { [CHANGE_CAUSE_KEY]: `image ${deployment.spec.template.containers[0]?.image ?? ''}` }),
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
    } else if (revisionOf(existing) < maxRevision) {
      // 前の世代の ReplicaSet を使い直す（rollout undo・前と同じ設計図に戻した）。本物と同じく番号を最大 + 1 に付け替え、
      // 前の番号を revision-history に残す（履歴から前の番号は消える）
      const history = [existing.metadata.annotations[REVISION_HISTORY_KEY], String(revisionOf(existing))].filter((v) => v !== undefined && v !== '').join(',');
      replicaSets.set(rsId, {
        ...existing,
        metadata: {
          ...existing.metadata,
          annotations: {
            ...existing.metadata.annotations,
            ...(cause !== undefined ? { [CHANGE_CAUSE_KEY]: cause } : {}),
            [REVISION_KEY]: String(maxRevision + 1),
            [REVISION_HISTORY_KEY]: history,
          },
        },
      });
    }

    // 2. ローリングアップデート。本物の deployment controller と同じ手順で、新旧の ReplicaSet の数を決める（rolloutRolling）:
    //    新しい側は、全体が desired + maxSurge を超えない分だけ増やす。古い側は、Ready の数が desired - maxUnavailable を割らない分だけ減らす
    //    （先に、古い側の Ready でない Pod の分を減らす）。本物は数を変えるたびにすぐ次を計算するので、変わらなくなるまで繰り返す
    const desired = deployment.spec.replicas;
    const { surge, unavailable } = fenceposts(deployment);
    const readyOf = (rs: ReplicaSet): number => ownedPods({ ...state, pods }, rs).filter(isReady).length;
    const scale = (rs: ReplicaSet, to: number): void => {
      if (to === rs.spec.replicas) return;
      replicaSets.set(key(rs.metadata.namespace, rs.metadata.name), { ...rs, spec: { ...rs.spec, replicas: to } });
      if (real) events.push({
        tick, type: 'Normal', reason: 'ScalingReplicaSet', object: `deployment/${deployment.metadata.name}`,
        message: `Scaled ${to > rs.spec.replicas ? 'up' : 'down'} replica set ${rs.metadata.name} from ${String(rs.spec.replicas)} to ${String(to)}`,
      });
    };
    for (let pass = 0; pass < 8; pass += 1) {
      const before = JSON.stringify(mine().map((rs) => rs.spec.replicas));
      const current = replicaSets.get(rsId);
      if (current === undefined) break;
      // 古い側（数が 0 でない物。作った順）
      const olds = (): ReplicaSet[] => mine()
        .filter((rs) => rs.metadata.name !== rsName && rs.spec.replicas > 0)
        .sort((a, b) => a.metadata.createdAt - b.metadata.createdAt);
      const total = (): number => mine().reduce((n, rs) => n + rs.spec.replicas, 0);

      // 新しい側
      if (current.spec.replicas > desired) scale(current, desired);
      else if (current.spec.replicas < desired && total() < desired + surge) {
        scale(current, current.spec.replicas + Math.min(desired + surge - total(), desired - current.spec.replicas));
      }

      // 古い側
      if (olds().length > 0) {
        const fresh = replicaSets.get(rsId) ?? current;
        const minAvailable = desired - unavailable;
        let room = total() - minAvailable - (fresh.spec.replicas - readyOf(fresh));
        if (room > 0) {
          for (const rs of olds()) {
            const unhealthy = rs.spec.replicas - readyOf(rs);
            if (room <= 0 || unhealthy <= 0) continue;
            const down = Math.min(room, unhealthy);
            scale(rs, rs.spec.replicas - down);
            room -= down;
          }
          const available = mine().reduce((n, rs) => n + Math.min(rs.spec.replicas, readyOf(rs)), 0);
          let excess = available - minAvailable;
          for (const rs of olds()) {
            if (excess <= 0) break;
            const down = Math.min(rs.spec.replicas, excess);
            scale(rs, rs.spec.replicas - down);
            excess -= down;
          }
        }
      }
      if (JSON.stringify(mine().map((rs) => rs.spec.replicas)) === before) break;
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
          volumes: rs.spec.template.volumes,
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
    const status = { replicas: all.length, readyReplicas: all.filter(isReady).length, updatedReplicas: updated.length };
    // 進んだか（本物の DeploymentProgressing）: 設計図が変わった・新しい側が増えた・古い側が減った・Ready が増えた
    const prev = deployment.status;
    const progressed = prev.progress?.mark !== hash ||
      status.updatedReplicas > prev.updatedReplicas ||
      status.replicas - status.updatedReplicas < prev.replicas - prev.updatedReplicas ||
      status.readyReplicas > prev.readyReplicas;
    deployments.set(id, {
      ...deployment,
      status: { ...status, progress: progressed || prev.progress === undefined ? { tick, mark: hash } : prev.progress },
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

/**
 * 知らせをためる。本物と同じく、同じ物・同じ理由・同じ文の繰り返しは 1 つにまとめ（回数と最初の時刻を持ち、最後に起きた所へ動かす）、
 * 新しい物から 200 まで残す。確かめの失敗が続いても、前の知らせ（入れ替えの Scaled up など）が押し出されない
 */
export function compactEvents(list: readonly EventRecord[]): EventRecord[] {
  const merged = new Map<string, EventRecord>();
  for (const e of list) {
    const k = [e.object, e.type, e.reason, e.message].join('|');
    const prev = merged.get(k);
    if (prev !== undefined) merged.delete(k);
    merged.set(k, prev === undefined ? e : { ...e, count: (prev.count ?? 1) + (e.count ?? 1), first: prev.first ?? prev.tick });
  }
  return [...merged.values()].slice(-200);
}

/** 1 tick 進める（PV 束ね → コントローラ → kubelet の順） */
export function advanceCluster(state: ClusterState, tickPods: (s: ClusterState) => {
  pods: Map<string, Pod>;
  events: EventRecord[];
  ipCounter: number;
  persistentVolumes?: Map<string, PersistentVolume>;
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
  const entry = syncIngresses(reconciled.state);
  return {
    ...reconciled.state,
    ingresses: entry.ingresses,
    tick: state.tick + 1,
    pods: ticked.pods,
    ipCounter: ticked.ipCounter,
    persistentVolumes: ticked.persistentVolumes ?? reconciled.state.persistentVolumes,
    events: compactEvents([
      ...state.events,
      ...bound.events,
      ...workloads.events,
      ...reconciled.events,
      ...ticked.events,
      ...entry.events,
    ]),
  };
}
