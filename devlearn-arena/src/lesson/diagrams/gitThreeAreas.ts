import { headCommit, log, status, treeFiles } from '@/engines/git/repository';
import type { GitState } from '@/engines/git/types';
import { applyCommand, boot, unknownMove, type Playground, type Sim } from './sim';

/**
 * `git-three-areas`: 作業ツリー → インデックス → コミット。
 *
 * ファイルの札を右の台へ運ぶと、本物の `git add` / `git commit` が走る。
 * 各台に何が載っているかは `git status` と同じ計算（`status`）から読む。
 */

const HOME = '/home/learner';
export const FILES = ['app.txt', 'notes.txt'] as const;
const MESSAGE = '変更を記録';

export type Area = 'worktree' | 'index' | 'commit';

export interface GitThreeAreasView {
  /** 札ごとに、いまどの台にいるか。変更が無ければ commit */
  cards: { path: string; area: Area; change: 'added' | 'modified' | 'deleted' | 'new' | null }[];
  /** 撮った写真（コミット）の数 */
  commits: number;
  /** 直近のコミットのメッセージ */
  last: string | null;
}

function gitOf(sim: Sim): GitState {
  const git = sim.session.state.git;
  if (git === null) throw new Error('図解のリポジトリがありません');
  return git;
}

function start(): Sim {
  return boot(
    { files: { [HOME]: null, [`${HOME}/app.txt`]: '1 行目\n' }, cwd: HOME },
    [
      'git init',
      'git add app.txt',
      'git commit -m "はじめの写真"',
      // 写真を撮った後に、2 つ手を入れる。1 つは書き足し、1 つは新しいファイル
      'echo "2 行目" >> app.txt',
      'echo "メモ" > notes.txt',
    ],
  );
}

function view(sim: Sim): GitThreeAreasView {
  const git = gitOf(sim);
  const report = status(git, sim.session.state.vfs);
  const committed = treeFiles(git, headCommit(git));
  const history = log(git);
  const cards = FILES.map((path) => {
    const unstaged = report.unstaged.find((e) => e.path === path);
    if (unstaged !== undefined) return { path, area: 'worktree' as const, change: unstaged.state };
    if (report.untracked.includes(path)) return { path, area: 'worktree' as const, change: 'new' as const };
    const staged = report.staged.find((e) => e.path === path);
    if (staged !== undefined) return { path, area: 'index' as const, change: staged.state };
    return { path, area: 'commit' as const, change: committed.has(path) ? null : ('deleted' as const) };
  });
  return { cards, commits: history.length, last: history[0]?.message ?? null };
}

function moves(sim: Sim) {
  const current = view(sim);
  return [
    ...current.cards
      .filter((c) => c.area === 'worktree')
      .map((c) => ({ id: `add:${c.path}`, label: `${c.path} をインデックスへ`, command: `git add ${c.path}` })),
    { id: 'commit', label: 'インデックスを写真に撮る', command: `git commit -m "${MESSAGE}"` },
    ...current.cards
      .filter((c) => c.area === 'commit')
      .map((c) => ({ id: `edit:${c.path}`, label: `${c.path} に手を入れる`, command: `echo "追記" >> ${c.path}` })),
  ];
}

function apply(sim: Sim, moveId: string) {
  const found = moves(sim).find((m) => m.id === moveId);
  if (found === undefined) {
    if (moveId.startsWith('add:')) {
      return { sim, command: '', ok: false, reason: 'その札は作業ツリーに無い。手を入れた札だけがインデックスへ運べる' };
    }
    return unknownMove(sim, moveId);
  }
  if (found.id === 'commit' && view(sim).cards.every((c) => c.area !== 'index')) {
    return {
      sim,
      command: found.command,
      ok: false,
      reason: 'インデックスが空。写真に写るのはインデックスに載せた札だけ。先に札を運ぶ',
    };
  }
  return applyCommand(sim, found.command);
}

export const gitThreeAreas: Playground<GitThreeAreasView> = {
  id: 'git-three-areas',
  goal: '2 つの変更を、どちらも写真（コミット）に入れよ',
  notes: [
    '作業ツリーは手を入れている最中の場所。インデックスは写真に入れる物を並べる台。',
    '札をインデックスへ運ぶのが git add。台に並んだ物だけを写すのが git commit。',
    '写真を撮ると札はコミットの台に移り、作業ツリーは片付いた状態になる。',
  ],
  start,
  moves,
  apply,
  view,
  reached: (sim) => {
    const current = view(sim);
    return current.commits >= 2 && current.cards.every((c) => c.area === 'commit' && c.change === null);
  },
  solution: ['add:app.txt', 'add:notes.txt', 'commit'],
};
