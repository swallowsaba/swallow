import { diffLines } from '@/engines/kernel/diff';

/**
 * 3-way マージ。共通祖先を基準に、双方の変更を突き合わせる。
 * 同じ行を双方が別の内容に変えていたら衝突として印を書き込む。
 */
export interface MergeResult {
  content: string;
  conflicted: boolean;
}

type Op = { kind: 'equal' | 'insert' | 'delete'; line: string };

/** base から side への変更を、行番号の対応として取り出す */
function changeMap(base: readonly string[], side: readonly string[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  let baseIndex = 0;
  let pending: string[] = [];

  for (const op of diffLines(base, side) as Op[]) {
    if (op.kind === 'equal') {
      if (pending.length > 0) {
        map.set(baseIndex, [...(map.get(baseIndex) ?? []), ...pending]);
        pending = [];
      }
      baseIndex += 1;
      continue;
    }
    if (op.kind === 'delete') {
      map.set(baseIndex, map.get(baseIndex) ?? []);
      baseIndex += 1;
      continue;
    }
    pending.push(op.line);
  }
  if (pending.length > 0) map.set(baseIndex, [...(map.get(baseIndex) ?? []), ...pending]);
  return map;
}

function sameArray(a: readonly string[] | undefined, b: readonly string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

export function mergeThreeWay(
  baseText: string,
  oursText: string,
  theirsText: string,
  labels: { ours: string; theirs: string } = { ours: 'HEAD', theirs: 'branch' },
): MergeResult {
  if (oursText === theirsText) return { content: oursText, conflicted: false };
  if (baseText === oursText) return { content: theirsText, conflicted: false };
  if (baseText === theirsText) return { content: oursText, conflicted: false };

  const base = baseText.split('\n');
  const ours = changeMap(base, oursText.split('\n'));
  const theirs = changeMap(base, theirsText.split('\n'));

  const out: string[] = [];
  let conflicted = false;

  for (let i = 0; i <= base.length; i += 1) {
    const a = ours.get(i);
    const b = theirs.get(i);
    const touchedByOurs = ours.has(i);
    const touchedByTheirs = theirs.has(i);

    if (touchedByOurs && touchedByTheirs && !sameArray(a, b)) {
      conflicted = true;
      out.push(`<<<<<<< ${labels.ours}`);
      out.push(...(a ?? []));
      out.push('=======');
      out.push(...(b ?? []));
      out.push(`>>>>>>> ${labels.theirs}`);
      continue;
    }
    if (touchedByOurs) {
      out.push(...(a ?? []));
      continue;
    }
    if (touchedByTheirs) {
      out.push(...(b ?? []));
      continue;
    }
    const line = base[i];
    if (line !== undefined) out.push(line);
  }

  return { content: out.join('\n'), conflicted };
}
