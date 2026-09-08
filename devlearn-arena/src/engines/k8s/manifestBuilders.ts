import { deployment, meta, pod, service } from './factory';
import {
  asArray, asBoolean, asNumber, asRecord, asString, asStringMap, selectorOf, toContainers,
  toTemplate, toTolerations, toVolumes,
} from './manifestValues';
import type {
  ConfigMap, CronJob, DaemonSet, Deployment, HorizontalPodAutoscaler, Ingress, Job,
  NetworkPolicy, PersistentVolume, PersistentVolumeClaim, Pod, Resource, Role, RoleBinding,
  Secret, Service, ServiceAccount, StatefulSet, StorageClass,
} from './types';

/** kind ごとの組み立て。追加するときはここに1つ足す */
export type Builder = (
  name: string,
  namespace: string,
  labels: Record<string, string>,
  spec: Record<string, unknown>,
  doc: Record<string, unknown>,
) => Resource;

export const BUILDERS: Record<string, Builder> = {
  Pod: (name, namespace, labels, spec) => {
    const built = pod(name, toContainers(spec['containers']), {
      namespace,
      labels,
      nodeSelector: asStringMap(spec['nodeSelector']),
      volumes: toVolumes(spec['volumes']),
      serviceAccountName: asString(spec['serviceAccountName'], 'default'),
      tolerations: toTolerations(spec['tolerations']),
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
