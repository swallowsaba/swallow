import { concepts } from '../glossary';
import { emptyCluster, node } from '@/engines/k8s/factory';
import { isReady } from '@/engines/k8s/kubelet';
import type { Pod } from '@/engines/k8s/types';
import type { ShellState } from '@/engines/kernel/registry';
import type { LessonDefinition } from '../types';
import { NODE, ran } from '../authoring/ran';

/** 持ち主（Deployment など）のいない、単独の Pod web */
function standaloneWeb(shell: ShellState): Pod | null {
  const found = shell.cluster?.pods.get('default/web');
  return found !== undefined && found.metadata.ownerReferences.length === 0 ? found : null;
}

/** Deployment web が持っている Pod */
function ownedPods(shell: ShellState): Pod[] {
  const cluster = shell.cluster;
  if (cluster === null) return [];
  return [...cluster.pods.values()].filter(
    (p) => p.metadata.ownerReferences.length > 0 && p.metadata.labels['app'] === 'web',
  );
}

/** 単独の Pod web が消えてから何秒たったか。消えていなければ null */
function ticksSinceStandaloneGone(timeline: readonly ShellState[]): number | null {
  const current = timeline[timeline.length - 1]?.cluster;
  if (current == null || current.pods.has('default/web')) return null;
  let last = -1;
  timeline.forEach((state, i) => {
    if (standaloneWeb(state) !== null) last = i;
  });
  const gone = timeline[last + 1]?.cluster;
  if (last === -1 || gone == null) return null;
  return current.tick - gone.tick;
}

/** Deployment が持っていた Pod のうち、今は無いもの（消されたもの）があるか */
function ownedPodWasRemoved(timeline: readonly ShellState[]): boolean {
  const current = timeline[timeline.length - 1];
  if (current === undefined) return false;
  const now = new Set(ownedPods(current).map((p) => p.metadata.name));
  return timeline.some((state) => ownedPods(state).some((p) => !now.has(p.metadata.name)));
}

const readyOwned = (shell: ShellState) => ownedPods(shell).filter(isReady).length;

/**
 * Kubernetes の最初の任務。ノードだけがある空のクラスタから始める。
 * Pod を直接作ると消えたら戻らず、Deployment に頼むと戻る。その違いを手で確かめる。
 */
export const k8sFirstPod: LessonDefinition = {
  id: 'k8s/01/first-kubectl',
  track: 'k8s',
  kind: 'training',
  title: '空のクラスタに Pod を作る',
  intro: {
    summary:
      '何も動いていないクラスタに、Pod を1つ手で作って消す。次に Deployment に頼んで作って消す。消したあとに戻ってくるかどうかの違いを見る。',
    why:
      'Kubernetes を使う理由は「決めた数だけ動かし続けてくれる」ことにある。Pod を直接作ると、消えたらそれっきり。Deployment に頼むと、消えても作り直してくれる。この違いを自分の手で確かめると、なぜ現場では Pod を直接作らずに Deployment を使うのかが分かる。',
    concepts: concepts(
      'Kubernetes', 'クラスタ', 'ノード', 'kubectl', 'Pod', 'コンテナ', 'イメージ',
      'Pending', 'Running', 'Deployment', 'ReplicaSet', 'レプリカ', 'controller',
    ),
    commands: [
      { command: 'kubectl get nodes', means: 'クラスタにあるノード（コンピュータ）の一覧を見る' },
      { command: 'kubectl get pods', means: 'Pod の一覧と、それぞれの状態を見る' },
      { command: 'kubectl run web --image=nginx', means: 'nginx というイメージから、web という名前の Pod を1つ作る' },
      { command: 'kubectl wait 10', means: '時間を 10 秒ぶん進める（この練習場だけのコマンド）' },
      { command: 'kubectl delete pod web', means: 'web という名前の Pod を消す' },
      {
        command: 'kubectl create deployment web --image=nginx --replicas=2',
        means: '「nginx の Pod を 2 つ動かし続けて」と頼む Deployment を作る',
      },
    ],
  },
  objectives: [
    'クラスタに何があるかを一覧で見られる',
    'ファイルを書かずに Pod と Deployment を作れる',
    '直接作った Pod は戻らず、Deployment の Pod は戻る理由が分かる',
  ],
  parCommands: 10,
  initial: {
    cluster: emptyCluster([node('node-1', 2000, 4096), node('node-2', 2000, 4096)]),
  },
  steps: [
    {
      prompt: 'クラスタに何があるか見よう。ノード（コンピュータ）の一覧を出し、Pod がまだ 1 つも無いことを確かめよ。',
      check: 'kubectl get nodes を打ったこと（Pod はまだ 0 個のまま）',
      hints: [
        'ノードの一覧は kubectl get nodes、Pod の一覧は kubectl get pods で見られる',
        'kubectl get nodes',
      ],
      solution: ['kubectl get nodes'],
      assert: ({ shell, history }) =>
        shell.cluster !== null && shell.cluster.pods.size === 0 && ran(history, 'kubectl', 'get', NODE),
      explain:
        'ノードが 2 台あり、どちらも Ready（Pod を受け入れられる）になっている。けれど Pod はまだ 1 つも無い。コンピュータはあるが、何も動いていない状態。',
    },
    {
      prompt: 'nginx（Web サーバ）のイメージから、web という名前の Pod を 1 つ作れ。',
      check: 'web という名前の Pod があること',
      hints: [
        'kubectl run <名前> --image=<イメージ> で Pod を 1 つ作れる',
        'kubectl run web --image=nginx',
      ],
      solution: ['kubectl run web --image=nginx'],
      assert: ({ shell }) => standaloneWeb(shell) !== null,
      explain:
        '作った直後の Pod は Pending（置き場所を決めている最中）。kubectl get pods で見ると STATUS の欄にそう出る。',
    },
    {
      prompt: '時間を進めて、web が Running（動いている）になるのを見よ。',
      check: 'Pod web が Running で、Ready になっていること',
      hints: ['この練習場では、時間は kubectl wait <秒> で進める', 'kubectl wait 10'],
      solution: ['kubectl wait 10'],
      assert: ({ shell }) => {
        const found = standaloneWeb(shell);
        return found !== null && isReady(found);
      },
      explain:
        '時間が進むあいだに、配置係（scheduler）が置くノードを決め、そのノードの現場係（kubelet）がコンテナを起動した。kubectl get pods -o wide で、どのノードに置かれたかも見られる。',
    },
    {
      prompt: 'web を消し、時間を進めても作り直されないことを確かめよ。',
      check: 'Pod web が消えて、そのあと 5 秒以上たっても無いままであること',
      hints: [
        'kubectl delete pod <名前> で消せる。そのあと kubectl wait で時間を進め、kubectl get pods で見る',
        'kubectl delete pod web\nkubectl wait 10',
      ],
      solution: ['kubectl delete pod web', 'kubectl wait 10'],
      assert: ({ timeline }) => (ticksSinceStandaloneGone(timeline) ?? -1) >= 5,
      diagnose: ({ timeline }) => {
        const ticks = ticksSinceStandaloneGone(timeline);
        if (ticks === null) return null;
        return `web は消えました。kubectl wait で時間を進めて、戻ってこないことを確かめてください（あと ${String(5 - ticks)} 秒）。`;
      },
      explain:
        'kubectl run で作った Pod には「持ち主」がいない。誰も「web は 1 つあるべき」と覚えていないので、消えたらそれっきり。',
    },
    {
      prompt:
        '今度は Deployment に頼む。nginx の Pod を 2 つ動かし続ける web という Deployment を作り、時間を進めて 2 つとも Running にせよ。',
      check: 'Deployment web があり、その Pod が 2 つ Ready になっていること',
      hints: [
        'kubectl create deployment <名前> --image=<イメージ> --replicas=<数> で作れる。そのあと時間を進める',
        'kubectl create deployment web --image=nginx --replicas=2\nkubectl wait 10',
      ],
      solution: ['kubectl create deployment web --image=nginx --replicas=2', 'kubectl wait 10'],
      assert: ({ shell }) =>
        shell.cluster?.deployments.has('default/web') === true && readyOwned(shell) === 2,
      explain:
        'Pod の名前が web-b0xusf-00001 のように長くなった。Deployment が ReplicaSet（数を合わせる係）を作り、その係が Pod を作ったので、名前に印が付いている。',
    },
    {
      prompt: 'Deployment の Pod を 1 つ消し、時間を進めて、今度は作り直されることを確かめよ。',
      check: 'Deployment の Pod を消したあと、また 2 つ Ready になっていること',
      hints: [
        'kubectl get pods で名前を確かめ、kubectl delete pod <名前> で 1 つ消す。そのあと kubectl wait で時間を進める',
        'kubectl delete pod web-b0xusf-00001\nkubectl wait 10',
      ],
      solution: ['kubectl delete pod web-b0xusf-00001', 'kubectl wait 10'],
      assert: ({ shell, timeline }) => ownedPodWasRemoved(timeline) && readyOwned(shell) === 2,
      diagnose: ({ shell, timeline }) => {
        if (!ownedPodWasRemoved(timeline)) {
          return 'まだ Deployment の Pod を消していません。kubectl get pods で名前を確かめてください。';
        }
        if (readyOwned(shell) < 2) return '消せました。kubectl wait で時間を進めると、足りない分が作り直されます。';
        return null;
      },
      explain:
        '同じ「Pod を消す」でも結果が違った。Deployment は「web は 2 つあるべき」を覚えていて、見張り係（controller）が今の数と比べ続けている。1 つ減ったのを見つけると、足りない分を新しく作る。消えた Pod が生き返ったのではなく、名前の違う新しい Pod ができていることも kubectl get pods で確かめよう。',
    },
  ],
};
