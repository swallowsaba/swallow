import { concepts } from '../glossary';
import { container, deployment, emptyCluster, node, service } from '@/engines/k8s/factory';
import { isReady } from '@/engines/k8s/kubelet';
import type { LessonDefinition } from '../types';

export { k8sFirstPod } from './k8sFirst';

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
