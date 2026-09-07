import { resolveEnv } from '@/engines/k8s/storage';
import type {
  ClusterState, ConfigMap, CronJob, DaemonSet, Deployment, HorizontalPodAutoscaler, Ingress, Job,
  NetworkPolicy, Node, PersistentVolume, PersistentVolumeClaim, Pod, ReplicaSet, Resource, Role,
  RoleBinding, Secret, Service, ServiceAccount, StatefulSet, StorageClass,
} from '@/engines/k8s/types';
import { age, podReady, podStatus, restarts, table } from './kubectlShared';

/** 種別ごとの一覧表。全て状態から導く（作り置きの文字列は持たない） */
export function renderTable(
  cluster: ClusterState,
  kind: string,
  items: readonly Resource[],
  wide: boolean,
): string {
  const at = (createdAt: number) => age(cluster.tick, createdAt);

  switch (kind) {
    case 'pods': {
      const pods = items as Pod[];
      const header = ['NAME', 'READY', 'STATUS', 'RESTARTS', 'AGE'];
      if (wide) header.push('IP', 'NODE');
      const rows = [header];
      for (const pod of pods) {
        const row = [
          pod.metadata.name,
          podReady(pod),
          podStatus(pod),
          String(restarts(pod)),
          at(pod.metadata.createdAt),
        ];
        if (wide) row.push(pod.status.podIP ?? '<none>', pod.status.nodeName ?? '<none>');
        rows.push(row);
      }
      return table(rows);
    }

    case 'nodes': {
      const rows = [['NAME', 'STATUS', 'CPU', 'MEMORY']];
      for (const node of items as Node[]) {
        rows.push([
          node.metadata.name,
          node.spec.unschedulable
            ? 'Ready,SchedulingDisabled'
            : node.status.ready ? 'Ready' : 'NotReady',
          `${String(node.status.allocatable.cpu)}m`,
          `${String(node.status.allocatable.memory)}Mi`,
        ]);
      }
      return table(rows);
    }

    case 'deployments': {
      const rows = [['NAME', 'READY', 'UP-TO-DATE', 'AVAILABLE', 'AGE']];
      for (const d of items as Deployment[]) {
        rows.push([
          d.metadata.name,
          `${String(d.status.readyReplicas)}/${String(d.spec.replicas)}`,
          String(d.status.updatedReplicas),
          String(d.status.readyReplicas),
          at(d.metadata.createdAt),
        ]);
      }
      return table(rows);
    }

    case 'replicasets': {
      const rows = [['NAME', 'DESIRED', 'CURRENT', 'READY', 'AGE']];
      for (const r of items as ReplicaSet[]) {
        rows.push([
          r.metadata.name,
          String(r.spec.replicas),
          String(r.status.replicas),
          String(r.status.readyReplicas),
          at(r.metadata.createdAt),
        ]);
      }
      return table(rows);
    }

    case 'services': {
      const rows = [['NAME', 'TYPE', 'CLUSTER-IP', 'PORT(S)', 'ENDPOINTS']];
      for (const s of items as Service[]) {
        rows.push([
          s.metadata.name,
          s.spec.type,
          s.spec.clusterIP,
          s.spec.ports.map((p) => `${String(p.port)}/TCP`).join(','),
          s.status.endpoints.length === 0 ? '<none>' : s.status.endpoints.join(','),
        ]);
      }
      return table(rows);
    }

    case 'configmaps': {
      const rows = [['NAME', 'DATA', 'AGE']];
      for (const c of items as ConfigMap[]) {
        rows.push([c.metadata.name, String(Object.keys(c.data).length), at(c.metadata.createdAt)]);
      }
      return table(rows);
    }

    case 'secrets': {
      const rows = [['NAME', 'TYPE', 'DATA', 'AGE']];
      for (const s of items as Secret[]) {
        rows.push([s.metadata.name, s.type, String(Object.keys(s.data).length), at(s.metadata.createdAt)]);
      }
      return table(rows);
    }

    case 'statefulsets': {
      const rows = [['NAME', 'READY', 'AGE']];
      for (const s of items as StatefulSet[]) {
        rows.push([
          s.metadata.name,
          `${String(s.status.readyReplicas)}/${String(s.spec.replicas)}`,
          at(s.metadata.createdAt),
        ]);
      }
      return table(rows);
    }

    case 'daemonsets': {
      const rows = [['NAME', 'DESIRED', 'READY', 'AGE']];
      for (const d of items as DaemonSet[]) {
        rows.push([
          d.metadata.name,
          String(d.status.desiredNumberScheduled),
          String(d.status.numberReady),
          at(d.metadata.createdAt),
        ]);
      }
      return table(rows);
    }

    case 'jobs': {
      const rows = [['NAME', 'COMPLETIONS', 'STATUS', 'AGE']];
      for (const j of items as Job[]) {
        rows.push([
          j.metadata.name,
          `${String(j.status.succeeded)}/${String(j.spec.completions)}`,
          j.status.completed ? 'Complete' : 'Running',
          at(j.metadata.createdAt),
        ]);
      }
      return table(rows);
    }

    case 'cronjobs': {
      const rows = [['NAME', 'EVERY', 'SUSPEND', 'LAST SCHEDULE', 'AGE']];
      for (const c of items as CronJob[]) {
        rows.push([
          c.metadata.name,
          `${String(c.spec.everyTicks)} tick`,
          c.spec.suspend ? 'True' : 'False',
          c.status.lastScheduleTick === null ? '<none>' : at(c.status.lastScheduleTick),
          at(c.metadata.createdAt),
        ]);
      }
      return table(rows);
    }

    case 'persistentvolumes': {
      const rows = [['NAME', 'CAPACITY', 'ACCESS MODES', 'RECLAIM', 'STATUS', 'CLAIM', 'STORAGECLASS']];
      for (const v of items as PersistentVolume[]) {
        rows.push([
          v.metadata.name,
          `${String(v.spec.capacityGi)}Gi`,
          v.spec.accessModes.join(','),
          v.spec.reclaimPolicy,
          v.status.phase,
          v.status.claim ?? '<none>',
          v.spec.storageClassName,
        ]);
      }
      return table(rows);
    }

    case 'persistentvolumeclaims': {
      const rows = [['NAME', 'STATUS', 'VOLUME', 'CAPACITY', 'ACCESS MODES', 'STORAGECLASS']];
      for (const c of items as PersistentVolumeClaim[]) {
        rows.push([
          c.metadata.name,
          c.status.phase,
          c.status.volumeName ?? '<none>',
          `${String(c.spec.requestGi)}Gi`,
          c.spec.accessModes.join(','),
          c.spec.storageClassName,
        ]);
      }
      return table(rows);
    }

    case 'storageclasses': {
      const rows = [['NAME', 'PROVISIONER', 'RECLAIM', 'BINDING MODE', 'DYNAMIC']];
      for (const s of items as StorageClass[]) {
        rows.push([
          s.metadata.name,
          s.provisioner,
          s.reclaimPolicy,
          s.volumeBindingMode,
          s.dynamic ? 'True' : 'False',
        ]);
      }
      return table(rows);
    }

    case 'ingresses': {
      const rows = [['NAME', 'CLASS', 'HOSTS', 'PATHS', 'BACKEND']];
      for (const i of items as Ingress[]) {
        rows.push([
          i.metadata.name,
          i.spec.className,
          [...new Set(i.spec.rules.map((r) => r.host))].join(',') || '*',
          i.spec.rules.map((r) => r.path).join(',') || '/',
          i.spec.rules.map((r) => `${r.serviceName}:${String(r.servicePort)}`).join(','),
        ]);
      }
      return table(rows);
    }

    case 'networkpolicies': {
      const rows = [['NAME', 'POD-SELECTOR', 'TYPES']];
      for (const p of items as NetworkPolicy[]) {
        const selector = Object.entries(p.spec.podSelector).map(([k, v]) => `${k}=${v}`).join(',');
        rows.push([p.metadata.name, selector === '' ? '<all>' : selector, p.spec.policyTypes.join(',')]);
      }
      return table(rows);
    }

    case 'serviceaccounts': {
      const rows = [['NAME', 'AGE']];
      for (const s of items as ServiceAccount[]) rows.push([s.metadata.name, at(s.metadata.createdAt)]);
      return table(rows);
    }

    case 'roles': {
      const rows = [['NAME', 'KIND', 'RULES']];
      for (const r of items as Role[]) {
        rows.push([
          r.metadata.name,
          r.kind,
          r.rules.map((rule) => `${rule.verbs.join('|')} ${rule.resources.join('|')}`).join(' ; '),
        ]);
      }
      return table(rows);
    }

    case 'rolebindings': {
      const rows = [['NAME', 'ROLE', 'SUBJECTS']];
      for (const b of items as RoleBinding[]) {
        rows.push([
          b.metadata.name,
          `${b.roleRef.kind}/${b.roleRef.name}`,
          b.subjects.map((s) => `${s.kind}:${s.name}`).join(','),
        ]);
      }
      return table(rows);
    }

    case 'horizontalpodautoscalers': {
      const rows = [['NAME', 'REFERENCE', 'TARGETS', 'MINPODS', 'MAXPODS', 'REPLICAS']];
      for (const h of items as HorizontalPodAutoscaler[]) {
        rows.push([
          h.metadata.name,
          `Deployment/${h.spec.targetName}`,
          `${String(h.status.currentCpuPercent)}%/${String(h.spec.targetCpuPercent)}%`,
          String(h.spec.minReplicas),
          String(h.spec.maxReplicas),
          String(h.status.desiredReplicas),
        ]);
      }
      return table(rows);
    }

    case 'events': {
      const rows = [['AGE', 'TYPE', 'REASON', 'OBJECT', 'MESSAGE']];
      for (const e of cluster.events.slice(-20)) {
        rows.push([at(e.tick), e.type, e.reason, e.object, e.message]);
      }
      return table(rows);
    }

    default:
      return '';
  }
}

/** kubectl describe pod。イベントと、解決済みの環境変数まで見せる */
export function describePod(cluster: ClusterState, pod: Pod): string {
  const lines = [
    `Name:         ${pod.metadata.name}`,
    `Namespace:    ${pod.metadata.namespace}`,
    `Node:         ${pod.status.nodeName ?? '<none>'}`,
    `Status:       ${podStatus(pod)}`,
    `IP:           ${pod.status.podIP ?? '<none>'}`,
    `ServiceAccount: ${pod.spec.serviceAccountName}`,
    `Labels:       ${
      Object.entries(pod.metadata.labels).map(([k, v]) => `${k}=${v}`).join(',') || '<none>'
    }`,
    'Containers:',
  ];
  for (const spec of pod.spec.containers) {
    const status = pod.status.containerStatuses.find((c) => c.name === spec.name);
    lines.push(`  ${spec.name}:`);
    lines.push(`    Image:      ${spec.image}`);
    lines.push(`    Ready:      ${status?.ready === true ? 'True' : 'False'}`);
    lines.push(`    Restarts:   ${String(status?.restartCount ?? 0)}`);
    lines.push(`    Requests:   cpu=${String(spec.requests.cpu)}m memory=${String(spec.requests.memory)}Mi`);
    if (spec.livenessProbe !== null) lines.push('    Liveness:   設定あり');
    if (spec.readinessProbe !== null) lines.push('    Readiness:  設定あり');
    if (spec.startupProbe !== null) lines.push('    Startup:    設定あり');
    const env = resolveEnv(cluster, pod, spec.name);
    if (Object.keys(env).length > 0) {
      lines.push('    Environment:');
      for (const [k, v] of Object.entries(env)) lines.push(`      ${k}: ${v}`);
    }
    if (spec.volumeMounts.length > 0) {
      lines.push('    Mounts:');
      for (const m of spec.volumeMounts) lines.push(`      ${m.mountPath} from ${m.name}`);
    }
  }
  if (pod.spec.volumes.length > 0) {
    lines.push('Volumes:');
    for (const v of pod.spec.volumes) {
      const detail =
        v.kind === 'configMap' ? `ConfigMap (${v.configMap})`
          : v.kind === 'secret' ? `Secret (${v.secret})`
            : v.kind === 'persistentVolumeClaim' ? `PVC (${v.claimName})`
              : 'EmptyDir';
      lines.push(`  ${v.name}: ${detail}`);
    }
  }
  if (pod.status.message !== null) lines.push('', `Message:      ${pod.status.message}`);

  const events = cluster.events.filter((e) => e.object === `pod/${pod.metadata.name}`).slice(-10);
  lines.push('', 'Events:');
  if (events.length === 0) lines.push('  <none>');
  else {
    lines.push('  TYPE      REASON              AGE   MESSAGE');
    for (const e of events) {
      lines.push(
        `  ${e.type.padEnd(9)} ${e.reason.padEnd(19)} ${age(cluster.tick, e.tick).padEnd(5)} ${e.message}`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

/** Pod 以外の describe。共通の見出しと、その資源の要点を出す */
export function describeResource(cluster: ClusterState, kind: string, resource: Resource): string {
  const lines = [
    `Name:         ${resource.metadata.name}`,
    `Namespace:    ${resource.metadata.namespace === '' ? '<none>' : resource.metadata.namespace}`,
    `Kind:         ${resource.kind}`,
    `Labels:       ${
      Object.entries(resource.metadata.labels).map(([k, v]) => `${k}=${v}`).join(',') || '<none>'
    }`,
  ];
  const annotations = Object.entries(resource.metadata.annotations);
  if (annotations.length > 0) {
    lines.push('Annotations:');
    for (const [k, v] of annotations) lines.push(`  ${k}: ${v}`);
  }
  lines.push('', renderTable(cluster, kind, [resource], true).trimEnd());

  const object = `${resource.kind.toLowerCase()}/${resource.metadata.name}`;
  const events = cluster.events.filter((e) => e.object === object).slice(-10);
  lines.push('', 'Events:');
  if (events.length === 0) lines.push('  <none>');
  else {
    for (const e of events) {
      lines.push(`  ${e.type.padEnd(9)} ${e.reason.padEnd(19)} ${age(cluster.tick, e.tick).padEnd(5)} ${e.message}`);
    }
  }
  return `${lines.join('\n')}\n`;
}
