import { load, loadAll } from 'js-yaml';
import { container, deployment, meta, pod, probe, service } from './factory';
import type {
  ConfigMap, CronJob, DaemonSet, Deployment, EnvFromRef, HorizontalPodAutoscaler, Ingress, Job,
  NetworkPolicy, PersistentVolume, PersistentVolumeClaim, Pod, PodTemplate, PodVolume, Probe,
  Resource, Role, RoleBinding, Secret, Service, ServiceAccount, StatefulSet, StorageClass,
  VolumeMount,
} from './types';

/**
 * マニフェストの読み取り。
 * YAML を実際に構文解析し、素のオブジェクトを型のある資源に組み立てる。
 * 未知のキーは黙って捨てず、未対応の kind としてエラーにする。
 */
export interface ParseError {
  error: string;
}

export function isParseError(value: Resource | ParseError): value is ParseError {
  return 'error' in value;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value.replace(/(m|Mi|Gi)$/, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asStringMap(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(asRecord(value))) {
    if (typeof v === 'string') out[k] = v;
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = String(v);
  }
  return out;
}

function toProbe(value: unknown): Probe | null {
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

function toEnvFrom(value: unknown): EnvFromRef[] {
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

function toEnv(value: unknown): { env: Record<string, string>; refs: EnvFromRef[] } {
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

function toMounts(value: unknown): VolumeMount[] {
  return asArray(value).map((raw) => {
    const entry = asRecord(raw);
    return { name: asString(entry['name']), mountPath: asString(entry['mountPath']) };
  });
}

function toContainers(value: unknown): ReturnType<typeof container>[] {
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

function toVolumes(value: unknown): PodVolume[] {
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

function toTemplate(value: unknown, fallbackLabels: Record<string, string>): PodTemplate {
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

function selectorOf(spec: Record<string, unknown>, fallback: Record<string, string>): Record<string, string> {
  const selector = asRecord(spec['selector']);
  const matchLabels = asStringMap(selector['matchLabels']);
  if (Object.keys(matchLabels).length > 0) return matchLabels;
  const direct = asStringMap(spec['selector']);
  return Object.keys(direct).length > 0 ? direct : fallback;
}

type Builder = (
  name: string,
  namespace: string,
  labels: Record<string, string>,
  spec: Record<string, unknown>,
  doc: Record<string, unknown>,
) => Resource;

const BUILDERS: Record<string, Builder> = {
  Pod: (name, namespace, labels, spec) => {
    const built = pod(name, toContainers(spec['containers']), {
      namespace,
      labels,
      nodeSelector: asStringMap(spec['nodeSelector']),
      volumes: toVolumes(spec['volumes']),
      serviceAccountName: asString(spec['serviceAccountName'], 'default'),
    });
    return built satisfies Pod;
  },

  Deployment: (name, namespace, labels, spec) => {
    const template = toTemplate(spec['template'], { app: name, ...labels });
    const strategy = asRecord(spec['strategy']);
    const rolling = asRecord(strategy['rollingUpdate']);
    const built = deployment(name, asNumber(spec['replicas'], 1), template.containers, {
      namespace,
      labels: template.labels,
      maxSurge: asNumber(rolling['maxSurge'], 1),
      maxUnavailable: asNumber(rolling['maxUnavailable'], 1),
    });
    return {
      ...built,
      spec: {
        ...built.spec,
        selector: selectorOf(spec, template.labels),
        template,
      },
    } satisfies Deployment;
  },

  Service: (name, namespace, _labels, spec) => {
    const ports = asArray(spec['ports']);
    const first = asRecord(ports[0]);
    return service(name, asStringMap(spec['selector']), {
      namespace,
      port: asNumber(first['port'], 80),
      targetPort: asNumber(first['targetPort'], 80),
      type: (asString(spec['type'], 'ClusterIP') as Service['spec']['type']),
    });
  },

  ConfigMap: (name, namespace, labels, _spec, doc) =>
    ({
      kind: 'ConfigMap',
      metadata: meta(name, { namespace, labels }),
      data: asStringMap(doc['data']),
      immutable: asBoolean(doc['immutable']),
    }) satisfies ConfigMap,

  Secret: (name, namespace, labels, _spec, doc) => {
    const plain = asStringMap(doc['stringData']);
    const encoded = asStringMap(doc['data']);
    // stringData で書かれたものは base64 にして持つ。中身が読めることを見せるため
    for (const [k, v] of Object.entries(plain)) encoded[k] = btoa(v);
    return {
      kind: 'Secret',
      metadata: meta(name, { namespace, labels }),
      data: encoded,
      type: asString(doc['type'], 'Opaque'),
    } satisfies Secret;
  },

  StorageClass: (name, _namespace, labels, _spec, doc) =>
    ({
      kind: 'StorageClass',
      metadata: meta(name, { namespace: '', labels }),
      provisioner: asString(doc['provisioner'], 'devlearn.io/local'),
      reclaimPolicy: (asString(doc['reclaimPolicy'], 'Delete') as StorageClass['reclaimPolicy']),
      volumeBindingMode: (asString(doc['volumeBindingMode'], 'Immediate') as StorageClass['volumeBindingMode']),
      dynamic: asBoolean(doc['dynamic'], true),
    }) satisfies StorageClass,

  PersistentVolume: (name, _namespace, labels, spec) =>
    ({
      kind: 'PersistentVolume',
      metadata: meta(name, { namespace: '', labels }),
      spec: {
        capacityGi: asNumber(asRecord(spec['capacity'])['storage'], 1),
        accessModes: asArray(spec['accessModes']).map((m) => asString(m, 'ReadWriteOnce')) as PersistentVolume['spec']['accessModes'],
        storageClassName: asString(spec['storageClassName'], 'standard'),
        reclaimPolicy: (asString(spec['persistentVolumeReclaimPolicy'], 'Retain') as StorageClass['reclaimPolicy']),
        nodeName: spec['nodeName'] === undefined ? null : asString(spec['nodeName']),
      },
      status: { phase: 'Available', claim: null },
    }) satisfies PersistentVolume,

  PersistentVolumeClaim: (name, namespace, labels, spec) =>
    ({
      kind: 'PersistentVolumeClaim',
      metadata: meta(name, { namespace, labels }),
      spec: {
        requestGi: asNumber(asRecord(asRecord(spec['resources'])['requests'])['storage'], 1),
        accessModes: asArray(spec['accessModes']).map((m) => asString(m, 'ReadWriteOnce')) as PersistentVolumeClaim['spec']['accessModes'],
        storageClassName: asString(spec['storageClassName'], 'standard'),
      },
      status: { phase: 'Pending', volumeName: null, message: null },
    }) satisfies PersistentVolumeClaim,

  StatefulSet: (name, namespace, labels, spec) => {
    const template = toTemplate(spec['template'], { app: name, ...labels });
    return {
      kind: 'StatefulSet',
      metadata: meta(name, { namespace, labels: template.labels }),
      spec: {
        replicas: asNumber(spec['replicas'], 1),
        selector: selectorOf(spec, template.labels),
        serviceName: asString(spec['serviceName'], name),
        template,
        volumeClaimTemplates: asArray(spec['volumeClaimTemplates']).map((raw) => {
          const claim = asRecord(raw);
          const claimSpec = asRecord(claim['spec']);
          return {
            name: asString(asRecord(claim['metadata'])['name'], 'data'),
            requestGi: asNumber(asRecord(asRecord(claimSpec['resources'])['requests'])['storage'], 1),
            storageClassName: asString(claimSpec['storageClassName'], 'standard'),
          };
        }),
      },
      status: { replicas: 0, readyReplicas: 0 },
    } satisfies StatefulSet;
  },

  DaemonSet: (name, namespace, labels, spec) => {
    const template = toTemplate(spec['template'], { app: name, ...labels });
    return {
      kind: 'DaemonSet',
      metadata: meta(name, { namespace, labels: template.labels }),
      spec: {
        selector: selectorOf(spec, template.labels),
        template,
        nodeSelector: template.nodeSelector,
      },
      status: { desiredNumberScheduled: 0, numberReady: 0 },
    } satisfies DaemonSet;
  },

  Job: (name, namespace, labels, spec) =>
    ({
      kind: 'Job',
      metadata: meta(name, { namespace, labels }),
      spec: {
        completions: asNumber(spec['completions'], 1),
        parallelism: asNumber(spec['parallelism'], 1),
        backoffLimit: asNumber(spec['backoffLimit'], 6),
        template: toTemplate(spec['template'], { job: name }),
      },
      status: { active: 0, succeeded: 0, failed: 0, completed: false },
    }) satisfies Job,

  CronJob: (name, namespace, labels, spec) => {
    const jobTemplate = asRecord(spec['jobTemplate']);
    const jobSpec = asRecord(jobTemplate['spec']);
    return {
      kind: 'CronJob',
      metadata: meta(name, { namespace, labels }),
      spec: {
        everyTicks: asNumber(spec['everyTicks'], 5),
        suspend: asBoolean(spec['suspend']),
        concurrencyPolicy: (asString(spec['concurrencyPolicy'], 'Allow') as CronJob['spec']['concurrencyPolicy']),
        jobTemplate: {
          completions: asNumber(jobSpec['completions'], 1),
          parallelism: asNumber(jobSpec['parallelism'], 1),
          backoffLimit: asNumber(jobSpec['backoffLimit'], 6),
          template: toTemplate(jobSpec['template'], { job: name }),
        },
      },
      status: { lastScheduleTick: null, createdCount: 0 },
    } satisfies CronJob;
  },

  Ingress: (name, namespace, labels, spec) =>
    ({
      kind: 'Ingress',
      metadata: meta(name, { namespace, labels }),
      spec: {
        className: asString(spec['ingressClassName'], 'nginx'),
        rules: asArray(spec['rules']).flatMap((raw) => {
          const rule = asRecord(raw);
          const host = asString(rule['host']);
          const http = asRecord(rule['http']);
          return asArray(http['paths']).map((p) => {
            const path = asRecord(p);
            const backend = asRecord(asRecord(path['backend'])['service']);
            return {
              host,
              path: asString(path['path'], '/'),
              serviceName: asString(backend['name']),
              servicePort: asNumber(asRecord(backend['port'])['number'], 80),
            };
          });
        }),
      },
      status: { address: null },
    }) satisfies Ingress,

  NetworkPolicy: (name, namespace, labels, spec) => {
    const peers = (value: unknown, side: 'from' | 'to') =>
      asArray(value).map((raw) => {
        const rule = asRecord(raw);
        const sources = asArray(rule[side]);
        const first = asRecord(sources[0]);
        return {
          podSelector: asStringMap(asRecord(first['podSelector'])['matchLabels']),
          ports: asArray(rule['ports']).map((p) => asNumber(asRecord(p)['port'], 80)),
        };
      });
    return {
      kind: 'NetworkPolicy',
      metadata: meta(name, { namespace, labels }),
      spec: {
        podSelector: asStringMap(asRecord(spec['podSelector'])['matchLabels']),
        policyTypes: asArray(spec['policyTypes']).map((t) => asString(t, 'Ingress')) as NetworkPolicy['spec']['policyTypes'],
        ingressFrom: peers(spec['ingress'], 'from'),
        egressTo: peers(spec['egress'], 'to'),
      },
    } satisfies NetworkPolicy;
  },

  ServiceAccount: (name, namespace, labels) =>
    ({ kind: 'ServiceAccount', metadata: meta(name, { namespace, labels }) }) satisfies ServiceAccount,

  Role: (name, namespace, labels, _spec, doc) =>
    ({
      kind: 'Role',
      metadata: meta(name, { namespace, labels }),
      rules: asArray(doc['rules']).map((raw) => {
        const rule = asRecord(raw);
        return {
          apiGroups: asArray(rule['apiGroups']).map((g) => asString(g)),
          resources: asArray(rule['resources']).map((r) => asString(r)),
          verbs: asArray(rule['verbs']).map((v) => asString(v)),
        };
      }),
    }) satisfies Role,

  RoleBinding: (name, namespace, labels, _spec, doc) => {
    const roleRef = asRecord(doc['roleRef']);
    return {
      kind: 'RoleBinding',
      metadata: meta(name, { namespace, labels }),
      roleRef: {
        kind: (asString(roleRef['kind'], 'Role') as 'Role' | 'ClusterRole'),
        name: asString(roleRef['name']),
      },
      subjects: asArray(doc['subjects']).map((raw) => {
        const subject = asRecord(raw);
        return {
          kind: (asString(subject['kind'], 'ServiceAccount') as RoleBinding['subjects'][number]['kind']),
          name: asString(subject['name']),
          namespace: asString(subject['namespace'], namespace),
        };
      }),
    } satisfies RoleBinding;
  },

  HorizontalPodAutoscaler: (name, namespace, labels, spec) => {
    const target = asRecord(spec['scaleTargetRef']);
    const metrics = asArray(spec['metrics']);
    const first = asRecord(asRecord(metrics[0])['resource']);
    const utilization = asRecord(first['target']);
    return {
      kind: 'HorizontalPodAutoscaler',
      metadata: meta(name, { namespace, labels }),
      spec: {
        targetKind: 'Deployment',
        targetName: asString(target['name']),
        minReplicas: asNumber(spec['minReplicas'], 1),
        maxReplicas: asNumber(spec['maxReplicas'], 10),
        targetCpuPercent: asNumber(utilization['averageUtilization'], 80),
      },
      status: { currentCpuPercent: 0, desiredReplicas: asNumber(spec['minReplicas'], 1) },
    } satisfies HorizontalPodAutoscaler;
  },
};

/** kind の別名。Role と ClusterRole のように、扱いが同じものをまとめる */
const ALIASES: Record<string, string> = {
  ClusterRole: 'Role',
  ClusterRoleBinding: 'RoleBinding',
};

export function buildResource(doc: Record<string, unknown>): Resource | ParseError {
  const rawKind = asString(doc['kind']);
  if (rawKind === '') return { error: 'error: kind が指定されていません' };
  const kind = ALIASES[rawKind] ?? rawKind;
  const metadata = asRecord(doc['metadata']);
  const name = asString(metadata['name']);
  if (name === '') return { error: 'error: metadata.name が指定されていません' };

  const builder = BUILDERS[kind];
  if (builder === undefined) return { error: `error: 未対応の kind です: ${rawKind}` };

  const namespace = asString(metadata['namespace'], 'default');
  const labels = asStringMap(metadata['labels']);
  const built = builder(name, namespace, labels, asRecord(doc['spec']), doc);
  // ClusterRole / ClusterRoleBinding は元の kind を保つ
  if (rawKind !== kind && (built.kind === 'Role' || built.kind === 'RoleBinding')) {
    return { ...built, kind: rawKind } as Resource;
  }
  return built;
}

/** YAML の1文書を資源にする */
export function parseManifest(text: string): Resource | ParseError {
  let doc: unknown;
  try {
    doc = load(text);
  } catch (error) {
    return { error: `error: YAML を読めませんでした: ${String(error)}` };
  }
  return buildResource(asRecord(doc));
}

/** `---` で区切られた複数文書をまとめて読む */
export function parseManifests(text: string): (Resource | ParseError)[] {
  let docs: unknown[];
  try {
    docs = loadAll(text);
  } catch (error) {
    return [{ error: `error: YAML を読めませんでした: ${String(error)}` }];
  }
  return docs
    .filter((d) => d !== null && d !== undefined)
    .map((d) => buildResource(asRecord(d)));
}
