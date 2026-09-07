import { z } from 'zod';

/**
 * シェルの状態そのもののスキーマ。
 * エンジンの直列化（`snapshotShell`）が返す形と 1 対 1 で対応させる。
 * ここを通らないデータは保存にも復元にも使わない。
 */

const headSchema = z.union([
  z.object({ type: z.literal('branch'), name: z.string() }),
  z.object({ type: z.literal('detached'), hash: z.string() }),
]);

const gitSnapshotBaseSchema = z.object({
  root: z.string(),
  head: headSchema,
  refs: z.array(z.tuple([z.string(), z.string()])),
  index: z.array(z.object({ path: z.string(), mode: z.string(), hash: z.string() })),
  reflog: z.array(z.object({ hash: z.string(), message: z.string() })),
  stash: z
    .array(z.object({ message: z.string(), files: z.array(z.tuple([z.string(), z.string()])) }))
    .default([]),
  author: z.object({
    name: z.string(),
    email: z.string(),
    timestamp: z.number(),
    timezone: z.string(),
  }),
  origHead: z.string().nullable(),
  mergeHead: z.string().nullable().default(null),
  objects: z.array(
    z.object({ type: z.enum(['blob', 'tree', 'commit', 'tag']), body: z.string() }),
  ),
});

export const gitSnapshotSchema = gitSnapshotBaseSchema.extend({
  remotes: z
    .array(z.object({ name: z.string(), url: z.string(), state: gitSnapshotBaseSchema }))
    .default([]),
});

/* ---- Kubernetes ---- */

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

const containerSpecSchema = z.object({
  name: z.string(),
  image: z.string(),
  requests: quantitySchema,
  limits: quantitySchema.nullable(),
  env: stringMap,
  readyAfter: z.number().int(),
  failing: z.boolean(),
  ports: z.array(z.number().int()),
});

const podSchema = z.object({
  kind: z.literal('Pod'),
  metadata: metaSchema,
  spec: z.object({
    containers: z.array(containerSpecSchema),
    nodeSelector: stringMap,
    tolerations: z.array(z.object({ key: z.string(), effect: z.string() })),
    restartPolicy: z.enum(['Always', 'OnFailure', 'Never']),
    terminationGracePeriodSeconds: z.number().int(),
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
    taints: z.array(z.object({ key: z.string(), value: z.string(), effect: z.string() })),
    unschedulable: z.boolean(),
  }),
  status: z.object({ allocatable: quantitySchema, ready: z.boolean() }),
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

export const clusterSnapshotSchema = z.object({
  tick: z.number().int(),
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
  ipCounter: z.number().int(),
  nameCounter: z.number().int(),
});

/* ---- ネットワーク ---- */

const deviceSchema = z.object({
  name: z.string(),
  kind: z.enum(['host', 'router', 'switch']),
  interfaces: z.array(
    z.object({
      name: z.string(),
      ip: z.string(),
      prefix: z.number().int(),
      mac: z.string(),
      up: z.boolean(),
    }),
  ),
  routes: z.array(
    z.object({ destination: z.string(), via: z.string().nullable(), dev: z.string() }),
  ),
  listening: z.array(z.number().int()),
  blockedPorts: z.array(z.number().int()),
});

export const topologySnapshotSchema = z.object({
  devices: z.array(z.tuple([z.string(), deviceSchema])),
  links: z.array(z.object({ a: z.string(), b: z.string(), up: z.boolean() })),
  dns: z.array(z.tuple([z.string(), z.string()])),
});

/* ---- GitHub ---- */

export const repoSnapshotSchema = z.object({
  owner: z.string(),
  name: z.string(),
  defaultBranch: z.string(),
  protections: z.array(
    z.object({
      branch: z.string(),
      requiredApprovals: z.number().int(),
      requiredChecks: z.array(z.string()),
      blockDirectPush: z.boolean(),
    }),
  ),
  pulls: z.array(
    z.object({
      number: z.number().int(),
      title: z.string(),
      body: z.string(),
      author: z.string(),
      head: z.string(),
      base: z.string(),
      state: z.enum(['open', 'merged', 'closed']),
      reviews: z.array(
        z.object({
          reviewer: z.string(),
          state: z.enum(['approved', 'changes_requested', 'commented']),
          body: z.string(),
        }),
      ),
      labels: z.array(z.string()),
      checks: z.array(
        z.object({
          name: z.string(),
          status: z.enum(['queued', 'running', 'success', 'failure', 'skipped']),
          needs: z.array(z.string()),
          logs: z.array(z.string()),
        }),
      ),
    }),
  ),
  workflows: z.array(z.tuple([z.string(), z.string()])),
  nextPullNumber: z.number().int(),
});

export const shellSnapshotSchema = z.object({
  cwd: z.string().min(1),
  vars: z.record(z.string(), z.string()),
  files: z.record(
    z.string(),
    z.object({ kind: z.enum(['dir', 'file']), content: z.string().optional() }),
  ),
  history: z.array(z.string()).default([]),
  git: gitSnapshotSchema.nullable().default(null),
  cluster: clusterSnapshotSchema.nullable().default(null),
  net: topologySnapshotSchema.nullable().default(null),
  repo: repoSnapshotSchema.nullable().default(null),
});
export type ShellSnapshot = z.infer<typeof shellSnapshotSchema>;
