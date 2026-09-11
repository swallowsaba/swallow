import { concepts } from '../glossary';
import { container, deployment, emptyCluster, node, service } from '@/engines/k8s/factory';
import { isReady } from '@/engines/k8s/kubelet';
import type { LessonDefinition } from '../types';
import { POD, ran } from '../authoring/ran';

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
  intro: {
    summary: 'クラスタを覗き、Pod を消しても戻ってくること、数を変えられることを確かめる。',
    why:
      'Kubernetes は「決めた数だけ動かし続ける」ことを人の代わりにやってくれる。消しても戻る、を自分の目で見ると、その仕組みが腑に落ちる。',
    concepts: concepts('Kubernetes', 'クラスタ', 'Pod', 'Deployment', 'レプリカ', 'kubectl'),
    commands: [
      { command: 'kubectl get pods', means: 'Pod の一覧と状態を見る' },
      { command: 'kubectl wait <秒>', means: '時間を進める' },
      { command: 'kubectl delete pods -l app=web', means: 'app=web のラベルが付いた Pod を消す' },
      { command: 'kubectl scale deploy web --replicas=4', means: 'あるべき数を 4 にする' },
    ],
  },
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
      solution: ['kubectl wait 10'],
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
      solution: ['kubectl delete pods -l app=web', 'kubectl wait 10'],
      assert: ({ shell }) => {
        if (shell.cluster === null) return false;
        const deleted = ran(shell.history, 'kubectl', 'delete', POD);
        return deleted && [...shell.cluster.pods.values()].filter(isReady).length === 2;
      },
      explain:
        '消えたことに反応したのではない。「2 つあるべき」と「1 つしかない」の差を、次の tick で埋めただけ。これが宣言的ということ。',
    },
    {
      prompt: 'replicas を 4 に増やし、全て Running にせよ。',
      check: 'Ready な Pod が 4 つあること',
      hints: ['kubectl scale deploy web --replicas=4', 'そのあと kubectl wait 12'],
      solution: ['kubectl scale deploy web --replicas=4', 'kubectl wait 12'],
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
  intro: {
    summary: 'Pod は動いているのに Service から繋がらない。原因を突き止めて直す。',
    why:
      '現場でとても多い障害。Pod だけ見ると元気なので気付きにくい。Service が「どのラベルの Pod を選んでいるか」を突き合わせる癖をつける。',
    concepts: concepts('Service', 'Endpoints', 'セレクタ', 'ラベル', 'Pod', 'Ready'),
    commands: [
      { command: 'kubectl get svc', means: 'Service の一覧を見る' },
      { command: 'kubectl endpoints <名前>', means: 'Service が繋ぐ Pod の一覧を見る' },
      { command: 'kubectl set selector svc <名前> <キー>=<値>', means: 'Service の選び方を直す' },
    ],
  },
  objectives: ['Endpoints に載る条件を知る', 'ラベルとセレクタの一致を確かめられる'],
  parCommands: 10,
  initial: { cluster: brokenServiceCluster() },
  steps: [
    {
      prompt: 'まず Pod を Running にし、Service の Endpoints が空であることを確かめよ。',
      check: 'Ready な Pod が 2 つあり、Service の Endpoints が空のままであること',
      hints: ['kubectl wait 12', 'kubectl get svc で Endpoints の欄を見る'],
      solution: ['kubectl wait 12', 'kubectl get svc'],
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
      solution: ['kubectl set selector svc web app=web', 'kubectl wait 2'],
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
