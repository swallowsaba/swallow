import { advanceCluster } from '@/engines/k8s/controllers';
import { container, deployment, emptyCluster, node, pod } from '@/engines/k8s/factory';
import { tickPods } from '@/engines/k8s/kubelet';
import type { ClusterState, Deployment, Pod } from '@/engines/k8s/types';
import { readyPods, resourceAbsent, resourceWhere, withCluster } from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import { family, k8sDoc } from './shared';

const POD_DOC = k8sDoc('concepts/workloads/pods/', 'Pods');
const LIFECYCLE = k8sDoc('concepts/workloads/pods/pod-lifecycle/', 'Pod Lifecycle');
const CONTROLLER = k8sDoc('concepts/architecture/controller/', 'Controllers');
const DEPLOY_DOC = k8sDoc('concepts/workloads/controllers/deployment/', 'Deployment');

/** 決まった回数だけ時間を進めた、落ち着いたクラスタ */
function settled(state: ClusterState, times: number): ClusterState {
  let current = state;
  for (let i = 0; i < times; i += 1) current = advanceCluster(current, tickPods);
  return current;
}

function twoNodes(): ClusterState {
  return emptyCluster([node('node-1', 4000, 8192), node('node-2', 4000, 8192)]);
}

/* ------------------------------------------------------------------ *
 * k8s/02 Pod の解剖：状態の遷移を読む
 * ------------------------------------------------------------------ */

interface PodSpec {
  slug: string;
  name: string;
  image: string;
  ticks: number;
}

const PODS: PodSpec[] = [
  { slug: 'nginx', name: 'web', image: 'nginx:1.27', ticks: 6 },
  { slug: 'redis', name: 'cache', image: 'redis:7', ticks: 6 },
  { slug: 'api', name: 'api', image: 'api:1.4', ticks: 8 },
  { slug: 'worker', name: 'worker', image: 'worker:2.0', ticks: 8 },
  { slug: 'front', name: 'front', image: 'front:3.1', ticks: 6 },
  { slug: 'batch', name: 'batch', image: 'batch:0.9', ticks: 10 },
  { slug: 'proxy', name: 'proxy', image: 'envoy:1.30', ticks: 6 },
  { slug: 'search', name: 'search', image: 'search:5.2', ticks: 10 },
];

const lifecycleDrills = family<PodSpec>({
  track: 'k8s',
  chapterId: 'k8s/02',
  family: 'pod-lifecycle',
  docs: [POD_DOC, LIFECYCLE],
  variants: PODS.map((value) => ({ slug: value.slug, value })),
  make: (v) => ({
    title: `${v.name} が Pending から Running になるまで`,
    objectives: ['Pending の意味が分かる', '時間を進めて遷移を見られる', 'Ready の条件が言える'],
    initial: {
      cluster: {
        ...twoNodes(),
        pods: new Map([[`default/${v.name}`, pod(v.name, [container(v.name, v.image)], { labels: { app: v.name } })]]),
      },
    },
    solution: [`kubectl wait ${String(v.ticks + 6)}`],
    steps: [
      {
        prompt: `${v.name} が Ready になるまで時間を進めよ。`,
        conditions: [
          {
            label: `${v.name} が Running であること`,
            test: resourceWhere<Pod>('Pod', v.name, (p) => p.status.phase === 'Running'),
            howTo: 'kubectl get pods で STATUS を見てください',
          },
          {
            label: 'コンテナが Ready であること',
            test: resourceWhere<Pod>('Pod', v.name, (p) =>
              p.status.containerStatuses.every((s) => s.ready),
            ),
            howTo: 'READY 列が 1/1 になれば通ります',
          },
          {
            label: 'ノードに載っていること',
            test: resourceWhere<Pod>('Pod', v.name, (p) => p.status.nodeName !== null),
            howTo: 'kubectl get pods -o wide でどのノードか見えます',
          },
        ],
        hints: [
          'kubectl get pods でいまの様子が見える',
          'kubectl wait <数> で時間を進められる',
          `kubectl wait ${String(v.ticks + 6)}`,
        ],
        explain:
          'Pending は「置き場所が決まっていない」、ContainerCreating は「置いたが起動中」、Running は「動いている」。Ready はさらにその先で、受け口として使ってよいかを示す。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * k8s/03 宣言的管理：消しても戻る
 * ------------------------------------------------------------------ */

interface ReconcileSpec {
  slug: string;
  name: string;
  replicas: number;
}

const RECONCILES: ReconcileSpec[] = [
  { slug: 'web2', name: 'web', replicas: 2 },
  { slug: 'web3', name: 'web', replicas: 3 },
  { slug: 'api2', name: 'api', replicas: 2 },
  { slug: 'api4', name: 'api', replicas: 4 },
  { slug: 'worker3', name: 'worker', replicas: 3 },
  { slug: 'front5', name: 'front', replicas: 5 },
  { slug: 'cache1', name: 'cache', replicas: 1 },
  { slug: 'proxy2', name: 'proxy', replicas: 2 },
];

function deployed(name: string, replicas: number): ClusterState {
  return settled(
    {
      ...twoNodes(),
      deployments: new Map([
        [`default/${name}`, deployment(name, replicas, [container(name, 'nginx:1.27')], { labels: { app: name } })],
      ]),
    },
    replicas * 4 + 8,
  );
}

const reconcileDrills = family<ReconcileSpec>({
  track: 'k8s',
  chapterId: 'k8s/03',
  family: 'reconcile',
  docs: [CONTROLLER],
  variants: RECONCILES.map((value) => ({ slug: value.slug, value })),
  make: (v) => ({
    title: `${v.name} の Pod を消しても戻ってくる`,
    objectives: ['宣言と現実の差が埋められると分かる', '消えたことに反応しているのではないと分かる'],
    initial: { cluster: deployed(v.name, v.replicas) },
    solution: [
      `kubectl delete pod $(kubectl get pods -o name | head -n 1 | cut -d '/' -f 2)`,
      'kubectl wait 20',
    ],
    steps: [
      {
        prompt: `${v.name} の Pod をひとつ消し、時間を進めて元の ${String(v.replicas)} 個に戻ることを確かめよ。`,
        conditions: [
          {
            label: 'Pod を消した記録があること',
            test: (ctx) => ctx.history.some((l) => /delete\s+pod/.test(l)),
            howTo: 'kubectl get pods で名前を確かめてから消します',
          },
          {
            label: `Ready な Pod が ${String(v.replicas)} 個に戻っていること`,
            test: readyPods(v.replicas),
            howTo: '消した直後は減ります。kubectl wait で時間を進めてください',
          },
        ],
        hints: [
          'kubectl get pods で名前を確かめる',
          'kubectl delete pod <名前>',
          'そのあと kubectl wait 20',
        ],
        explain:
          '復活したのは「消えたことに反応した」からではない。「3 個あるべき」と「2 個しかない」の差を、次の tick で埋めただけ。これが宣言的ということ。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * k8s/03 ラベルとセレクタ
 * ------------------------------------------------------------------ */

const LABELS: { slug: string; value: { name: string; key: string; val: string } }[] = [
  { slug: 'tier', value: { name: 'web', key: 'tier', val: 'front' } },
  { slug: 'env', value: { name: 'api', key: 'env', val: 'prod' } },
  { slug: 'team', value: { name: 'worker', key: 'team', val: 'payments' } },
  { slug: 'release', value: { name: 'front', key: 'release', val: 'canary' } },
  { slug: 'zone', value: { name: 'cache', key: 'zone', val: 'a' } },
  { slug: 'role', value: { name: 'proxy', key: 'role', val: 'edge' } },
  { slug: 'owner', value: { name: 'batch', key: 'owner', val: 'data' } },
  { slug: 'stage', value: { name: 'search', key: 'stage', val: 'beta' } },
];

const labelDrills = family<{ name: string; key: string; val: string }>({
  track: 'k8s',
  chapterId: 'k8s/03',
  family: 'labels',
  docs: [k8sDoc('concepts/overview/working-with-objects/labels/', 'Labels and Selectors')],
  variants: LABELS,
  make: (v) => ({
    title: `${v.name} に ${v.key}=${v.val} の印を付ける`,
    objectives: ['ラベルを付けられる', 'ラベルで絞れる'],
    initial: { cluster: deployed(v.name, 2) },
    solution: [`kubectl label deploy ${v.name} ${v.key}=${v.val}`],
    steps: [
      {
        prompt: `Deployment ${v.name} に ${v.key}=${v.val} を付けよ。`,
        conditions: [
          {
            label: `${v.key}=${v.val} が付いていること`,
            test: resourceWhere<Deployment>(
              'Deployment',
              v.name,
              (d) => d.metadata.labels[v.key] === v.val,
            ),
            howTo: 'kubectl get deploy --show-labels か describe で確かめられます',
          },
        ],
        hints: [
          'kubectl label <種類> <名前> <キー>=<値>',
          `kubectl label deploy ${v.name} ${v.key}=${v.val}`,
        ],
        explain:
          'Kubernetes は木構造ではなく集合で対象を選ぶ。ラベルが集合の定義で、セレクタがその引き方になる。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * k8s/04 Workloads：数を変える
 * ------------------------------------------------------------------ */

const SCALES: { slug: string; value: { name: string; from: number; to: number } }[] = [
  { slug: 'up-2-4', value: { name: 'web', from: 2, to: 4 } },
  { slug: 'up-1-3', value: { name: 'api', from: 1, to: 3 } },
  { slug: 'down-4-2', value: { name: 'worker', from: 4, to: 2 } },
  { slug: 'down-3-1', value: { name: 'front', from: 3, to: 1 } },
  { slug: 'up-2-5', value: { name: 'cache', from: 2, to: 5 } },
  { slug: 'down-5-2', value: { name: 'proxy', from: 5, to: 2 } },
  { slug: 'up-3-6', value: { name: 'search', from: 3, to: 6 } },
  { slug: 'zero', value: { name: 'batch', from: 2, to: 0 } },
];

const scaleDrills = family<{ name: string; from: number; to: number }>({
  track: 'k8s',
  chapterId: 'k8s/04',
  family: 'scale',
  docs: [DEPLOY_DOC],
  variants: SCALES,
  make: (v) => ({
    title: `${v.name} を ${String(v.from)} から ${String(v.to)} にする`,
    objectives: ['数を変えられる', '増やすときと減らすときの動きを見られる'],
    initial: { cluster: deployed(v.name, v.from) },
    solution: [
      `kubectl scale deploy ${v.name} --replicas=${String(v.to)}`,
      'kubectl wait 30',
    ],
    steps: [
      {
        prompt: `${v.name} の replicas を ${String(v.to)} にし、実際にその数になるまで待て。`,
        conditions: [
          {
            label: `宣言が ${String(v.to)} になっていること`,
            test: resourceWhere<Deployment>('Deployment', v.name, (d) => d.spec.replicas === v.to),
            howTo: 'kubectl get deploy で DESIRED を見てください',
          },
          {
            label: `Ready な Pod が ${String(v.to)} 個であること`,
            test: readyPods(v.to),
            howTo: 'kubectl wait で時間を進めると近づいていきます',
          },
        ],
        hints: [
          'kubectl scale deploy <名前> --replicas=<数>',
          '変えた直後は数が合わない。時間を進める',
          `kubectl scale deploy ${v.name} --replicas=${String(v.to)}`,
        ],
        explain:
          '増やすときは一気に立たず、減らすときも一気に消えない。maxSurge / maxUnavailable の範囲で少しずつ近づく。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * k8s/04 いらなくなったものを片付ける
 * ------------------------------------------------------------------ */

const DELETES: { slug: string; value: string }[] = [
  { slug: 'web', value: 'web' },
  { slug: 'api', value: 'api' },
  { slug: 'worker', value: 'worker' },
  { slug: 'front', value: 'front' },
  { slug: 'cache', value: 'cache' },
  { slug: 'proxy', value: 'proxy' },
];

const deleteDrills = family<string>({
  track: 'k8s',
  chapterId: 'k8s/04',
  family: 'delete',
  docs: [DEPLOY_DOC],
  variants: DELETES,
  make: (name) => ({
    title: `${name} をまるごと片付ける`,
    objectives: ['Deployment を消すと Pod も消えると分かる', '所有関係が分かる'],
    initial: { cluster: deployed(name, 2) },
    solution: [`kubectl delete deploy ${name}`, 'kubectl wait 10'],
    steps: [
      {
        prompt: `Deployment ${name} を消し、Pod も残らないようにせよ。`,
        conditions: [
          {
            label: `Deployment ${name} が無いこと`,
            test: resourceAbsent('Deployment', name),
            howTo: 'kubectl delete deploy <名前>',
          },
          {
            label: 'Pod がひとつも残っていないこと',
            test: withCluster((c) => [...c.pods.values()].length === 0),
            howTo: '親が消えると子も片付きます。時間を進めてください',
          },
        ],
        hints: [`kubectl delete deploy ${name}`, 'そのあと kubectl wait 10'],
        explain:
          'Pod には ownerReferences で親が書いてある。親が消えると、その印を頼りに子も片付けられる。Pod だけ消しても親が作り直すのはこの裏返し。',
      },
    ],
  }),
});

export function k8s02(): MissionSource[] {
  return [
    ...lifecycleDrills,
    ...reconcileDrills,
    ...labelDrills,
    ...scaleDrills,
    ...deleteDrills,
  ];
}
