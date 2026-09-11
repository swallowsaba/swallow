import { container, deployment, emptyCluster, node } from '@/engines/k8s/factory';
import { isReady } from '@/engines/k8s/kubelet';
import { key, type ClusterState } from '@/engines/k8s/types';
import { HOME } from '@/engines/kernel/path';
import type { LessonDefinition } from '../types';
import { heredoc } from '../authoring/solution';
import { countRan, NODE, POD, PVC, ran, SECRET } from '../authoring/ran';

const MANIFEST_HINT = 'vi app.yaml でマニフェストを書き、kubectl apply -f app.yaml で適用する';

function cluster(nodes = [node('node-1', 2000, 4096), node('node-2', 2000, 4096)]): ClusterState {
  return emptyCluster(nodes);
}

/** 容量が足りず、どうやっても入らないクラスタ */
function crowded(): ClusterState {
  return {
    ...emptyCluster([node('node-1', 500, 512)]),
    deployments: new Map([
      ['default/api', deployment('api', 3, [container('api', 'api:1.0', { requests: { cpu: 400, memory: 256 } })])],
    ]),
  };
}

const FILES = { [HOME]: null };

/* 模範解答で書くマニフェスト。1行ずつの配列で持ち、ヒアドキュメントで書き出す */

const WEB_YAML = [
  'kind: Deployment',
  'metadata:',
  '  name: web',
  'spec:',
  '  replicas: 2',
  '  template:',
  '    metadata:',
  '      labels:',
  '        app: web',
  '    spec:',
  '      containers:',
  '        - name: web',
  '          image: nginx:1.25',
];

const JOB_YAML = [
  'kind: Job',
  'metadata:',
  '  name: migrate',
  'spec:',
  '  completions: 2',
  '  template:',
  '    metadata:',
  '      labels:',
  '        job: migrate',
  '    spec:',
  '      containers:',
  '        - name: main',
  '          image: migrator',
];

const CRON_YAML = [
  'kind: CronJob',
  'metadata:',
  '  name: nightly',
  'spec:',
  '  everyTicks: 3',
  '  jobTemplate:',
  '    spec:',
  '      template:',
  '        metadata:',
  '          labels:',
  '            job: nightly',
  '        spec:',
  '          containers:',
  '            - name: main',
  '              image: batch',
];

const STS_YAML = [
  'kind: StatefulSet',
  'metadata:',
  '  name: db',
  'spec:',
  '  replicas: 3',
  '  serviceName: db',
  '  template:',
  '    metadata:',
  '      labels:',
  '        app: db',
  '    spec:',
  '      containers:',
  '        - name: main',
  '          image: postgres',
];

const CONFIG_YAML = [
  'kind: ConfigMap',
  'metadata:',
  '  name: app-config',
  'data:',
  '  GREETING: hello',
  '---',
  'kind: Secret',
  'metadata:',
  '  name: app-secret',
  'stringData:',
  '  TOKEN: s3cret',
];

const READER_YAML = [
  'kind: Pod',
  'metadata:',
  '  name: reader',
  'spec:',
  '  containers:',
  '    - name: main',
  '      image: busybox',
  '      envFrom:',
  '        - configMapRef:',
  '            name: app-config',
  '        - secretRef:',
  '            name: app-secret',
];

const PVC_YAML = [
  'kind: StorageClass',
  'metadata:',
  '  name: manual',
  'provisioner: none',
  'dynamic: false',
  '---',
  'kind: PersistentVolumeClaim',
  'metadata:',
  '  name: data',
  'spec:',
  '  storageClassName: manual',
  '  accessModes: [ReadWriteOnce]',
  '  resources:',
  '    requests:',
  '      storage: 5',
];

const PV_YAML = [
  'kind: PersistentVolume',
  'metadata:',
  '  name: vol1',
  'spec:',
  '  capacity:',
  '    storage: 10',
  '  accessModes: [ReadWriteOnce]',
  '  storageClassName: manual',
];

const PLAIN_POD_YAML = [
  'kind: Pod',
  'metadata:',
  '  name: plain',
  'spec:',
  '  containers:',
  '    - name: main',
  '      image: nginx',
];

const TOLERATING_POD_YAML = [
  'kind: Pod',
  'metadata:',
  '  name: gpu-job',
  'spec:',
  '  tolerations:',
  '    - key: gpu',
  '      effect: NoSchedule',
  '  containers:',
  '    - name: main',
  '      image: nginx',
];

export const k8sStuckPending: LessonDefinition = {
  id: 'k8s/02/boss-stuck-pending',
  track: 'k8s',
  kind: 'boss',
  title: 'Pending から動かない',
  objectives: ['配置されない理由を読める', 'requests と allocatable を比べられる', '直して実際に動かせる'],
  parCommands: 12,
  initial: { cluster: crowded(), files: { ...FILES } },
  steps: [
    {
      prompt: 'Pod が動いていない。まず状態と理由を確かめよ。',
      check: 'kubectl get pods と kubectl describe pod を実行したこと',
      hints: ['kubectl wait 5 で時間を進める', 'kubectl get pods', 'kubectl describe pod <名前>'],
      solution: ['kubectl wait 5', 'kubectl get pods', 'kubectl describe pods'],
      assert: ({ history }) =>
        ran(history, 'kubectl', 'get', POD) && ran(history, 'kubectl', 'describe', POD),
      explain:
        'Pending は「まだ置き場所が決まっていない」状態。理由は必ず describe のイベントに出る。',
    },
    {
      prompt: 'ノードの空き容量を確かめよ。',
      check: 'kubectl get nodes を実行したこと',
      hints: ['kubectl get nodes'],
      solution: ['kubectl get nodes'],
      assert: ({ history }) => ran(history, 'kubectl', ['get', 'describe', 'top'], NODE),
      explain:
        'スケジューラは requests と allocatable を比べている。実際に使っている量ではなく、宣言した要求量で決まる。',
    },
    {
      prompt: '3 つ全部が Running になるようにせよ。要求量を減らすか、台数を減らすか、判断は任せる。',
      check: 'api の Pod が全て Running であること',
      hints: [
        'kubectl scale deployment api --replicas=1 なら1つは入る',
        'requests を下げたマニフェストを apply しても直る',
        '直したら kubectl wait 10 で進める',
      ],
      solution: ['kubectl scale deployment api --replicas=1', 'kubectl wait 20'],
      assert: ({ shell }) => {
        const state = shell.cluster;
        if (state === null) return false;
        const pods = [...state.pods.values()].filter((p) => p.metadata.name.startsWith('api-'));
        return pods.length > 0 && pods.every(isReady);
      },
      diagnose: ({ shell }) => {
        const state = shell.cluster;
        if (state === null) return null;
        const pending = [...state.pods.values()].filter((p) => p.status.nodeName === null);
        if (pending.length > 0) return `まだ ${String(pending.length)} 個が置けていません: ${pending[0]?.status.message ?? ''}`;
        return null;
      },
      explain:
        '「入らない」の答えは2つしかない。要求を減らすか、置き場所を増やすか。どちらを選ぶかは、そのサービスに必要な余裕で決まる。',
    },
  ],
};

export const k8sApply: LessonDefinition = {
  id: 'k8s/03/apply-vs-create',
  track: 'k8s',
  kind: 'training',
  title: 'マニフェストから宣言的に作る',
  objectives: ['YAML から資源を作れる', '同じものを2回 apply しても壊れないと分かる', '状態を宣言で管理できる'],
  parCommands: 10,
  initial: { cluster: cluster(), files: { ...FILES } },
  steps: [
    {
      prompt: 'web という名前で nginx の Deployment を replicas: 2 で作るマニフェストを書き、適用せよ。',
      check: 'web という Deployment があり、replicas が 2 であること',
      hints: [
        MANIFEST_HINT,
        'kind: Deployment / metadata.name: web / spec.replicas: 2',
        'spec.template.spec.containers に name と image を書く',
      ],
      solution: [heredoc('app.yaml', WEB_YAML), 'kubectl apply -f app.yaml'],
      assert: ({ shell }) => {
        const target = shell.cluster?.deployments.get(key('default', 'web'));
        return target !== undefined && target.spec.replicas === 2;
      },
      explain:
        'apply は「こうあってほしい」を渡すだけ。どう近づけるかはコントローラが決める。手順ではなく状態を書く。',
    },
    {
      prompt: '同じファイルをもう一度適用し、created ではなく configured になることを確かめよ。',
      check: '同じマニフェストを2回 apply したこと',
      hints: ['kubectl apply -f app.yaml をもう一度実行する'],
      solution: ['kubectl apply -f app.yaml'],
      assert: ({ history }) => countRan(history, 'kubectl', 'apply', '-f') >= 2,
      explain:
        '同じものを何度適用しても結果は変わらない。これがあるから、CI から機械的に流せる。',
    },
    {
      prompt: 'Pod が2つとも Ready になるまで進めよ。',
      check: 'web の Pod が2つ Ready であること',
      hints: ['kubectl wait 12'],
      solution: ['kubectl wait 20'],
      assert: ({ shell }) => {
        const state = shell.cluster;
        if (state === null) return false;
        const pods = [...state.pods.values()].filter((p) => p.metadata.labels['app'] === 'web');
        return pods.length >= 2 && pods.filter(isReady).length >= 2;
      },
      explain: 'Deployment → ReplicaSet → Pod と辿って初めて Pod ができる。間に1段あることが後で効いてくる。',
    },
  ],
};

export const k8sJobs: LessonDefinition = {
  id: 'k8s/04/job-cronjob',
  track: 'k8s',
  kind: 'training',
  title: '終わる仕事と、繰り返す仕事',
  objectives: ['Job が completions まで走ると分かる', 'CronJob が Job を作ると分かる', '常駐との違いが分かる'],
  parCommands: 10,
  initial: { cluster: cluster(), files: { ...FILES } },
  steps: [
    {
      prompt: 'completions: 2 の Job を作り、Complete になるまで進めよ。',
      check: 'Job があり、succeeded が 2 に届いていること',
      hints: [MANIFEST_HINT, 'kind: Job / spec.completions: 2', 'kubectl wait 20'],
      solution: [heredoc('job.yaml', JOB_YAML), 'kubectl apply -f job.yaml', 'kubectl wait 20'],
      assert: ({ shell }) => {
        const jobs = [...(shell.cluster?.jobs.values() ?? [])];
        return jobs.some((j) => j.status.succeeded >= 2);
      },
      explain:
        'Job の Pod は Succeeded になったら作り直されない。「動き続ける」ことではなく「終わる」ことが目的だから。',
    },
    {
      prompt: 'everyTicks を指定した CronJob を作り、Job が自動で作られることを確かめよ。',
      check: 'CronJob から作られた Job が1つ以上あること',
      hints: ['kind: CronJob / spec.everyTicks: 3 / spec.jobTemplate.spec.template ...', 'kubectl wait 10'],
      solution: [heredoc('cron.yaml', CRON_YAML), 'kubectl apply -f cron.yaml', 'kubectl wait 10'],
      assert: ({ shell }) => {
        const jobs = [...(shell.cluster?.jobs.values() ?? [])];
        return jobs.some((j) => j.metadata.ownerReferences.some((o) => o.kind === 'CronJob'));
      },
      explain:
        'CronJob は自分では何もしない。時間が来たら Job を作るだけ。責任が1段ずつ分かれているのが Kubernetes の作り。',
    },
  ],
};

export const k8sStatefulSet: LessonDefinition = {
  id: 'k8s/04/statefulset',
  track: 'k8s',
  kind: 'training',
  title: '順番と名前が要るワークロード',
  objectives: ['StatefulSet の Pod 名が連番だと分かる', '前が Ready になってから次が作られると分かる'],
  parCommands: 8,
  initial: { cluster: cluster(), files: { ...FILES } },
  steps: [
    {
      prompt: 'replicas: 3 の StatefulSet を作り、少しだけ時間を進めて Pod の名前を見よ。',
      check: 'db-0 が存在すること（まだ全部は揃っていなくてよい）',
      hints: [MANIFEST_HINT, 'kind: StatefulSet / metadata.name: db / spec.replicas: 3', 'kubectl wait 3'],
      solution: [heredoc('sts.yaml', STS_YAML), 'kubectl apply -f sts.yaml', 'kubectl wait 3'],
      assert: ({ shell }) => shell.cluster?.pods.has(key('default', 'db-0')) === true,
      explain:
        'Deployment の Pod 名は乱数まじりだが、StatefulSet は 0 から始まる連番。名前が安定しているから、相手を名指しできる。',
    },
    {
      prompt: '3つ全部が Ready になるまで進めよ。',
      check: 'db-0 db-1 db-2 が全て Ready であること',
      hints: ['kubectl wait 20'],
      solution: ['kubectl wait 30'],
      assert: ({ shell }) => {
        const state = shell.cluster;
        if (state === null) return false;
        return ['db-0', 'db-1', 'db-2'].every((name) => {
          const pod = state.pods.get(key('default', name));
          return pod !== undefined && isReady(pod);
        });
      },
      explain:
        '前の番号が Ready になるまで次を作らない。この順序があるから、初期化の順番に意味があるデータベースでも使える。',
    },
  ],
};

export const k8sConfig: LessonDefinition = {
  id: 'k8s/05/configmap',
  track: 'k8s',
  kind: 'training',
  title: '設定と機密をコンテナに渡す',
  objectives: ['ConfigMap を env として渡せる', 'Secret が base64 なだけだと分かる', '無い参照は配置を止めると分かる'],
  parCommands: 12,
  initial: { cluster: cluster(), files: { ...FILES } },
  steps: [
    {
      prompt: 'ConfigMap（キー GREETING）と Secret（キー TOKEN）を作れ。',
      check: 'ConfigMap と Secret が1つずつあること',
      hints: [MANIFEST_HINT, 'kind: ConfigMap の data: に GREETING を書く', 'kind: Secret の stringData: に TOKEN を書く'],
      solution: [heredoc('cfg.yaml', CONFIG_YAML), 'kubectl apply -f cfg.yaml'],
      assert: ({ shell }) => {
        const state = shell.cluster;
        if (state === null) return false;
        const cm = [...state.configMaps.values()].some((c) => 'GREETING' in c.data);
        const secret = [...state.secrets.values()].some((s) => 'TOKEN' in s.data);
        return cm && secret;
      },
      explain: 'どちらも「コンテナの外に置く値」。違いは扱いの慎重さだけで、仕組みはほとんど同じ。',
    },
    {
      prompt: '両方を envFrom で取り込む Pod を作り、Ready にせよ。',
      check: 'その Pod が Ready であること',
      hints: [
        'spec.containers[].envFrom に configMapRef と secretRef を書く',
        'kubectl wait 10',
      ],
      solution: [heredoc('pod.yaml', READER_YAML), 'kubectl apply -f pod.yaml', 'kubectl wait 10'],
      assert: ({ shell }) => {
        const state = shell.cluster;
        if (state === null) return false;
        return [...state.pods.values()].some(
          (p) => p.spec.containers.some((c) => c.envFrom.length >= 2) && isReady(p),
        );
      },
      explain: 'envFrom は起動時に一度だけ解決される。あとから ConfigMap を変えても、その Pod には届かない。',
    },
    {
      prompt: 'Secret の値が、保管時は base64 で、環境変数では元の文字列になっていることを確かめよ。',
      check: 'kubectl get secret -o yaml（か json）と kubectl exec ... -- env を実行したこと',
      hints: ['kubectl get secret <名前> -o yaml', 'kubectl exec <Pod名> -- env'],
      solution: ['kubectl get secret app-secret -o yaml', 'kubectl exec reader -- env'],
      assert: ({ history }) =>
        ran(history, 'kubectl', 'get', SECRET, '-o', ['yaml', 'json']) &&
        ran(history, 'kubectl', 'exec', 'env'),
      explain:
        'Secret は暗号化ではなく符号化。誰でも復号できる。守るのは RBAC と保管先の暗号化であって、base64 ではない。',
    },
  ],
};

export const k8sPvcPending: LessonDefinition = {
  id: 'k8s/06/boss-pvc-pending',
  track: 'k8s',
  kind: 'boss',
  title: 'PVC が Bound にならない',
  objectives: ['PVC と PV の結び付きが分かる', '束ねられない理由を読める', '容量とアクセスモードの条件が分かる'],
  parCommands: 12,
  initial: { cluster: cluster(), files: { ...FILES } },
  steps: [
    {
      prompt: '動的provisioning に対応しない StorageClass（dynamic: false）と、5Gi を要求する PVC を作れ。',
      check: 'PVC があり、Pending のままであること',
      hints: [
        MANIFEST_HINT,
        'kind: StorageClass に dynamic: false を書く',
        'kind: PersistentVolumeClaim の spec.resources.requests.storage: 5',
        'kubectl wait 3',
      ],
      solution: [heredoc('pvc.yaml', PVC_YAML), 'kubectl apply -f pvc.yaml', 'kubectl wait 3'],
      assert: ({ shell }) => {
        const claims = [...(shell.cluster?.persistentVolumeClaims.values() ?? [])];
        return claims.length > 0 && claims.every((c) => c.status.phase === 'Pending');
      },
      explain: '要求はしたが、応える相手がいない。Pending は「まだ相手が見つかっていない」状態。',
    },
    {
      prompt: 'なぜ束ねられないのか、理由を確かめよ。',
      check: 'kubectl get pvc か describe で PVC を調べたこと',
      hints: ['kubectl get pvc', 'kubectl get pvc <名前> -o yaml で message が読める'],
      solution: ['kubectl get pvc'],
      assert: ({ history }) => ran(history, 'kubectl', ['get', 'describe'], PVC),
      explain: '理由は必ず状態に書いてある。「なんとなく動かない」で終わらせない。',
    },
    {
      prompt: '条件を満たす PV を用意し、PVC を Bound にせよ。',
      check: 'PVC が Bound になっていること',
      hints: [
        '容量は要求以上、storageClassName と accessModes は一致させる',
        'kind: PersistentVolume の spec.capacity.storage: 10',
        'kubectl wait 3',
      ],
      solution: [heredoc('pv.yaml', PV_YAML), 'kubectl apply -f pv.yaml', 'kubectl wait 3'],
      assert: ({ shell }) => {
        const claims = [...(shell.cluster?.persistentVolumeClaims.values() ?? [])];
        return claims.length > 0 && claims.some((c) => c.status.phase === 'Bound');
      },
      diagnose: ({ shell }) => {
        const claims = [...(shell.cluster?.persistentVolumeClaims.values() ?? [])];
        const stuck = claims.find((c) => c.status.phase !== 'Bound');
        return stuck === undefined ? null : `まだ Pending です: ${stuck.status.message ?? ''}`;
      },
      explain:
        'PVC は「これだけ欲しい」、PV は「これだけある」。条件（容量・アクセスモード・StorageClass）が全て合って初めて結び付く。',
    },
  ],
};

/** taint が付いていて、toleration が無いと置けないクラスタ */
function tainted(): ClusterState {
  const gpu = node('gpu-1', 4000, 8192, { role: 'gpu' });
  return {
    ...emptyCluster([
      { ...gpu, spec: { ...gpu.spec, taints: [{ key: 'gpu', value: 'true', effect: 'NoSchedule' }] } },
    ]),
  };
}

export const k8sUnschedulable: LessonDefinition = {
  id: 'k8s/08/boss-unschedulable',
  track: 'k8s',
  kind: 'boss',
  title: '置ける場所が無い',
  objectives: ['taint と toleration の関係が分かる', '拒否の理由を読める', '意図した場所にだけ置ける'],
  parCommands: 12,
  initial: { cluster: tainted(), files: { ...FILES } },
  steps: [
    {
      prompt: '普通の Pod を1つ作り、置けないことを確かめよ。',
      check: 'Pod があり、まだ配置されていないこと',
      hints: [MANIFEST_HINT, 'kind: Pod で nginx を1つ', 'kubectl wait 3'],
      solution: [heredoc('pod.yaml', PLAIN_POD_YAML), 'kubectl apply -f pod.yaml', 'kubectl wait 3'],
      assert: ({ shell }) => {
        const pods = [...(shell.cluster?.pods.values() ?? [])];
        return pods.length > 0 && pods.some((p) => p.status.nodeName === null);
      },
      explain: 'taint は「ここには来るな」という札。toleration を持たない Pod は弾かれる。',
    },
    {
      prompt: '拒否された理由を確かめよ。',
      check: 'kubectl describe pod を実行したこと',
      hints: ['kubectl describe pod <名前>'],
      solution: ['kubectl describe pod plain'],
      assert: ({ history }) => ran(history, 'kubectl', 'describe', POD),
      explain: 'untolerated taint という理由がイベントに出る。容量不足とは別の理由であることが読み取れる。',
    },
    {
      prompt: 'toleration を付けた Pod を作り、Ready にせよ。',
      check: 'Ready な Pod が1つ以上あること',
      hints: [
        'spec.tolerations に key: gpu / effect: NoSchedule を書く',
        'kubectl wait 10',
      ],
      solution: [heredoc('tol.yaml', TOLERATING_POD_YAML), 'kubectl apply -f tol.yaml', 'kubectl wait 12'],
      assert: ({ shell }) => [...(shell.cluster?.pods.values() ?? [])].some(isReady),
      explain:
        'taint は「弾く」、toleration は「弾かれない」。置きたい場所に置くための条件であって、そこに引き寄せる仕組みではない。',
    },
  ],
};
