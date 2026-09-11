import { concepts } from '../glossary';
import { container, deployment, emptyCluster, node, service } from '@/engines/k8s/factory';
import { isReady } from '@/engines/k8s/kubelet';
import { key, type ClusterState } from '@/engines/k8s/types';
import { HOME } from '@/engines/kernel/path';
import type { LessonDefinition } from '../types';
import { heredoc } from '../authoring/solution';
import { countRan, DEPLOY, POD, ran } from '../authoring/ran';

const MANIFEST_HINT = 'vi app.yaml でマニフェストを書き、kubectl apply -f app.yaml で適用する';

function cluster(nodes = [node('node-1', 2000, 4096), node('node-2', 2000, 4096)]): ClusterState {
  return emptyCluster(nodes);
}

const FILES = { [HOME]: null };

/* 模範解答で書くマニフェスト。1行ずつの配列で持ち、ヒアドキュメントで書き出す */

const SA_YAML = [
  'kind: ServiceAccount',
  'metadata:',
  '  name: deploy-bot',
];

const RBAC_YAML = [
  'kind: Role',
  'metadata:',
  '  name: pod-reader',
  'rules:',
  '  - apiGroups: [""]',
  '    resources: ["pods"]',
  '    verbs: ["get", "list"]',
  '---',
  'kind: RoleBinding',
  'metadata:',
  '  name: read-pods',
  'roleRef:',
  '  kind: Role',
  '  name: pod-reader',
  'subjects:',
  '  - kind: ServiceAccount',
  '    name: deploy-bot',
  '    namespace: default',
];

const HPA_YAML = [
  'kind: HorizontalPodAutoscaler',
  'metadata:',
  '  name: web',
  'spec:',
  '  scaleTargetRef:',
  '    name: web',
  '  minReplicas: 2',
  '  maxReplicas: 6',
  '  metrics:',
  '    - resource:',
  '        target:',
  '          averageUtilization: 50',
];

const NOISY_YAML = [
  'kind: Deployment',
  'metadata:',
  '  name: noisy',
  'spec:',
  '  replicas: 1',
  '  template:',
  '    metadata:',
  '      labels:',
  '        app: noisy',
  '    spec:',
  '      containers:',
  '        - name: noisy',
  '          image: batch:1.0',
  '          resources:',
  '            requests:',
  '              cpu: 100',
  '              memory: 128',
  '            limits:',
  '              cpu: 200',
  '              memory: 256',
];

import { canI } from '@/engines/k8s/policy';

/** 可観測性・権限・スケール・運用（09〜13 章） */

export const k8sCrashLoop: LessonDefinition = {
  id: 'k8s/09/boss-crashloop',
  track: 'k8s',
  kind: 'boss',
  title: '再起動を繰り返して止まらない',
  intro: {
    summary: '起動してはすぐ落ちる Pod の原因をログで確かめ、動くイメージに差し替える。',
    why:
      'CrashLoopBackOff は「何度起こしても落ちる」という知らせ。Kubernetes は起こし続けてくれるが、原因を直すのは人の仕事。原因はたいていログにある。',
    concepts: concepts('CrashLoopBackOff', 'Pod', 'コンテナ', 'イメージ', 'ログ', 'Kubernetes'),
    commands: [
      { command: 'kubectl get pods', means: '再起動の回数（RESTARTS）を見る' },
      { command: 'kubectl logs deploy/<名前>', means: '落ちる直前のログを見る' },
      { command: 'kubectl set image deployment <名前> <コンテナ>=<イメージ>', means: '動くイメージに差し替える' },
    ],
  },
  objectives: ['CrashLoopBackOff の意味が分かる', 'ログとイベントから原因を追える', 'probe の効き方が分かる'],
  parCommands: 14,
  initial: {
    cluster: {
      ...cluster(),
      deployments: new Map([
        ['default/worker', deployment('worker', 1, [container('worker', 'crash-worker:1.0')])],
      ]),
    },
    files: { ...FILES },
  },
  steps: [
    {
      prompt: '時間を進め、worker がどうなっているか確かめよ。',
      check: 'CrashLoopBackOff になっている Pod があること',
      hints: ['kubectl wait 10', 'kubectl get pods'],
      solution: ['kubectl wait 10', 'kubectl get pods'],
      assert: ({ shell }) =>
        [...(shell.cluster?.pods.values() ?? [])].some((p) =>
          p.status.containerStatuses.some((c) => c.waitingReason === 'CrashLoopBackOff'),
        ),
      explain:
        'CrashLoopBackOff は「起動はしたが落ちた」を繰り返している状態。イメージが取れない ImagePullBackOff とは別。',
    },
    {
      prompt: 'ログを見て、何が起きているか確かめよ。',
      check: 'kubectl logs を実行したこと',
      hints: ['kubectl logs <Pod名>'],
      solution: ['kubectl logs deploy/worker'],
      assert: ({ history }) => ran(history, 'kubectl', 'logs'),
      explain: '再起動している Pod のログは、落ちる直前までの出力。ここに原因が出ていることが多い。',
    },
    {
      prompt: '再起動の間隔が伸びていることを確かめよ。restartCount を2回見比べること。',
      check: 'restartCount を2回以上取得したこと',
      hints: [
        'kubectl get pods <名前> -o jsonpath={.status.containerStatuses[0].restartCount}',
        'kubectl wait 10 を挟んでもう一度見る',
      ],
      solution: ['kubectl wait 10', 'kubectl get pods', 'kubectl wait 10', 'kubectl get pods'],
      // 見比べるには、再起動が2回以上起きた状態で、2回以上 Pod を見ている必要がある
      assert: ({ shell, history }) =>
        countRan(history, 'kubectl', ['get', 'describe'], POD) >= 2 &&
        [...(shell.cluster?.pods.values() ?? [])].some((p) =>
          p.status.containerStatuses.some((c) => c.restartCount >= 2),
        ),
      explain:
        '同じ間隔で叩き続けると、直っていないのに負荷だけ掛かる。だから待ち時間を倍々に伸ばす（指数バックオフ）。',
    },
    {
      prompt: '落ちないイメージに差し替えて、Ready にせよ。',
      check: 'worker の Pod が Ready であること',
      hints: ['kubectl set image deployment worker worker=nginx:1.25', 'kubectl wait 20'],
      solution: ['kubectl set image deployment worker worker=nginx:1.25', 'kubectl wait 30'],
      assert: ({ shell }) => {
        const pods = [...(shell.cluster?.pods.values() ?? [])].filter(
          (p) => p.metadata.labels['app'] === 'worker',
        );
        return pods.length > 0 && pods.some(isReady);
      },
      explain:
        '直し方は「落ちない状態に持っていく」だけ。差し替えても古い ReplicaSet は残るので、駄目ならすぐ戻せる。',
    },
  ],
};

export const k8sRbacDenied: LessonDefinition = {
  id: 'k8s/10/boss-rbac-denied',
  track: 'k8s',
  kind: 'boss',
  title: '権限が足りなくて叩けない',
  intro: {
    summary: '権限が足りずに叩けないプログラム用アカウントに、必要な分だけ許可を足す。',
    why:
      '何でもできる権限を渡すと、そのプログラムが乗っ取られたときに全部やられる。必要な操作だけを許すのが基本。',
    concepts: concepts('RBAC', 'ServiceAccount', 'Role', 'RoleBinding', '権限'),
    commands: [
      { command: 'kubectl auth can-i <操作> <種類> --as=<誰>', means: 'その人がその操作をしてよいか確かめる' },
      { command: 'kubectl apply -f rbac.yaml', means: 'Role と RoleBinding を作る' },
    ],
  },
  objectives: ['Role と RoleBinding の関係が分かる', 'can-i で確かめられる', '最小権限で足せる'],
  parCommands: 12,
  initial: { cluster: cluster(), files: { ...FILES } },
  steps: [
    {
      prompt: 'ServiceAccount deploy-bot を作り、いま pods を list できないことを確かめよ。',
      check: 'ServiceAccount があり、can-i が no を返すこと',
      hints: [
        MANIFEST_HINT,
        'kind: ServiceAccount / metadata.name: deploy-bot',
        'kubectl auth can-i list pods --as=system:serviceaccount:default:deploy-bot',
      ],
      solution: [heredoc('sa.yaml', SA_YAML), 'kubectl apply -f sa.yaml', 'kubectl auth can-i list pods --as=system:serviceaccount:default:deploy-bot'],
      assert: ({ shell, history }) => {
        const state = shell.cluster;
        if (state === null) return false;
        if (!state.serviceAccounts.has(key('default', 'deploy-bot'))) return false;
        if (!ran(history, 'kubectl', 'auth', 'can-i')) return false;
        const decision = canI(state, {
          verb: 'list',
          resource: 'pods',
          namespace: 'default',
          subject: { kind: 'ServiceAccount', name: 'deploy-bot', namespace: 'default' },
        });
        return !decision.allowed;
      },
      explain:
        'Kubernetes の既定は「何も許さない」。ServiceAccount を作っただけでは何もできない。',
    },
    {
      prompt: 'pods を get / list できる Role と、それを deploy-bot に結び付ける RoleBinding を作れ。',
      check: 'can-i list pods が yes になること',
      hints: [
        'kind: Role の rules に resources: ["pods"] と verbs: ["get","list"]',
        'kind: RoleBinding の roleRef と subjects を書く',
      ],
      solution: [heredoc('rbac.yaml', RBAC_YAML), 'kubectl apply -f rbac.yaml'],
      assert: ({ shell }) => {
        const state = shell.cluster;
        if (state === null) return false;
        return canI(state, {
          verb: 'list',
          resource: 'pods',
          namespace: 'default',
          subject: { kind: 'ServiceAccount', name: 'deploy-bot', namespace: 'default' },
        }).allowed;
      },
      diagnose: ({ shell }) => {
        const state = shell.cluster;
        if (state === null) return null;
        if (state.roles.size === 0) return 'Role がまだありません。';
        if (state.roleBindings.size === 0) return 'Role はありますが、結び付ける RoleBinding がありません。';
        return null;
      },
      explain:
        '権限は Role（何ができるか）と RoleBinding（誰にか）の2枚で決まる。片方だけでは何も変わらない。',
    },
    {
      prompt: 'delete までは許していないことを確かめよ。',
      check: 'can-i delete pods が no であること',
      hints: ['kubectl auth can-i delete pods --as=system:serviceaccount:default:deploy-bot'],
      solution: ['kubectl auth can-i delete pods --as=system:serviceaccount:default:deploy-bot'],
      assert: ({ shell, history }) => {
        const state = shell.cluster;
        if (state === null) return false;
        if (!ran(history, 'kubectl', 'auth', 'can-i', 'delete')) return false;
        return !canI(state, {
          verb: 'delete',
          resource: 'pods',
          namespace: 'default',
          subject: { kind: 'ServiceAccount', name: 'deploy-bot', namespace: 'default' },
        }).allowed;
      },
      explain:
        '許可は足すことしかできない。だから「とりあえず全部」を1回付けると、後から絞るのが難しくなる。',
    },
  ],
};

export const k8sHpa: LessonDefinition = {
  id: 'k8s/11/hpa',
  track: 'k8s',
  kind: 'training',
  title: '負荷に合わせて台数を変える',
  intro: {
    summary: '負荷に合わせて Pod の数が自動で増えるようにし、上限で止まることを確かめる。',
    why:
      'お客さんの数は時間で変わる。いつも最大の数で動かすと無駄、少なすぎると落ちる。負荷を見て自動で合わせる係に任せる。',
    concepts: concepts('HPA', 'Deployment', 'レプリカ', 'Pod'),
    commands: [
      { command: 'kubectl apply -f hpa.yaml', means: '自動で数を変える係を作る' },
      { command: 'kubectl load web <割合>', means: '負荷をかける（学習用）' },
      { command: 'kubectl wait <秒>', means: '時間を進める' },
    ],
  },
  objectives: ['HPA が何を見ているか分かる', '上限と下限の意味が分かる', '増減が自動で起きると分かる'],
  parCommands: 12,
  initial: {
    cluster: {
      ...cluster([node('node-1', 8000, 16384)]),
      deployments: new Map([['default/web', deployment('web', 2, [container('web', 'nginx:1.25')])]]),
      services: new Map([['default/web', service('web', { app: 'web' })]]),
    },
    files: { ...FILES },
  },
  steps: [
    {
      prompt: 'web を対象に、min 2 / max 6 / 目標 CPU 50% の HPA を作れ。',
      check: 'HPA があり、min と max が設定されていること',
      hints: [
        MANIFEST_HINT,
        'kind: HorizontalPodAutoscaler / spec.scaleTargetRef.name: web',
        'spec.minReplicas: 2 / spec.maxReplicas: 6',
        'spec.metrics[0].resource.target.averageUtilization: 50',
      ],
      solution: [heredoc('hpa.yaml', HPA_YAML), 'kubectl apply -f hpa.yaml'],
      assert: ({ shell }) => {
        const hpa = [...(shell.cluster?.autoscalers.values() ?? [])][0];
        return hpa !== undefined && hpa.spec.minReplicas === 2 && hpa.spec.maxReplicas === 6;
      },
      explain: 'HPA は Deployment の replicas を書き換える。自分で Pod を作るわけではない。',
    },
    {
      prompt: '負荷を 100% にして、台数が増えることを確かめよ。',
      check: 'web の replicas が 2 より増えていること',
      hints: ['kubectl load web 100', 'kubectl wait 20'],
      solution: ['kubectl load web 100', 'kubectl wait 20'],
      assert: ({ shell }) => (shell.cluster?.deployments.get(key('default', 'web'))?.spec.replicas ?? 0) > 2,
      explain:
        '「いまの台数 × 現在値 ÷ 目標値」が必要な台数。倍の負荷なら倍の台数、という素直な比で決まる。',
    },
    {
      prompt: '上限を超えないことを確かめよ。負荷を極端に上げてみること。',
      check: '負荷を 100% より強くしても、replicas が 6 を超えていないこと',
      hints: ['kubectl load web 1000', 'kubectl wait 30'],
      solution: ['kubectl load web 1000', 'kubectl wait 30'],
      assert: ({ shell }) => {
        const replicas = shell.cluster?.deployments.get(key('default', 'web'))?.spec.replicas ?? 0;
        // 手順2より強い負荷をかけても、上限の6で止まっていること
        const load = shell.cluster?.load.get(key('default', 'web')) ?? 0;
        return load > 100 && replicas <= 6 && replicas > 2;
      },
      explain:
        '上限が無いと、障害時に増え続けてクラスタを食い潰す。maxReplicas は性能の設定ではなく、事故を止める柵。',
    },
  ],
};

export const k8sDrain: LessonDefinition = {
  id: 'k8s/12/drain-cordon',
  track: 'k8s',
  kind: 'training',
  title: 'ノードを安全に空ける',
  intro: {
    summary: 'ノードを drain して空け、Pod が別のノードで作り直されるのを確かめる。',
    why:
      'ノードの修理や入れ替えは必ずある。いきなり止めずに、中の Pod を先に逃がせば、アプリを止めずに作業できる。',
    concepts: concepts('drain', 'cordon', 'ノード', 'Pod', 'Deployment'),
    commands: [
      { command: 'kubectl get pods -o wide', means: 'どの Pod がどのノードにいるか見る' },
      { command: 'kubectl drain <ノード>', means: 'ノードを空ける' },
      { command: 'kubectl wait <秒>', means: '時間を進める' },
    ],
  },
  objectives: ['cordon と drain の違いが分かる', '所有者のある Pod が作り直されると分かる', '無停止で入れ替えられる'],
  parCommands: 10,
  initial: {
    cluster: {
      ...cluster(),
      deployments: new Map([['default/web', deployment('web', 4, [container('web', 'nginx:1.25')])]]),
    },
    files: { ...FILES },
  },
  steps: [
    {
      prompt: 'Pod が2台のノードに分かれて動いている状態にせよ。',
      check: 'Ready な Pod が4つあること',
      hints: ['kubectl wait 20', 'kubectl get pods -o wide で置き場所が見える'],
      solution: ['kubectl wait 25'],
      assert: ({ shell }) => {
        const pods = [...(shell.cluster?.pods.values() ?? [])];
        return pods.filter(isReady).length >= 4;
      },
      explain: 'スケジューラは空きの多いノードを選ぶので、自然と散る。',
    },
    {
      prompt: 'node-1 を drain して空けよ。',
      check: 'node-1 が unschedulable になり、そこに Pod が居ないこと',
      hints: ['kubectl drain node-1'],
      solution: ['kubectl drain node-1'],
      assert: ({ shell }) => {
        const state = shell.cluster;
        if (state === null) return false;
        const node1 = state.nodes.get('node-1');
        if (node1?.spec.unschedulable !== true) return false;
        return ![...state.pods.values()].some((p) => p.status.nodeName === 'node-1');
      },
      explain:
        'cordon は「これ以上置くな」、drain は「いま居るものも退けろ」。順番があるのは、退けた先がまた同じノードにならないため。',
    },
    {
      prompt: '追い出された Pod が別のノードで作り直され、4つに戻ることを確かめよ。',
      check: 'Ready な Pod が再び4つあり、全て node-2 に居ること',
      hints: ['kubectl wait 20', 'kubectl get pods -o wide'],
      solution: ['kubectl wait 30'],
      assert: ({ shell }) => {
        const pods = [...(shell.cluster?.pods.values() ?? [])].filter(isReady);
        return pods.length >= 4 && pods.every((p) => p.status.nodeName === 'node-2');
      },
      explain:
        '所有者（ReplicaSet）がいるから作り直される。所有者のいない裸の Pod は消えたきり戻らない。だから本番では裸の Pod を作らない。',
    },
  ],
};

export const k8sNoLimits: LessonDefinition = {
  id: 'k8s/13/no-limits',
  track: 'k8s',
  kind: 'training',
  title: 'limits を書かないと何が起きるか',
  intro: {
    summary: '上限（limits）の無い Pod に、上限を書き足す。',
    why:
      '上限の無い Pod が暴れると、同じノードの他の Pod まで巻き込まれる。「最低これだけ」と「最大これだけ」の両方を書いておく。',
    concepts: concepts('limits', 'requests', 'Deployment', 'マニフェスト', 'Pod', 'ノード', 'YAML'),
    commands: [
      { command: 'kubectl get deploy <名前> -o yaml', means: '今の設定を YAML で見る' },
      { command: 'kubectl apply -f fix.yaml', means: '上限を書いたマニフェストを渡す' },
    ],
  },
  objectives: ['requests と limits の役割の違いが分かる', '設定してあるかを機械的に確かめられる'],
  parCommands: 10,
  initial: {
    cluster: {
      ...cluster([node('node-1', 1000, 1024)]),
      deployments: new Map([
        ['default/noisy', deployment('noisy', 1, [container('noisy', 'batch:1.0', { requests: { cpu: 100, memory: 128 } })])],
      ]),
    },
    files: { ...FILES },
  },
  steps: [
    {
      prompt: 'noisy の limits が設定されていないことを確かめよ。',
      check: '-o yaml か -o jsonpath で limits を見たこと',
      hints: [
        'kubectl get deploy noisy -o yaml',
        'kubectl get deploy noisy -o jsonpath={.spec.template.spec.containers[0].resources.limits}',
      ],
      solution: ['kubectl get deploy noisy -o yaml'],
      assert: ({ history }) =>
        ran(history, 'kubectl', 'get', DEPLOY, '-o', /^(yaml|json|jsonpath.*)$/),
      explain:
        'requests は「置き場所を決めるための申告」、limits は「これ以上は使わせない上限」。片方だけだと、申告より多く使えてしまう。',
    },
    {
      prompt: 'limits を書いたマニフェストを apply して、設定された状態にせよ。',
      check: 'noisy の全コンテナに limits があること',
      hints: [
        MANIFEST_HINT,
        'spec.template.spec.containers[].resources.limits に cpu と memory を書く',
      ],
      solution: [heredoc('fix.yaml', NOISY_YAML), 'kubectl apply -f fix.yaml'],
      assert: ({ shell }) => {
        const target = shell.cluster?.deployments.get(key('default', 'noisy'));
        if (target === undefined) return false;
        return target.spec.template.containers.every((c) => c.limits !== null);
      },
      diagnose: ({ shell }) => {
        const target = shell.cluster?.deployments.get(key('default', 'noisy'));
        if (target === undefined) return 'noisy が消えています。';
        if (target.spec.template.containers.some((c) => c.limits === null)) {
          return 'まだ limits の無いコンテナがあります。resources.limits に cpu と memory を両方書いてください。';
        }
        return null;
      },
      explain:
        'limits が無いと、1つの Pod がノードを食い尽くして隣を巻き込む。上限は自分のためではなく、同居している相手のために書く。',
    },
  ],
};
