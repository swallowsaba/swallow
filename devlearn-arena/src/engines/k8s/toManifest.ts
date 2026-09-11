import type {
  ContainerSpec, Deployment, ObjectMeta, Pod, PodVolume, Probe, ReplicaSet, Resource, Service,
} from './types';

/**
 * 資源を、本物の `kubectl get -o yaml` と同じ形の素のオブジェクトにする。
 *
 * 中で持っている形（spec.template.containers など）は扱いやすさのための近道で、
 * 本物のマニフェストとは入れ子が違う。見せる形を本物に揃えておけば、
 * `-o yaml` の出力をそのままファイルに保存して `kubectl apply -f` に渡せる。
 */

/** kind から apiVersion を決める（本物の表記に合わせる） */
export function apiVersionOf(kind: string): string {
  if (['Deployment', 'ReplicaSet', 'StatefulSet', 'DaemonSet'].includes(kind)) return 'apps/v1';
  if (['Job', 'CronJob'].includes(kind)) return 'batch/v1';
  if (kind === 'Ingress' || kind === 'NetworkPolicy') return 'networking.k8s.io/v1';
  if (['Role', 'RoleBinding', 'ClusterRole', 'ClusterRoleBinding'].includes(kind)) {
    return 'rbac.authorization.k8s.io/v1';
  }
  if (kind === 'StorageClass') return 'storage.k8s.io/v1';
  if (kind === 'HorizontalPodAutoscaler') return 'autoscaling/v2';
  return 'v1';
}

type Plain = Record<string, unknown>;

/** 空の値を落とす。本物も既定値や空の欄は出さない */
function compact(value: Plain): Plain {
  const out: Plain = {};
  for (const [k, v] of Object.entries(value)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    out[k] = v;
  }
  return out;
}

function metadataOf(meta: ObjectMeta): Plain {
  return compact({
    name: meta.name,
    namespace: meta.namespace === '' ? undefined : meta.namespace,
    labels: meta.labels,
    annotations: meta.annotations,
    // 本物の resourceVersion は文字列
    resourceVersion: String(meta.resourceVersion),
    ownerReferences: meta.ownerReferences.map((o) => ({
      apiVersion: apiVersionOf(o.kind),
      kind: o.kind,
      name: o.name,
    })),
  });
}

function probeOf(probe: Probe | null): Plain | undefined {
  if (probe === null) return undefined;
  return {
    initialDelaySeconds: probe.initialDelaySeconds,
    periodSeconds: probe.periodSeconds,
    failureThreshold: probe.failureThreshold,
    // 練習場だけの欄。何秒後から検査に通るようになるか
    succeedsAfter: probe.succeedsAfter,
  };
}

function containerOf(c: ContainerSpec): Plain {
  const env = [
    ...Object.entries(c.env).map(([name, value]) => ({ name, value })),
    ...c.envFrom
      .filter((ref) => ref.key !== undefined)
      .map((ref) => ({
        name: ref.as ?? ref.key,
        valueFrom: {
          [ref.kind === 'ConfigMap' ? 'configMapKeyRef' : 'secretKeyRef']: { name: ref.name, key: ref.key },
        },
      })),
  ];
  const envFrom = c.envFrom
    .filter((ref) => ref.key === undefined)
    .map((ref) => (ref.kind === 'ConfigMap' ? { configMapRef: { name: ref.name } } : { secretRef: { name: ref.name } }));
  return compact({
    name: c.name,
    image: c.image,
    ports: c.ports.map((containerPort) => ({ containerPort })),
    env,
    envFrom,
    resources: compact({
      requests: { cpu: `${String(c.requests.cpu)}m`, memory: `${String(c.requests.memory)}Mi` },
      limits: c.limits === null ? undefined : { cpu: `${String(c.limits.cpu)}m`, memory: `${String(c.limits.memory)}Mi` },
    }),
    livenessProbe: probeOf(c.livenessProbe),
    readinessProbe: probeOf(c.readinessProbe),
    startupProbe: probeOf(c.startupProbe),
    volumeMounts: c.volumeMounts.map((m) => ({ name: m.name, mountPath: m.mountPath })),
  });
}

function volumeOf(v: PodVolume): Plain {
  switch (v.kind) {
    case 'configMap':
      return { name: v.name, configMap: { name: v.configMap } };
    case 'secret':
      return { name: v.name, secret: { secretName: v.secret } };
    case 'persistentVolumeClaim':
      return { name: v.name, persistentVolumeClaim: { claimName: v.claimName } };
    case 'emptyDir':
      return { name: v.name, emptyDir: {} };
  }
}

function templateOf(template: Deployment['spec']['template']): Plain {
  return {
    metadata: { labels: template.labels },
    spec: compact({
      containers: template.containers.map(containerOf),
      nodeSelector: template.nodeSelector,
    }),
  };
}

function podOf(pod: Pod): Plain {
  return {
    spec: compact({
      containers: pod.spec.containers.map(containerOf),
      nodeName: pod.status.nodeName ?? undefined,
      nodeSelector: pod.spec.nodeSelector,
      tolerations: pod.spec.tolerations.map((t) => ({ key: t.key, effect: t.effect })),
      restartPolicy: pod.spec.restartPolicy,
      serviceAccountName: pod.spec.serviceAccountName,
      terminationGracePeriodSeconds: pod.spec.terminationGracePeriodSeconds,
      volumes: pod.spec.volumes.map(volumeOf),
    }),
    status: compact({
      phase: pod.status.phase,
      message: pod.status.message ?? undefined,
      podIP: pod.status.podIP ?? undefined,
      containerStatuses: pod.status.containerStatuses.map((s) =>
        compact({
          name: s.name,
          ready: s.ready,
          restartCount: s.restartCount,
          started: s.started,
          state: s.waitingReason === null ? undefined : { waiting: { reason: s.waitingReason } },
        }),
      ),
    }),
  };
}

function deploymentOf(d: Deployment): Plain {
  return {
    spec: {
      replicas: d.spec.replicas,
      selector: { matchLabels: d.spec.selector },
      strategy: {
        type: 'RollingUpdate',
        rollingUpdate: { maxSurge: d.spec.strategy.maxSurge, maxUnavailable: d.spec.strategy.maxUnavailable },
      },
      template: templateOf(d.spec.template),
    },
    status: {
      replicas: d.status.replicas,
      readyReplicas: d.status.readyReplicas,
      updatedReplicas: d.status.updatedReplicas,
    },
  };
}

function replicaSetOf(rs: ReplicaSet): Plain {
  return {
    spec: {
      replicas: rs.spec.replicas,
      selector: { matchLabels: rs.spec.selector },
      template: templateOf(rs.spec.template),
    },
    status: { replicas: rs.status.replicas, readyReplicas: rs.status.readyReplicas },
  };
}

function serviceOf(s: Service): Plain {
  return {
    spec: {
      type: s.spec.type,
      clusterIP: s.spec.clusterIP,
      selector: s.spec.selector,
      ports: s.spec.ports.map((p) =>
        compact({ protocol: 'TCP', port: p.port, targetPort: p.targetPort, nodePort: p.nodePort ?? undefined }),
      ),
    },
  };
}

/** 本物の形にした資源。apiVersion / kind / metadata が先頭に来る */
export function toManifest(resource: Resource): Plain {
  const head = { apiVersion: apiVersionOf(resource.kind), kind: resource.kind, metadata: metadataOf(resource.metadata) };
  switch (resource.kind) {
    case 'Pod':
      return { ...head, ...podOf(resource) };
    case 'Deployment':
      return { ...head, ...deploymentOf(resource) };
    case 'ReplicaSet':
      return { ...head, ...replicaSetOf(resource) };
    case 'Service':
      return { ...head, ...serviceOf(resource) };
    default: {
      // ほかの資源は中の形のまま出す。metadata だけ本物に揃える
      const rest: Plain = { ...resource };
      delete rest['kind'];
      delete rest['metadata'];
      return { ...head, ...rest };
    }
  }
}
