import { container, deployment, pod, service } from './factory';
import type { Deployment, Pod, Service } from './types';

/**
 * マニフェストの読み取り。
 * js-yaml を足す前段階として、まず素の JavaScript オブジェクトを受ける形にする。
 * kubectl create の簡易指定もここで組み立てる。
 */
export interface ManifestInput {
  apiVersion?: string;
  kind?: string;
  metadata?: { name?: string; namespace?: string; labels?: Record<string, string> };
  spec?: Record<string, unknown>;
}

export type ParsedResource = Pod | Deployment | Service;

export interface ParseError {
  error: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toContainers(value: unknown): ReturnType<typeof container>[] {
  const list = asArray(value);
  if (list.length === 0) return [container('main', 'nginx')];
  return list.map((raw, i) => {
    const c = asRecord(raw);
    const resources = asRecord(c['resources']);
    const requests = asRecord(resources['requests']);
    return container(
      typeof c['name'] === 'string' ? c['name'] : `c${String(i)}`,
      typeof c['image'] === 'string' ? c['image'] : 'nginx',
      {
        requests: {
          cpu: typeof requests['cpu'] === 'number' ? requests['cpu'] : 100,
          memory: typeof requests['memory'] === 'number' ? requests['memory'] : 128,
        },
      },
    );
  });
}

export function parseManifest(input: ManifestInput): ParsedResource | ParseError {
  const kind = input.kind;
  const name = input.metadata?.name;
  if (typeof kind !== 'string') return { error: 'error: kind が指定されていません' };
  if (typeof name !== 'string') return { error: 'error: metadata.name が指定されていません' };
  const namespace = input.metadata?.namespace ?? 'default';
  const spec = input.spec ?? {};

  if (kind === 'Pod') {
    return pod(name, toContainers(spec['containers']), {
      namespace,
      labels: input.metadata?.labels ?? {},
    });
  }

  if (kind === 'Deployment') {
    const template = asRecord(spec['template']);
    const templateSpec = asRecord(template['spec']);
    const templateMeta = asRecord(template['metadata']);
    const labels =
      (templateMeta['labels'] as Record<string, string> | undefined) ??
      input.metadata?.labels ?? { app: name };
    const strategy = asRecord(spec['strategy']);
    const rolling = asRecord(strategy['rollingUpdate']);
    const built = deployment(
      name,
      typeof spec['replicas'] === 'number' ? spec['replicas'] : 1,
      toContainers(templateSpec['containers']),
      {
        namespace,
        labels,
        maxSurge: typeof rolling['maxSurge'] === 'number' ? rolling['maxSurge'] : 1,
        maxUnavailable: typeof rolling['maxUnavailable'] === 'number' ? rolling['maxUnavailable'] : 1,
      },
    );
    return built;
  }

  if (kind === 'Service') {
    const ports = asArray(spec['ports']);
    const first = asRecord(ports[0]);
    return service(name, (spec['selector'] as Record<string, string> | undefined) ?? {}, {
      namespace,
      port: typeof first['port'] === 'number' ? first['port'] : 80,
      targetPort: typeof first['targetPort'] === 'number' ? first['targetPort'] : 80,
      type: (spec['type'] as Service['spec']['type'] | undefined) ?? 'ClusterIP',
    });
  }

  return { error: `error: 未対応の kind です: ${kind}` };
}

export function isParseError(value: ParsedResource | ParseError): value is ParseError {
  return 'error' in value;
}
