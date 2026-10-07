import { advanceCluster } from '@/engines/k8s/controllers';
import { meta } from '@/engines/k8s/factory';
import { isReady, tickPods } from '@/engines/k8s/kubelet';
import { podCpu, podMemory, SCRAPE } from '@/engines/k8s/metrics';
import type { ClusterState, HorizontalPodAutoscaler, Pod } from '@/engines/k8s/types';
import { key } from '@/engines/k8s/types';
import type { CommandResult } from '../registry';
import { HPA_HEAD, hpaRow } from './kubectlGet';
import { targetOf } from './kubectlSet';
import { listOf, matchesSelector, notFound, table, type KubectlContext } from './kubectlShared';

/** 数の欄（--min=2）。書かなければ fallback、数でなければ NaN */
function intValue(ctx: KubectlContext, name: string, fallback: number): number {
  const raw = ctx.values.get(name);
  return raw === undefined ? fallback : /^-?\d+$/.test(raw) ? Number(raw) : Number.NaN;
}

/**
 * kubectl autoscale deployment web --cpu-percent=50 --min=2 --max=10。
 * 本物と同じく、Deployment と同じ名前の HPA を作る。--cpu-percent を書かなければ目標は既定の 80%、--min は 1
 */
export function autoscale(ctx: KubectlContext): CommandResult {
  const { cluster, namespace } = ctx;
  const ref = targetOf(ctx.operands, 0);
  if (ref.name === '') return { stderr: 'error: required resource not specified\n', code: 1 };
  const max = intValue(ctx, 'max', -1);
  const min = intValue(ctx, 'min', 1);
  const percent = intValue(ctx, 'cpu-percent', 80);
  if (Number.isNaN(max) || Number.isNaN(min) || Number.isNaN(percent)) {
    return { stderr: 'error: invalid argument for --min, --max or --cpu-percent: must be a number\n', code: 1 };
  }
  if (max < 1) return { stderr: `error: --max=MAXPODS is required and must be at least 1, max: ${String(max)}\n`, code: 1 };
  if (max < min) return { stderr: `error: --max=MAXPODS must be larger or equal to --min=MINPODS, max: ${String(max)}, min: ${String(min)}\n`, code: 1 };
  if (ref.kind !== 'deployments') return { stderr: `error: cannot autoscale a ${ref.kind === '' ? ctx.operands[0] ?? '' : ref.kind}: only Deployments can be autoscaled here\n`, code: 1 };
  if (!cluster.deployments.has(key(namespace, ref.name))) return notFound('deployments.apps', ref.name);
  const name = ctx.values.get('name') ?? ref.name;
  const id = key(namespace, name);
  if (cluster.autoscalers.has(id)) {
    return { stderr: `Error from server (AlreadyExists): horizontalpodautoscalers.autoscaling "${name}" already exists\n`, code: 1 };
  }
  const hpa: HorizontalPodAutoscaler = {
    kind: 'HorizontalPodAutoscaler',
    metadata: meta(name, { namespace, createdAt: cluster.tick }),
    spec: { targetKind: 'Deployment', targetName: ref.name, minReplicas: min, maxReplicas: max, targetCpuPercent: percent },
    status: { currentCpuPercent: null, currentReplicas: 0, desiredReplicas: 0 },
  };
  const autoscalers = new Map(cluster.autoscalers);
  autoscalers.set(id, hpa);
  return { stdout: `horizontalpodautoscaler.autoscaling/${name} autoscaled\n`, patch: { cluster: { ...cluster, autoscalers } } };
}

/** HPA と対象の Pod が落ち着いていないか（数を合わせる途中・縮める前の様子見・動き出す途中の Pod がある） */
function settling(c: ClusterState, hpas: readonly HorizontalPodAutoscaler[], namespace: string): boolean {
  const starting = [...c.pods.values()].some((p) => p.metadata.namespace === namespace && (p.status.phase === 'ContainerCreating' || (p.status.phase === 'Pending' && p.status.nodeName !== null && p.status.containerStatuses.every((s) => s.waitingReason === null))));
  if (starting) return true;
  return hpas.some((h) => {
    const target = c.deployments.get(key(h.metadata.namespace, h.spec.targetName));
    if (target === undefined) return false;
    const ready = [...c.pods.values()].filter((p) => p.metadata.namespace === h.metadata.namespace && isReady(p) && Object.entries(target.spec.selector).every(([k, v]) => p.metadata.labels[k] === v)).length;
    const last = h.status.recommendations?.[h.status.recommendations.length - 1];
    return ready !== target.spec.replicas || (last !== undefined && last.replicas < target.spec.replicas);
  });
}

/** get hpa -w: 欄（AGE 以外）が変わるたびに 1 行足す（本物は Ctrl-C まで続く。模擬は落ち着いたら終える） */
export function watchHpa(cluster: ClusterState, namespace: string, name: string | undefined): { stdout: string; cluster: ClusterState } {
  const pick = (c: ClusterState): HorizontalPodAutoscaler[] => (listOf(c, 'horizontalpodautoscalers', namespace) as HorizontalPodAutoscaler[]).filter((h) => name === undefined || h.metadata.name === name);
  const seen = new Map<string, string>();
  const rows: string[][] = [[...HPA_HEAD]];
  const note = (c: ClusterState): boolean => {
    let changed = false;
    for (const h of pick(c)) {
      const row = hpaRow(c, h);
      const state = row.slice(0, -1).join(' ');
      if (seen.get(h.metadata.name) === state) continue;
      seen.set(h.metadata.name, state);
      rows.push(row);
      changed = true;
    }
    return changed;
  };
  note(cluster);
  let next = cluster;
  // 2 回分の計算（31 秒）変わらず、落ち着いていれば終える。縮める前の様子見（5 分）を待てるよう、420 秒まで
  for (let i = 0, quiet = 0; i < 420 && quiet <= 2 * SCRAPE; i += 1) {
    next = advanceCluster(next, tickPods);
    quiet = note(next) || settling(next, pick(next), namespace) ? 0 : quiet + 1;
  }
  return { stdout: table(rows), cluster: next };
}

/** kubectl top pods（metrics-server が測った使用量）。本物と同じく、まだ一度も測っていない Pod は出さない */
export function top(ctx: KubectlContext): CommandResult {
  const { cluster, namespace, operands, values } = ctx;
  const what = operands[0] ?? '';
  if (!['pods', 'pod', 'po'].includes(what)) return { stderr: 'この練習の模擬では、kubectl top pods だけを扱う\n', code: 1 };
  const name = operands[1];
  const selector = values.get('l');
  const pods = (listOf(cluster, 'pods', namespace) as Pod[])
    .filter((p) => (name === undefined || p.metadata.name === name) && (selector === undefined || matchesSelector(p.metadata.labels, selector)));
  if (name !== undefined && pods.length === 0) return notFound('pods', name);
  if (pods.length === 0) return { stdout: `No resources found in ${namespace} namespace.\n` };
  const rows = pods.flatMap((p) => {
    const cpu = podCpu(cluster, p);
    const memory = podMemory(cluster, p);
    return cpu === null || memory === null ? [] : [[p.metadata.name, `${String(cpu)}m`, `${String(memory)}Mi`]];
  });
  if (rows.length === 0) {
    return name === undefined
      ? { stderr: 'error: metrics not available yet\n', code: 1 }
      : { stderr: `Error from server (NotFound): podmetrics.metrics.k8s.io "${namespace}/${name}" not found\n`, code: 1 };
  }
  return { stdout: table([['NAME', 'CPU(cores)', 'MEMORY(bytes)'], ...rows]) };
}
