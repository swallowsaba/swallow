import { calicoManifest, flannelManifest } from '@/engines/k8s/addons';
import { emptyCluster, machine } from '@/engines/k8s/factory';
import { mintToken } from '@/engines/k8s/bootstrap';
import {
  cniReady, controlPlaneReady, nodeCount, nodesReady, resourceWhere, withCluster,
} from '../authoring/assert';
import type { MissionSource } from '../authoring/mission';
import type { Node } from '@/engines/k8s/types';
import { HOME, family, k8sDoc } from './shared';

const CH = 'k8s/01';

const KUBEADM = k8sDoc(
  'setup/production-environment/tools/kubeadm/create-cluster-kubeadm/',
  'Creating a cluster with kubeadm',
);
const CNI_DOC = k8sDoc(
  'concepts/extend-kubernetes/compute-storage-net/network-plugins/',
  'Network Plugins',
);

interface Lab {
  slug: string;
  /** 立てる機械 */
  cp: string;
  workers: string[];
  cidr: string;
  cni: 'flannel' | 'calico';
}

const LABS: Lab[] = [
  { slug: 'two-node', cp: 'cp-1', workers: ['node-1'], cidr: '10.244.0.0/16', cni: 'flannel' },
  { slug: 'three-node', cp: 'cp-1', workers: ['node-1', 'node-2'], cidr: '10.244.0.0/16', cni: 'flannel' },
  { slug: 'calico', cp: 'cp-1', workers: ['node-1'], cidr: '192.168.0.0/16', cni: 'calico' },
  { slug: 'calico-three', cp: 'cp-1', workers: ['node-1', 'node-2'], cidr: '192.168.0.0/16', cni: 'calico' },
  { slug: 'wide', cp: 'master', workers: ['worker-a', 'worker-b', 'worker-c'], cidr: '10.32.0.0/12', cni: 'flannel' },
  { slug: 'edge', cp: 'edge-cp', workers: ['edge-1'], cidr: '10.10.0.0/16', cni: 'calico' },
  { slug: 'lab', cp: 'lab-cp', workers: ['lab-1', 'lab-2'], cidr: '172.16.0.0/16', cni: 'flannel' },
  { slug: 'staging', cp: 'stg-cp', workers: ['stg-1'], cidr: '10.200.0.0/16', cni: 'calico' },
];

function manifestFor(lab: Lab): { name: string; text: string; daemonSet: string } {
  return lab.cni === 'flannel'
    ? { name: 'flannel.yaml', text: flannelManifest(lab.cidr), daemonSet: 'kube-flannel-ds' }
    : { name: 'calico.yaml', text: calicoManifest(), daemonSet: 'calico-node' };
}

function labCluster(lab: Lab) {
  return emptyCluster(
    [],
    [
      machine(lab.cp, 2000, 4096),
      ...lab.workers.map((w) => machine(w, 4000, 8192)),
      // わざと要件を満たさない機械も混ぜる（preflight で弾かれることを学ぶ）
      machine('tiny-1', 1000, 2048),
    ],
  );
}

function labFiles(lab: Lab): Record<string, string | null> {
  const manifest = manifestFor(lab);
  return { [HOME]: null, [`${HOME}/${manifest.name}`]: manifest.text };
}

/** init が払い出すトークンは決まっているので、模範解答にも書ける */
function tokenOf(lab: Lab): string {
  return mintToken(`${lab.cp}:init`);
}

/* ------------------------------------------------------------------ *
 * 1. コントロールプレーンを立てる
 * ------------------------------------------------------------------ */

const initDrills = family<Lab>({
  track: 'k8s',
  chapterId: CH,
  family: 'kubeadm-init',
  docs: [KUBEADM],
  variants: LABS.map((value) => ({ slug: value.slug, value })),
  make: (lab) => ({
    title: `${lab.cp} でコントロールプレーンを立てる`,
    objectives: ['素の計算機から始められる', 'Pod 網の範囲を決められる', '立てた直後の状態を説明できる'],
    initial: { cluster: labCluster(lab), files: labFiles(lab), cwd: HOME },
    solution: [`kubeadm init --node-name ${lab.cp} --pod-network-cidr ${lab.cidr}`],
    steps: [
      {
        prompt: `${lab.cp} に Kubernetes のコントロールプレーンを立てよ。Pod 網は ${lab.cidr} とする。`,
        conditions: [
          {
            label: 'コントロールプレーンが初期化されていること',
            test: controlPlaneReady(),
            howTo: 'kubectl get machines で、まだクラスタに入っていない計算機が見えます',
          },
          {
            label: `${lab.cp} が Node として現れていること`,
            test: withCluster((c) => c.nodes.has(lab.cp)),
            howTo: 'kubectl get nodes で確かめてください',
          },
          {
            label: `Pod 網が ${lab.cidr} で登録されていること`,
            test: withCluster((c) => c.controlPlane.podNetworkCidr === lab.cidr),
            howTo: '--pod-network-cidr で渡します。あとから CNI の設定と食い違うと Pod 網が張れません',
          },
          {
            label: 'まだ Ready になっていないこと（CNI が無いため）',
            test: nodesReady(0),
            howTo: 'これは失敗ではありません。次の手順で CNI を入れます',
          },
        ],
        hints: [
          'kubeadm init で立てる',
          'どの計算機で立てるかは --node-name で指名する',
          `kubeadm init --node-name ${lab.cp} --pod-network-cidr ${lab.cidr}`,
        ],
        explain:
          'init が終わっても、ノードは NotReady のまま。Pod 同士を繋ぐ配線（CNI）がまだ無いからで、これは壊れているのではなく順序の問題。',
      },
    ],
  }),
});

/* ------------------------------------------------------------------ *
 * 2. CNI を入れる
 * ------------------------------------------------------------------ */

const cniDrills = family<Lab>({
  track: 'k8s',
  chapterId: CH,
  family: 'install-cni',
  docs: [CNI_DOC],
  variants: LABS.map((value) => ({ slug: value.slug, value })),
  make: (lab) => {
    const manifest = manifestFor(lab);
    return {
      title: `${lab.cni} を入れてノードを Ready にする`,
      objectives: ['NotReady の理由を読める', 'マニフェストを適用できる', 'Ready になったことを確かめられる'],
      initial: { cluster: labCluster(lab), files: labFiles(lab), cwd: HOME },
      solution: [
        `kubeadm init --node-name ${lab.cp} --pod-network-cidr ${lab.cidr}`,
        `kubectl apply -f ${manifest.name}`,
      ],
      steps: [
        {
          prompt: `まず ${lab.cp} でコントロールプレーンを立てよ（Pod 網は ${lab.cidr}）。`,
          check: 'コントロールプレーンが初期化されていること',
          assert: controlPlaneReady(),
          hints: [`kubeadm init --node-name ${lab.cp} --pod-network-cidr ${lab.cidr}`],
          explain: '立てるところまでは前の演習と同じ。',
        },
        {
          prompt: `${manifest.name} を適用して Pod 網を張り、ノードを Ready にせよ。`,
          conditions: [
            {
              label: `${manifest.daemonSet} が kube-system に入っていること`,
              test: withCluster((c) => c.daemonSets.has(`kube-system/${manifest.daemonSet}`)),
              howTo: 'kubectl get ds -n kube-system で確かめてください',
            },
            {
              label: 'Pod 網の設定が入っていること',
              test: cniReady(),
              howTo: 'kubectl describe node で NotReady の理由が読めます',
            },
            {
              label: `${lab.cp} が Ready になっていること`,
              test: nodesReady(1),
              howTo: 'kubectl get nodes で STATUS 列を見てください',
            },
          ],
          hints: [
            'kubectl describe node <名前> に NotReady の理由が書いてある',
            'マニフェストは kubectl apply -f で適用する',
            `kubectl apply -f ${manifest.name}`,
          ],
          explain:
            'ノードの Ready は保持された印ではなく、状態から導かれる。Pod 網の設定が書かれた瞬間に条件が満たされ、Ready に変わる。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 3. ノードを足す
 * ------------------------------------------------------------------ */

const joinDrills = family<Lab>({
  track: 'k8s',
  chapterId: CH,
  family: 'join-nodes',
  docs: [k8sDoc('reference/setup-tools/kubeadm/kubeadm-join/', 'kubeadm join')],
  variants: LABS.map((value) => ({ slug: value.slug, value })),
  make: (lab) => {
    const manifest = manifestFor(lab);
    const token = tokenOf(lab);
    return {
      title: `${lab.workers.join(' と ')} をクラスタに入れる`,
      objectives: ['トークンの役割が分かる', 'ノードを足せる', '要件を満たさない機械が弾かれると分かる'],
      initial: { cluster: labCluster(lab), files: labFiles(lab), cwd: HOME },
      solution: [
        `kubeadm init --node-name ${lab.cp} --pod-network-cidr ${lab.cidr}`,
        `kubectl apply -f ${manifest.name}`,
        ...lab.workers.map((w) => `kubeadm join ${lab.cp}:6443 --token ${token} --node-name ${w}`),
      ],
      steps: [
        {
          prompt: `${lab.cp} でコントロールプレーンを立て、${manifest.name} を適用せよ。`,
          conditions: [
            { label: 'コントロールプレーンが初期化されていること', test: controlPlaneReady() },
            { label: 'Pod 網の設定が入っていること', test: cniReady() },
          ],
          hints: [
            `kubeadm init --node-name ${lab.cp} --pod-network-cidr ${lab.cidr}`,
            `kubectl apply -f ${manifest.name}`,
          ],
          explain: 'ここまでが土台。ノードを足すのはこの後。',
        },
        {
          prompt: `${lab.workers.join(' と ')} を join せよ。トークンは init の出力に書いてある。`,
          conditions: [
            {
              label: `ノードが ${String(lab.workers.length + 1)} 台になっていること`,
              test: nodeCount(lab.workers.length + 1),
              howTo: 'kubectl get nodes で数えてください',
            },
            {
              label: '全てのノードが Ready であること',
              test: nodesReady(lab.workers.length + 1),
              howTo: 'CNI が入っていれば、join した瞬間から Ready になります',
            },
            {
              label: '足したノードに control-plane の taint が付いていないこと',
              test: withCluster((c) =>
                lab.workers.every((w) => (c.nodes.get(w)?.spec.taints.length ?? 1) === 0),
              ),
              howTo: 'kubectl describe node <名前> で Taints を見てください',
            },
          ],
          hints: [
            'init の出力に kubeadm join の行がそのまま書いてある',
            'kubeadm token list でも確かめられる',
            `kubeadm join ${lab.cp}:6443 --token ${token} --node-name ${lab.workers[0] ?? ''}`,
          ],
          explain:
            'トークンは「この API サーバに繋いでよい」という短命の合鍵。期限が切れたら kubeadm token create で作り直す。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 4. コントロールプレーンの taint
 * ------------------------------------------------------------------ */

const taintDrills = family<Lab>({
  track: 'k8s',
  chapterId: CH,
  family: 'control-plane-taint',
  docs: [k8sDoc('concepts/scheduling-eviction/taint-and-toleration/', 'Taints and Tolerations')],
  variants: LABS.map((value) => ({ slug: value.slug, value })),
  make: (lab) => {
    const manifest = manifestFor(lab);
    return {
      title: `1台構成でも Pod を動かせるようにする（${lab.cp}）`,
      objectives: ['taint が何を止めているか分かる', '外す判断ができる'],
      initial: { cluster: labCluster(lab), files: labFiles(lab), cwd: HOME },
      solution: [
        `kubeadm init --node-name ${lab.cp} --pod-network-cidr ${lab.cidr}`,
        `kubectl apply -f ${manifest.name}`,
        `kubectl taint nodes ${lab.cp} node-role.kubernetes.io/control-plane:NoSchedule-`,
      ],
      steps: [
        {
          prompt: `${lab.cp} でクラスタを立て、${manifest.name} を適用せよ。`,
          conditions: [
            { label: 'コントロールプレーンが初期化されていること', test: controlPlaneReady() },
            { label: `${lab.cp} が Ready であること`, test: nodesReady(1) },
          ],
          hints: [
            `kubeadm init --node-name ${lab.cp} --pod-network-cidr ${lab.cidr}`,
            `kubectl apply -f ${manifest.name}`,
          ],
          explain: 'Ready にはなったが、このままでは普通の Pod は載らない。',
        },
        {
          prompt: `${lab.cp} に付いている NoSchedule の taint を外せ。`,
          conditions: [
            {
              label: `${lab.cp} から control-plane の taint が消えていること`,
              test: resourceWhere<Node>(
                'Node',
                lab.cp,
                (node) => !node.spec.taints.some((t) => t.key.includes('control-plane')),
                '',
              ),
              howTo: 'kubectl describe node で Taints の行を見てください',
            },
          ],
          hints: [
            'taint を消すには、指定の末尾に - を付ける',
            'kubectl describe node で正確なキーが読める',
            `kubectl taint nodes ${lab.cp} node-role.kubernetes.io/control-plane:NoSchedule-`,
          ],
          explain:
            'この taint は「ここにアプリを載せるな」という印。本番では残す。1台しかない検証環境では外さないと何も動かせない。',
        },
      ],
    };
  },
});

/* ------------------------------------------------------------------ *
 * 5. 立てたクラスタに最初のアプリを載せる
 * ------------------------------------------------------------------ */

const APPS: { slug: string; value: { name: string; image: string; replicas: number } }[] = [
  { slug: 'web', value: { name: 'web', image: 'nginx:1.27', replicas: 2 } },
  { slug: 'api', value: { name: 'api', image: 'api:1.4', replicas: 3 } },
  { slug: 'cache', value: { name: 'cache', image: 'redis:7', replicas: 1 } },
  { slug: 'worker', value: { name: 'worker', image: 'worker:2.0', replicas: 2 } },
  { slug: 'front', value: { name: 'front', image: 'front:3.1', replicas: 3 } },
  { slug: 'gateway', value: { name: 'gateway', image: 'envoy:1.30', replicas: 2 } },
];

const firstAppDrills = family<{ name: string; image: string; replicas: number }>({
  track: 'k8s',
  chapterId: CH,
  family: 'first-app',
  docs: [KUBEADM],
  variants: APPS,
  make: (app) => {
    const lab = LABS[0] as Lab;
    const manifest = manifestFor(lab);
    const token = tokenOf(lab);
    return {
      title: `組み上げたクラスタに ${app.name} を載せる`,
      objectives: ['構築から配置までを通しでできる', '数が揃うまで待てる'],
      initial: { cluster: labCluster(lab), files: labFiles(lab), cwd: HOME },
      solution: [
        `kubeadm init --node-name ${lab.cp} --pod-network-cidr ${lab.cidr}`,
        `kubectl apply -f ${manifest.name}`,
        `kubeadm join ${lab.cp}:6443 --token ${token} --node-name ${lab.workers[0] ?? ''}`,
        `kubectl create deploy ${app.name} --image=${app.image} --replicas=${String(app.replicas)}`,
        'kubectl wait 20',
      ],
      steps: [
        {
          prompt: `クラスタを立て、CNI を入れ、${lab.workers[0] ?? ''} を join せよ。`,
          conditions: [
            { label: 'ノードが 2 台あること', test: nodeCount(2) },
            { label: '2 台とも Ready であること', test: nodesReady(2) },
          ],
          hints: [
            `kubeadm init --node-name ${lab.cp} --pod-network-cidr ${lab.cidr}`,
            `kubectl apply -f ${manifest.name}`,
            `kubeadm join ${lab.cp}:6443 --token ${token} --node-name ${lab.workers[0] ?? ''}`,
          ],
          explain: 'ここまでが構築。ここから先が、いつもの Kubernetes の話になる。',
        },
        {
          prompt: `${app.name} を ${app.image} で ${String(app.replicas)} 個動かせ。`,
          conditions: [
            {
              label: `Deployment ${app.name} があること`,
              test: withCluster((c) => c.deployments.has(`default/${app.name}`)),
              howTo: 'kubectl create deploy <名前> --image=<イメージ> で作れます',
            },
            {
              label: `Ready な Pod が ${String(app.replicas)} 個あること`,
              test: withCluster(
                (c) =>
                  [...c.pods.values()].filter(
                    (p) =>
                      p.metadata.namespace === 'default' &&
                      p.metadata.labels['app'] === app.name &&
                      p.status.containerStatuses.every((s) => s.ready),
                  ).length === app.replicas,
              ),
              howTo: 'kubectl wait 20 で時間を進めてください',
            },
          ],
          hints: [
            `kubectl create deploy ${app.name} --image=${app.image} --replicas=${String(app.replicas)}`,
            '作った直後は Pending。kubectl wait で時間を進める',
          ],
          explain:
            'コントローラは「あるべき数」と「いまの数」の差を毎 tick 埋めにいく。作った瞬間に立ち上がるのではなく、収束していく。',
        },
      ],
    };
  },
});

export function k8s01(): MissionSource[] {
  return [...initDrills, ...cniDrills, ...joinDrills, ...taintDrills, ...firstAppDrills];
}
