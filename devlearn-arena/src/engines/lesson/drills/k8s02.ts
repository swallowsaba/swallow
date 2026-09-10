import { advanceCluster } from '@/engines/k8s/controllers';
import { container, deployment, emptyCluster, node, pod } from '@/engines/k8s/factory';
import { tickPods } from '@/engines/k8s/kubelet';
import type { ClusterState, Deployment, Pod } from '@/engines/k8s/types';
import { readyPods, resourceAbsent, resourceWhere, withCluster } from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import { family, k8sDoc } from './shared';
import { APP_NAMES } from './values';

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

const PODS: PodSpec[] = APP_NAMES.map((name, i) => ({
  slug: name,
  name,
  image: `${name}:1.${String(i)}.0`,
  ticks: 6 + (i % 6),
}));

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

const RECONCILES: ReconcileSpec[] = APP_NAMES.flatMap((name, i) =>
  [1, 2, 3].map((k) => ({
    slug: `${name}${String(k)}`,
    name,
    replicas: 1 + ((i + k) % 4),
  })),
);

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

const LABEL_KEYS: [string, string][] = [
  ['tier', 'front'], ['env', 'prod'], ['team', 'payments'], ['release', 'canary'],
  ['zone', 'a'], ['role', 'edge'], ['owner', 'data'], ['stage', 'beta'],
  ['plan', 'gold'], ['shard', 'three'],
];

const LABELS: { slug: string; value: { name: string; key: string; val: string } }[] =
  APP_NAMES.flatMap((name, i) =>
    LABEL_KEYS.slice(i % 3, (i % 3) + 2).map(([key = '', val = '']) => ({
      slug: `${name}-${key}`,
      value: { name, key, val },
    })),
  );

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

const SCALE_PAIRS: [number, number][] = [
  [2, 4], [1, 3], [4, 2], [3, 1], [2, 5], [5, 2], [3, 6], [2, 0], [1, 4], [4, 1],
];

const SCALES: { slug: string; value: { name: string; from: number; to: number } }[] =
  APP_NAMES.flatMap((name, i) =>
    SCALE_PAIRS.slice(i % 4, (i % 4) + 2).map(([from = 1, to = 2]) => ({
      slug: `${name}-${String(from)}-${String(to)}`,
      value: { name, from, to },
    })),
  );

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

const DELETES: { slug: string; value: string }[] = APP_NAMES.map((value) => ({
  slug: value,
  value,
}));

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
