import { container, probe } from './factory';
import type { EnvFromRef, PodTemplate, PodVolume, Probe, VolumeMount } from './types';

/**
 * YAML から読んだ素の値を、型のある値に直す道具。
 * 想定と違う形が来たら既定値に倒す。落ちるより、既定で動いたほうが学習の邪魔にならない。
 */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

export function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/(m|Mi|Gi)$/, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function asStringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(asRecord(value))) {
    if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
  }
  return out;
}

export function toProbe(value: unknown): Probe | null {
  const raw = asRecord(value);
  if (Object.keys(raw).length === 0) return null;
  // 「いつ通るようになるか」は succeedsAfter で明示する。書かれていなければすぐ通る
  const succeeds = raw['succeedsAfter'];
  return probe({
    initialDelaySeconds: asNumber(raw['initialDelaySeconds'], 0),
    periodSeconds: asNumber(raw['periodSeconds'], 1),
    failureThreshold: asNumber(raw['failureThreshold'], 3),
    succeedsAfter: succeeds === null ? null : asNumber(succeeds, 1),
  });
}

export function toEnvFrom(value: unknown): EnvFromRef[] {
  const out: EnvFromRef[] = [];
  for (const raw of asArray(value)) {
    const entry = asRecord(raw);
    const configMap = asRecord(entry['configMapRef']);
    const secret = asRecord(entry['secretRef']);
    if (typeof configMap['name'] === 'string') out.push({ kind: 'ConfigMap', name: configMap['name'] });
    if (typeof secret['name'] === 'string') out.push({ kind: 'Secret', name: secret['name'] });
  }
  return out;
}

export function toEnv(value: unknown): { env: Record<string, string>; refs: EnvFromRef[] } {
  const env: Record<string, string> = {};
  const refs: EnvFromRef[] = [];
  for (const raw of asArray(value)) {
    const entry = asRecord(raw);
    const name = asString(entry['name']);
    if (name === '') continue;
    if (typeof entry['value'] === 'string') {
      env[name] = entry['value'];
      continue;
    }
    const from = asRecord(entry['valueFrom']);
    const configMapKey = asRecord(from['configMapKeyRef']);
    const secretKey = asRecord(from['secretKeyRef']);
    if (typeof configMapKey['name'] === 'string') {
      refs.push({ kind: 'ConfigMap', name: configMapKey['name'], key: asString(configMapKey['key']), as: name });
    } else if (typeof secretKey['name'] === 'string') {
      refs.push({ kind: 'Secret', name: secretKey['name'], key: asString(secretKey['key']), as: name });
    }
  }
  return { env, refs };
}

export function toMounts(value: unknown): VolumeMount[] {
  return asArray(value).map((raw) => {
    const entry = asRecord(raw);
    return { name: asString(entry['name']), mountPath: asString(entry['mountPath']) };
  });
}

export function toContainers(value: unknown): ReturnType<typeof container>[] {
  const list = asArray(value);
  if (list.length === 0) return [container('main', 'nginx')];
  return list.map((raw, i) => {
    const c = asRecord(raw);
    const resources = asRecord(c['resources']);
    const requests = asRecord(resources['requests']);
    const limits = asRecord(resources['limits']);
    const { env, refs } = toEnv(c['env']);
    return container(asString(c['name'], `c${String(i)}`), asString(c['image'], 'nginx'), {
      requests: {
        cpu: asNumber(requests['cpu'], 100),
        memory: asNumber(requests['memory'], 128),
      },
      limits:
        Object.keys(limits).length === 0
          ? null
          : { cpu: asNumber(limits['cpu'], 200), memory: asNumber(limits['memory'], 256) },
      env,
      envFrom: [...toEnvFrom(c['envFrom']), ...refs],
      readyAfter: asNumber(c['readyAfter'], 2),
      livenessProbe: toProbe(c['livenessProbe']),
      readinessProbe: toProbe(c['readinessProbe']),
      startupProbe: toProbe(c['startupProbe']),
      volumeMounts: toMounts(c['volumeMounts']),
      ports: asArray(c['ports']).map((p) => asNumber(asRecord(p)['containerPort'], 80)),
    });
  });
}

export function toVolumes(value: unknown): PodVolume[] {
  const out: PodVolume[] = [];
  for (const raw of asArray(value)) {
    const entry = asRecord(raw);
    const name = asString(entry['name']);
    if (name === '') continue;
    const configMap = asRecord(entry['configMap']);
    const secret = asRecord(entry['secret']);
    const claim = asRecord(entry['persistentVolumeClaim']);
    if (typeof configMap['name'] === 'string') out.push({ name, kind: 'configMap', configMap: configMap['name'] });
    else if (typeof secret['secretName'] === 'string') out.push({ name, kind: 'secret', secret: secret['secretName'] });
    else if (typeof claim['claimName'] === 'string') out.push({ name, kind: 'persistentVolumeClaim', claimName: claim['claimName'] });
    else out.push({ name, kind: 'emptyDir' });
  }
  return out;
}

export function toTolerations(value: unknown): { key: string; effect: string }[] {
  return asArray(value).map((raw) => {
    const entry = asRecord(raw);
    return { key: asString(entry['key']), effect: asString(entry['effect'], 'NoSchedule') };
  });
}

export function toTemplate(value: unknown, fallbackLabels: Record<string, string>): PodTemplate {
  const template = asRecord(value);
  const templateMeta = asRecord(template['metadata']);
  const templateSpec = asRecord(template['spec']);
  const labels = asStringMap(templateMeta['labels']);
  return {
    labels: Object.keys(labels).length === 0 ? fallbackLabels : labels,
    containers: toContainers(templateSpec['containers']),
    nodeSelector: asStringMap(templateSpec['nodeSelector']),
  };
}

export function selectorOf(spec: Record<string, unknown>, fallback: Record<string, string>): Record<string, string> {
  const selector = asRecord(spec['selector']);
  const matchLabels = asStringMap(selector['matchLabels']);
  if (Object.keys(matchLabels).length > 0) return matchLabels;
  const direct = asStringMap(spec['selector']);
  return Object.keys(direct).length > 0 ? direct : fallback;
}
