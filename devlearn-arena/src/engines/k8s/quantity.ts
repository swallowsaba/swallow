/**
 * Kubernetes の数量（resources の cpu・memory）を本物と同じく読み書きする。
 * 模擬の中では CPU を m（1000m = 1 コア）、メモリを Mi（2^20 バイト）で持つ。0 は「書いていない」
 */

/** 10 進の接尾（k・M・G・T）と 2 進の接尾（Ki・Mi・Gi・Ti）の倍率（バイト） */
const SUFFIX: Readonly<Record<string, number>> = {
  '': 1, k: 1e3, M: 1e6, G: 1e9, T: 1e12, Ki: 2 ** 10, Mi: 2 ** 20, Gi: 2 ** 30, Ti: 2 ** 40, m: 1e-3,
};

/** 数と接尾に分ける（`200m` → 200, 'm'）。読めなければ null */
function split(value: unknown): { n: number; suffix: string } | null {
  if (typeof value === 'number') return Number.isFinite(value) ? { n: value, suffix: '' } : null;
  if (typeof value !== 'string') return null;
  const m = /^\s*(\d+(?:\.\d+)?|\.\d+)\s*(Ki|Mi|Gi|Ti|k|M|G|T|m)?\s*$/.exec(value);
  if (m === null) return null;
  const suffix = m[2] ?? '';
  return SUFFIX[suffix] === undefined ? null : { n: Number(m[1]), suffix };
}

/** CPU の数量を m で読む（`200m` → 200、`0.5` → 500、`1` → 1000）。書いていない・読めなければ 0 */
export function cpuMillis(value: unknown): number {
  const q = split(value);
  if (q === null) return 0;
  return Math.round((q.suffix === 'm' ? q.n : q.n * (SUFFIX[q.suffix] ?? 1) * 1000) * 1000) / 1000;
}

/** メモリの数量を Mi で読む（`256Mi` → 256、`1Gi` → 1024、`512M` → 488.28…）。書いていない・読めなければ 0 */
export function memoryMi(value: unknown): number {
  const q = split(value);
  if (q === null) return 0;
  return (q.n * (SUFFIX[q.suffix] ?? 1)) / 2 ** 20;
}

/** CPU を本物の書き方で（1 コアちょうどの倍数は `1`、それ以外は `250m`） */
export function formatCpu(millis: number): string {
  return millis % 1000 === 0 ? String(millis / 1000) : `${String(Math.round(millis))}m`;
}

/** メモリを本物の書き方で（Gi ちょうどは `1Gi`、Mi ちょうどは `256Mi`、それ以外はバイト数） */
export function formatMemory(mi: number): string {
  if (mi % 1024 === 0) return `${String(mi / 1024)}Gi`;
  if (Number.isInteger(mi)) return `${String(mi)}Mi`;
  return String(Math.round(mi * 2 ** 20));
}

/**
 * Pod の QoS の種類（本物と同じ決め方）。要求も上限も書かなければ BestEffort、
 * 全てのコンテナが CPU とメモリの上限を持ち、要求が上限と同じなら Guaranteed、それ以外は Burstable
 */
export function qosClass(pod: { spec: { containers: readonly { requests: { cpu: number; memory: number }; limits: { cpu: number; memory: number } | null }[] } }): string {
  const cs = pod.spec.containers;
  const none = cs.every((c) => c.requests.cpu === 0 && c.requests.memory === 0 && (c.limits === null || (c.limits.cpu === 0 && c.limits.memory === 0)));
  if (none) return 'BestEffort';
  const guaranteed = cs.every((c) => c.limits !== null && c.limits.cpu !== 0 && c.limits.memory !== 0 && c.requests.cpu === c.limits.cpu && c.requests.memory === c.limits.memory);
  return guaranteed ? 'Guaranteed' : 'Burstable';
}
