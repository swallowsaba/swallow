import { fromRegistry, normalizeRef } from '@/engines/container/container';
import { isReady } from './kubelet';
import { appMemory } from './apps';
import type { ClusterState, Pod } from './types';
import { key } from './types';

/**
 * Pod の使用量（metrics-server が集める物。kubectl top と HPA が読む）。
 * 本物と同じく 15 秒ごとに測り、動き出してから一度も測っていない Pod には値が無い。
 * CPU の仕事は、負荷を掛ける道具（イメージの sends）が頼みを送る Service の、Ready の Pod に等しく分かれる
 */

/** metrics-server が測る間隔（秒 = tick） */
export const SCRAPE = 15;

/** 何もしていないコンテナの CPU（m） */
const IDLE_CPU = 1;

/** 最後に測った時刻 */
export function sampledAt(tick: number): number {
  return tick - (tick % SCRAPE);
}

/** 道具が指す URL（http://web・http://web:80・http://web.default.svc.cluster.local）の Service の鍵 */
function serviceOfUrl(url: string, namespace: string): string | null {
  const m = /^https?:\/\/([a-z0-9-]+)(?:\.([a-z0-9-]+))?[^/]*/.exec(url);
  if (m === null) return null;
  return key(m[2] ?? namespace, m[1] ?? '');
}

/** Service ごとに掛かっている CPU の仕事（m） */
function demands(state: ClusterState): Map<string, number> {
  const out = new Map<string, number>();
  for (const pod of state.pods.values()) {
    if (!isReady(pod)) continue;
    for (const [i, spec] of pod.spec.containers.entries()) {
      const sends = fromRegistry(normalizeRef(spec.image))?.sends;
      if (sends === undefined) continue;
      const url = pod.status.containerStatuses[i]?.env?.[sends.env] ?? spec.env[sends.env] ?? '';
      const svc = serviceOfUrl(url, pod.metadata.namespace);
      if (svc !== null && state.services.has(svc)) out.set(svc, (out.get(svc) ?? 0) + sends.millicores);
    }
  }
  return out;
}

function selects(selector: Readonly<Record<string, string>>, labels: Readonly<Record<string, string>>): boolean {
  const entries = Object.entries(selector);
  return entries.length > 0 && entries.every(([k, v]) => labels[k] === v);
}

/** 測った値があるか（動いていて、動き出してから一度は測った） */
export function measured(state: ClusterState, pod: Pod): boolean {
  return pod.status.phase === 'Running' && pod.status.containerStatuses.some((c) => c.started) && pod.status.startedAt !== null && sampledAt(state.tick) - pod.status.startedAt >= SCRAPE;
}

/** Pod の CPU の使用量（m）。まだ測っていなければ null。CPU の上限があれば、そこで頭打ち（止めずに絞られる） */
export function podCpu(state: ClusterState, pod: Pod): number | null {
  if (!measured(state, pod)) return null;
  let use = IDLE_CPU * pod.spec.containers.length;
  if (isReady(pod)) {
    const load = demands(state);
    for (const svc of state.services.values()) {
      if (svc.metadata.namespace !== pod.metadata.namespace || !selects(svc.spec.selector, pod.metadata.labels)) continue;
      const work = load.get(key(svc.metadata.namespace, svc.metadata.name)) ?? 0;
      if (work === 0) continue;
      const endpoints = [...state.pods.values()].filter((p) => p.metadata.namespace === pod.metadata.namespace && isReady(p) && selects(svc.spec.selector, p.metadata.labels)).length;
      use += work / Math.max(1, endpoints);
    }
  }
  const caps = pod.spec.containers.map((c) => c.limits?.cpu ?? 0);
  if (caps.every((c) => c > 0)) use = Math.min(use, caps.reduce((a, b) => a + b, 0));
  return Math.round(use);
}

/** Pod のメモリの使用量（Mi。アプリが使う量の合計）。まだ測っていなければ null */
export function podMemory(state: ClusterState, pod: Pod): number | null {
  if (!measured(state, pod)) return null;
  return Math.round(pod.spec.containers.reduce((sum, c) => sum + appMemory(c), 0));
}
