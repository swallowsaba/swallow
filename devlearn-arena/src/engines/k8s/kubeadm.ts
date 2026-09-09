import { caCertHashOf, makeNode, mintToken, type ControlPlane, type Machine } from './bootstrap';
import type { ClusterState } from './types';

export interface AdmResult {
  cluster: ClusterState;
  /** 表示する行。コマンド層はこれを繋ぐだけ */
  lines: string[];
  error: string | null;
}

function fail(cluster: ClusterState, error: string): AdmResult {
  return { cluster, lines: [], error };
}

function freeMachine(state: ClusterState, name: string): Machine | string {
  const machine = state.machines.get(name);
  if (!machine) {
    return `machine "${name}" not found: この演習で使える計算機ではありません`;
  }
  if (state.nodes.has(name)) {
    return '[ERROR Port-10250]: Port 10250 is in use\n[ERROR FileAvailable--etc-kubernetes-kubelet.conf]: /etc/kubernetes/kubelet.conf already exists';
  }
  return machine;
}

function controlPlaneName(state: ClusterState): string | null {
  for (const node of state.nodes.values()) {
    if (node.spec.role === 'control-plane') return node.metadata.name;
  }
  return null;
}

export interface InitOptions {
  machine: string;
  podNetworkCidr: string | null;
  serviceCidr: string | null;
  version: string | null;
}

/**
 * コントロールプレーンを立てる。
 * 立てた直後は CNI が無いのでノードは NotReady のまま、という本物の順序を守る。
 */
export function kubeadmInit(state: ClusterState, options: InitOptions): AdmResult {
  if (state.controlPlane.initialized) {
    return fail(
      state,
      '[ERROR FileAvailable--etc-kubernetes-manifests-kube-apiserver.yaml]: /etc/kubernetes/manifests/kube-apiserver.yaml already exists',
    );
  }
  const machine = freeMachine(state, options.machine);
  if (typeof machine === 'string') return fail(state, machine);
  if (machine.cpu < 2000) {
    return fail(
      state,
      `[ERROR NumCPU]: the number of available CPUs ${String(Math.floor(machine.cpu / 1000))} is less than the required 2`,
    );
  }

  const version = options.version ?? state.controlPlane.version;
  const token = mintToken(`${machine.name}:init`);
  const caCertHash = caCertHashOf(machine.name);
  const controlPlane: ControlPlane = {
    ...state.controlPlane,
    initialized: true,
    version,
    podNetworkCidr: options.podNetworkCidr,
    serviceCidr: options.serviceCidr ?? state.controlPlane.serviceCidr,
    tokens: [token],
    endpoint: machine.name,
    caCertHash,
  };
  const node = makeNode(machine, 'control-plane', version, state.tick);
  return {
    cluster: {
      ...state,
      controlPlane,
      nodes: new Map([...state.nodes, [node.metadata.name, node]]),
    },
    lines: [
      'Your Kubernetes control-plane has initialized successfully!',
      '',
      'You should now deploy a pod network to the cluster.',
      'Run "kubectl apply -f [podnetwork].yaml" with one of the options listed at:',
      '  https://kubernetes.io/docs/concepts/cluster-administration/addons/',
      '',
      'Then you can join any number of worker nodes by running the following on each as root:',
      '',
      `kubeadm join ${machine.name}:6443 --token ${token} --discovery-token-ca-cert-hash ${caCertHash}`,
    ],
    error: null,
  };
}

export interface JoinOptions {
  machine: string;
  endpoint: string;
  token: string;
  caCertHash: string | null;
}

export function kubeadmJoin(state: ClusterState, options: JoinOptions): AdmResult {
  if (!state.controlPlane.initialized) {
    return fail(
      state,
      `[ERROR Connection]: could not reach ${options.endpoint}: コントロールプレーンがまだありません`,
    );
  }
  const machine = freeMachine(state, options.machine);
  if (typeof machine === 'string') return fail(state, machine);
  if (!state.controlPlane.tokens.includes(options.token)) {
    return fail(
      state,
      `[ERROR Discovery]: couldn't validate the identity of the API Server: invalid token "${options.token}"`,
    );
  }
  if (options.caCertHash !== null && options.caCertHash !== state.controlPlane.caCertHash) {
    return fail(
      state,
      "[ERROR Discovery]: could not find a JWS signature in the cluster-info ConfigMap for token ID: pinned hash doesn't match",
    );
  }
  const node = makeNode(machine, 'worker', state.controlPlane.version, state.tick);
  return {
    cluster: { ...state, nodes: new Map([...state.nodes, [node.metadata.name, node]]) },
    lines: [
      'This node has joined the cluster:',
      '* Certificate signing request was sent to apiserver and a response was received.',
      '* The Kubelet was informed of the new secure connection details.',
      '',
      "Run 'kubectl get nodes' on the control-plane to see this node join the cluster.",
    ],
    error: null,
  };
}

/** ノードをクラスタから外し、素の計算機に戻す */
export function kubeadmReset(state: ClusterState, name: string): AdmResult {
  const node = state.nodes.get(name);
  if (!node) return fail(state, `[ERROR NodeNotFound]: node "${name}" not found`);
  const nodes = new Map(state.nodes);
  nodes.delete(name);
  // そのノードに載っていた Pod は行き場を失う。次の tick で置き直される
  const pods = new Map(
    [...state.pods].map(([id, pod]) =>
      pod.status.nodeName === name
        ? [
            id,
            {
              ...pod,
              status: {
                ...pod.status,
                phase: 'Pending' as const,
                nodeName: null,
                podIP: null,
                startedAt: null,
              },
            },
          ]
        : [id, pod],
    ),
  );
  const controlPlane =
    node.spec.role === 'control-plane'
      ? { ...state.controlPlane, initialized: false, tokens: [], endpoint: null, caCertHash: null }
      : state.controlPlane;
  return {
    cluster: { ...state, nodes, pods, controlPlane },
    lines: [
      '[reset] Stopping the kubelet service',
      '[reset] Unmounting mounted directories in "/var/lib/kubelet"',
      '[reset] Deleting contents of directories: [/etc/kubernetes/manifests /var/lib/kubelet /etc/kubernetes/pki]',
      '',
      'The reset process does not clean CNI configuration. To do so, you must remove /etc/cni/net.d',
    ],
    error: null,
  };
}

export function tokenCreate(state: ClusterState): AdmResult {
  if (!state.controlPlane.initialized) {
    return fail(state, "couldn't create token: the cluster is not initialized");
  }
  const token = mintToken(
    `${String(state.controlPlane.tokens.length)}:${state.controlPlane.endpoint ?? ''}`,
  );
  return {
    cluster: {
      ...state,
      controlPlane: { ...state.controlPlane, tokens: [...state.controlPlane.tokens, token] },
    },
    lines: [token],
    error: null,
  };
}

/** 版を上げる。コントロールプレーンが先、ノードが後、という順序を守らせる */
export function upgradeApply(state: ClusterState, version: string): AdmResult {
  if (!state.controlPlane.initialized) {
    return fail(state, "couldn't upgrade: the cluster is not initialized");
  }
  if (version !== state.controlPlane.availableVersion) {
    return fail(
      state,
      `specified version to upgrade to "${version}" is not available (available: ${state.controlPlane.availableVersion})`,
    );
  }
  const cp = controlPlaneName(state);
  const nodes = new Map(state.nodes);
  if (cp !== null) {
    const node = nodes.get(cp);
    if (node) nodes.set(cp, { ...node, status: { ...node.status, version } });
  }
  return {
    cluster: { ...state, controlPlane: { ...state.controlPlane, version }, nodes },
    lines: [
      `[upgrade/successful] SUCCESS! Your cluster was upgraded to "${version}". Enjoy!`,
      '',
      '[upgrade/kubelet] Now please proceed with upgrading the kubelet on each node.',
    ],
    error: null,
  };
}

/** ノード側の kubelet を上げる。コントロールプレーンを追い越せない */
export function upgradeNode(state: ClusterState, name: string): AdmResult {
  const node = state.nodes.get(name);
  if (!node) return fail(state, `[ERROR NodeNotFound]: node "${name}" not found`);
  if (node.status.version === state.controlPlane.version) {
    return {
      cluster: state,
      lines: [`[upgrade] The node is already up to date (${node.status.version})`],
      error: null,
    };
  }
  if (!node.spec.unschedulable) {
    return fail(
      state,
      `node "${name}" はまだ drain されていません。先に kubectl drain ${name} --ignore-daemonsets を実行してください`,
    );
  }
  const nodes = new Map(state.nodes);
  nodes.set(name, { ...node, status: { ...node.status, version: state.controlPlane.version } });
  return {
    cluster: { ...state, nodes },
    lines: ['[upgrade] The configuration for this node was successfully updated!'],
    error: null,
  };
}
