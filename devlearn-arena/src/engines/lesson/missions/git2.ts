import { REBASE_TODO, gitPath, readGitFile, sparsePatterns } from '@/engines/git/gitdir';
import { GITLINK_MODE, branches, headCommit, log, status } from '@/engines/git/repository';
import { tagNames } from '@/engines/git/refs';
import { HOME } from '@/engines/kernel/path';
import { exists } from '@/engines/kernel/vfs';
import type { LessonDefinition } from '../types';

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
  objectives: ['作業ツリー・インデックス・HEAD の違いが分かる', 'status の3つの区画を読める', 'add と restore で行き来できる'],
  parCommands: 10,
  initial: { files: { ...THREE_TREES_FILES } },
  steps: [
    {
      prompt: 'リポジトリを作り、app.ts と notes.md だけを最初のコミットに入れよ。tmp.log は入れるな。',
      check: 'コミットがあり、app.ts と notes.md が記録され、tmp.log が記録されていないこと',
      hints: ['git init', 'git add app.ts notes.md', 'git commit -m "base"'],
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
      assert: ({ shell }) => shell.git !== null && log(shell.git).length >= 2,
      explain: '事故を再現するには、まず失うものが要る。',
    },
    {
      prompt: '事故を起こせ。git reset --hard HEAD~1 で2つ目を消せ。',
      check: 'コミットが1つに減っていること',
      hints: ['git reset --hard HEAD~1'],
      assert: ({ shell }) => shell.git !== null && log(shell.git).length === 1,
      explain: '--hard は作業ツリーごと巻き戻す。この時点で2つ目のコミットは「どこからも辿れない」状態になった。',
    },
    {
      prompt: '消えたコミットが、まだオブジェクトDBに残っていることを確かめよ。',
      check: 'git fsck か git count-objects -v を実行し、到達不能なオブジェクトがあると分かること',
      hints: ['git fsck', 'git count-objects -v'],
      assert: ({ history }) =>
        history.some((l) => l.includes('git fsck') || l.includes('count-objects')),
      explain:
        'reset は参照を動かしただけ。オブジェクトそのものは消えていない。到達不能（dangling）になっただけ。',
    },
    {
      prompt: 'reflog から消したコミットを見つけ、その位置まで戻せ。',
      check: 'コミットが再び2つになっていること',
      hints: ['git reflog で HEAD が通った場所が並ぶ', 'git reset --hard <消したコミットのハッシュ>'],
      assert: ({ shell }) => shell.git !== null && log(shell.git).length >= 2,
      diagnose: ({ history }) =>
        history.some((l) => l.includes('reflog'))
          ? null
          : 'まず git reflog を見てください。HEAD が通った場所が新しい順に並びます。',
      explain:
        'reflog は「HEAD がどこを通ったか」の記録。ブランチを消しても reset を間違えても、通った場所さえ分かれば戻せる。',
    },
  ],
};

export const gitParallelWork: LessonDefinition = {
  id: 'git/08/worktree',
  track: 'git',
  kind: 'training',
  title: '切り替えずに並行して作業する',
  objectives: ['worktree で同じリポジトリを2か所に開ける', 'sparse-checkout で作業ツリーを絞れる', '履歴とチェックアウトは別物だと分かる'],
  parCommands: 12,
  initial: {
    files: {
      [HOME]: null,
      [`${HOME}/src/app.ts`]: 'export const app = 1;\n',
      [`${HOME}/docs/guide.md`]: '# guide\n',
      [`${HOME}/docs/faq.md`]: '# faq\n',
    },
  },
  steps: [
    {
      prompt: '全部をコミットし、hotfix ブランチを作れ（切り替えなくてよい）。',
      check: 'コミットがあり、hotfix ブランチが存在すること',
      hints: ['git init / git add . / git commit -m "base"', 'git branch hotfix'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null || headCommit(git) === null) return false;
        return branches(git).includes('hotfix');
      },
      explain: 'ブランチを作るのはポインタを1つ増やすだけ。作業ツリーはまだ何も変わっていない。',
    },
    {
      prompt: '/tmp/hotfix に hotfix ブランチをもう1つ展開せよ。今の作業ツリーは触るな。',
      check: '/tmp/hotfix にファイルが展開され、git worktree list に2つ出ること',
      hints: ['git worktree add /tmp/hotfix hotfix'],
      assert: ({ shell }) => exists(shell.vfs, '/tmp/hotfix/src/app.ts'),
      explain:
        '同じ .git を共有したまま、別のディレクトリに別のブランチを展開できる。切り替えの待ち時間も、退避の手間も要らない。',
    },
    {
      prompt: '元の作業ツリーを src だけに絞れ。docs を作業ツリーから外すこと。',
      check: 'sparse-checkout が設定され、docs/ が作業ツリーから消えていること',
      hints: ['git sparse-checkout set src'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        const patterns = sparsePatterns(shell.vfs, git);
        return patterns !== null && !exists(shell.vfs, `${HOME}/docs/guide.md`);
      },
      explain:
        '巨大なリポジトリでも、手元に展開する範囲は絞れる。履歴からは消えていないので、いつでも戻せる。',
    },
    {
      prompt: 'docs が履歴からは消えていないことを確かめよ。',
      check: 'git ls-files に docs/guide.md が残っていること',
      hints: ['git ls-files'],
      assert: ({ shell }) => shell.git?.index.has('docs/guide.md') === true,
      explain: '作業ツリーに無い＝リポジトリに無い、ではない。チェックアウトの範囲と履歴の範囲は別物。',
    },
  ],
};

export const gitDivergedBoss: LessonDefinition = {
  id: 'git/09/boss-diverged',
  track: 'git',
  kind: 'boss',
  title: 'リモートと食い違った',
  objectives: ['非 fast-forward の push が拒まれる理由が分かる', '取り込んでから出し直せる', 'force-with-lease の意味を知る'],
  parCommands: 14,
  initial: {
    files: {
      [HOME]: null,
      [`${HOME}/service.py`]: 'def main():\n    return 1\n',
    },
  },
  steps: [
    {
      prompt: 'コミットして origin に push せよ。',
      check: 'origin/main が手元の main と同じ位置にあること',
      hints: [
        'git init / git add . / git commit -m "first"',
        'git remote add origin https://example.invalid/service.git',
        'git push origin main',
      ],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        const local = git.refs.get('refs/heads/main');
        return local !== undefined && git.refs.get('refs/remotes/origin/main') === local;
      },
      explain: 'push が通ると、リモート追跡参照（origin/main）が手元の位置に追いつく。',
    },
    {
      prompt: '他人がリモートを進めた状況を作れ。origin をクローンした別の場所から、もう1つコミットを push させる代わりに、ここでは手元を1つ進めてから origin をリセットする——のではなく、手元にコミットを1つ積め。',
      check: '手元の main が origin/main より進んでいること',
      hints: ['echo "def helper(): pass" >> service.py', 'git add . && git commit -m "helper"'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        const local = git.refs.get('refs/heads/main');
        const remote = git.refs.get('refs/remotes/origin/main');
        return local !== undefined && remote !== undefined && local !== remote;
      },
      explain: 'status に ahead と出る。まだ相手には渡っていない状態。',
    },
    {
      prompt: '履歴を作り直せ。直前のコミットを amend して、内容を変えよ。',
      check: 'amend 後も手元が origin/main より進んでおり、コミット数が変わっていないこと',
      hints: ['echo "def helper(): return 2" > service.py', 'git add . && git commit --amend -m "helper v2"'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        return log(git).length === 2 && git.refs.get('refs/heads/main') !== git.refs.get('refs/remotes/origin/main');
      },
      explain: '書き換えた側は、リモートが知っているコミットの子孫ではなくなる。ここが非 fast-forward の正体。',
    },
    {
      prompt: '安全な形で push し直せ。相手の位置を確かめてから上書きすること。',
      check: 'origin/main が手元の main に追いついていること',
      hints: [
        'まず git push origin main を試すと何が起きるか見る',
        'git push origin main --force-with-lease',
      ],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        const local = git.refs.get('refs/heads/main');
        return local !== undefined && git.refs.get('refs/remotes/origin/main') === local;
      },
      diagnose: ({ history }) =>
        history.some((l) => l.includes('--force') && !l.includes('--force-with-lease'))
          ? '--force は相手の新しいコミットも消します。--force-with-lease なら、自分が見た位置と違っていたら止まります。'
          : null,
      explain:
        '--force は無条件で上書きする。--force-with-lease は「自分が最後に見た位置と同じなら」上書きする。他人の仕事を消さずに済む。',
    },
  ],
};

export const gitFindRegression: LessonDefinition = {
  id: 'git/10/boss-find-regression',
  track: 'git',
  kind: 'boss',
  title: 'いつ壊れたのかを突き止める',
  objectives: ['bisect で二分探索できる', '手数が log で効くと分かる', 'hook で再発を止められる'],
  parCommands: 16,
  initial: {
    files: {
      [HOME]: null,
      [`${HOME}/health.txt`]: 'ok\n',
    },
  },
  steps: [
    {
      prompt: 'health.txt が ok のまま3回コミットし、4回目で NG にし、そのあと2回コミットせよ（合計6コミット）。',
      check: 'コミットが6つ以上あり、いま health.txt が NG であること',
      hints: [
        'git init のあと、echo ok > health.txt と git commit を繰り返す',
        '4回目だけ echo NG > health.txt にする',
      ],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        if (log(git).length < 6) return false;
        const node = shell.vfs.nodes.get(`${HOME}/health.txt`);
        return node?.kind === 'file' && node.content.includes('NG');
      },
      explain: '実際の障害は「いつからか」が分からないところから始まる。まずその状況を作る。',
    },
    {
      prompt: 'bisect を始め、いまが悪いこと、一番古いコミットが良いことを伝えよ。',
      check: 'bisect が動いていて、次に調べるコミットが決まっていること',
      hints: ['git bisect start', 'git bisect bad HEAD', 'git bisect good <一番古いハッシュ>'],
      assert: ({ shell, history }) =>
        shell.git !== null &&
        history.some((l) => l.includes('bisect bad')) &&
        history.some((l) => l.includes('bisect good')),
      explain:
        '良い版と悪い版が1つずつ分かれば、あとは間を半分に割るだけ。6コミットなら3回で決まる。',
    },
    {
      prompt: 'health.txt を見ながら good / bad を答え続け、犯人を特定せよ。',
      check: '残り候補が 0 件になっていること',
      hints: ['cat health.txt で判定する', 'NG なら git bisect bad、ok なら git bisect good'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        const bad = git.refs.get('refs/bisect/bad');
        const good = [...git.refs.keys()].some((r) => r.startsWith('refs/bisect/good-'));
        if (bad === undefined || !good) return false;
        // 候補が尽きていれば決着している
        return [...git.refs.keys()].filter((r) => r.startsWith('refs/bisect/good-')).length >= 2;
      },
      diagnose: ({ shell }) =>
        shell.git !== null && shell.git.refs.has('refs/bisect/bad')
          ? null
          : 'まだ bad を答えていません。cat health.txt の結果で good か bad を答えてください。',
      explain:
        '当てずっぽうなら平均で半分（3回）見る。二分なら最大でも log2(6)≒3 回。差はコミットが増えるほど開く。',
    },
    {
      prompt: 'bisect を終わらせ、同じ事故を止める hook を仕掛けよ。health.txt に NG があるとコミットできないようにすること。',
      check: '.git/hooks/pre-commit があり、NG のままではコミットが通らないこと',
      hints: [
        'git bisect reset で元の場所に戻る',
        'echo "grep -q NG health.txt && exit 1" > .git/hooks/pre-commit',
        'grep -v NG health.txt でも書ける',
      ],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        return exists(shell.vfs, gitPath(git, 'hooks/pre-commit'));
      },
      explain:
        '見つけて直すより、二度と入らないようにする方が安い。hook はその一番手前に置ける仕掛け。',
    },
  ],
};

export const gitRepoSize: LessonDefinition = {
  id: 'git/11/gc-packfile',
  track: 'git',
  kind: 'training',
  title: 'リポジトリが太る理由を数える',
  objectives: ['オブジェクト数を数えられる', '同じ内容が1つしか増えないと分かる', '到達不能なオブジェクトを見分けられる'],
  parCommands: 10,
  initial: {
    files: {
      [HOME]: null,
      [`${HOME}/data.txt`]: 'x\n',
    },
  },
  steps: [
    {
      prompt: 'コミットを1つ作り、オブジェクトがいくつあるか数えよ。',
      check: 'コミットがあり、git count-objects を実行したこと',
      hints: ['git init / git add . / git commit -m "first"', 'git count-objects -v'],
      assert: ({ shell, history }) =>
        shell.git !== null &&
        headCommit(shell.git) !== null &&
        history.some((l) => l.includes('count-objects')),
      explain: 'コミット1つで、blob（中身）・tree（ディレクトリ）・commit の3つが増える。',
    },
    {
      prompt: '同じ内容のファイルをもう1つ作ってコミットせよ（例: copy.txt に同じ x を書く）。',
      check: 'コミットが2つあり、copy.txt が記録されていること',
      hints: ['cp data.txt copy.txt', 'git add . && git commit -m "copy"'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        return log(git).length >= 2 && git.index.has('copy.txt');
      },
      explain:
        '中身が同じなら SHA も同じ。blob は増えない。増えるのは tree と commit だけ。これが content addressing の効き目。',
    },
    {
      prompt: '到達不能なオブジェクトがあるか調べよ。',
      check: 'git fsck を実行したこと',
      hints: ['git fsck'],
      assert: ({ history }) => history.some((l) => l.includes('git fsck')),
      explain:
        'reset や rebase で参照から外れたオブジェクトは、消えずに残る。これがあるから reflog から戻せる。逆に、放っておくと太る。',
    },
  ],
};

/** 大きなファイルを扱う任務で使う（タグの一覧を検証に使う） */
export const gitRelease: LessonDefinition = {
  id: 'git/01/refs-head',
  track: 'git',
  kind: 'training',
  title: '参照を付け替えて位置を示す',
  objectives: ['ブランチもタグもただの参照だと分かる', '軽量タグと注釈付きタグの違いが分かる', 'HEAD が何を指しているか読める'],
  parCommands: 10,
  initial: {
    files: {
      [HOME]: null,
      [`${HOME}/CHANGELOG.md`]: '# 変更履歴\n',
    },
  },
  steps: [
    {
      prompt: 'コミットを1つ作れ。',
      check: 'コミットが1つ以上あること',
      hints: ['git init / git add . / git commit -m "first"'],
      assert: ({ shell }) => shell.git !== null && headCommit(shell.git) !== null,
      explain: 'この時点で refs/heads/main が、いま作ったコミットを指している。',
    },
    {
      prompt: '軽量タグ v0.1.0 を打て。',
      check: 'タグ v0.1.0 があること',
      hints: ['git tag v0.1.0'],
      assert: ({ shell }) => shell.git !== null && tagNames(shell.git).includes('v0.1.0'),
      explain: '軽量タグは refs/tags/<名前> にコミットのハッシュを書くだけ。ブランチとの違いは「動かないこと」だけ。',
    },
    {
      prompt: '注釈付きタグ v1.0.0 を、メッセージ付きで打て。',
      check: 'タグ v1.0.0 があり、それが tag オブジェクトであること',
      hints: ['git tag -a v1.0.0 -m "最初のリリース"'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        const hash = git.refs.get('refs/tags/v1.0.0');
        if (hash === undefined) return false;
        return git.objects.read(hash)?.type === 'tag';
      },
      diagnose: ({ shell }) => {
        const git = shell.git;
        if (git === null) return null;
        const hash = git.refs.get('refs/tags/v1.0.0');
        if (hash !== undefined && git.objects.read(hash)?.type === 'commit') {
          return '軽量タグになっています。-a と -m を付けると注釈付きタグになります。';
        }
        return null;
      },
      explain:
        '注釈付きタグは、誰がいつ何のために打ったかを持つ独立したオブジェクト。リリースには普通こちらを使う。',
    },
    {
      prompt: '2つのタグが同じコミットを指していることを確かめよ。',
      check: 'git rev-parse か git cat-file を実行したこと',
      hints: ['git rev-parse v0.1.0 v1.0.0', 'git cat-file -t v1.0.0 で型が見える'],
      assert: ({ history }) =>
        history.some((l) => l.includes('rev-parse') || l.includes('cat-file')),
      explain:
        '注釈付きタグは tag オブジェクトを経由してコミットを指す。rev-parse はそれを剥がして最後のコミットまで辿る。',
    },
  ],
};

/** submodule を扱う任務。gitlink がコミット1つを指すことを見る */
export const gitSubmodule: LessonDefinition = {
  id: 'git/08/submodule',
  track: 'git',
  kind: 'training',
  title: '別のリポジトリを1点で参照する',
  objectives: ['gitlink が中身ではなくコミットを指すと分かる', '.gitmodules の役割が分かる'],
  parCommands: 10,
  initial: {
    files: {
      [HOME]: null,
      [`${HOME}/main.py`]: 'print("hi")\n',
    },
  },
  steps: [
    {
      prompt: 'コミットを作り、lib という名前でリモートを登録して push せよ。',
      check: 'lib リモートがあり、そこに main が push されていること',
      hints: [
        'git init / git add . / git commit -m "first"',
        'git remote add lib https://example.invalid/lib.git',
        'git push lib main',
      ],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        const remote = git.remotes.get('lib');
        return remote !== undefined && remote.state.refs.has('refs/heads/main');
      },
      explain: 'submodule に取り込む相手は、まず「別のリポジトリとして存在している」必要がある。',
    },
    {
      prompt: 'その lib を vendor/lib として submodule に取り込め。',
      check: 'インデックスに gitlink（mode 160000）の vendor/lib があること',
      hints: ['git submodule add https://example.invalid/lib.git vendor/lib'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        return git.index.get('vendor/lib')?.mode === GITLINK_MODE;
      },
      explain:
        'gitlink は相手のファイルを持たない。「相手のこのコミット」という1点だけを記録する。だから親リポジトリは太らない。',
    },
    {
      prompt: '.gitmodules に url と path が書かれていることを確かめよ。',
      check: '.gitmodules があり、url が書かれていること',
      hints: ['cat .gitmodules'],
      assert: ({ shell }) => {
        const node = shell.vfs.nodes.get(`${HOME}/.gitmodules`);
        return node?.kind === 'file' && node.content.includes('url = ');
      },
      explain:
        'gitlink はコミットしか覚えていないので、「どこから取ってくるか」は .gitmodules が持つ。片方だけでは復元できない。',
    },
  ],
};
