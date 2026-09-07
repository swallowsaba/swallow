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

/**
 * base から side への変更を「base の何行目が何に置き換わるか」に直す。
 *
 * 連続する delete / insert をひとかたまり（hunk）として扱う。
 * 1行ずつ見ると、削除した行の位置と挿入した行の位置がずれ、
 * 後続の行を巻き込んで消してしまうため。
 */
function changeMap(base: readonly string[], side: readonly string[]): Map<number, string[]> {
  const ops = diffLines(base, side) as Op[];
  const map = new Map<number, string[]>();
  let baseIndex = 0;
  let cursor = 0;

  while (cursor < ops.length) {
    const op = ops[cursor];
    if (op === undefined) break;
    if (op.kind === 'equal') {
      baseIndex += 1;
      cursor += 1;
      continue;
    }

    const start = baseIndex;
    const removed: number[] = [];
    const added: string[] = [];
    while (cursor < ops.length) {
      const current = ops[cursor];
      if (current === undefined || current.kind === 'equal') break;
      if (current.kind === 'delete') {
        removed.push(baseIndex);
        baseIndex += 1;
      } else {
        added.push(current.line);
      }
      cursor += 1;
    }

    if (removed.length === 0) {
      // 純粋な挿入。base[start] の手前に入るので、その行ごと置き換える形にする
      const kept = base[start];
      map.set(start, kept === undefined ? added : [...added, kept]);
    } else {
      map.set(start, added);
      for (const index of removed.slice(1)) map.set(index, []);
    }
  }
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
