import { findContainer, normalizeRef, type ContainerHost } from './container';

/**
 * 実戦の達成条件 `{ kind: 'container', expr }`（docs/content-spec.md 2.4）を、コンテナの模型の状態で判定する。純粋な関数。
 *
 * expr は空白で区切った条件を並べる（全てを満たせば達成）。先頭の `!` で否定:
 *   image:名前:タグ（手元にある。タグを省けば最新のタグ）/ running:名前・exited:名前（コンテナの状態）/ exists:名前（コンテナがある）
 */

function termHolds(host: ContainerHost, term: string): boolean {
  const colon = term.indexOf(':');
  const kind = colon < 0 ? term : term.slice(0, colon);
  const arg = colon < 0 ? '' : term.slice(colon + 1);
  if (arg === '') throw new Error(`コンテナの条件「${term}」は知らない形`);
  switch (kind) {
    case 'image': {
      const ref = normalizeRef(arg);
      return host.images.some((i) => i.ref === ref);
    }
    case 'running':
      return findContainer(host, arg)?.state === 'running';
    case 'exited':
      return findContainer(host, arg)?.state === 'exited';
    case 'exists':
      return findContainer(host, arg) !== undefined;
    default:
      throw new Error(`コンテナの条件「${term}」は知らない形`);
  }
}

export function containerHolds(host: ContainerHost | null, expr: string): boolean {
  const terms = expr.trim().split(/\s+/).filter(Boolean);
  // 知らない形は、機械に Docker が無くても内容の誤りとして投げる
  const results = terms.map((t) => (t.startsWith('!') ? { neg: true, term: t.slice(1) } : { neg: false, term: t }));
  if (!host) {
    for (const r of results) termHolds({ images: [], containers: [], seq: 0 }, r.term);
    return false;
  }
  return results.every((r) => termHolds(host, r.term) !== r.neg);
}
