import {
  kubeadmInit, kubeadmJoin, kubeadmReset, tokenCreate, upgradeApply, upgradeNode,
  type AdmResult,
} from '@/engines/k8s/kubeadm';
import type { ClusterState } from '@/engines/k8s/types';
import type { CommandResult, CommandSpec } from '../registry';
import { fromLines, parseArgs } from './args';

const NO_CLUSTER =
  'クラスタ演習ではありません。Kubernetes の任務を選んでください。\n';

/** `--token=x` と `--token x` のどちらでも受け取る */
const WITH_VALUE = [
  'pod-network-cidr', 'service-cidr', 'kubernetes-version', 'token',
  'discovery-token-ca-cert-hash', 'node-name', 'apiserver-advertise-address',
];

function render(result: AdmResult): CommandResult {
  if (result.error !== null) {
    return { stderr: `error execution phase preflight: ${result.error}\n`, code: 1 };
  }
  return { stdout: fromLines(result.lines), patch: { cluster: result.cluster } };
}

/** join の第1引数 `host:6443` からホスト名だけ取り出す */
function endpointHost(operand: string | undefined): string {
  if (operand === undefined) return '';
  return operand.split(':')[0] ?? '';
}

function runInit(cluster: ClusterState, argv: readonly string[]): CommandResult {
  const { values } = parseArgs([...argv], { withValue: WITH_VALUE });
  return render(
    kubeadmInit(cluster, {
      // どの計算機で立てるかは --node-name で指名する（1つの端末から全台を扱うため）
      machine: values.get('node-name') ?? firstFree(cluster),
      podNetworkCidr: values.get('pod-network-cidr') ?? null,
      serviceCidr: values.get('service-cidr') ?? null,
      version: values.get('kubernetes-version') ?? null,
    }),
  );
}

function firstFree(cluster: ClusterState): string {
  const names = [...cluster.machines.keys()].sort();
  return names.find((n) => !cluster.nodes.has(n)) ?? names[0] ?? '';
}

function runJoin(cluster: ClusterState, argv: readonly string[]): CommandResult {
  const { values, operands } = parseArgs([...argv], { withValue: WITH_VALUE });
  const token = values.get('token');
  if (token === undefined) {
    return { stderr: 'error: --token が要ります\n', code: 1 };
  }
  return render(
    kubeadmJoin(cluster, {
      machine: values.get('node-name') ?? firstFree(cluster),
      endpoint: endpointHost(operands[1]),
      token,
      caCertHash: values.get('discovery-token-ca-cert-hash') ?? null,
    }),
  );
}

function runToken(cluster: ClusterState, argv: readonly string[]): CommandResult {
  const action = argv[2] ?? 'list';
  if (action === 'create') return render(tokenCreate(cluster));
  if (action === 'list') {
    const rows = ['TOKEN                     TTL         DESCRIPTION'];
    for (const token of cluster.controlPlane.tokens) {
      rows.push(`${token}   23h         bootstrap token`);
    }
    return { stdout: fromLines(rows) };
  }
  return { stderr: `unknown command "token ${action}"\n`, code: 1 };
}

function runUpgrade(cluster: ClusterState, argv: readonly string[]): CommandResult {
  const action = argv[2] ?? '';
  const cp = cluster.controlPlane;
  if (action === 'plan') {
    if (!cp.initialized) {
      return { stderr: 'error: the cluster is not initialized\n', code: 1 };
    }
    return {
      stdout: fromLines([
        '[upgrade/config] Reading configuration from the cluster...',
        '',
        'Components that must be upgraded manually after you have upgraded the control plane with '
          + `'kubeadm upgrade apply':`,
        'COMPONENT   CURRENT   TARGET',
        ...[...cluster.nodes.values()]
          .filter((n) => n.spec.role === 'worker')
          .map((n) => `kubelet     ${n.status.version}   ${cp.availableVersion}`),
        '',
        'Upgrade to the latest stable version:',
        '',
        'COMPONENT                 CURRENT   TARGET',
        `kube-apiserver            ${cp.version}   ${cp.availableVersion}`,
        `kube-controller-manager   ${cp.version}   ${cp.availableVersion}`,
        `kube-scheduler            ${cp.version}   ${cp.availableVersion}`,
        '',
        'You can now apply the upgrade by executing the following command:',
        '',
        `\tkubeadm upgrade apply ${cp.availableVersion}`,
      ]),
    };
  }
  if (action === 'apply') {
    const version = argv[3];
    if (version === undefined) return { stderr: 'error: 上げ先の版を指定してください\n', code: 1 };
    return render(upgradeApply(cluster, version));
  }
  if (action === 'node') {
    const { values } = parseArgs([...argv], { withValue: WITH_VALUE });
    const name = values.get('node-name');
    if (name === undefined) return { stderr: 'error: --node-name が要ります\n', code: 1 };
    return render(upgradeNode(cluster, name));
  }
  return { stderr: `unknown command "upgrade ${action}"\n`, code: 1 };
}

/**
 * クラスタを組み立てる側の道具。
 * 本物は各機械の上で実行するが、ここは端末が1つなので
 * どの機械に対する操作かを --node-name で指名する。
 */
export const kubeadmCommands: CommandSpec[] = [
  {
    name: 'kubeadm',
    summary: 'クラスタを構築する（init / join / token / upgrade / reset）',
    handler: ({ argv, shell }) => {
      const cluster = shell.cluster;
      if (cluster === null) return { stderr: NO_CLUSTER, code: 1 };
      const sub = argv[1] ?? '';
      switch (sub) {
        case 'init':
          return runInit(cluster, argv);
        case 'join':
          return runJoin(cluster, argv);
        case 'token':
          return runToken(cluster, argv);
        case 'upgrade':
          return runUpgrade(cluster, argv);
        case 'reset': {
          const { values } = parseArgs([...argv], { withValue: WITH_VALUE });
          const name = values.get('node-name');
          if (name === undefined) return { stderr: 'error: --node-name が要ります\n', code: 1 };
          return render(kubeadmReset(cluster, name));
        }
        case 'version':
          return { stdout: `kubeadm version: ${cluster.controlPlane.version}\n` };
        case '':
        case 'help':
          return {
            stdout: fromLines([
              'kubeadm: クラスタを作る道具',
              '',
              '  init    --node-name <機械> --pod-network-cidr <CIDR>',
              '  join    <host>:6443 --token <token> --node-name <機械>',
              '  token   list | create',
              '  upgrade plan | apply <版> | node --node-name <ノード>',
              '  reset   --node-name <ノード>',
            ]),
          };
        default:
          return { stderr: `kubeadm: unknown command "${sub}"\n`, code: 1 };
      }
    },
  },
];
