import { isNodeReady, nodeCondition } from '@/engines/k8s/bootstrap';
import type {
  ClusterState, ConfigMap, CronJob, DaemonSet, Deployment, HorizontalPodAutoscaler, Ingress, Job,
  NetworkPolicy, Node, PersistentVolume, PersistentVolumeClaim, Pod, ReplicaSet, Resource, Role,
  RoleBinding, Secret, Service, ServiceAccount, StatefulSet, StorageClass,
} from '@/engines/k8s/types';
import { NODE_SYSTEM, nodeAddress } from './kubectlDescribe';
import { age, podReady, podStatus, restarts, table } from './kubectlShared';

/** 一覧の使い方の略し方（本物の kubectl と同じ） */
const MODE_SHORT: Readonly<Record<string, string>> = {
  ReadWriteOnce: 'RWO', ReadOnlyMany: 'ROX', ReadWriteMany: 'RWX', ReadWriteOncePod: 'RWOP',
};
const shortMode = (mode: string): string => MODE_SHORT[mode] ?? mode;

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
      const head = ['NAME', 'STATUS', 'ROLES', 'AGE', 'VERSION'];
      const rows = [wide ? [...head, 'INTERNAL-IP', 'EXTERNAL-IP', 'OS-IMAGE', 'KERNEL-VERSION', 'CONTAINER-RUNTIME'] : head];
      for (const node of items as Node[]) {
        // 本物と同じく、Ready/NotReady と SchedulingDisabled は並べて出す
        const state = isNodeReady(cluster, node) ? 'Ready' : 'NotReady';
        const row = [
          node.metadata.name,
          node.spec.unschedulable ? `${state},SchedulingDisabled` : state,
          node.spec.role === 'control-plane' ? 'control-plane' : '<none>',
          age(cluster.tick, node.metadata.createdAt),
          node.status.version,
        ];
        rows.push(wide ? [...row, nodeAddress(node), '<none>', NODE_SYSTEM.os, NODE_SYSTEM.kernel, NODE_SYSTEM.runtime] : row);
      }
      return table(rows);
    }

    case 'machines': {
      // 実物の kubectl には無い。まだクラスタに入っていない計算機を見るための窓口
      const rows = [['NAME', 'CPU', 'MEMORY', 'KUBELET', 'JOINED']];
      for (const m of [...cluster.machines.values()].sort((a, b) => (a.name < b.name ? -1 : 1))) {
        rows.push([
          m.name,
          `${String(m.cpu)}m`,
          `${String(m.memory)}Mi`,
          m.kubeletVersion,
          cluster.nodes.has(m.name) ? 'true' : 'false',
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
      // 本物と同じ欄。NodePort は 80:30080/TCP の形、LoadBalancer の外の住所は配られるまで <pending>
      const rows = [['NAME', 'TYPE', 'CLUSTER-IP', 'EXTERNAL-IP', 'PORT(S)', 'AGE']];
      for (const s of items as Service[]) {
        rows.push([
          s.metadata.name,
          s.spec.type,
          s.spec.clusterIP,
          s.spec.type === 'LoadBalancer' ? '<pending>' : '<none>',
          s.spec.ports.map((p) => `${String(p.port)}${p.nodePort === null ? '' : `:${String(p.nodePort)}`}/TCP`).join(','),
          at(s.metadata.createdAt),
        ]);
      }
      return table(rows);
    }

    case 'endpoints': {
      // 宛先の住所:番号。4 つ目からは「+ N more...」にまとめる（本物と同じ）
      const rows = [['NAME', 'ENDPOINTS', 'AGE']];
      for (const s of items as Service[]) {
        const port = s.spec.ports[0]?.targetPort ?? 80;
        const all = s.status.endpoints.map((ip) => `${ip}:${String(port)}`);
        const shown = all.length > 3 ? `${all.slice(0, 3).join(',')} + ${String(all.length - 3)} more...` : all.join(',');
        rows.push([s.metadata.name, all.length === 0 ? '<none>' : shown, at(s.metadata.createdAt)]);
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
      // 本物の欄（1.31 から VOLUMEATTRIBUTESCLASS が入った）。結ばれていない PV の CLAIM は空
      const rows = [['NAME', 'CAPACITY', 'ACCESS MODES', 'RECLAIM POLICY', 'STATUS', 'CLAIM', 'STORAGECLASS', 'VOLUMEATTRIBUTESCLASS', 'REASON', 'AGE']];
      for (const v of items as PersistentVolume[]) {
        rows.push([
          v.metadata.name,
          `${String(v.spec.capacityGi)}Gi`,
          v.spec.accessModes.map(shortMode).join(','),
          v.spec.reclaimPolicy,
          v.status.phase,
          v.status.claim ?? '',
          v.spec.storageClassName,
          '<unset>',
          '',
          at(v.metadata.createdAt),
        ]);
      }
      return table(rows);
    }

    case 'persistentvolumeclaims': {
      // 大きさと使い方は、結ばれた PV の物（Pending の間は空）
      const rows = [['NAME', 'STATUS', 'VOLUME', 'CAPACITY', 'ACCESS MODES', 'STORAGECLASS', 'VOLUMEATTRIBUTESCLASS', 'AGE']];
      for (const c of items as PersistentVolumeClaim[]) {
        const pv = c.status.volumeName === null ? undefined : cluster.persistentVolumes.get(c.status.volumeName);
        rows.push([
          c.metadata.name,
          c.status.phase,
          c.status.volumeName ?? '',
          pv === undefined ? '' : `${String(pv.spec.capacityGi)}Gi`,
          pv === undefined ? '' : pv.spec.accessModes.map(shortMode).join(','),
          c.spec.storageClassName,
          '<unset>',
          at(c.metadata.createdAt),
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
  if (resource.kind === 'Node') {
    const node = resource;
    const condition = nodeCondition(cluster, node);
    lines.push(
      `Roles:        ${node.spec.role}`,
      `Taints:       ${
        node.spec.taints.map((t) => `${t.key}${t.value === '' ? '' : `=${t.value}`}:${t.effect}`).join(', ') || '<none>'
      }`,
      `Unschedulable: ${String(node.spec.unschedulable)}`,
      'Conditions:',
      `  Ready   ${condition.ready ? 'True' : 'False'}   ${condition.reason}   ${condition.message}`,
    );
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
