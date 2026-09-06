import { chapter, doc } from '../build';
import type { Track } from '../types';

const cmd = (name: string) => doc(`git ${name}`, `https://git-scm.com/docs/git-${name}`);
const book = (label: string, path: string) => doc(label, `https://git-scm.com/book/en/v2/${path}`);

export const gitTrack: Track = {
  id: 'git',
  title: 'Git',
  goal: '内部モデルを理解して、チームの履歴を壊さずに使い倒す。事故からは必ず戻せる',
  phase: 'P2',
  chapters: [
    chapter('git', 1, '内部データモデル', 'コマンドを覚える前に、何が保存されているかを見る。',
      [book('Git Objects', 'Git-Internals-Git-Objects')], [
        ['objects', 'blob / tree / commit を実際にハッシュする', 'concept', 15,
          [doc('git cat-file', 'https://git-scm.com/docs/git-cat-file')]],
        ['content-addressing', '同じ内容は同じ SHA-1 になる、が意味すること', 'drill', 12],
        ['refs-head', 'ブランチはただのポインタ、HEAD はポインタへのポインタ', 'concept', 12,
          [book('Git References', 'Git-Internals-Git-References')]],
        ['dag', 'コミットは親を指す。履歴は DAG である', 'concept', 12],
      ]),
    chapter('git', 2, '3面モデル', 'worktree / index / HEAD の三角形で status が読める。',
      [cmd('status')], [
        ['three-trees', '3面を同時に表示して差分を見る', 'concept', 15],
        ['add-restore', 'add と restore --staged で index を行き来する', 'drill', 12, [cmd('restore')]],
        ['diff-variants', 'diff / diff --staged / diff HEAD の違い', 'drill', 12, [cmd('diff')]],
        ['gitignore', 'ignore が効かない時の追跡状態', 'drill', 10, [doc('gitignore', 'https://git-scm.com/docs/gitignore')]],
      ]),
    chapter('git', 3, 'コミット設計', '後で読む人のための履歴を作る。',
      [cmd('commit')], [
        ['atomic-commit', '1コミット1意図に割る', 'concept', 12],
        ['add-patch', 'add -p で変更を分割してステージする', 'drill', 15],
        ['message-convention', 'コミットメッセージの型と Conventional Commits', 'concept', 12],
        ['amend', 'amend は履歴を作り直している（SHA が変わる）', 'drill', 12],
      ]),
    chapter('git', 4, 'ブランチと統合', 'merge か rebase か、判断基準を持つ。',
      [cmd('merge')], [
        ['branch-switch', 'branch / switch / detached HEAD', 'drill', 12, [cmd('switch')]],
        ['fast-forward', 'fast-forward と no-ff の履歴の形', 'concept', 12],
        ['three-way-merge', '共通祖先を求める 3-way マージ', 'concept', 15],
        ['rebase-basics', 'rebase はコミットを複製して付け替える', 'concept', 15, [cmd('rebase')]],
        ['merge-vs-rebase', '公開履歴と手元履歴で判断を変える', 'concept', 15,
          [book('Rebasing', 'Git-Branching-Rebasing')]],
        ['boss-history-mess', 'BOSS: 3本のブランチが絡んだ履歴を整える', 'boss', 25],
      ]),
    chapter('git', 5, 'コンフリクト', 'マーカーの意味が分かれば怖くない。',
      [cmd('merge')], [
        ['conflict-markers', 'マーカーの3ブロックが何を指すか', 'drill', 15],
        ['resolve-drill', '衝突解決ドリル（意味を壊さず統合する）', 'drill', 20],
        ['rerere-mergetool', '同じ衝突を繰り返さない', 'concept', 12,
          [doc('git rerere', 'https://git-scm.com/docs/git-rerere')]],
        ['boss-conflict-storm', 'BOSS: rebase 中に連続する衝突を捌く', 'boss', 25],
      ]),
    chapter('git', 6, '履歴の書き換え', '強力すぎる道具の、使ってよい範囲。',
      [cmd('rebase')], [
        ['interactive-rebase', 'rebase -i の todo（pick/squash/fixup/edit/drop）', 'drill', 20],
        ['reset-three', 'reset --soft / --mixed / --hard の到達点の違い', 'drill', 18, [cmd('reset')]],
        ['revert', '公開済みを打ち消すなら revert', 'drill', 12, [cmd('revert')]],
        ['rewrite-danger', '共有履歴の書き換えが他人に何を起こすか', 'concept', 15],
      ]),
    chapter('git', 7, '事故からの復旧', 'reflog がある限り、たいてい戻せる。',
      [cmd('reflog')], [
        ['reflog-basics', 'reflog は「HEAD がいた場所」の記録', 'concept', 12],
        ['recover-branch', '消したブランチを復活させる', 'challenge', 15],
        ['recover-hard-reset', 'reset --hard で消した変更を取り戻す', 'challenge', 15],
        ['fsck-dangling', 'dangling オブジェクトを探す', 'concept', 12,
          [doc('git fsck', 'https://git-scm.com/docs/git-fsck')]],
        ['boss-force-push-accident', 'BOSS: force push で消えた同僚のコミットを戻す', 'boss', 30],
      ]),
    chapter('git', 8, '作業の一時退避と並行作業', '手を止めずに別の作業に移る。',
      [cmd('stash')], [
        ['stash', 'stash の push / pop / apply と衝突', 'drill', 12],
        ['worktree', 'worktree で複数ブランチを同時に開く', 'drill', 15, [cmd('worktree')]],
        ['sparse-checkout', '巨大リポジトリで必要な部分だけ取り出す', 'concept', 12,
          [doc('git sparse-checkout', 'https://git-scm.com/docs/git-sparse-checkout')]],
        ['submodule', 'submodule の落とし穴', 'concept', 15, [cmd('submodule')]],
      ]),
    chapter('git', 9, 'リモートとの同期', 'push が拒否される理由を、状態から説明できる。',
      [cmd('push')], [
        ['remote-tracking', 'origin/main はローカルにあるリモートの写し', 'concept', 12, [cmd('remote')]],
        ['fetch-vs-pull', 'fetch と pull（--rebase）の違い', 'drill', 12, [cmd('fetch')]],
        ['non-fast-forward', '非 fast-forward の拒否と、正しい直し方', 'drill', 18],
        ['force-with-lease', '--force と --force-with-lease の差', 'drill', 15],
        ['boss-diverged', 'BOSS: 履歴が分岐して push できない', 'boss', 22],
      ]),
    chapter('git', 10, '調査と自動化', '原因コミットを機械的に絞り込む。',
      [cmd('bisect')], [
        ['log-search', 'log -S / -G / --follow で変更を探す', 'drill', 15, [cmd('log')]],
        ['blame', 'blame は犯人探しではなく文脈探し', 'drill', 10, [cmd('blame')]],
        ['bisect', 'bisect で二分探索する', 'challenge', 20],
        ['hooks', 'hooks で事故を入り口で止める', 'concept', 15,
          [doc('githooks', 'https://git-scm.com/docs/githooks')]],
        ['boss-find-regression', 'BOSS: いつ壊れたか分からない不具合を特定する', 'boss', 28],
      ]),
    chapter('git', 11, '大規模リポジトリ運用', '重くなってからでは遅い。',
      [doc('git gc', 'https://git-scm.com/docs/git-gc')], [
        ['gc-packfile', 'packfile と gc、リポジトリが太る理由', 'concept', 15],
        ['lfs', '大きなファイルの扱い', 'concept', 12,
          [doc('git lfs', 'https://git-scm.com/docs/git-lfs')]],
        ['monorepo', 'monorepo と polyrepo の運用差', 'concept', 15],
      ]),
  ],
};
