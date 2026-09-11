import { concepts } from '../glossary';
import { advanceCluster } from '@/engines/k8s/controllers';
import { container, deployment, emptyCluster, node, probe, quantity, service } from '@/engines/k8s/factory';
import { tickPods } from '@/engines/k8s/kubelet';
import type { ClusterState, Deployment, Pod, Service } from '@/engines/k8s/types';
import { readyPods, resourceWhere, withCluster } from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import { createDeploymentFirst, startingEmpty } from './k8sBuild';
import { family, k8sDoc } from './shared';
import { APP_NAMES } from './values';

const SVC_DOC = k8sDoc('concepts/services-networking/service/', 'Service');
const PROBE_DOC = k8sDoc(
  'tasks/configure-pod-container/configure-liveness-readiness-startup-probes/',
  'Configure Probes',
);
const DEBUG_DOC = k8sDoc('tasks/debug/debug-application/debug-pods/', 'Debug Pods');
const RES_DOC = k8sDoc('concepts/configuration/manage-resources-containers/', 'Resource Management');

function settled(state: ClusterState, times: number): ClusterState {
  let current = state;
  for (let i = 0; i < times; i += 1) current = advanceCluster(current, tickPods);
  return current;
}

/* ------------------------------------------------------------------ *
 * k8s/07 Service に endpoint が載らない
 * ------------------------------------------------------------------ */

interface SelectorSpec {
  slug: string;
  app: string;
  wrong: string;
}

const SELECTORS: SelectorSpec[] = APP_NAMES.map((app) => ({
  slug: app,
  app,
  wrong: `${app}-svc`,
}));

function brokenService(v: SelectorSpec): ClusterState {
  return settled(
    {
      ...emptyCluster([node('node-1', 4000, 8192), node('node-2', 4000, 8192)]),
      deployments: new Map([
        [
          `default/${v.app}`,
          deployment(v.app, 2, [container(v.app, 'nginx:1.27')], { labels: { app: v.app } }),
        ],
      ]),
      services: new Map([[`default/${v.app}`, service(v.app, { app: v.wrong })]]),
    },
    16,
  );
}

const selectorDrills = family<SelectorSpec>({
  track: 'k8s',
  chapterId: 'k8s/07',
  family: 'no-endpoint',
  docs: [SVC_DOC],
  variants: SELECTORS.map((value) => ({ slug: value.slug, value })),
  make: (v) => ({
    title: `${v.app}: Pod は動いているのに Service で繋がらない`,
    intro: {
      summary: 'Pod は動いているのに Service から繋がらない原因を、ラベルとセレクタの食い違いから探す。',
      why:
        '現場でとてもよく起きる障害。Pod だけ見ると元気なので気付きにくい。Service 側の「誰を選んでいるか」を突き合わせる癖をつける。',
      concepts: concepts('Service', 'Endpoints', 'セレクタ', 'ラベル', 'Pod'),
      commands: [
        { command: 'kubectl get svc', means: 'Service の一覧を見る' },
        { command: 'kubectl endpoints <名前>', means: 'Service が繋ぐ Pod の一覧を見る' },
        { command: 'kubectl label pods -l <キー>=<値> <キー>=<新しい値> --overwrite', means: 'Pod のラベルを付け直す' },
        { command: 'kubectl set selector svc <名前> <キー>=<値>', means: 'Service の選び方のほうを直す' },
      ],
    },
    objectives: ['endpoint に載る条件が言える', 'セレクタとラベルの食い違いを見つけられる'],
    initial: { cluster: brokenService(v) },
    solution: [`kubectl label pods -l app=${v.app} app=${v.wrong} --overwrite`],
    steps: [
      {
        prompt: `Service ${v.app} に endpoint が載るように直せ。Pod 側のラベルを合わせてもよいし、Service 側のセレクタを直してもよい。`,
        conditions: [
          {
            label: `Service ${v.app} の endpoint が 2 件あること`,
            test: withCluster((c) => {
              const svc = c.services.get(`default/${v.app}`);
              if (!svc) return false;
              const selector = svc.spec.selector;
              return (
                [...c.pods.values()].filter(
                  (p) =>
                    p.status.containerStatuses.every((s) => s.ready) &&
                    Object.entries(selector).every(([k, val]) => p.metadata.labels[k] === val),
                ).length === 2
              );
            }),
            howTo: 'kubectl endpoints <名前> で、いま何件載っているか見えます',
          },
        ],
        hints: [
          'kubectl describe svc で selector を確かめる',
          'kubectl get pods --show-labels で Pod のラベルを確かめる',
          `kubectl label pods -l app=${v.app} app=${v.wrong} --overwrite`,
        ],
        explain:
          'endpoint に載る条件は2つだけ。セレクタに一致していること、そして Ready であること。どちらかが欠けると、Pod が動いていても繋がらない。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * k8s/07 Service の種類
 * ------------------------------------------------------------------ */

const TYPES: { slug: string; value: { name: string; type: 'NodePort' | 'LoadBalancer' } }[] =
  APP_NAMES.map((name, i) => ({
    slug: `${name}-${i % 2 === 0 ? 'nodeport' : 'lb'}`,
    value: { name, type: i % 2 === 0 ? 'NodePort' : 'LoadBalancer' },
  }));

const typeDrills = family<{ name: string; type: 'NodePort' | 'LoadBalancer' }>({
  track: 'k8s',
  chapterId: 'k8s/07',
  family: 'service-type',
  docs: [SVC_DOC],
  variants: TYPES,
  make: (v) => startingEmpty(createDeploymentFirst(v.name, 1), emptyCluster([node('node-1', 4000, 8192)]), {
    title: `${v.name} を ${v.type} で外に出す`,
    intro: {
      summary: 'Service の種類を変えて、クラスタの外から繋げるようにする。',
      why:
        'Service はふつうクラスタの中からしか見えない。外のお客さんに見せるには、外向きの口を開ける種類に変える必要がある。',
      concepts: concepts('Service', 'Deployment', 'ポート', 'ノード', 'クラスタ'),
      commands: [
        { command: 'kubectl create service <種類> <名前>', means: 'その種類の Service を作る（nodeport なら全部のノードに外向きの口が開く）' },
        { command: 'kubectl get svc', means: '外向きのポートが付いたか見る' },
      ],
    },
    objectives: ['種類の違いが言える', '作って確かめられる'],
    solution: [`kubectl create service ${v.type.toLowerCase()} ${v.name}`],
    steps: [
      {
        prompt: `${v.name} 向けの Service を ${v.type} で作れ。`,
        conditions: [
          {
            label: `Service ${v.name} があること`,
            test: withCluster((c) => c.services.has(`default/${v.name}`)),
            howTo: 'kubectl create service <種類> <名前>',
          },
          {
            label: `種類が ${v.type} であること`,
            test: resourceWhere<Service>('Service', v.name, (s) => s.spec.type === v.type),
            howTo: 'kubectl get svc の TYPE 列で確かめられます',
          },
        ],
        hints: [
          'kubectl create service <clusterip|nodeport|loadbalancer> <名前>',
          `kubectl create service ${v.type.toLowerCase()} ${v.name}`,
        ],
        explain:
          'ClusterIP はクラスタの中だけ、NodePort は各ノードの決まった口、LoadBalancer はさらにその外に、専用の入り口を用意してもらう。どれも土台は ClusterIP。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * k8s/09 CrashLoopBackOff を直す
 * ------------------------------------------------------------------ */

const CRASHES: { slug: string; value: { name: string; bad: string; good: string } }[] =
  APP_NAMES.map((name, i) => ({
    slug: name,
    value: { name, bad: `${name}:crash`, good: `${name}:1.${String(i)}.0` },
  }));

const crashDrills = family<{ name: string; bad: string; good: string }>({
  track: 'k8s',
  chapterId: 'k8s/09',
  family: 'crashloop',
  docs: [DEBUG_DOC],
  variants: CRASHES,
  make: (v) => ({
    title: `${v.name} が CrashLoopBackOff から抜けない`,
    intro: {
      summary: 'CrashLoopBackOff の原因をログから探し、直して動かす。',
      why:
        '起動してはすぐ落ちる、を繰り返している状態。Kubernetes は何度も起こし直してくれるが、原因を直さない限り終わらない。原因はたいていログに書いてある。',
      concepts: concepts('CrashLoopBackOff', 'Pod', 'コンテナ', 'イメージ', 'ログ', 'Kubernetes'),
      commands: [
        { command: 'kubectl get pods', means: '再起動の回数（RESTARTS）を見る' },
        { command: 'kubectl logs deploy/<名前>', means: '落ちる直前に何と言っていたかを見る' },
        { command: 'kubectl set image deploy/<名前> <コンテナ>=<イメージ>', means: '動くイメージに差し替える' },
      ],
    },
    objectives: ['状態から原因を読める', 'イメージを差し替えられる', '直ったことを確かめられる'],
    initial: {
      cluster: settled(
        {
          ...emptyCluster([node('node-1', 4000, 8192)]),
          deployments: new Map([
            [
              `default/${v.name}`,
              deployment(v.name, 1, [container(v.name, v.bad)], { labels: { app: v.name } }),
            ],
          ]),
        },
        20,
      ),
    },
    solution: [
      `kubectl set image deploy/${v.name} ${v.name}=${v.good}`,
      'kubectl wait 30',
    ],
    steps: [
      {
        prompt: `${v.name} が立ち上がらない理由を確かめ、動くイメージ ${v.good} に差し替えて Ready にせよ。`,
        conditions: [
          {
            label: `テンプレートのイメージが ${v.good} になっていること`,
            test: resourceWhere<Deployment>(
              'Deployment',
              v.name,
              (d) => d.spec.template.containers[0]?.image === v.good,
            ),
            howTo: 'kubectl set image deploy/<名前> <コンテナ名>=<イメージ>',
          },
          {
            label: 'Ready な Pod が 1 つあること',
            test: readyPods(1),
            howTo: '差し替えたあと kubectl wait で時間を進めてください',
          },
          {
            label: '落ち続けている Pod が残っていないこと',
            test: withCluster((c) =>
              [...c.pods.values()].every((p) =>
                p.status.containerStatuses.every((s) => s.waitingReason !== 'CrashLoopBackOff'),
              ),
            ),
            howTo: '古い ReplicaSet の Pod が片付くまで待ちます',
          },
        ],
        hints: [
          'kubectl get pods で STATUS と RESTARTS を見る',
          'kubectl describe pod でイベントを時系列に読む',
          `kubectl set image deploy/${v.name} ${v.name}=${v.good}`,
        ],
        explain:
          'CrashLoopBackOff は「起動はしたがすぐ落ちる」を繰り返している状態。再試行の間隔は落ちるたびに伸びるので、直しても反映まで少し待つことがある。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * k8s/09 readiness を通す
 * ------------------------------------------------------------------ */

const PROBES: { slug: string; value: { name: string } }[] = APP_NAMES.map((name) => ({
  slug: name,
  value: { name },
}));

const probeDrills = family<{ name: string }>({
  track: 'k8s',
  chapterId: 'k8s/09',
  family: 'readiness',
  docs: [PROBE_DOC],
  variants: PROBES,
  make: (v) => ({
    title: `${v.name}: Running なのに Ready にならない`,
    intro: {
      summary: 'Running なのに Ready にならない Pod を、probe の設定から直す。',
      why:
        '動いていても「まだ注文を受けられない」と答えている Pod には、Service は繋がない。確かめる検査の中身が間違っていると、ずっと繋がらない。',
      concepts: concepts('probe', 'Running', 'Ready', 'Service', 'Pod'),
      commands: [
        { command: 'kubectl describe pods', means: '検査がなぜ落ちているかを見る' },
        { command: 'kubectl set probe deploy/<名前> --readiness --succeeds-after=1', means: '検査の中身を直す（起動後すぐ受け付けられると答える）' },
      ],
    },
    objectives: ['Running と Ready の違いが分かる', 'readinessProbe の設定ミスを見つけられる'],
    initial: {
      cluster: settled(
        {
          ...emptyCluster([node('node-1', 4000, 8192)]),
          deployments: new Map([
            [
              `default/${v.name}`,
              deployment(
                v.name,
                1,
                [
                  container(v.name, 'nginx:1.27', {
                    // 決して成功しない readinessProbe
                    readinessProbe: probe({ succeedsAfter: null }),
                  }),
                ],
                { labels: { app: v.name } },
              ),
            ],
          ]),
        },
        20,
      ),
    },
    solution: [
      `kubectl set probe deploy/${v.name} --readiness --succeeds-after=1`,
      'kubectl wait 40',
    ],
    steps: [
      {
        prompt: `${v.name} が Ready にならない。readinessProbe が通るように直し、Ready な Pod を 1 つにせよ。`,
        conditions: [
          {
            label: 'readinessProbe が通る設定になっていること',
            test: resourceWhere<Deployment>(
              'Deployment',
              v.name,
              (d) => d.spec.template.containers[0]?.readinessProbe?.succeedsAfter !== null,
            ),
            howTo: 'kubectl describe deploy で probe の設定を確かめてください',
          },
          {
            label: 'Ready な Pod が 1 つあること',
            test: readyPods(1),
            howTo: '直したあと kubectl wait で時間を進めてください',
          },
        ],
        hints: [
          'kubectl get pods の READY 列は 0/1 のまま',
          'kubectl describe pod に probe の失敗が出る',
          `kubectl set probe deploy/${v.name} --readiness --succeeds-after=1`,
        ],
        explain:
          'Running は「動いている」、Ready は「受け口として使ってよい」。readinessProbe が通らない限り Service の endpoint には載らない。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * k8s/08 requests が大きすぎて置けない
 * ------------------------------------------------------------------ */

const FITS: { slug: string; value: { name: string; cpu: number; nodeCpu: number } }[] =
  APP_NAMES.map((name, i) => {
    const nodeCpu = 2000 + (i % 4) * 1000;
    return { slug: name, value: { name, cpu: nodeCpu + 1000 + i * 100, nodeCpu } };
  });

const fitDrills = family<{ name: string; cpu: number; nodeCpu: number }>({
  track: 'k8s',
  chapterId: 'k8s/08',
  family: 'unschedulable',
  docs: [RES_DOC],
  variants: FITS,
  make: (v) => ({
    title: `${v.name} が Pending から動かない（要求が大きすぎる）`,
    intro: {
      summary: '要求が大きすぎて置き場所が無い Pod を、要求を見直して動かす。',
      why:
        '「最低これだけ使う」と申告した量が、どのノードの空きより大きいと、Pod は永遠に置かれない。数字の見直しで直る。',
      concepts: concepts('requests', 'Pending', 'scheduler', 'ノード', 'Pod'),
      commands: [
        { command: 'kubectl describe pods', means: '置けない理由を見る' },
        { command: 'kubectl get nodes', means: 'ノードの空きを見る' },
        { command: 'kubectl set resources deploy/<名前> --requests=cpu=<量>m', means: '申告する量を下げる（m は 1000 分の 1 個ぶん）' },
      ],
    },
    objectives: ['Pending の理由を読める', 'requests を実態に合わせられる'],
    initial: {
      cluster: settled(
        {
          ...emptyCluster([node('node-1', v.nodeCpu, 8192)]),
          deployments: new Map([
            [
              `default/${v.name}`,
              deployment(
                v.name,
                1,
                [container(v.name, 'nginx:1.27', { requests: quantity(v.cpu, 128) })],
                { labels: { app: v.name } },
              ),
            ],
          ]),
        },
        10,
      ),
    },
    solution: [
      `kubectl set resources deploy/${v.name} --requests=cpu=${String(Math.floor(v.nodeCpu / 4))}m`,
      'kubectl wait 20',
    ],
    steps: [
      {
        prompt: `${v.name} が置けない理由を確かめ、ノードに収まる要求に直して Ready にせよ。`,
        conditions: [
          {
            label: `requests.cpu がノードの空きに収まっていること（${String(v.nodeCpu)}m 未満）`,
            test: resourceWhere<Deployment>(
              'Deployment',
              v.name,
              (d) => (d.spec.template.containers[0]?.requests.cpu ?? 0) < v.nodeCpu,
            ),
            howTo: 'kubectl describe node で allocatable が見えます',
          },
          {
            label: 'Ready な Pod が 1 つあること',
            test: readyPods(1),
            howTo: '直したあと kubectl wait で時間を進めてください',
          },
          {
            label: 'Pending の Pod が残っていないこと',
            test: withCluster((c) =>
              [...c.pods.values()].every((p: Pod) => p.status.phase !== 'Pending'),
            ),
            howTo: '古い Pod が片付くまで待ちます',
          },
        ],
        hints: [
          'kubectl describe pod に「置けない理由」が書いてある',
          'kubectl describe node で allocatable を確かめる',
          `kubectl set resources deploy/${v.name} --requests=cpu=${String(Math.floor(v.nodeCpu / 4))}m`,
        ],
        explain:
          'requests は「配置のための約束」。実際の使用量ではなく、この数字だけを見て置き場所が決まる。大きすぎると、余っていても置けない。',
      },
    ],
  }),
});

export function k8s03(): MissionSource[] {
  return [...selectorDrills, ...typeDrills, ...crashDrills, ...probeDrills, ...fitDrills];
}
