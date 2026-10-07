import { isReady } from './kubelet';
import { measured, podCpu, sampledAt, SCRAPE } from './metrics';
import type { ClusterState, Deployment, EventRecord, HorizontalPodAutoscaler, HpaCondition, Pod } from './types';
import { key } from './types';

/**
 * HPA（horizontal-pod-autoscaler）。本物の計算の仕方に寄せる:
 * - 15 秒ごとに、対象の Pod の CPU の使用量の合計を、要求（requests）の合計で割った割合を目標と比べ、
 *   必要な数 = ceil(今の数 × 割合 / 目標)。差が 1 割以内なら変えない
 * - 要求を書いていないコンテナがあれば計算できない（missing request for cpu）。TARGETS は <unknown>
 * - 動き出したばかり・Ready でない Pod の値は使わない。増やす向きの時は、その Pod を 0% と数える
 * - 増やすのは 1 回に「今の 2 倍」か「今より 4 つ多い」の大きい方まで。減らす時は、過去 5 分の計算の一番大きい数を使う
 * - 数は min と max の間に収める
 */

/** 本物の既定（--horizontal-pod-autoscaler-tolerance・cpu-initialization-period・縮める前に見る時間） */
const TOLERANCE = 0.1;
const CPU_INIT_PERIOD = 300;
const DOWN_WINDOW = 300;

const METRIC = 'cpu resource utilization (percentage of request)';

type Computed =
  | { ok: true; replicas: number; utilization: number; average: number }
  | { ok: false; error: string };

function selects(selector: Readonly<Record<string, string>>, labels: Readonly<Record<string, string>>): boolean {
  const entries = Object.entries(selector);
  return entries.length > 0 && entries.every(([k, v]) => labels[k] === v);
}

/** 本物の GetResourceReplicas。今の数と、測った値から必要な数を出す */
function computeReplicas(state: ClusterState, target: Deployment, current: number, percent: number): Computed {
  const pods = [...state.pods.values()]
    .filter((p) => p.metadata.namespace === target.metadata.namespace && selects(target.spec.selector, p.metadata.labels))
    .filter((p) => p.status.phase !== 'Succeeded' && p.status.phase !== 'Failed')
    .sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1));
  if (!pods.some((p) => measured(state, p))) return { ok: false, error: 'unable to get metrics for resource cpu: no metrics returned from resource metrics API' };
  if (pods.length === 0) return { ok: false, error: 'no pods returned by selector while calculating replica count' };

  const sample = sampledAt(state.tick);
  const ready: Pod[] = [];
  const unready: Pod[] = [];
  for (const p of pods) {
    // 置き場所を待つ・作っている途中の Pod は数えない
    if (p.status.phase !== 'Running') continue;
    const fresh = p.status.startedAt !== null && state.tick - p.status.startedAt < CPU_INIT_PERIOD;
    const settled = isReady(p) && p.status.readySince !== undefined && sample >= p.status.readySince + SCRAPE;
    if (!measured(state, p) || (fresh ? !settled : !isReady(p))) unready.push(p);
    else ready.push(p);
  }
  for (const p of pods) {
    const missing = p.spec.containers.find((c) => c.requests.cpu === 0);
    if (missing !== undefined) return { ok: false, error: `missing request for cpu in container ${missing.name} of Pod ${p.metadata.name}` };
  }
  if (ready.length === 0) return { ok: false, error: 'did not receive metrics for targeted pods (pods might be unready)' };

  const request = (p: Pod): number => p.spec.containers.reduce((a, c) => a + c.requests.cpu, 0);
  const ratioOf = (counted: readonly { use: number; request: number }[]): { utilization: number; ratio: number } => {
    const use = counted.reduce((a, c) => a + c.use, 0);
    const req = counted.reduce((a, c) => a + c.request, 0);
    const utilization = Math.trunc((use * 100) / req);
    return { utilization, ratio: utilization / percent };
  };
  const samples = ready.map((p) => ({ use: podCpu(state, p) ?? 0, request: request(p) }));
  const first = ratioOf(samples);
  const average = Math.trunc(samples.reduce((a, c) => a + c.use, 0) / samples.length);
  const result = (replicas: number): Computed => ({ ok: true, replicas, utilization: first.utilization, average });
  const upWithUnready = unready.length > 0 && first.ratio > 1;
  if (!upWithUnready) {
    if (Math.abs(1 - first.ratio) <= TOLERANCE) return result(current);
    return result(Math.ceil(first.ratio * ready.length));
  }
  // 増やす向きで、まだ値を使えない Pod がある時は、その Pod を 0% と数えてもう一度比べる
  const all = [...samples, ...unready.map((p) => ({ use: 0, request: request(p) }))];
  const again = ratioOf(all);
  if (Math.abs(1 - again.ratio) <= TOLERANCE || again.ratio < 1) return result(current);
  const replicas = Math.ceil(again.ratio * all.length);
  return result(replicas < current ? current : replicas);
}

function condition(type: HpaCondition['type'], status: HpaCondition['status'], reason: string, message: string): HpaCondition {
  return { type, status, reason, message };
}

/** 1 つの HPA を 15 秒ごとに見て、対象の Deployment の数を変える */
function syncOne(state: ClusterState, tick: number, hpa: HorizontalPodAutoscaler, deployments: Map<string, Deployment>, events: EventRecord[]): HorizontalPodAutoscaler {
  const object = `horizontalpodautoscaler/${hpa.metadata.name}`;
  const note = (type: 'Normal' | 'Warning', reason: string, message: string): void => {
    events.push({ tick, type, reason, object, message });
  };
  const targetId = key(hpa.metadata.namespace, hpa.spec.targetName);
  const target = deployments.get(targetId);
  if (target === undefined) {
    const message = `deployments/scale.apps "${hpa.spec.targetName}" not found`;
    note('Warning', 'FailedGetScale', message);
    return {
      ...hpa,
      status: {
        ...hpa.status, lastSync: tick, currentCpuPercent: null, currentCpuAverage: null,
        conditions: [condition('AbleToScale', 'False', 'FailedGetScale', `the HPA controller was unable to get the target's current scale: ${message}`)],
      },
    };
  }
  const current = target.spec.replicas;
  const { minReplicas: min, maxReplicas: max } = hpa.spec;
  const able = condition('AbleToScale', 'True', 'SucceededGetScale', "the HPA controller was able to get the target's current scale");
  const history = (hpa.status.recommendations ?? []).filter((r) => r.tick > tick - DOWN_WINDOW);

  let desired: number;
  let reason: string;
  let conditions: HpaCondition[];
  let utilization: number | null = hpa.status.currentCpuPercent;
  let average: number | null = hpa.status.currentCpuAverage ?? null;
  if (current === 0 && min !== 0) {
    return {
      ...hpa,
      status: {
        ...hpa.status, lastSync: tick, currentReplicas: 0, desiredReplicas: 0,
        conditions: [able, condition('ScalingActive', 'False', 'ScalingDisabled', 'scaling is disabled since the replica count of the target is zero')],
      },
    };
  } else if (current > max) {
    desired = max;
    reason = 'Current number of replicas above Spec.MaxReplicas';
    conditions = [able];
  } else if (current < min) {
    desired = min;
    reason = 'Current number of replicas below Spec.MinReplicas';
    conditions = [able];
  } else {
    const computed = computeReplicas(state, target, current, hpa.spec.targetCpuPercent);
    if (!computed.ok) {
      const error = `failed to get cpu utilization: ${computed.error}`;
      note('Warning', 'FailedGetResourceMetric', error);
      note('Warning', 'FailedComputeMetricsReplicas', `invalid metrics (1 invalid out of 1), first error is: failed to get cpu resource metric value: ${error}`);
      return {
        ...hpa,
        status: {
          ...hpa.status, lastSync: tick, currentReplicas: current, currentCpuPercent: null, currentCpuAverage: null,
          conditions: [able, condition('ScalingActive', 'False', 'FailedGetResourceMetric', `the HPA was unable to compute the replica count: ${error}`)],
        },
      };
    }
    utilization = computed.utilization;
    average = computed.average;
    const proposal = computed.replicas;
    history.push({ tick, replicas: proposal });
    // 減らす時は、過去 5 分の計算の一番大きい数まで（増やす時は、今の計算そのまま）
    const stabilized = proposal < current ? Math.min(current, Math.max(...history.map((r) => r.replicas))) : proposal;
    conditions = [
      stabilized !== proposal
        ? condition('AbleToScale', 'True', 'ScaleDownStabilized', 'recent recommendations were higher than current one, applying the highest recent recommendation')
        : condition('AbleToScale', 'True', 'ReadyForNewScale', 'recommended size matches current size'),
      condition('ScalingActive', 'True', 'ValidMetricFound', `the HPA was able to successfully calculate a replica count from ${METRIC}`),
    ];
    // 増やせる速さ（本物の既定: 15 秒に 2 倍か 4 つ）と、min・max
    const upLimit = Math.max(current * 2, current + 4);
    const highest = Math.min(max, upLimit);
    if (stabilized > highest) {
      desired = highest;
      conditions.push(highest === max
        ? condition('ScalingLimited', 'True', 'TooManyReplicas', 'the desired replica count is more than the maximum replica count')
        : condition('ScalingLimited', 'True', 'ScaleUpLimit', 'the desired replica count is increasing faster than the maximum scale rate'));
    } else if (stabilized < min) {
      desired = min;
      conditions.push(condition('ScalingLimited', 'True', 'TooFewReplicas', 'the desired replica count is less than the minimum replica count'));
    } else {
      desired = stabilized;
      conditions.push(condition('ScalingLimited', 'False', 'DesiredWithinRange', 'the desired count is within the acceptable range'));
    }
    reason = desired > current ? `${METRIC} above target` : 'All metrics below target';
  }

  if (desired !== current) {
    deployments.set(targetId, {
      ...target,
      spec: { ...target.spec, replicas: desired },
      metadata: { ...target.metadata, resourceVersion: target.metadata.resourceVersion + 1 },
    });
    note('Normal', 'SuccessfulRescale', `New size: ${String(desired)}; reason: ${reason}`);
    conditions = conditions.map((c) => (c.type === 'AbleToScale' ? condition('AbleToScale', 'True', 'SucceededRescale', `the HPA controller was able to update the target scale to ${String(desired)}`) : c));
  }
  return {
    ...hpa,
    status: {
      ...hpa.status, lastSync: tick, currentReplicas: current, desiredReplicas: desired,
      currentCpuPercent: utilization, currentCpuAverage: average, recommendations: history, conditions,
    },
  };
}

/** 任務の練習場（kubectl load で負荷を与える）の、これまでの簡単な計算。毎 tick、負荷と目標の比で数を変える */
function legacyOne(state: ClusterState, tick: number, hpa: HorizontalPodAutoscaler, deployments: Map<string, Deployment>, events: EventRecord[]): HorizontalPodAutoscaler {
  const targetId = key(hpa.metadata.namespace, hpa.spec.targetName);
  const target = deployments.get(targetId);
  if (target === undefined) return hpa;
  const current = state.load.get(targetId) ?? 0;
  const ratio = hpa.spec.targetCpuPercent === 0 ? 1 : current / hpa.spec.targetCpuPercent;
  const desired = Math.min(hpa.spec.maxReplicas, Math.max(hpa.spec.minReplicas, Math.ceil(target.spec.replicas * ratio)));
  if (desired !== target.spec.replicas) {
    deployments.set(targetId, { ...target, spec: { ...target.spec, replicas: desired } });
    events.push({
      tick, type: 'Normal', reason: 'SuccessfulRescale',
      object: `horizontalpodautoscaler/${hpa.metadata.name}`,
      message: `New size: ${String(desired)}; reason: cpu resource utilization above target`,
    });
  }
  return { ...hpa, status: { ...hpa.status, currentCpuPercent: current, currentReplicas: target.spec.replicas, desiredReplicas: desired } };
}

/** 全ての HPA を進める（workloads の 5 段目）。deployments と events を書き換える */
export function reconcileAutoscalers(
  state: ClusterState,
  tick: number,
  autoscalers: Map<string, HorizontalPodAutoscaler>,
  deployments: Map<string, Deployment>,
  events: EventRecord[],
): void {
  for (const [id, hpa] of autoscalers) {
    const targetId = key(hpa.metadata.namespace, hpa.spec.targetName);
    if (state.load.has(targetId)) {
      autoscalers.set(id, legacyOne(state, tick, hpa, deployments, events));
      continue;
    }
    // 本物と同じく 15 秒ごと（作った直後は、すぐに 1 度見る）
    if (hpa.status.lastSync !== undefined && tick - hpa.status.lastSync < SCRAPE) continue;
    autoscalers.set(id, syncOne(state, tick, hpa, deployments, events));
  }
}
