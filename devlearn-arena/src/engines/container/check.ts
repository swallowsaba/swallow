import { filesInside, findContainer, normalizeRef, type ContainerHost } from './container';
import { readTables, TABLES_FILE } from './pg';

/**
 * 実戦の達成条件 `{ kind: 'container', expr }`（docs/content-spec.md 2.4）を、コンテナの模型の状態で判定する。純粋な関数。
 *
 * expr は空白で区切った条件を並べる（全てを満たせば達成）。先頭の `!` で否定:
 *   image:名前:タグ（手元にある。タグを省けば最新のタグ）/ running:名前・exited:名前（コンテナの状態）/ exists:名前（コンテナがある）/
 *   volume:名前（名前付きボリュームがある）/ mount:コンテナ=つなぐ物:中の場所 / rows:コンテナ/表=数（DB の表の行の数）/
 *   made:名前>=数・made:名前=数（その名前でコンテナを作った回数）
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
    case 'volume':
      return host.volumes?.some((v) => v.name === arg) === true;
    case 'mount': {
      // mount:コンテナ=つなぐ物:中の場所（中の場所を省けば、どこにつないでいてもよい）
      const m = /^([^=]+)=([^:]+)(?::(.+))?$/.exec(arg);
      if (!m) throw new Error(`コンテナの条件「${term}」は知らない形`);
      const trim = (p: string): string => p.replace(/(.)\/+$/, '$1');
      return findContainer(host, m[1] ?? '')?.volumes.some((v) => v.host === m[2] && (m[3] === undefined || trim(v.container) === trim(m[3]))) === true;
    }
    case 'rows': {
      // rows:コンテナ/表=数（DB のコンテナのデータを書く場所にある表の行の数）
      const m = /^([^/]+)\/(\w+)=(\d+)$/.exec(arg);
      if (!m) throw new Error(`コンテナの条件「${term}」は知らない形`);
      const c = findContainer(host, m[1] ?? '');
      const pg = host.images.find((i) => i.ref === c?.image)?.pg;
      if (!c || !pg) return false;
      return readTables(filesInside(host, c)[`${pg.dataDir}/${TABLES_FILE}`])[m[2] ?? '']?.rows.length === Number(m[3]);
    }
    case 'made': {
      // made:名前>=数（その名前でコンテナを作った回数。作り直したことを確かめる）
      const m = /^([^>=]+)(>=|=)(\d+)$/.exec(arg);
      if (!m) throw new Error(`コンテナの条件「${term}」は知らない形`);
      const n = host.made?.[m[1] ?? ''] ?? 0;
      return m[2] === '>=' ? n >= Number(m[3]) : n === Number(m[3]);
    }
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
