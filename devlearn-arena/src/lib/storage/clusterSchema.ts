import { z } from 'zod';

/** Kubernetes クラスタのスキーマ。`snapshotCluster` が返す形と 1 対 1 で対応させる。 */

const stringMap = z.record(z.string(), z.string());
const quantitySchema = z.object({ cpu: z.number(), memory: z.number() });

const metaSchema = z.object({
  name: z.string(),
  namespace: z.string(),
  labels: stringMap,
  annotations: stringMap,
  resourceVersion: z.number().int(),
  createdAt: z.number().int(),
  ownerReferences: z.array(z.object({ kind: z.string(), name: z.string() })),
});

const probeSchema = z.object({
  initialDelaySeconds: z.number().int(),
  periodSeconds: z.number().int(),
  failureThreshold: z.number().int(),
  succeedsAfter: z.number().int().nullable(),
});

const containerSpecSchema = z.object({
  name: z.string(),
  image: z.string(),
  requests: quantitySchema,
  limits: quantitySchema.nullable(),
  env: stringMap,
  envFrom: z.array(
    z.object({
      kind: z.enum(['ConfigMap', 'Secret']),
      name: z.string(),
      key: z.string().optional(),
      as: z.string().optional(),
    }),
  ),
  readyAfter: z.number().int(),
  failing: z.boolean(),
  crashing: z.boolean(),
  ports: z.array(z.number().int()),
  livenessProbe: probeSchema.nullable(),
  readinessProbe: probeSchema.nullable(),
  startupProbe: probeSchema.nullable(),
  volumeMounts: z.array(z.object({ name: z.string(), mountPath: z.string() })),
});

const podVolumeSchema = z.union([
  z.object({ name: z.string(), kind: z.literal('configMap'), configMap: z.string() }),
  z.object({ name: z.string(), kind: z.literal('secret'), secret: z.string() }),
  z.object({ name: z.string(), kind: z.literal('persistentVolumeClaim'), claimName: z.string() }),
  z.object({ name: z.string(), kind: z.literal('emptyDir') }),
]);

const podSchema = z.object({
  kind: z.literal('Pod'),
  metadata: metaSchema,
  spec: z.object({
    containers: z.array(containerSpecSchema),
    nodeSelector: stringMap,
    tolerations: z.array(z.object({ key: z.string(), effect: z.string() })),
    restartPolicy: z.enum(['Always', 'OnFailure', 'Never']),
    terminationGracePeriodSeconds: z.number().int(),
    volumes: z.array(podVolumeSchema),
    serviceAccountName: z.string(),
  }),
  status: z.object({
    phase: z.enum(['Pending', 'ContainerCreating', 'Running', 'Succeeded', 'Failed']),
    nodeName: z.string().nullable(),
    podIP: z.string().nullable(),
    containerStatuses: z.array(
      z.object({
        name: z.string(),
        ready: z.boolean(),
        restartCount: z.number().int(),
        waitingReason: z.string().nullable(),
        restartAt: z.number().int().nullable(),
        started: z.boolean(),
      }),
    ),
    message: z.string().nullable(),
    startedAt: z.number().int().nullable(),
  }),
});

const nodeSchema = z.object({
  kind: z.literal('Node'),
  metadata: metaSchema,
  spec: z.object({
    role: z.enum(['control-plane', 'worker']),
    taints: z.array(z.object({ key: z.string(), value: z.string(), effect: z.string() })),
    unschedulable: z.boolean(),
  }),
  status: z.object({
    allocatable: quantitySchema,
    kubeletHealthy: z.boolean(),
    version: z.string(),
  }),
});

const machineSchema = z.object({
  name: z.string(),
  cpu: z.number(),
  memory: z.number(),
  kubeletVersion: z.string(),
});

const controlPlaneSchema = z.object({
  initialized: z.boolean(),
  version: z.string(),
  availableVersion: z.string(),
  podNetworkCidr: z.string().nullable(),
  serviceCidr: z.string(),
  tokens: z.array(z.string()).readonly(),
  endpoint: z.string().nullable(),
  caCertHash: z.string().nullable(),
  cni: z.string().nullable(),
});

const templateSchema = z.object({
  labels: stringMap,
  containers: z.array(containerSpecSchema),
  nodeSelector: stringMap,
});

const deploymentSchema = z.object({
  kind: z.literal('Deployment'),
  metadata: metaSchema,
  spec: z.object({
    replicas: z.number().int(),
    selector: stringMap,
    template: templateSchema,
    strategy: z.object({ maxSurge: z.number().int(), maxUnavailable: z.number().int() }),
  }),
  status: z.object({
    replicas: z.number().int(),
    readyReplicas: z.number().int(),
    updatedReplicas: z.number().int(),
  }),
});

const replicaSetSchema = z.object({
  kind: z.literal('ReplicaSet'),
  metadata: metaSchema,
  spec: z.object({
    replicas: z.number().int(),
    selector: stringMap,
    template: templateSchema,
  }),
  status: z.object({ replicas: z.number().int(), readyReplicas: z.number().int() }),
});

const serviceSchema = z.object({
  kind: z.literal('Service'),
  metadata: metaSchema,
  spec: z.object({
    type: z.enum(['ClusterIP', 'NodePort', 'LoadBalancer']),
    selector: stringMap,
    ports: z.array(
      z.object({
        port: z.number().int(),
        targetPort: z.number().int(),
        nodePort: z.number().int().nullable(),
      }),
    ),
    clusterIP: z.string(),
  }),
  status: z.object({ endpoints: z.array(z.string()) }),
});

const configMapSchema = z.object({
  kind: z.literal('ConfigMap'),
  metadata: metaSchema,
  data: stringMap,
  immutable: z.boolean(),
});

const secretSchema = z.object({
  kind: z.literal('Secret'),
  metadata: metaSchema,
  data: stringMap,
  type: z.string(),
});

const reclaimSchema = z.enum(['Retain', 'Delete', 'Recycle']);
const accessModeSchema = z.enum(['ReadWriteOnce', 'ReadOnlyMany', 'ReadWriteMany']);

const storageClassSchema = z.object({
  kind: z.literal('StorageClass'),
  metadata: metaSchema,
  provisioner: z.string(),
  reclaimPolicy: reclaimSchema,
  volumeBindingMode: z.enum(['Immediate', 'WaitForFirstConsumer']),
  dynamic: z.boolean(),
});

const pvSchema = z.object({
  kind: z.literal('PersistentVolume'),
  metadata: metaSchema,
  spec: z.object({
    capacityGi: z.number(),
    accessModes: z.array(accessModeSchema),
    storageClassName: z.string(),
    reclaimPolicy: reclaimSchema,
    nodeName: z.string().nullable(),
  }),
  status: z.object({
    phase: z.enum(['Available', 'Bound', 'Released', 'Failed']),
    claim: z.string().nullable(),
  }),
});

const pvcSchema = z.object({
  kind: z.literal('PersistentVolumeClaim'),
  metadata: metaSchema,
  spec: z.object({
    requestGi: z.number(),
    accessModes: z.array(accessModeSchema),
    storageClassName: z.string(),
  }),
  status: z.object({
    phase: z.enum(['Pending', 'Bound', 'Lost']),
    volumeName: z.string().nullable(),
    message: z.string().nullable(),
  }),
});

const statefulSetSchema = z.object({
  kind: z.literal('StatefulSet'),
  metadata: metaSchema,
  spec: z.object({
    replicas: z.number().int(),
    selector: stringMap,
    serviceName: z.string(),
    template: templateSchema,
    volumeClaimTemplates: z.array(
      z.object({ name: z.string(), requestGi: z.number(), storageClassName: z.string() }),
    ),
  }),
  status: z.object({ replicas: z.number().int(), readyReplicas: z.number().int() }),
});

const daemonSetSchema = z.object({
  kind: z.literal('DaemonSet'),
  metadata: metaSchema,
  spec: z.object({
    selector: stringMap,
    template: templateSchema,
    nodeSelector: stringMap,
  }),
  status: z.object({
    desiredNumberScheduled: z.number().int(),
    numberReady: z.number().int(),
  }),
});

const jobSpecSchema = z.object({
  completions: z.number().int(),
  parallelism: z.number().int(),
  backoffLimit: z.number().int(),
  template: templateSchema,
});

const jobSchema = z.object({
  kind: z.literal('Job'),
  metadata: metaSchema,
  spec: jobSpecSchema,
  status: z.object({
    active: z.number().int(),
    succeeded: z.number().int(),
    failed: z.number().int(),
    completed: z.boolean(),
  }),
});

const cronJobSchema = z.object({
  kind: z.literal('CronJob'),
  metadata: metaSchema,
  spec: z.object({
    everyTicks: z.number().int(),
    suspend: z.boolean(),
    jobTemplate: jobSpecSchema,
    concurrencyPolicy: z.enum(['Allow', 'Forbid', 'Replace']),
  }),
  status: z.object({
    lastScheduleTick: z.number().int().nullable(),
    createdCount: z.number().int(),
  }),
});

const ingressSchema = z.object({
  kind: z.literal('Ingress'),
  metadata: metaSchema,
  spec: z.object({
    className: z.string(),
    rules: z.array(
      z.object({
        host: z.string(),
        path: z.string(),
        serviceName: z.string(),
        servicePort: z.number().int(),
      }),
    ),
  }),
  status: z.object({ address: z.string().nullable() }),
});

const peerSchema = z.object({ podSelector: stringMap, ports: z.array(z.number().int()) });

const networkPolicySchema = z.object({
  kind: z.literal('NetworkPolicy'),
  metadata: metaSchema,
  spec: z.object({
    podSelector: stringMap,
    policyTypes: z.array(z.enum(['Ingress', 'Egress'])),
    ingressFrom: z.array(peerSchema),
    egressTo: z.array(peerSchema),
  }),
});

const serviceAccountSchema = z.object({
  kind: z.literal('ServiceAccount'),
  metadata: metaSchema,
});

const roleSchema = z.object({
  kind: z.enum(['Role', 'ClusterRole']),
  metadata: metaSchema,
  rules: z.array(
    z.object({
      apiGroups: z.array(z.string()),
      resources: z.array(z.string()),
      verbs: z.array(z.string()),
    }),
  ),
});

const roleBindingSchema = z.object({
  kind: z.enum(['RoleBinding', 'ClusterRoleBinding']),
  metadata: metaSchema,
  roleRef: z.object({ kind: z.enum(['Role', 'ClusterRole']), name: z.string() }),
  subjects: z.array(
    z.object({
      kind: z.enum(['ServiceAccount', 'User', 'Group']),
      name: z.string(),
      namespace: z.string(),
    }),
  ),
});

const hpaSchema = z.object({
  kind: z.literal('HorizontalPodAutoscaler'),
  metadata: metaSchema,
  spec: z.object({
    targetKind: z.literal('Deployment'),
    targetName: z.string(),
    minReplicas: z.number().int(),
    maxReplicas: z.number().int(),
    targetCpuPercent: z.number(),
  }),
  status: z.object({
    currentCpuPercent: z.number(),
    desiredReplicas: z.number().int(),
  }),
});

/** Map を配列に開いたもの */
function entries<T extends z.ZodTypeAny>(value: T) {
  return z.array(z.tuple([z.string(), value]));
}

export const clusterSnapshotSchema = z.object({
  tick: z.number().int(),
  machines: z.array(z.tuple([z.string(), machineSchema])),
  controlPlane: controlPlaneSchema,
  nodes: z.array(z.tuple([z.string(), nodeSchema])),
  pods: z.array(z.tuple([z.string(), podSchema])),
  deployments: z.array(z.tuple([z.string(), deploymentSchema])),
  replicaSets: z.array(z.tuple([z.string(), replicaSetSchema])),
  services: z.array(z.tuple([z.string(), serviceSchema])),
  events: z.array(
    z.object({
      tick: z.number().int(),
      type: z.enum(['Normal', 'Warning']),
      reason: z.string(),
      object: z.string(),
      message: z.string(),
    }),
  ),
  configMaps: entries(configMapSchema),
  secrets: entries(secretSchema),
  storageClasses: entries(storageClassSchema),
  persistentVolumes: entries(pvSchema),
  persistentVolumeClaims: entries(pvcSchema),
  statefulSets: entries(statefulSetSchema),
  daemonSets: entries(daemonSetSchema),
  jobs: entries(jobSchema),
  cronJobs: entries(cronJobSchema),
  ingresses: entries(ingressSchema),
  networkPolicies: entries(networkPolicySchema),
  serviceAccounts: entries(serviceAccountSchema),
  roles: entries(roleSchema),
  roleBindings: entries(roleBindingSchema),
  autoscalers: entries(hpaSchema),
  load: entries(z.number()),
  currentUser: z.object({
    kind: z.enum(['ServiceAccount', 'User']),
    name: z.string(),
    namespace: z.string(),
  }),
  ipCounter: z.number().int(),
  nameCounter: z.number().int(),
});
