import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { meta, quantity } from './factory';
import type { ClusterState, Node } from './types';

/**
 * まだ Kubernetes が入っていない計算機。
 * kubeadm init / join で初めて Node になる。
 */
export interface Machine {
  name: string;
  cpu: number;
  memory: number;
  /** 素の OS に入っている kubeadm / kubelet の版 */
  kubeletVersion: string;
}

export interface ControlPlane {
  initialized: boolean;
  /** init したときの版。ノードはこの版で join する */
  version: string;
  /** kubeadm upgrade plan が提示する上げ先 */
  availableVersion: string;
  /** --pod-network-cidr。CNI の設定と食い違うと Pod 網が張れない */
  podNetworkCidr: string | null;
  serviceCidr: string;
  /** join に使える有効なトークン。init と token create で増える */
  tokens: readonly string[];
  /** どの計算機で init したか */
  endpoint: string | null;
  caCertHash: string | null;
  /**
   * 入っている CNI の名前。入っていなければ null。
   * 本物でもノードの /etc/cni/net.d に設定が書かれているかどうかが実体で、
   * DaemonSet はそれを書きに行く手段でしかない。ここでも設定の側を状態に持つ。
   */
  cni: string | null;
}

export const CONTROL_PLANE_TAINT = {
  key: 'node-role.kubernetes.io/control-plane',
  value: '',
  effect: 'NoSchedule',
} as const;

export function emptyControlPlane(version = 'v1.31.2', availableVersion = 'v1.32.1'): ControlPlane {
  return {
    initialized: false,
    version,
    availableVersion,
    podNetworkCidr: null,
    serviceCidr: '10.96.0.0/12',
    tokens: [],
    endpoint: null,
    caCertHash: null,
    cni: null,
  };
}

const ALNUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 乱数を使わずにトークンを作る。同じ操作をすれば同じ値になる */
export function mintToken(seed: string): string {
  const digest = bytesToHex(sha256(new TextEncoder().encode(`token:${seed}`)));
  const pick = (from: number, len: number): string => {
    let out = '';
    for (let i = 0; i < len; i += 1) {
      const byte = Number.parseInt(digest.slice((from + i) * 2, (from + i) * 2 + 2), 16);
      out += ALNUM[byte % ALNUM.length] ?? 'a';
    }
    return out;
  };
  return `${pick(0, 6)}.${pick(6, 16)}`;
}

export function caCertHashOf(endpoint: string): string {
  return `sha256:${bytesToHex(sha256(new TextEncoder().encode(`ca:${endpoint}`)))}`;
}

/** これらの名前の DaemonSet を適用すると Pod 網が張られる */
export const CNI_NAMES = new Set(['kube-flannel-ds', 'calico-node', 'cilium', 'weave-net']);

export function cniInstalled(state: ClusterState): boolean {
  return state.controlPlane.cni !== null;
}

export interface NodeCondition {
  ready: boolean;
  /** NotReady のときの理由。kubectl describe node に出す */
  reason: string;
  message: string;
}

/**
 * ノードが Ready かどうかを状態から導く。
 * kubelet が生きていても、Pod 網が張れていなければ Ready にはならない。
 */
export function nodeCondition(state: ClusterState, node: Node): NodeCondition {
  if (!node.status.kubeletHealthy) {
    return {
      ready: false,
      reason: 'NodeStatusUnknown',
      message: 'Kubelet stopped posting node status.',
    };
  }
  if (!cniInstalled(state)) {
    return {
      ready: false,
      reason: 'KubeletNotReady',
      message:
        'container runtime network not ready: NetworkReady=false reason:NetworkPluginNotReady message:Network plugin returns error: cni plugin not initialized',
    };
  }
  return { ready: true, reason: 'KubeletReady', message: 'kubelet is posting ready status' };
}

export function isNodeReady(state: ClusterState, node: Node): boolean {
  return nodeCondition(state, node).ready;
}

export function controlPlaneNode(state: ClusterState): Node | null {
  for (const node of state.nodes.values()) {
    if (node.spec.role === 'control-plane') return node;
  }
  return null;
}

export function makeNode(
  machine: Machine,
  role: Node['spec']['role'],
  version: string,
  createdAt: number,
): Node {
  return {
    kind: 'Node',
    metadata: meta(machine.name, {
      namespace: '',
      labels: {
        'kubernetes.io/hostname': machine.name,
        ...(role === 'control-plane' ? { 'node-role.kubernetes.io/control-plane': '' } : {}),
      },
      createdAt,
    }),
    spec: {
      role,
      taints: role === 'control-plane' ? [{ ...CONTROL_PLANE_TAINT }] : [],
      unschedulable: false,
    },
    status: {
      allocatable: quantity(machine.cpu, machine.memory),
      kubeletHealthy: true,
      version,
    },
  };
}
