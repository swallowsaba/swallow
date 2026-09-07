import { parseCommit, serializeCommit, type Signature } from './objects';
import { resolveRef } from './refs';
import { materialize, replayCommit, writeTreeFromIndex } from './repository';
import type { GitState, IndexEntry } from './types';

/**
 * rebase -i の todo。
 *
 * 本物と同じく「1行1コミット、上から順に適用する台本」として扱う。
 * 行を消せばコミットが消え、並べ替えれば順番が変わり、squash なら前の行と1つになる。
 * 出力を作り置きせず、この台本を実際に上から実行して履歴を組み直す。
 */
export type TodoAction = 'pick' | 'reword' | 'edit' | 'squash' | 'fixup' | 'drop';

export const TODO_ACTIONS: readonly TodoAction[] = [
  'pick', 'reword', 'edit', 'squash', 'fixup', 'drop',
];

const SHORTHAND: Record<string, TodoAction> = {
  p: 'pick', r: 'reword', e: 'edit', s: 'squash', f: 'fixup', d: 'drop',
};

export interface TodoLine {
  action: TodoAction;
  ref: string;
  message: string;
}

export const TODO_HELP = [
  '',
  '# 上から順に実行されます。行を消せばそのコミットは消えます。',
  '# p, pick   = そのまま使う',
  '# r, reword = 使うがメッセージを書き換える（この行のメッセージが使われる）',
  '# e, edit   = ここで一旦止まる',
  '# s, squash = 直前のコミットに混ぜる（メッセージは両方残る）',
  '# f, fixup  = 直前のコミットに混ぜる（メッセージは捨てる）',
  '# d, drop   = 捨てる',
  '',
].join('\n');

export function buildTodo(lines: readonly TodoLine[]): string {
  const body = lines.map((l) => `${l.action} ${l.ref} ${l.message}`).join('\n');
  return `${body}\n${TODO_HELP}`;
}

export function parseTodo(text: string): TodoLine[] {
  const out: TodoLine[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const parts = line.split(/\s+/);
    const head = parts[0] ?? '';
    const action = TODO_ACTIONS.includes(head as TodoAction)
      ? (head as TodoAction)
      : SHORTHAND[head];
    const ref = parts[1];
    if (action === undefined || ref === undefined) continue;
    out.push({ action, ref, message: parts.slice(2).join(' ') });
  }
  return out;
}

export interface TodoRun {
  git: GitState;
  tip: string;
  conflicts: string[];
  /** edit で止まったときの、残りの台本 */
  remaining: TodoLine[];
  /** 止まった理由。最後まで走ったら null */
  stopped: 'edit' | 'conflict' | null;
  /** 実際に積んだコミットの数 */
  applied: number;
}

/** tip のコミットを、内容はそのままに親とメッセージだけ差し替えて作り直す */
function recommit(
  git: GitState,
  tip: string,
  parent: string,
  message: string,
  now: number,
): { git: GitState; hash: string } {
  const files = materialize(git, tip);
  const index = new Map<string, IndexEntry>();
  for (const [path, content] of files) {
    index.set(path, {
      path,
      mode: '100644',
      hash: git.objects.write('blob', new TextEncoder().encode(content)),
    });
  }
  const staged: GitState = { ...git, index };
  const tree = writeTreeFromIndex(staged);
  const signature: Signature = { ...git.author, timestamp: now };
  const hash = git.objects.write(
    'commit',
    serializeCommit({
      tree,
      parents: [parent],
      author: signature,
      committer: signature,
      message,
    }),
  );
  return { git: staged, hash };
}

function messageOf(git: GitState, hash: string): string {
  const object = git.objects.read(hash);
  return object && object.type === 'commit' ? parseCommit(object.body).message.trim() : '';
}

function firstParent(git: GitState, hash: string): string | null {
  const object = git.objects.read(hash);
  if (!object || object.type !== 'commit') return null;
  return parseCommit(object.body).parents[0] ?? null;
}

/** 台本を onto の上で上から実行する */
export function runTodo(
  git: GitState,
  onto: string,
  todo: readonly TodoLine[],
  now: number,
): TodoRun {
  let state = git;
  let tip = onto;
  let applied = 0;
  const conflicts: string[] = [];

  for (let i = 0; i < todo.length; i += 1) {
    const line = todo[i];
    if (line === undefined) continue;
    if (line.action === 'drop') continue;

    // 参照は台本を作った時点の状態で解く（実行中は HEAD が動くため）
    const target = resolveRef(git, line.ref);
    if (target === undefined) {
      return {
        git: state, tip, conflicts: [`不明なコミット: ${line.ref}`],
        remaining: todo.slice(i), stopped: 'conflict', applied,
      };
    }

    const replayed = replayCommit(state, target, tip, now);
    state = replayed.git;
    conflicts.push(...replayed.conflicts);

    if (line.action === 'squash' || line.action === 'fixup') {
      const parent = firstParent(state, tip);
      if (parent === null) {
        // 直前が無いなら混ぜられないので、そのまま積む
        tip = replayed.hash;
        applied += 1;
      } else {
        const combined = line.action === 'squash'
          ? `${messageOf(state, tip)}\n\n${messageOf(state, target)}`
          : messageOf(state, tip);
        const merged = recommit(state, replayed.hash, parent, combined, now);
        state = merged.git;
        tip = merged.hash;
      }
    } else if (line.action === 'reword' && line.message !== '') {
      const parent = firstParent(state, replayed.hash) ?? tip;
      const reworded = recommit(state, replayed.hash, parent, line.message, now);
      state = reworded.git;
      tip = reworded.hash;
      applied += 1;
    } else {
      tip = replayed.hash;
      applied += 1;
    }

    if (line.action === 'edit') {
      return { git: state, tip, conflicts, remaining: todo.slice(i + 1), stopped: 'edit', applied };
    }
  }

  return { git: state, tip, conflicts, remaining: [], stopped: null, applied };
}
