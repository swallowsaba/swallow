import { container, deployment, emptyCluster, node, service } from '@/engines/k8s/factory';
import { isReady } from '@/engines/k8s/kubelet';
import { canI } from '@/engines/k8s/policy';
import { key, type ClusterState } from '@/engines/k8s/types';
import { HOME } from '@/engines/kernel/path';
import type { LessonDefinition } from '../types';

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
      assert: ({ history }) =>
        history.some((l) => l.includes('get pod')) && history.some((l) => l.includes('describe pod')),
      explain:
        'Pending は「まだ置き場所が決まっていない」状態。理由は必ず describe のイベントに出る。',
    },
    {
      prompt: 'ノードの空き容量を確かめよ。',
      check: 'kubectl get nodes を実行したこと',
      hints: ['kubectl get nodes'],
      assert: ({ history }) => history.some((l) => l.includes('get node')),
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
      assert: ({ history }) => history.filter((l) => l.includes('apply -f')).length >= 2,
      explain:
        '同じものを何度適用しても結果は変わらない。これがあるから、CI から機械的に流せる。',
    },
    {
      prompt: 'Pod が2つとも Ready になるまで進めよ。',
      check: 'web の Pod が2つ Ready であること',
      hints: ['kubectl wait 12'],
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
      assert: ({ shell }) => shell.cluster?.pods.has(key('default', 'db-0')) === true,
      explain:
        'Deployment の Pod 名は乱数まじりだが、StatefulSet は 0 から始まる連番。名前が安定しているから、相手を名指しできる。',
    },
    {
      prompt: '3つ全部が Ready になるまで進めよ。',
      check: 'db-0 db-1 db-2 が全て Ready であること',
      hints: ['kubectl wait 20'],
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
      assert: ({ history }) =>
        history.some((l) => l.includes('get secret') && (l.includes('-o yaml') || l.includes('-o json'))) &&
        history.some((l) => l.includes('exec') && l.includes('env')),
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
      assert: ({ history }) => history.some((l) => l.includes('pvc')),
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
      assert: ({ history }) => history.some((l) => l.includes('describe pod')),
      explain: 'untolerated taint という理由がイベントに出る。容量不足とは別の理由であることが読み取れる。',
    },
    {
      prompt: 'toleration を付けた Pod を作り、Ready にせよ。',
      check: 'Ready な Pod が1つ以上あること',
      hints: [
        'spec.tolerations に key: gpu / effect: NoSchedule を書く',
        'kubectl wait 10',
      ],
      assert: ({ shell }) => [...(shell.cluster?.pods.values() ?? [])].some(isReady),
      explain:
        'taint は「弾く」、toleration は「弾かれない」。置きたい場所に置くための条件であって、そこに引き寄せる仕組みではない。',
    },
  ],
};

export const k8sCrashLoop: LessonDefinition = {
  id: 'k8s/09/boss-crashloop',
  track: 'k8s',
  kind: 'boss',
  title: '再起動を繰り返して止まらない',
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
      assert: ({ history }) => history.some((l) => l.includes('kubectl logs')),
      explain: '再起動している Pod のログは、落ちる直前までの出力。ここに原因が出ていることが多い。',
    },
    {
      prompt: '再起動の間隔が伸びていることを確かめよ。restartCount を2回見比べること。',
      check: 'restartCount を2回以上取得したこと',
      hints: [
        'kubectl get pods <名前> -o jsonpath={.status.containerStatuses[0].restartCount}',
        'kubectl wait 10 を挟んでもう一度見る',
      ],
      assert: ({ history }) =>
        history.filter((l) => l.includes('restartCount')).length >= 2,
      explain:
        '同じ間隔で叩き続けると、直っていないのに負荷だけ掛かる。だから待ち時間を倍々に伸ばす（指数バックオフ）。',
    },
    {
      prompt: '落ちないイメージに差し替えて、Ready にせよ。',
      check: 'worker の Pod が Ready であること',
      hints: ['kubectl set image deployment worker worker=nginx:1.25', 'kubectl wait 20'],
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
      assert: ({ shell, history }) => {
        const state = shell.cluster;
        if (state === null) return false;
        if (!state.serviceAccounts.has(key('default', 'deploy-bot'))) return false;
        if (!history.some((l) => l.includes('can-i'))) return false;
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
      assert: ({ shell, history }) => {
        const state = shell.cluster;
        if (state === null) return false;
        if (!history.some((l) => l.includes('can-i delete'))) return false;
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
      assert: ({ shell }) => (shell.cluster?.deployments.get(key('default', 'web'))?.spec.replicas ?? 0) > 2,
      explain:
        '「いまの台数 × 現在値 ÷ 目標値」が必要な台数。倍の負荷なら倍の台数、という素直な比で決まる。',
    },
    {
      prompt: '上限を超えないことを確かめよ。負荷を極端に上げてみること。',
      check: 'replicas が 6 を超えていないこと',
      hints: ['kubectl load web 1000', 'kubectl wait 30'],
      assert: ({ shell, history }) => {
        const replicas = shell.cluster?.deployments.get(key('default', 'web'))?.spec.replicas ?? 0;
        return history.some((l) => l.includes('load web')) && replicas <= 6 && replicas > 2;
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
        'kubectl get deploy noisy -o jsonpath={.spec.template.containers[0].limits}',
      ],
      assert: ({ history }) =>
        history.some((l) => l.includes('get deploy') && (l.includes('-o yaml') || l.includes('jsonpath'))),
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
