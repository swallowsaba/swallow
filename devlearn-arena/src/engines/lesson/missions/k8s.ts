import { container, deployment, emptyCluster, node, service } from '@/engines/k8s/factory';
import { isReady } from '@/engines/k8s/kubelet';
import type { LessonDefinition } from '../types';

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
