import { probe as makeProbe } from '@/engines/k8s/factory';
import type { ContainerSpec, Deployment } from '@/engines/k8s/types';
import { key } from '@/engines/k8s/types';
import type { CommandResult } from '../registry';
import { KINDS, notFound, type KubectlContext } from './kubectlShared';

export interface TargetRef {
  kind: string;
  name: string;
  /** `deploy/web` のようにまとめて書かれていたか */
  slash: boolean;
}

/** `deploy/web` と `deployment web` のどちらの書き方も受ける */
export function targetOf(operands: readonly string[], at: number): TargetRef {
  const head = operands[at] ?? '';
  if (head.includes('/')) {
    return { kind: KINDS[head.split('/')[0] ?? ''] ?? '', name: head.split('/')[1] ?? '', slash: true };
  }
  return { kind: KINDS[head] ?? '', name: operands[at + 1] ?? '', slash: false };
}

/** `cpu=200m,memory=256Mi` を読む */
function parseQuantities(text: string): { cpu?: number; memory?: number } {
  const out: { cpu?: number; memory?: number } = {};
  for (const part of text.split(',')) {
    const [k, v = ''] = part.split('=');
    if (k === 'cpu') {
      out.cpu = v.endsWith('m') ? Number(v.slice(0, -1)) : Number(v) * 1000;
    } else if (k === 'memory') {
      out.memory = Number(v.replace(/(Mi|M)$/, ''));
    }
  }
  return out;
}

function updateContainers(
  ctx: KubectlContext,
  ref: TargetRef,
  change: (c: ContainerSpec) => ContainerSpec,
  note: string,
): CommandResult {
  const { cluster, namespace } = ctx;
  if (ref.kind !== 'deployments') {
    return { stderr: 'usage: kubectl set ... deployment <name> ...\n', code: 1 };
  }
  const id = key(namespace, ref.name);
  const deployment: Deployment | undefined = cluster.deployments.get(id);
  if (deployment === undefined) return notFound('deployments.apps', ref.name);

  const containers = deployment.spec.template.containers.map(change);
  const deployments = new Map(cluster.deployments);
  deployments.set(id, {
    ...deployment,
    spec: { ...deployment.spec, template: { ...deployment.spec.template, containers } },
    metadata: {
      ...deployment.metadata,
      annotations: { ...deployment.metadata.annotations, 'kubernetes.io/change-cause': note },
      resourceVersion: deployment.metadata.resourceVersion + 1,
    },
  });
  return {
    stdout: `deployment.apps/${ref.name} ${note} updated\n`,
    patch: { cluster: { ...cluster, deployments } },
  };
}

/** `kubectl set resources deploy/web --requests=cpu=200m,memory=256Mi --limits=...` */
export function setResources(ctx: KubectlContext): CommandResult {
  const ref = targetOf(ctx.operands, 1);
  const requests = ctx.values.get('requests');
  const limits = ctx.values.get('limits');
  if (requests === undefined && limits === undefined) {
    return { stderr: 'error: --requests か --limits を指定してください\n', code: 1 };
  }
  const wantRequests = requests === undefined ? null : parseQuantities(requests);
  const wantLimits = limits === undefined ? null : parseQuantities(limits);
  return updateContainers(
    ctx,
    ref,
    (c) => ({
      ...c,
      requests:
        wantRequests === null
          ? c.requests
          : {
              cpu: wantRequests.cpu ?? c.requests.cpu,
              memory: wantRequests.memory ?? c.requests.memory,
            },
      limits:
        wantLimits === null
          ? c.limits
          : {
              cpu: wantLimits.cpu ?? c.limits?.cpu ?? 0,
              memory: wantLimits.memory ?? c.limits?.memory ?? 0,
            },
    }),
    'resources',
  );
}

/**
 * `kubectl set probe deploy/web --readiness --succeeds-after=2`
 *
 * 本物の kubectl には無い形だが、probe の設定を状態として持っているので、
 * その1点だけを変えられる入口を用意する。--succeeds-after=never で通らない設定にできる。
 */
export function setProbe(ctx: KubectlContext): CommandResult {
  const ref = targetOf(ctx.operands, 1);
  const which = ctx.flags.has('liveness')
    ? 'livenessProbe'
    : ctx.flags.has('startup')
      ? 'startupProbe'
      : 'readinessProbe';
  const raw = ctx.values.get('succeeds-after');
  if (raw === undefined && !ctx.flags.has('remove')) {
    return { stderr: 'error: --succeeds-after=<数|never> か --remove を指定してください\n', code: 1 };
  }
  if (ctx.flags.has('remove')) {
    return updateContainers(ctx, ref, (c) => ({ ...c, [which]: null }), which);
  }
  const succeedsAfter = raw === 'never' ? null : Number(raw);
  if (raw !== 'never' && !Number.isInteger(succeedsAfter)) {
    return { stderr: `error: invalid value: ${raw ?? ''}\n`, code: 1 };
  }
  return updateContainers(
    ctx,
    ref,
    (c) => ({ ...c, [which]: makeProbe({ succeedsAfter }) }),
    which,
  );
}
