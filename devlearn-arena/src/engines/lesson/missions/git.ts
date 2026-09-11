import { concepts } from '../glossary';
import { HOME } from '@/engines/kernel/path';
import { branches, currentBranch, headCommit, log, status } from '@/engines/git/repository';
import { isAncestor } from '@/engines/git/history';
import type { LessonDefinition } from '../types';

export const gitFirstCommit: LessonDefinition = {
  id: 'git/01/objects',
  track: 'git',
  kind: 'training',
  title: '最初のコミットを刻む',
  intro: {
    summary: 'リポジトリを作り、選んだファイルだけを載せて、最初のコミットを作る。',
    why:
      'Git は「いつ・何を変えたか」を残す道具。最初の1回で「作業ツリー → インデックス → コミット」という流れを手で覚える。',
    concepts: concepts('Git', 'リポジトリ', '作業ツリー', 'インデックス', 'コミット', '3面'),
    commands: [
      { command: 'git init', means: 'ここをリポジトリにする' },
      { command: 'git add <ファイル>', means: '次のコミットに入れるものとして載せる' },
      { command: 'git commit -m "説明"', means: '載せたものを記録する' },
      { command: 'git status', means: '3つの場所のどこに差があるかを見る' },
    ],
  },
  objectives: ['リポジトリを作る', '3面（作業ツリー・インデックス・HEAD）を動かす', '履歴を残す'],
  parCommands: 6,
  initial: {
    files: {
      [HOME]: null,
      [`${HOME}/notes.md`]: '# 覚え書き\n\n- git は差分ではなくスナップショットを保存する\n',
      [`${HOME}/draft.txt`]: 'まだ途中\n',
      '/etc/hosts': '127.0.0.1\tlocalhost\n',
    },
  },
  steps: [
    {
      prompt: 'ここをリポジトリにせよ。',
      check: 'git のリポジトリが作られていること',
      hints: ['git init と打つ'],
      solution: ['git init'],
      assert: ({ shell }) => shell.git !== null,
      explain:
        'init で作られるのは .git というディレクトリだけ。ファイルの中身はまだ1つも記録されていない。',
    },
    {
      prompt: 'notes.md だけをインデックスに載せよ。draft.txt はまだ載せるな。',
      check: 'インデックスに notes.md があり、draft.txt が無いこと',
      hints: ['git add <ファイル名>', 'git add notes.md'],
      solution: ['git add notes.md'],
      assert: ({ shell }) =>
        shell.git !== null && shell.git.index.has('notes.md') && !shell.git.index.has('draft.txt'),
      explain:
        'add は「次のコミットに含めるものを選ぶ」操作。全部を無条件に含めないのが index の存在理由。',
    },
    {
      prompt: 'メッセージを付けてコミットせよ。',
      check: 'コミットが1つ以上あり、notes.md が記録されていること',
      hints: ['git commit -m "メッセージ"'],
      solution: ['git commit -m "first"'],
      assert: ({ shell }) => {
        if (shell.git === null) return false;
        if (headCommit(shell.git) === null) return false;
        return log(shell.git).length >= 1;
      },
      diagnose: ({ shell }) => {
        if (shell.git === null) return null;
        if (shell.git.index.size === 0) return 'インデックスが空です。先に git add をしてください。';
        return null;
      },
      explain:
        'コミットは、その時点のツリー全体を指すスナップショット。親を1つ持ち、履歴は数珠つなぎになる。',
    },
    {
      prompt: 'draft.txt を追跡外のまま、作業ツリーが汚れていない状態にせよ（notes.md を編集していたら戻すか、コミットせよ）。',
      check: 'notes.md に未ステージの変更が無いこと（draft.txt は追跡外のままでよい）',
      hints: [
        'git status で今どうなっているかを見る',
        '編集してしまったら git add と git commit でもう一度記録する',
      ],
      solution: ['git status'],
      assert: ({ shell }) => {
        if (shell.git === null) return false;
        const report = status(shell.git, shell.vfs);
        return report.unstaged.length === 0 && report.staged.length === 0;
      },
      explain:
        'status が読めれば、3面のどこに差があるかが分かる。untracked は「まだ git が知らない」だけで、汚れではない。',
    },
  ],
};

const GIT_FILES = {
  [HOME]: null,
  [`${HOME}/app.txt`]: 'line1\nline2\nline3\n',
  [`${HOME}/README.md`]: '# プロジェクト\n\n手順はここに書く\n',
  '/etc/hosts': '127.0.0.1\tlocalhost\n',
} as const;

export const gitBranching: LessonDefinition = {
  id: 'git/04/three-way-merge',
  track: 'git',
  kind: 'training',
  title: 'ブランチを分けて統合する',
  intro: {
    summary: 'ブランチを分けて作業し、main に取り込む。',
    why:
      '本体を壊さずに新しいことを試すために、枝を分ける。取り込むとき、main が動いていなければ札を進めるだけで済む（早送り）。',
    concepts: concepts('ブランチ', 'main', 'HEAD', 'マージ', '早送り', 'コミット'),
    commands: [
      { command: 'git switch -c <名前>', means: '新しいブランチを作って移る' },
      { command: 'git switch main', means: 'main に戻る' },
      { command: 'git merge <名前>', means: 'そのブランチの変更を取り込む' },
    ],
  },
  objectives: ['ブランチはポインタだと分かる', '分けた作業を統合できる', '早送りと統合の違いが分かる'],
  parCommands: 10,
  initial: { files: { ...GIT_FILES } },
  steps: [
    {
      prompt: 'リポジトリを作り、いまのファイルを最初のコミットとして記録せよ。',
      check: 'コミットが1つ以上あること',
      hints: ['git init', 'git add . のあと git commit -m "..."'],
      solution: ['git init', 'git add .', 'git commit -m "base"'],
      assert: ({ shell }) => shell.git !== null && log(shell.git).length >= 1,
      explain: '最初のコミットには親が無い。ここが履歴の根になる。',
    },
    {
      prompt: 'feature という名前のブランチを作り、そこへ移れ。',
      check: 'feature ブランチが存在し、HEAD がそれを指していること',
      hints: ['git switch -c feature', 'branch と switch を分けて打ってもよい'],
      solution: ['git switch -c feature'],
      assert: ({ shell }) =>
        shell.git !== null &&
        branches(shell.git).includes('feature') &&
        currentBranch(shell.git) === 'feature',
      diagnose: ({ shell }) => {
        if (shell.git === null) return null;
        if (!branches(shell.git).includes('feature')) return null;
        if (currentBranch(shell.git) !== 'feature') {
          return 'feature は作れていますが、まだ移っていません。git switch feature で移れます。';
        }
        return null;
      },
      explain:
        'ブランチは、あるコミットを指すだけのポインタ。作っても履歴は複製されないし、容量もほぼ増えない。',
    },
    {
      prompt: 'feature 側で README.md を書き換え、コミットせよ。',
      check: 'feature にコミットが2つ以上あり、README.md の内容が最初のコミットと違うこと',
      hints: ['vi README.md で編集できる', 'echo で上書きしてもよい', 'git add と git commit を忘れない'],
      solution: ['echo updated > README.md', 'git add README.md', 'git commit -m "update readme"'],
      assert: ({ shell }) =>
        shell.git !== null && currentBranch(shell.git) === 'feature' && log(shell.git).length >= 2,
      explain: 'この時点で main は動いていない。feature のポインタだけが1つ先へ進んでいる。',
    },
    {
      prompt: 'main に戻り、feature の変更を取り込め。',
      check: 'main にいて、feature の内容が取り込まれていること',
      hints: ['git switch main', 'git merge feature'],
      solution: ['git switch main', 'git merge feature'],
      assert: ({ shell }) => {
        if (shell.git === null) return false;
        if (currentBranch(shell.git) !== 'main') return false;
        const mainTip = shell.git.refs.get('refs/heads/main');
        const featureTip = shell.git.refs.get('refs/heads/feature');
        return mainTip !== undefined && mainTip === featureTip;
      },
      diagnose: ({ shell }) => {
        if (shell.git === null) return null;
        if (currentBranch(shell.git) !== 'main') return 'まだ feature にいます。git switch main で戻ってください。';
        return null;
      },
      explain:
        'main が動いていなかったので、統合はコミットを作らず、ポインタが進むだけで済んだ。これが fast-forward。',
    },
  ],
};

export const gitConflictDrill: LessonDefinition = {
  id: 'git/05/resolve-drill',
  track: 'git',
  kind: 'training',
  title: '衝突を解く',
  intro: {
    summary: 'わざと衝突を起こし、マーカを読んで直し、取り込みを終える。',
    why:
      '2人が同じ行を変えれば、必ず衝突する。Git はどちらが正しいか決めない。マーカの読み方と直し方を知っていれば怖くない。',
    concepts: concepts('衝突', '衝突マーカ', 'ブランチ', 'マージ', 'インデックス', 'Git'),
    commands: [
      { command: 'git merge <名前>', means: '取り込む（衝突するとここで止まる）' },
      { command: 'vi <ファイル>', means: 'ファイルを開いてマーカの行を消し、正しい内容にする' },
      { command: 'git add <ファイル>', means: '直したことを載せる' },
      { command: 'git commit -m "説明"', means: '取り込みを終える' },
    ],
  },
  objectives: ['衝突マーカを読める', '意味を壊さず統合できる', '解決してコミットできる'],
  parCommands: 12,
  initial: { files: { ...GIT_FILES } },
  steps: [
    {
      prompt: 'リポジトリを作り、app.txt を最初のコミットに含めよ。',
      check: 'コミットが1つ以上あり、app.txt が記録されていること',
      hints: ['git init', 'git add app.txt', 'git commit -m "base"'],
      solution: ['git init', 'git add app.txt', 'git commit -m "base"'],
      assert: ({ shell }) => shell.git !== null && log(shell.git).length >= 1,
      explain: '衝突を起こすには、まず共通の祖先が要る。',
    },
    {
      prompt: 'topic ブランチを作り、app.txt の 2 行目を書き換えてコミットせよ。',
      check: 'topic にコミットがあり、app.txt が変わっていること',
      hints: ['git switch -c topic', 'vi app.txt で2行目を書き換える'],
      solution: ['git switch -c topic', 'printf "line1\\nTHEIRS\\nline3\\n" > app.txt', 'git add app.txt', 'git commit -m "topic"'],
      assert: ({ shell }) =>
        shell.git !== null && branches(shell.git).includes('topic') && log(shell.git).length >= 2,
      explain: 'ここまでは分岐しただけ。まだ衝突は起きていない。',
    },
    {
      prompt: 'main に戻り、同じ 2 行目を別の内容に書き換えてコミットせよ。',
      check: 'main と topic がそれぞれ別のコミットを積んで、枝分かれしていること',
      hints: ['git switch main', '同じ行を違う内容にするのが要点'],
      solution: ['git switch main', 'printf "line1\\nOURS\\nline3\\n" > app.txt', 'git add app.txt', 'git commit -m "main"'],
      assert: ({ shell }) => {
        if (shell.git === null) return false;
        const main = shell.git.refs.get('refs/heads/main');
        const topic = shell.git.refs.get('refs/heads/topic');
        // どちらかがもう一方の祖先なら、まだ片方しか進んでいない（早送りで済んでしまう）
        return (
          main !== undefined && topic !== undefined &&
          !isAncestor(shell.git, main, topic) && !isAncestor(shell.git, topic, main)
        );
      },
      explain: '双方が同じ行を別の内容に変えた。この状態で統合すると衝突する。',
    },
    {
      prompt: 'topic を統合し、衝突を解いてコミットせよ。マーカを残すな。',
      check: 'app.txt に衝突マーカが無く、変更が記録済みで、HEAD がマージコミットであること',
      hints: [
        'git merge topic を実行すると衝突する',
        'vi app.txt を開き、<<<<<<< と ======= と >>>>>>> の行を消して、正しい内容にする',
        '直したら git add app.txt と git commit -m "resolve"',
      ],
      solution: ['git merge topic', 'printf "line1\\nRESOLVED\\nline3\\n" > app.txt', 'git add app.txt', 'git commit -m "resolve"'],
      assert: ({ shell }) => {
        if (shell.git === null) return false;
        const node = shell.vfs.nodes.get(`${HOME}/app.txt`);
        if (!node || node.kind !== 'file') return false;
        if (node.content.includes('<<<<<<<') || node.content.includes('>>>>>>>')) return false;
        const report = status(shell.git, shell.vfs);
        // 追跡していないファイルは残っていてよい。統合した結果を記録できたかだけを見る
        const recorded = report.staged.length === 0 && report.unstaged.length === 0;
        const merge = log(shell.git)[0];
        return recorded && merge !== undefined && merge.parents.length >= 2;
      },
      diagnose: ({ shell }) => {
        const node = shell.vfs.nodes.get(`${HOME}/app.txt`);
        if (node?.kind === 'file' && node.content.includes('<<<<<<<')) {
          return '衝突マーカがまだ残っています。vi app.txt を開いて、<<<<<<< / ======= / >>>>>>> の行を消してください。';
        }
        if (shell.git !== null) {
          const report = status(shell.git, shell.vfs);
          if (report.staged.length > 0 || report.unstaged.length > 0) {
            return '直した内容をまだ記録していません。git add と git commit で確定させてください。';
          }
        }
        return null;
      },
      explain:
        'git は「どちらが正しいか」を判断しない。マーカで両方を見せ、決めるのは人に委ねる。だから解決後は必ず動作を確かめること。',
    },
  ],
};
