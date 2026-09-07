import { HOME } from '@/engines/kernel/path';
import { branches, currentBranch, headCommit, log, status } from '@/engines/git/repository';
import { container, deployment, emptyCluster, node, service } from '@/engines/k8s/factory';
import { isReady } from '@/engines/k8s/kubelet';
import { createRepo } from '@/engines/github/pr';
import { host, iface, link, resetMac, router, topology } from '@/engines/net/factory';
import { exists, isDir, list, readFile } from '@/engines/kernel/vfs';
import type { LessonDefinition } from './types';

/** ボス戦の初期状態を作る。ログが溢れてディスクが逼迫している想定。 */
function floodedLog(lines: number): string {
  return Array.from(
    { length: lines },
    (_, i) => `2026-05-0${String((i % 9) + 1)} ERROR connection reset by peer (retry ${String(i)})`,
  ).join('\n');
}

export const shellWarmup: LessonDefinition = {
  id: 'kernel/00/shell-warmup',
  track: 'kernel',
  kind: 'training',
  title: 'シェルに慣れる',
  objectives: ['ディレクトリを作って移動できる', 'リダイレクトで書き出せる', 'パイプで繋げる'],
  parCommands: 5,
  initial: {},
  steps: [
    {
      prompt: 'ホームに reports ディレクトリを作れ。',
      check: '~/reports がディレクトリとして存在すること',
      hints: ['mkdir でディレクトリを作れる', 'mkdir reports'],
      assert: ({ shell }) => isDir(shell.vfs, `${HOME}/reports`),
      diagnose: ({ shell }) => {
        const wrongPlace = [...shell.vfs.nodes.keys()].find(
          (p) => p.endsWith('/reports') && p !== `${HOME}/reports`,
        );
        if (wrongPlace !== undefined) {
          return `reports は ${wrongPlace} にできています。作る場所はホーム（${HOME}）です。cd ~ で戻れます。`;
        }
        return null;
      },
      explain: 'mkdir は親が無いと失敗する。深い階層をまとめて作るなら -p を付ける。',
    },
    {
      prompt: 'reports/hosts.txt に /etc/hosts の中身を書き出せ。',
      check: '~/reports/hosts.txt が存在し、中身に localhost が含まれること',
      hints: ['> はコマンドの標準出力をファイルに向ける', 'cat /etc/hosts > reports/hosts.txt'],
      assert: ({ shell }) => {
        const path = `${HOME}/reports/hosts.txt`;
        return exists(shell.vfs, path) && readFile(shell.vfs, path).includes('localhost');
      },
      diagnose: ({ shell }) => {
        const dir = `${HOME}/reports`;
        if (!isDir(shell.vfs, dir)) return null;
        const path = `${dir}/hosts.txt`;
        if (exists(shell.vfs, path)) {
          return 'hosts.txt はできていますが、中身に localhost が見当たりません。/etc/hosts の中身がそのまま入っているか確かめてください。';
        }
        const others = list(shell.vfs, dir).filter((n) => n !== 'hosts.txt');
        const near = others.find((n) => n.startsWith('hosts'));
        if (near !== undefined) {
          return `reports/${near} ができていますが、求めているのは hosts.txt です。コピー先にディレクトリを指定すると元の名前のままコピーされます。mv reports/${near} reports/hosts.txt で直せます。`;
        }
        if (others.length > 0) {
          return `reports の中にあるのは ${others.join(', ')} です。hosts.txt という名前で作ってください。`;
        }
        return null;
      },
      explain: '> は毎回ファイルを空にしてから書く。追記したいときは >> を使う。',
    },
    {
      prompt: 'そのファイルから localhost を含む行だけを reports/local.txt に残せ。',
      check: '~/reports/local.txt の全ての行に localhost が含まれること（空でないこと）',
      hints: ['grep とリダイレクトを組み合わせる', 'grep localhost reports/hosts.txt > reports/local.txt'],
      assert: ({ shell }) => {
        const path = `${HOME}/reports/local.txt`;
        if (!exists(shell.vfs, path)) return false;
        const lines = readFile(shell.vfs, path).split('\n').filter((l) => l !== '');
        return lines.length > 0 && lines.every((l) => l.includes('localhost'));
      },
      diagnose: ({ shell }) => {
        const path = `${HOME}/reports/local.txt`;
        if (!exists(shell.vfs, path)) return null;
        const lines = readFile(shell.vfs, path).split('\n').filter((l) => l !== '');
        if (lines.length === 0) return 'local.txt が空です。grep の結果が0件だった可能性があります。';
        const bad = lines.find((l) => !l.includes('localhost'));
        if (bad !== undefined) {
          return `local.txt に localhost を含まない行が混ざっています（例: ${bad}）。grep で絞り込めているか確かめてください。`;
        }
        return null;
      },
      explain: '判定は最終的な中身を見ている。パイプで解いてもリダイレクトで解いても正解になる。',
    },
  ],
};

export const diskFullBoss: LessonDefinition = {
  id: 'kernel/00/disk-full',
  track: 'kernel',
  kind: 'boss',
  title: 'ディスク逼迫',
  objectives: ['溢れたログを止める', '不要な世代を消す', '対応記録を残す'],
  parCommands: 8,
  initial: {
    cwd: '/var/log',
    files: {
      [HOME]: null,
      '/var/log/app.log': floodedLog(400),
      '/var/log/old/2026-03.log': floodedLog(120),
      '/var/log/old/2026-04.log': floodedLog(120),
      '/srv/app/RUNBOOK.txt':
        '障害対応の手順\n1. 一番大きいログを空にする\n2. 古い世代のログを消す\n3. 対応記録を /srv/app/RECOVERY.md に残す（rotate の方針を書くこと）\n',
      '/etc/hosts': '127.0.0.1\tlocalhost\n',
    },
  },
  steps: [
    {
      prompt: '容量を食っているログを特定し、中身を空にせよ。ファイル自体は消すな。',
      check: '/var/log/app.log が存在し、中身が空であること',
      hints: [
        'ls -l で大きさが見える。wc -l でも行数を比べられる',
        '> /var/log/app.log と打つと、ファイルを残したまま中身だけ空にできる',
      ],
      assert: ({ shell }) =>
        exists(shell.vfs, '/var/log/app.log') && readFile(shell.vfs, '/var/log/app.log') === '',
      diagnose: ({ shell }) => {
        if (!exists(shell.vfs, '/var/log/app.log')) {
          return 'app.log ごと消えています。ファイルは残したまま中身だけ空にしてください。書き込み中のプロセスが掴んだままだと容量が戻らないためです。';
        }
        return null;
      },
      explain:
        'ログファイルを rm すると、書き込み中のプロセスがファイルを掴んだままになり容量が戻らないことがある。中身だけ空にするのが定石。',
    },
    {
      prompt: '/var/log/old に残っている古い世代のログを片付けろ。',
      check: '/var/log/old に .log ファイルが1つも無いこと（ディレクトリごと消してもよい）',
      hints: ['ディレクトリごと消すなら rm -r', 'rm -r /var/log/old'],
      assert: ({ shell }) => {
        if (!exists(shell.vfs, '/var/log/old')) return true;
        return list(shell.vfs, '/var/log/old').filter((n) => n.endsWith('.log')).length === 0;
      },
      explain: '消す前に、本当に不要かを確認する癖をつける。RUNBOOK に手順が書いてあるのはそのため。',
    },
    {
      prompt: '/srv/app/RECOVERY.md に対応記録を残せ。再発防止として rotate の方針を書くこと。',
      check: '/srv/app/RECOVERY.md が存在し、中身に rotate が含まれること',
      hints: [
        'echo とリダイレクトで書ける',
        'echo "logrotate を導入して日次で rotate する" > /srv/app/RECOVERY.md',
      ],
      assert: ({ shell }) => {
        const path = '/srv/app/RECOVERY.md';
        return exists(shell.vfs, path) && readFile(shell.vfs, path).includes('rotate');
      },
      diagnose: ({ shell }) => {
        const path = '/srv/app/RECOVERY.md';
        if (exists(shell.vfs, path)) return '記録はありますが、rotate という語が含まれていません。';
        return null;
      },
      explain: '記録が無い対応は再発する。何を見て、何をして、次にどう防ぐかを残すまでが復旧作業。',
    },
  ],
};

export const gitFirstCommit: LessonDefinition = {
  id: 'git/01/objects',
  track: 'git',
  kind: 'training',
  title: '最初のコミットを刻む',
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
      assert: ({ shell }) => shell.git !== null,
      explain:
        'init で作られるのは .git というディレクトリだけ。ファイルの中身はまだ1つも記録されていない。',
    },
    {
      prompt: 'notes.md だけをインデックスに載せよ。draft.txt はまだ載せるな。',
      check: 'インデックスに notes.md があり、draft.txt が無いこと',
      hints: ['git add <ファイル名>', 'git add notes.md'],
      assert: ({ shell }) =>
        shell.git !== null && shell.git.index.has('notes.md') && !shell.git.index.has('draft.txt'),
      explain:
        'add は「次のコミットに含めるものを選ぶ」操作。全部を無条件に含めないのが index の存在理由。',
    },
    {
      prompt: 'メッセージを付けてコミットせよ。',
      check: 'コミットが1つ以上あり、notes.md が記録されていること',
      hints: ['git commit -m "メッセージ"'],
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
  objectives: ['ブランチはポインタだと分かる', '分けた作業を統合できる', '早送りと統合の違いが分かる'],
  parCommands: 10,
  initial: { files: { ...GIT_FILES } },
  steps: [
    {
      prompt: 'リポジトリを作り、いまのファイルを最初のコミットとして記録せよ。',
      check: 'コミットが1つ以上あること',
      hints: ['git init', 'git add . のあと git commit -m "..."'],
      assert: ({ shell }) => shell.git !== null && log(shell.git).length >= 1,
      explain: '最初のコミットには親が無い。ここが履歴の根になる。',
    },
    {
      prompt: 'feature という名前のブランチを作り、そこへ移れ。',
      check: 'feature ブランチが存在し、HEAD がそれを指していること',
      hints: ['git switch -c feature', 'branch と switch を分けて打ってもよい'],
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
      assert: ({ shell }) =>
        shell.git !== null && currentBranch(shell.git) === 'feature' && log(shell.git).length >= 2,
      explain: 'この時点で main は動いていない。feature のポインタだけが1つ先へ進んでいる。',
    },
    {
      prompt: 'main に戻り、feature の変更を取り込め。',
      check: 'main にいて、feature の内容が取り込まれていること',
      hints: ['git switch main', 'git merge feature'],
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
  objectives: ['衝突マーカを読める', '意味を壊さず統合できる', '解決してコミットできる'],
  parCommands: 12,
  initial: { files: { ...GIT_FILES } },
  steps: [
    {
      prompt: 'リポジトリを作り、app.txt を最初のコミットに含めよ。',
      check: 'コミットが1つ以上あり、app.txt が記録されていること',
      hints: ['git init', 'git add app.txt', 'git commit -m "base"'],
      assert: ({ shell }) => shell.git !== null && log(shell.git).length >= 1,
      explain: '衝突を起こすには、まず共通の祖先が要る。',
    },
    {
      prompt: 'topic ブランチを作り、app.txt の 2 行目を書き換えてコミットせよ。',
      check: 'topic にコミットがあり、app.txt が変わっていること',
      hints: ['git switch -c topic', 'vi app.txt で2行目を書き換える'],
      assert: ({ shell }) =>
        shell.git !== null && branches(shell.git).includes('topic') && log(shell.git).length >= 2,
      explain: 'ここまでは分岐しただけ。まだ衝突は起きていない。',
    },
    {
      prompt: 'main に戻り、同じ 2 行目を別の内容に書き換えてコミットせよ。',
      check: 'main と topic が別々のコミットを指していること',
      hints: ['git switch main', '同じ行を違う内容にするのが要点'],
      assert: ({ shell }) => {
        if (shell.git === null) return false;
        const main = shell.git.refs.get('refs/heads/main');
        const topic = shell.git.refs.get('refs/heads/topic');
        return main !== undefined && topic !== undefined && main !== topic;
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

/** ラベルが食い違っていて、Service から繋がらないクラスタ */
function brokenServiceCluster() {
  return {
    ...emptyCluster([node('node-1', 2000, 4096), node('node-2', 2000, 4096)]),
    deployments: new Map([
      ['default/web', deployment('web', 2, [container('nginx', 'nginx:1.25')], { labels: { app: 'web' } })],
    ]),
    // selector が app=frontend になっており、Pod のラベル app=web と一致しない
    services: new Map([['default/web', service('web', { app: 'frontend' })]]),
  };
}

export const k8sFirstPod: LessonDefinition = {
  id: 'k8s/01/first-kubectl',
  track: 'k8s',
  kind: 'training',
  title: 'クラスタを覗く',
  objectives: ['資源の一覧を読める', 'Pod が消えても戻る理由が分かる', '数を変えられる'],
  parCommands: 8,
  initial: {
    cluster: {
      ...emptyCluster([node('node-1', 2000, 4096), node('node-2', 2000, 4096)]),
      deployments: new Map([
        ['default/web', deployment('web', 2, [container('nginx', 'nginx:1.25')], { labels: { app: 'web' } })],
      ]),
    },
  },
  steps: [
    {
      prompt: '時間を進めて、Pod を 2 つとも Running にせよ。',
      check: 'Ready な Pod が 2 つあること',
      hints: ['kubectl get pods で今の状態が見える', 'kubectl wait 10 で時間を進められる'],
      assert: ({ shell }) =>
        shell.cluster !== null &&
        [...shell.cluster.pods.values()].filter(isReady).length === 2,
      explain:
        'apply は「こうあってほしい」を置くだけ。実際に Pod を作るのはコントローラで、tick ごとに差を埋めていく。',
    },
    {
      prompt: 'Pod を 1 つ消し、時間を進めて、また 2 つに戻ることを確かめよ。',
      check: 'Pod を削除した記録があり、Ready な Pod が再び 2 つあること',
      hints: ['kubectl get pods で名前を確かめる', 'kubectl delete pod <名前>', 'kubectl wait 10'],
      assert: ({ shell }) => {
        if (shell.cluster === null) return false;
        const deleted = shell.history.some((line) => line.includes('delete pod'));
        return deleted && [...shell.cluster.pods.values()].filter(isReady).length === 2;
      },
      explain:
        '消えたことに反応したのではない。「2 つあるべき」と「1 つしかない」の差を、次の tick で埋めただけ。これが宣言的ということ。',
    },
    {
      prompt: 'replicas を 4 に増やし、全て Running にせよ。',
      check: 'Ready な Pod が 4 つあること',
      hints: ['kubectl scale deploy web --replicas=4', 'そのあと kubectl wait 12'],
      assert: ({ shell }) =>
        shell.cluster !== null &&
        [...shell.cluster.pods.values()].filter(isReady).length === 4,
      explain: 'スケジューラは requests と各ノードの空き容量を比べて配置先を決めている。',
    },
  ],
};

export const k8sServiceBoss: LessonDefinition = {
  id: 'k8s/07/boss-service-no-endpoint',
  track: 'k8s',
  kind: 'boss',
  title: 'Pod は動いているのに繋がらない',
  objectives: ['Endpoints に載る条件を知る', 'ラベルとセレクタの一致を確かめられる'],
  parCommands: 10,
  initial: { cluster: brokenServiceCluster() },
  steps: [
    {
      prompt: 'まず Pod を Running にし、Service の Endpoints が空であることを確かめよ。',
      check: 'Ready な Pod が 2 つあり、Service の Endpoints が空のままであること',
      hints: ['kubectl wait 12', 'kubectl get svc で Endpoints の欄を見る'],
      assert: ({ shell }) => {
        if (shell.cluster === null) return false;
        const running = [...shell.cluster.pods.values()].filter(isReady).length === 2;
        const svc = shell.cluster.services.get('default/web');
        return running && svc !== undefined && svc.status.endpoints.length === 0;
      },
      explain:
        'Pod が Running でも Endpoints は自動では埋まらない。セレクタに一致し、かつ Ready であることが条件。',
    },
    {
      prompt: '原因を突き止め、Service から Pod に繋がるようにせよ。',
      check: 'Service の Endpoints に 2 つの Pod IP が載っていること',
      hints: [
        'kubectl endpoints web で、どの Pod が一致しているかが見える',
        'Pod のラベルは app=web、Service のセレクタは app=frontend',
        'kubectl set selector svc web app=web で直せる',
      ],
      assert: ({ shell }) => {
        const svc = shell.cluster?.services.get('default/web');
        return svc !== undefined && svc.status.endpoints.length === 2;
      },
      diagnose: ({ shell }) => {
        const cluster = shell.cluster;
        if (cluster === null) return null;
        const svc = cluster.services.get('default/web');
        if (svc === undefined) return 'Service が消えています。';
        const running = [...cluster.pods.values()].filter(isReady).length;
        if (running < 2) return 'まず Pod を Running にしてください（kubectl wait）。';
        if (svc.spec.selector['app'] === 'frontend') {
          return 'Service のセレクタが app=frontend のままです。Pod のラベルは app=web です。';
        }
        return null;
      },
      explain:
        'この形の障害は現場で頻出する。Pod を見ても Running としか出ないので、Service 側のセレクタと Pod のラベルを突き合わせる癖をつけること。',
    },
  ],
};

/** web が待ち受けていないため、ping は通るのに curl が失敗する構成 */
function brokenServiceNet(listening: number[]) {
  resetMac();
  const pc1 = host('pc1', [iface('eth0', '192.168.1.10', 24)], {
    routes: [{ destination: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
  });
  const gw = router('gw', [iface('eth0', '192.168.1.1', 24), iface('eth1', '10.0.0.1', 24)]);
  const web = host('web', [iface('eth0', '10.0.0.20', 24)], {
    routes: [{ destination: '0.0.0.0/0', via: '10.0.0.1', dev: 'eth0' }],
    listening,
  });
  return topology(
    [pc1, gw, web],
    [link('pc1:eth0', 'gw:eth0'), link('gw:eth1', 'web:eth0')],
    { 'web.internal': '10.0.0.20' },
  );
}

export const netFirstHop: LessonDefinition = {
  id: 'net/05/ttl-hop',
  track: 'net',
  kind: 'training',
  title: '経路をたどる',
  objectives: ['自分のアドレスと経路を読める', 'ホップごとに何が変わるか分かる', 'CIDR を計算できる'],
  parCommands: 8,
  initial: {
    net: brokenServiceNet([80]),
    vars: { NET_SELF: 'pc1' },
    files: { '/home/learner': null },
  },
  steps: [
    {
      prompt: '自分のアドレスと経路表を確認せよ。',
      check: 'ip addr と ip route を実行したこと',
      hints: ['ip addr', 'ip route'],
      assert: ({ history }) =>
        history.some((l) => l.includes('ip addr')) && history.some((l) => l.includes('ip route')),
      explain:
        '自分の IP とマスク、そしてデフォルトゲートウェイ。切り分けはここから始める。',
    },
    {
      prompt: 'web.internal まで届くことを確かめ、経路を1ホップずつ表示せよ。',
      check: 'ping と traceroute を実行したこと',
      hints: ['ping web.internal', 'traceroute web.internal'],
      assert: ({ history }) =>
        history.some((l) => l.startsWith('ping')) && history.some((l) => l.startsWith('traceroute')),
      explain:
        'ホップごとに TTL が 1 ずつ減り、MAC は次の相手のものに書き換わる。IP だけが最後まで変わらない。',
    },
    {
      prompt: '/home/learner/subnet.txt に、192.168.1.10/26 のネットワークアドレスを書き出せ。',
      check: 'subnet.txt に 192.168.1.0 が含まれること',
      hints: ['ipcalc 192.168.1.10/26 で計算できる', 'ipcalc の結果をそのまま書き出してもよい'],
      assert: ({ shell }) => {
        const node = shell.vfs.nodes.get('/home/learner/subnet.txt');
        return node?.kind === 'file' && node.content.includes('192.168.1.0');
      },
      explain:
        '/26 はホスト部が 6 ビット。62 台まで置ける。設計はこの計算が土台になる。',
    },
  ],
};

export const netUnreachableBoss: LessonDefinition = {
  id: 'net/14/boss-final',
  track: 'net',
  kind: 'boss',
  title: 'ping は通るのに curl が失敗する',
  objectives: ['層ごとに切り分けられる', '到達性と待ち受けの違いが分かる'],
  parCommands: 10,
  initial: {
    net: brokenServiceNet([]),
    vars: { NET_SELF: 'pc1' },
    files: { '/home/learner': null },
  },
  steps: [
    {
      prompt: '症状を確かめよ。ping と curl の両方を試すこと。',
      check: 'ping と curl を実行したこと',
      hints: ['ping web.internal', 'curl -v http://web.internal/'],
      assert: ({ history }) =>
        history.some((l) => l.startsWith('ping')) && history.some((l) => l.startsWith('curl')),
      explain:
        'ping が通るなら、IP までは届いている。つまり経路とケーブルは生きている。問題はその上の層。',
    },
    {
      prompt: '/home/learner/diagnosis.txt に、どの層まで到達していて何が原因かを書け。「refused」という語を含めること。',
      check: 'diagnosis.txt に refused が含まれること',
      hints: [
        'curl -v の最後の行に理由が出ている',
        'echo "IP までは到達。TCP 80 が Connection refused" > diagnosis.txt',
      ],
      assert: ({ shell }) => {
        const node = shell.vfs.nodes.get('/home/learner/diagnosis.txt');
        return node?.kind === 'file' && node.content.includes('refused');
      },
      diagnose: ({ shell }) => {
        const node = shell.vfs.nodes.get('/home/learner/diagnosis.txt');
        if (node === undefined) return null;
        if (node.kind === 'file' && !node.content.includes('refused')) {
          return 'ファイルはありますが refused の語がありません。curl の出力をもう一度読んでください。';
        }
        return null;
      },
      explain:
        'Connection refused は「届いたが、そのポートで誰も待っていない」という意味。' +
        'タイムアウト（届いていない）とは原因がまるで違う。この2つを混同しないことが切り分けの要。',
    },
  ],
};

const CI_YAML = `name: CI
on:
  push:
  pull_request:
jobs:
  lint:
    name: Lint
    steps:
      - name: run eslint
        run: npm run lint
  test:
    name: Test
    steps:
      - name: run vitest
        run: npm test
  build:
    name: Build
    needs: [lint, test]
    steps:
      - name: build
        run: npm run build
`;

export const ghPullRequest: LessonDefinition = {
  id: 'github/04/boss-blocked-merge',
  track: 'github',
  kind: 'boss',
  title: 'マージできない理由を全部潰す',
  objectives: ['保護ルールの意味が分かる', 'CI の依存関係を読める', 'レビューとチェックを揃えられる'],
  parCommands: 12,
  initial: {
    repo: createRepo('acme', 'app'),
    files: {
      [HOME]: null,
      [`${HOME}/.github/workflows/ci.yml`]: CI_YAML,
    },
  },
  steps: [
    {
      prompt: 'main ブランチを保護せよ。承認を 1 件、必須チェックを Build にすること。',
      check: 'main の保護ルールがあり、承認 1 件と Build が必須になっていること',
      hints: ['gh protect main --approvals=1 --checks=Build'],
      assert: ({ shell }) => {
        const rule = shell.repo?.protections.find((p) => p.branch === 'main');
        return rule !== undefined && rule.requiredApprovals >= 1 && rule.requiredChecks.includes('Build');
      },
      explain:
        '保護ルールは「人が気を付ける」を「仕組みで止める」に変える。直 push を塞ぎ、条件を満たさない限りマージさせない。',
    },
    {
      prompt: 'feature ブランチから Pull Request を作れ。',
      check: 'open な Pull Request が1つ以上あること',
      hints: ['gh pr create -t "機能追加" -b feature'],
      assert: ({ shell }) => (shell.repo?.pulls.filter((p) => p.state === 'open').length ?? 0) >= 1,
      explain: 'PR は差分を出す場所ではなく、意図を伝えて合意を取る場所。',
    },
    {
      prompt: 'CI を走らせ、どのジョブが何に依存しているかを確かめよ。',
      check: 'Pull Request にチェックの結果が記録されていること',
      hints: ['gh workflow で構造が見える', 'gh pr checks 1 で実行できる'],
      assert: ({ shell }) => (shell.repo?.pulls[0]?.checks.length ?? 0) > 0,
      explain:
        'Build は lint と test の両方に依存している。どちらかが失敗すれば Build は実行されず skipped になる。',
    },
    {
      prompt: 'すべての条件を満たして、Pull Request をマージせよ。',
      check: 'Pull Request が merged になっていること',
      hints: [
        'gh pr view 1 で、足りないものが全部出る',
        'gh pr review 1 --approve -r mentor で承認する',
        'gh pr checks 1 で Build を成功させる',
        'gh pr merge 1 --squash',
      ],
      assert: ({ shell }) => shell.repo?.pulls.some((p) => p.state === 'merged') === true,
      diagnose: ({ shell }) => {
        const repo = shell.repo;
        const pull = repo?.pulls[0];
        if (!repo || !pull) return null;
        const approvals = pull.reviews.filter((r) => r.state === 'approved').length;
        const build = pull.checks.find((c) => c.name === 'Build');
        if (approvals === 0) return 'まだ承認がありません。gh pr review 1 --approve -r mentor で承認してください。';
        if (build === undefined) return 'Build のチェックが未実行です。gh pr checks 1 を実行してください。';
        if (build.status !== 'success') return 'Build が成功していません。失敗の原因を取り除いて実行し直してください。';
        return null;
      },
      explain:
        'squash なら履歴に残るのは 1 コミット、merge ならマージコミットが増え、rebase なら載せ替えになる。' +
        'チームの読みやすさに合わせて選ぶ。',
    },
  ],
};

export const missions: readonly LessonDefinition[] = [
  shellWarmup,
  gitFirstCommit,
  gitBranching,
  gitConflictDrill,
  k8sFirstPod,
  k8sServiceBoss,
  netFirstHop,
  netUnreachableBoss,
  ghPullRequest,
  diskFullBoss,
];

export function findMission(id: string): LessonDefinition | undefined {
  return missions.find((m) => m.id === id || m.id.endsWith(`/${id}`));
}
