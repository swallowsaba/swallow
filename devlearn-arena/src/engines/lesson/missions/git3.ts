import { concepts } from '../glossary';
import { gitPath, sparsePatterns } from '@/engines/git/gitdir';
import { GITLINK_MODE, branches, headCommit, log } from '@/engines/git/repository';
import { tagNames } from '@/engines/git/refs';
import { HOME } from '@/engines/kernel/path';
import { exists } from '@/engines/kernel/vfs';
import type { LessonDefinition } from '../types';
import { ran } from '../authoring/ran';
import { badCommit, goodCommits, isBisecting } from '@/engines/git/bisect';

/** 並行作業・リモート・調査・大規模運用（08〜11 章） */

export const gitParallelWork: LessonDefinition = {
  id: 'git/08/worktree',
  track: 'git',
  kind: 'training',
  title: '切り替えずに並行して作業する',
  intro: {
    summary: 'worktree で別の枝を別の場所に広げ、sparse-checkout で必要な部分だけを広げる。',
    why:
      '急ぎの修正のたびに今の作業をしまって枝を切り替えるのは面倒。別の場所にもう1つ広げれば、切り替えずに並行して作業できる。',
    concepts: concepts('worktree', 'sparse-checkout', 'ブランチ', '作業ツリー'),
    commands: [
      { command: 'git branch <名前>', means: 'ブランチを作る（移らない）' },
      { command: 'git worktree add <場所> <ブランチ>', means: 'そのブランチを別の場所に広げる' },
      { command: 'git sparse-checkout set <ディレクトリ>', means: 'そのディレクトリだけを作業ツリーに残す' },
      { command: 'git ls-files', means: '記録されているファイルの一覧を見る' },
    ],
  },
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
      solution: ['git init', 'git add .', 'git commit -m "base"', 'git branch hotfix'],
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
      solution: ['git worktree add /tmp/hotfix hotfix'],
      assert: ({ shell }) => exists(shell.vfs, '/tmp/hotfix/src/app.ts'),
      explain:
        '同じ .git を共有したまま、別のディレクトリに別のブランチを展開できる。切り替えの待ち時間も、退避の手間も要らない。',
    },
    {
      prompt: '元の作業ツリーを src だけに絞れ。docs を作業ツリーから外すこと。',
      check: 'sparse-checkout が設定され、docs/ が作業ツリーから消えていること',
      hints: ['git sparse-checkout set src'],
      solution: ['git sparse-checkout set src'],
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
      solution: ['git ls-files'],
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
  intro: {
    summary: '手元の歴史を作り直してしまい、リモートと食い違った。安全に push し直す。',
    why:
      'push したあとに歴史を作り直すと、そのままでは送れなくなる。無理やり上書きすると他人の仕事を消すことがある。相手の位置を確かめてから上書きする方法を覚える。',
    concepts: concepts('リモート', 'push', 'amend', 'コミット', 'ブランチ'),
    commands: [
      { command: 'git remote add origin <URL>', means: 'リモートを登録する' },
      { command: 'git push origin main', means: 'main を送る' },
      { command: 'git push origin main --force-with-lease', means: '自分が最後に見た位置のままなら上書きする' },
    ],
  },
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
      solution: ['git init', 'git add .', 'git commit -m "first"', 'git remote add origin https://example.invalid/service.git', 'git push origin main'],
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
      solution: ['echo "def helper(): pass" >> service.py', 'git add .', 'git commit -m "helper"'],
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
      solution: ['echo "def helper(): return 2" > service.py', 'git add .', 'git commit --amend -m "helper v2"'],
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
      solution: ['git push origin main --force-with-lease'],
      assert: ({ shell }) => {
        const git = shell.git;
        if (git === null) return false;
        const local = git.refs.get('refs/heads/main');
        return local !== undefined && git.refs.get('refs/remotes/origin/main') === local;
      },
      diagnose: ({ history }) =>
        ran(history, 'git', 'push', ['--force', '-f'])
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
  intro: {
    summary: 'いつ壊れたのかを bisect で突き止め、同じ事故を hook で入口から止める。',
    why:
      '「前は動いていた」のに、どこで壊れたか分からない。1つずつ見れば時間がかかるが、半分ずつ調べれば何百コミットでも数回で見つかる。',
    concepts: concepts('bisect', 'hook', 'コミット', 'HEAD', 'スクリプト'),
    commands: [
      { command: 'git bisect start', means: '調べ始める' },
      { command: 'git bisect bad HEAD', means: '今は壊れている、と伝える' },
      { command: 'git bisect good HEAD~5', means: '5つ前は良かった、と伝える' },
      { command: 'git bisect good / bad', means: '見せられた版が良いか悪いかを答え続ける' },
      { command: 'git bisect reset', means: '調べ終わって元の場所に戻る' },
    ],
  },
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
      solution: ['git init', 'echo ok > health.txt', 'echo mark1 > f1.txt', 'git add .', 'git commit -m "c1"', 'echo mark2 > f2.txt', 'git add .', 'git commit -m "c2"', 'echo mark3 > f3.txt', 'git add .', 'git commit -m "c3"', 'echo NG > health.txt', 'git add .', 'git commit -m "c4 壊れた"', 'echo mark5 > f5.txt', 'git add .', 'git commit -m "c5"', 'echo mark6 > f6.txt', 'git add .', 'git commit -m "c6"'],
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
      solution: ['git bisect start', 'git bisect bad HEAD', 'git bisect good HEAD~5'],
      // 良い側と悪い側の両方が記録されていれば、次に調べる場所が決まる
      assert: ({ shell }) =>
        shell.git !== null && isBisecting(shell.git) &&
        badCommit(shell.git) !== null && goodCommits(shell.git).length > 0,
      explain:
        '良い版と悪い版が1つずつ分かれば、あとは間を半分に割るだけ。6コミットなら3回で決まる。',
    },
    {
      prompt: 'health.txt を見ながら good / bad を答え続け、犯人を特定せよ。',
      check: '残り候補が 0 件になっていること',
      hints: ['cat health.txt で判定する', 'NG なら git bisect bad、ok なら git bisect good'],
      solution: ['grep -q NG health.txt && git bisect bad || git bisect good', 'grep -q NG health.txt && git bisect bad || git bisect good', 'grep -q NG health.txt && git bisect bad || git bisect good'],
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
      solution: ['git bisect reset', 'echo "grep -q NG health.txt && exit 1" > .git/hooks/pre-commit'],
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
  intro: {
    summary: 'オブジェクトの数を数えて、リポジトリが何で太るのかを確かめる。',
    why:
      '同じ中身なら何回コミットしても1つ分しか場所を取らない。仕組みが分かると、「なぜ重いのか」「何を入れてはいけないか」が読める。',
    concepts: concepts('オブジェクト', 'ハッシュ', 'コミット', 'リポジトリ'),
    commands: [
      { command: 'git count-objects -v', means: 'オブジェクトの数と大きさを見る' },
      { command: 'git fsck', means: 'どこからも指されていないオブジェクトを探す' },
    ],
  },
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
      solution: ['git init', 'git add .', 'git commit -m "first"', 'git count-objects -v'],
      assert: ({ shell, history }) =>
        shell.git !== null &&
        headCommit(shell.git) !== null &&
        ran(history, 'git', 'count-objects'),
      explain: 'コミット1つで、blob（中身）・tree（ディレクトリ）・commit の3つが増える。',
    },
    {
      prompt: '同じ内容のファイルをもう1つ作ってコミットせよ（例: copy.txt に同じ x を書く）。',
      check: 'コミットが2つあり、copy.txt が記録されていること',
      hints: ['cp data.txt copy.txt', 'git add . && git commit -m "copy"'],
      solution: ['cp data.txt copy.txt', 'git add .', 'git commit -m "copy"'],
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
      solution: ['git fsck'],
      assert: ({ history }) => ran(history, 'git', 'fsck'),
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
  intro: {
    summary: 'コミットにタグを付け、名札が同じコミットを指していることを確かめる。',
    why:
      'ブランチもタグも HEAD も、中身は「どのコミットか」を指す札にすぎない。札の種類の違いが分かると、Git の操作がぐっと読みやすくなる。',
    concepts: concepts('タグ', '注釈付きタグ', 'HEAD', 'ブランチ', 'ハッシュ', 'オブジェクト', 'Git', 'コミット'),
    commands: [
      { command: 'git tag <名前>', means: '軽い名札を付ける' },
      { command: 'git tag -a <名前> -m "説明"', means: '説明付きの名札を付ける' },
      { command: 'git rev-parse <名札>', means: 'その名札が指すコミットのハッシュを出す' },
      { command: 'git cat-file -t <名札>', means: '名札の先にあるものの種類を見る' },
    ],
  },
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
      solution: ['git init', 'git add .', 'git commit -m "first"'],
      assert: ({ shell }) => shell.git !== null && headCommit(shell.git) !== null,
      explain: 'この時点で refs/heads/main が、いま作ったコミットを指している。',
    },
    {
      prompt: '軽量タグ v0.1.0 を打て。',
      check: 'タグ v0.1.0 があること',
      hints: ['git tag v0.1.0'],
      solution: ['git tag v0.1.0'],
      assert: ({ shell }) => shell.git !== null && tagNames(shell.git).includes('v0.1.0'),
      explain: '軽量タグは refs/tags/<名前> にコミットのハッシュを書くだけ。ブランチとの違いは「動かないこと」だけ。',
    },
    {
      prompt: '注釈付きタグ v1.0.0 を、メッセージ付きで打て。',
      check: 'タグ v1.0.0 があり、それが tag オブジェクトであること',
      hints: ['git tag -a v1.0.0 -m "最初のリリース"'],
      solution: ['git tag -a v1.0.0 -m "最初のリリース"'],
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
      solution: ['git rev-parse v0.1.0 v1.0.0'],
      assert: ({ history }) => ran(history, 'git', 'rev-parse') || ran(history, 'git', 'cat-file'),
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
  intro: {
    summary: '別のリポジトリを submodule として取り込む。',
    why:
      '共通の部品を写して持つと、直すたびに全部の写しを直すことになる。「どの版を使うか」の1点だけを記録すれば、親は太らず、版もはっきりする。',
    concepts: concepts('submodule', 'リモート', 'push', 'リポジトリ'),
    commands: [
      { command: 'git remote add lib <URL>', means: '部品のリモートを登録する' },
      { command: 'git push lib main', means: '部品を送る' },
      { command: 'git submodule add <URL> <場所>', means: '部品を取り込む' },
      { command: 'cat .gitmodules', means: 'どこから取ってくるかの記録を見る' },
    ],
  },
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
      solution: ['git init', 'git add .', 'git commit -m "first"', 'git remote add lib https://example.invalid/lib.git', 'git push lib main'],
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
      solution: ['git submodule add https://example.invalid/lib.git vendor/lib'],
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
      solution: ['cat .gitmodules'],
      assert: ({ shell }) => {
        const node = shell.vfs.nodes.get(`${HOME}/.gitmodules`);
        return node?.kind === 'file' && node.content.includes('url = ');
      },
      explain:
        'gitlink はコミットしか覚えていないので、「どこから取ってくるか」は .gitmodules が持つ。片方だけでは復元できない。',
    },
  ],
};
