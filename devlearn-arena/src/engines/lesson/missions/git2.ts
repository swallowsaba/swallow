import { concepts } from '../glossary';
import { REBASE_TODO, gitPath, readGitFile } from '@/engines/git/gitdir';
import { branches, headCommit, log, status } from '@/engines/git/repository';
import { HOME } from '@/engines/kernel/path';
import { exists } from '@/engines/kernel/vfs';
import type { LessonDefinition } from '../types';
import { ran } from '../authoring/ran';

const NOTES = `# 手順書

1. 依存を入れる
2. テストを流す
`;

/** 3面（作業ツリー / インデックス / HEAD）を見る任務の初期状態 */
const THREE_TREES_FILES = {
  [HOME]: null,
  [`${HOME}/app.ts`]: 'export const version = 1;\n',
  [`${HOME}/notes.md`]: NOTES,
  [`${HOME}/tmp.log`]: 'ゴミ\n',
};

export const gitThreeTrees: LessonDefinition = {
  id: 'git/02/three-trees',
  track: 'git',
  kind: 'training',
  title: '3面を動かして status を読む',
  intro: {
    summary: '作業ツリー・インデックス・HEAD の3つの場所を、add と restore で行き来する。',
    why:
      'Git の操作で迷うのは、たいてい「いまどの場所の話か」が分からないとき。3つの場所の間を自分で動かしてみると、status の表示が読めるようになる。',
    concepts: concepts('3面', '作業ツリー', 'インデックス', 'HEAD', 'コミット', 'Git'),
    commands: [
      { command: 'git add <ファイル>', means: '作業ツリーの変更をインデックスへ載せる' },
      { command: 'git restore --staged <ファイル>', means: 'インデックスだけを HEAD に戻す（作業ツリーはそのまま）' },
      { command: 'git status', means: 'どの場所に差があるかを見る' },
    ],
  },
  objectives: ['作業ツリー・インデックス・HEAD の違いが分かる', 'status の3つの区画を読める', 'add と restore で行き来できる'],
  parCommands: 10,
  initial: { files: { ...THREE_TREES_FILES } },
  steps: [
    {
      prompt: 'リポジトリを作り、app.ts と notes.md だけを最初のコミットに入れよ。tmp.log は入れるな。',
      check: 'コミットがあり、app.ts と notes.md が記録され、tmp.log が記録されていないこと',
      hints: ['git init', 'git add app.ts notes.md', 'git commit -m "base"'],
      solution: ['git init', 'git add app.ts notes.md', 'git commit -m "base"'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null || headCommit(git) === null) return false;
        return git.index.has('app.ts') && git.index.has('notes.md') && !git.index.has('tmp.log');
      },
      diagnose: ({ shell }) =>
        shell.git?.index.has('tmp.log') === true
          ? 'tmp.log まで載せています。git restore --staged tmp.log で外せます。'
          : null,
      explain: '3面のうち、コミットに入るのは「インデックスに載っているもの」だけ。作業ツリーにあるかどうかではない。',
    },
    {
      prompt: 'app.ts を書き換えよ。まだ add はするな。',
      check: 'app.ts に未ステージの変更があること',
      hints: ['echo "export const version = 2;" > app.ts'],
      solution: ['echo "export const version = 2;" > app.ts'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        return status(git, shell.vfs).unstaged.some((e) => e.path === 'app.ts');
      },
      explain:
        'この時点で作業ツリーだけが進んでいる。status の「Changes not staged for commit」がその区画。',
    },
    {
      prompt: 'その変更をインデックスに載せよ。',
      check: 'app.ts がステージ済みで、未ステージの変更が無いこと',
      hints: ['git add app.ts'],
      solution: ['git add app.ts'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        const report = status(git, shell.vfs);
        return report.staged.some((e) => e.path === 'app.ts') && report.unstaged.length === 0;
      },
      explain: 'add でインデックスが作業ツリーに追いついた。HEAD はまだ古いままなので、差分は「staged」側に移る。',
    },
    {
      prompt: 'やっぱり載せるのをやめ、インデックスだけを HEAD に戻せ。作業ツリーの変更は消すな。',
      check: 'app.ts が未ステージの変更として残っていること',
      hints: ['git restore --staged app.ts', 'git restore（--staged 無し）は作業ツリーを消してしまうので注意'],
      solution: ['git restore --staged app.ts'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        const report = status(git, shell.vfs);
        return report.staged.length === 0 && report.unstaged.some((e) => e.path === 'app.ts');
      },
      diagnose: ({ shell }) => {
        const git = shell.git;
        if (git === null) return null;
        const report = status(git, shell.vfs);
        if (report.staged.length === 0 && report.unstaged.length === 0) {
          return '作業ツリーの変更まで消えています。--staged を付けるとインデックスだけを戻せます。';
        }
        return null;
      },
      explain:
        '`restore --staged` は インデックス←HEAD、`restore` は 作業ツリー←インデックス。矢印の向きが違う。',
    },
  ],
};

export const gitAmend: LessonDefinition = {
  id: 'git/03/amend',
  track: 'git',
  kind: 'training',
  title: '直前のコミットを作り直す',
  intro: {
    summary: '入れ忘れたファイルを、直前のコミットに足して作り直す。',
    why:
      '「1つ入れ忘れた」のたびにコミットを増やすと、歴史が読みにくくなる。まだ誰にも渡していない直前のコミットなら、作り直してよい。',
    concepts: concepts('amend', 'コミット', 'インデックス', 'ハッシュ'),
    commands: [
      { command: 'git add <ファイル>', means: '入れ忘れたものを載せる' },
      { command: 'git commit --amend -m "説明"', means: '直前のコミットを作り直す' },
      { command: 'git log', means: 'コミットの数が増えていないか確かめる' },
    ],
  },
  objectives: ['amend が新しいコミットを作っていると分かる', '入れ忘れを取り込める', 'SHA が変わることの意味を知る'],
  parCommands: 8,
  initial: {
    files: {
      [HOME]: null,
      [`${HOME}/index.html`]: '<h1>hello</h1>\n',
      [`${HOME}/style.css`]: 'h1 { color: teal; }\n',
    },
  },
  steps: [
    {
      prompt: 'index.html だけをコミットせよ（style.css を入れ忘れた、という状況を作る）。',
      check: 'コミットが1つあり、style.css が記録されていないこと',
      hints: ['git init', 'git add index.html', 'git commit -m "ページを追加"'],
      solution: ['git init', 'git add index.html', 'git commit -m "ページを追加"'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null || headCommit(git) === null) return false;
        return git.index.has('index.html') && !git.index.has('style.css');
      },
      explain: '入れ忘れは日常的に起きる。ここからの戻し方に何通りかあるのが git の学びどころ。',
    },
    {
      prompt: 'style.css も含めて、コミットを1つのまま作り直せ。履歴を2つにするな。',
      check: 'コミットが1つで、style.css も記録されていること',
      hints: [
        'git add style.css',
        'git commit --amend -m "ページを追加"（reset --soft HEAD~1 から作り直しても正解）',
      ],
      solution: ['git add style.css', 'git commit --amend -m "ページを追加"'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        return log(git).length === 1 && git.index.has('style.css');
      },
      diagnose: ({ shell }) => {
        const git = shell.git;
        if (git === null) return null;
        if (log(git).length > 1) {
          return 'コミットが増えています。amend は履歴を増やさずに作り直す操作です。';
        }
        if (!git.index.has('style.css')) return 'style.css をまだ add していません。';
        return null;
      },
      explain:
        'amend は既存のコミットを書き換えているのではなく、内容の違う新しいコミットを作って枝の先を差し替えている。だから SHA が変わる。共有済みの履歴でやると相手とずれる。',
    },
  ],
};

export const gitInteractiveRebase: LessonDefinition = {
  id: 'git/06/interactive-rebase',
  track: 'git',
  kind: 'training',
  title: '台本を書き換えて履歴を整える',
  intro: {
    summary: '細かく積んだコミットを、rebase -i で1つにまとめる。',
    why:
      '作業中の「とりあえず保存」を全部残すと、後から読む人が意図を追えない。見せる前に、意味のある単位にまとめ直せる。',
    concepts: concepts('rebase', 'コミット', 'ブランチ', 'main'),
    commands: [
      { command: 'git rebase -i main', means: 'main の先に載せ直す台本を作る' },
      { command: 'vi .git/rebase-merge/git-rebase-todo', means: '台本を開き、2行目以降の pick を squash に変える' },
      { command: 'git rebase --continue', means: '台本どおりに実行する' },
    ],
  },
  objectives: ['rebase -i の todo が台本だと分かる', 'squash で細かいコミットを畳める', '公開前に読みやすい履歴にできる'],
  parCommands: 12,
  initial: {
    files: {
      [HOME]: null,
      [`${HOME}/README.md`]: '# app\n',
    },
  },
  steps: [
    {
      prompt: 'main で最初のコミットを作り、topic ブランチで3つコミットを積め。',
      check: 'topic に3つ以上のコミットが積まれていること',
      hints: [
        'git init / git add . / git commit -m "base"',
        'git switch -c topic',
        'echo a > a.txt && git add . && git commit -m "wip a" を3回',
      ],
      solution: ['git init', 'git add .', 'git commit -m "base"', 'git switch -c topic', 'echo a > a.txt', 'git add .', 'git commit -m "wip a"', 'echo b > b.txt', 'git add .', 'git commit -m "wip b"', 'echo c > c.txt', 'git add .', 'git commit -m "wip c"'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        return branches(git).includes('topic') && log(git).length >= 4;
      },
      explain: '作業中は細かくコミットしてよい。整えるのは公開する直前でいい。',
    },
    {
      prompt: 'main の上に載せ直す台本を作れ（まだ実行しなくてよい）。',
      check: '.git/rebase-merge/git-rebase-todo が作られていること',
      hints: ['git rebase -i main', '台本は .git/rebase-merge/git-rebase-todo に出る'],
      solution: ['git rebase -i main'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        return exists(shell.vfs, gitPath(git, REBASE_TODO));
      },
      explain:
        'rebase -i は先に台本を書き出す。行を消せばコミットが消え、並べ替えれば順番が変わる。実行はまだ始まっていない。',
    },
    {
      prompt: '台本を編集して、topic の3つを1つに畳んでから実行せよ（squash か fixup を使う）。',
      check: 'main から見て topic のコミットが1つになり、作ったファイルが全部残っていること',
      hints: [
        'vi .git/rebase-merge/git-rebase-todo で開ける',
        '2行目以降の pick を squash に変える',
        '直したら git rebase --continue',
      ],
      solution: ['printf "pick HEAD~2 wip a\\nsquash HEAD~1 wip b\\nsquash HEAD wip c\\n" > .git/rebase-merge/git-rebase-todo', 'git rebase --continue'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        // 台本が片付いていて、履歴が base + 1 になっていること
        if (readGitFile(shell.vfs, git, REBASE_TODO) !== null) return false;
        return log(git).length === 2;
      },
      diagnose: ({ shell }) => {
        const git = shell.git;
        if (git === null) return null;
        if (readGitFile(shell.vfs, git, REBASE_TODO) !== null) {
          return '台本がまだ残っています。git rebase --continue で実行してください。';
        }
        if (log(git).length > 2) return 'まだ畳みきれていません。pick を squash に変える行を増やしてください。';
        return null;
      },
      explain:
        'squash はメッセージを両方残し、fixup は捨てる。畳んでも中身は失われない。失われるのは「途中経過の区切り」だけ。',
    },
  ],
};

export const gitRecovery: LessonDefinition = {
  id: 'git/07/recover-hard-reset',
  track: 'git',
  kind: 'training',
  title: '消したはずのコミットを取り戻す',
  intro: {
    summary: 'reset --hard で消してしまったコミットを、reflog から取り戻す。',
    why:
      '「消してしまった！」の多くは、実は消えていない。札が外れて見えなくなっただけ。足あとをたどれば戻せると知っていると、事故の後に落ち着いて動ける。',
    concepts: concepts('reset', 'reflog', 'HEAD', 'コミット', 'オブジェクト'),
    commands: [
      { command: 'git reset --hard HEAD~1', means: '1つ前のコミットへ戻す（今のコミットは見えなくなる）' },
      { command: 'git fsck', means: 'どこからも指されていないオブジェクトを探す' },
      { command: 'git reflog', means: 'HEAD の足あとを見る' },
      { command: 'git reset --hard HEAD@{1}', means: '1つ前にいた場所へ戻る' },
    ],
  },
  objectives: ['reflog が HEAD の移動記録だと分かる', '到達不能なコミットを見つけられる', '事故から確実に戻せる'],
  parCommands: 12,
  initial: {
    files: {
      [HOME]: null,
      [`${HOME}/report.md`]: '# 調査結果\n',
    },
  },
  steps: [
    {
      prompt: 'コミットを2つ積め。2つ目には大事な内容を入れよ。',
      check: 'コミットが2つ以上あること',
      hints: ['git init / git add . / git commit -m "first"', 'echo 大事 >> report.md して2つ目'],
      solution: ['git init', 'git add .', 'git commit -m "first"', 'echo 大事 >> report.md', 'git add .', 'git commit -m "second"'],
      assert: ({ shell }) => shell.git !== null && log(shell.git).length >= 2,
      explain: '事故を再現するには、まず失うものが要る。',
    },
    {
      prompt: '事故を起こせ。git reset --hard HEAD~1 で2つ目を消せ。',
      check: 'コミットが1つに減っていること',
      hints: ['git reset --hard HEAD~1'],
      solution: ['git reset --hard HEAD~1'],
      assert: ({ shell }) => shell.git !== null && log(shell.git).length === 1,
      explain: '--hard は作業ツリーごと巻き戻す。この時点で2つ目のコミットは「どこからも辿れない」状態になった。',
    },
    {
      prompt: '消えたコミットが、まだオブジェクトDBに残っていることを確かめよ。',
      check: 'git fsck か git count-objects -v を実行し、到達不能なオブジェクトがあると分かること',
      hints: ['git fsck', 'git count-objects -v'],
      solution: ['git fsck'],
      assert: ({ history }) => ran(history, 'git', 'fsck') || ran(history, 'git', 'count-objects'),
      explain:
        'reset は参照を動かしただけ。オブジェクトそのものは消えていない。到達不能（dangling）になっただけ。',
    },
    {
      prompt: 'reflog から消したコミットを見つけ、その位置まで戻せ。',
      check: 'コミットが再び2つになっていること',
      hints: ['git reflog で HEAD が通った場所が並ぶ', 'git reset --hard <消したコミットのハッシュ>'],
      solution: ['git reflog', 'git reset --hard HEAD@{1}'],
      assert: ({ shell }) => shell.git !== null && log(shell.git).length >= 2,
      diagnose: ({ history }) =>
        ran(history, 'git', 'reflog')
          ? null
          : 'まず git reflog を見てください。HEAD が通った場所が新しい順に並びます。',
      explain:
        'reflog は「HEAD がどこを通ったか」の記録。ブランチを消しても reset を間違えても、通った場所さえ分かれば戻せる。',
    },
  ],
};
