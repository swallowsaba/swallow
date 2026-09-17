import { nodeCondition } from '@/engines/k8s/bootstrap';
import type { ClusterState, Pod } from '@/engines/k8s/types';
import { podLook, type PodLook } from '@/visual/clusterModel';
import { colorOf, type Scene, type SceneItem, type Tone, type Translate } from './types';

/**
 * Kubernetes の街（オフィス街と役所）。
 * control-plane = 市役所、worker ノード = オフィスビル、Pod = ビルの部屋、Deployment = 入居企業、
 * 置き場の無い Pending の Pod = 待機広場のテント、Service = バス停、Ingress = 街の門、監査局 = イメージの監査。
 */

const ROOM_TONE: Record<PodLook, Tone | undefined> = {
  Running: undefined,
  Completed: 'muted',
  Creating: 'warn',
  Pending: 'warn',
  BackOff: 'bad',
  Failed: 'bad',
};

/** Pod がどの企業（Deployment など）の部屋か */
export function tenantOf(pod: Pod): string {
  return pod.metadata.labels['app'] ?? pod.metadata.ownerReferences[0]?.name ?? pod.metadata.name;
}

/** 監査の指摘。タグ無し・latest は、いつ中身が変わるか分からない */
export function auditImage(image: string): 'latest' | 'untagged' | null {
  const last = image.split('/').pop() ?? image;
  if (last.includes('@sha256:')) return null;
  if (!last.includes(':')) return 'untagged';
  return last.endsWith(':latest') ? 'latest' : null;
}

export function k8sScene(cluster: ClusterState | null, t: Translate): Scene {
  const legend = [
    { sample: 'solid' as const, name: t('scape.k8s.legend.building'), meaning: t('scape.k8s.legend.buildingMeaning'), command: 'kubectl get nodes' },
    { sample: 'room' as const, name: t('scape.k8s.legend.room'), meaning: t('scape.k8s.legend.roomMeaning'), command: 'kubectl get pods -o wide' },
    { sample: 'marker' as const, icon: '🏢', name: t('scape.k8s.legend.tenant'), meaning: t('scape.k8s.legend.tenantMeaning'), command: 'kubectl scale deployment <名前> --replicas=3' },
    { sample: 'tent' as const, name: t('scape.k8s.legend.tent'), meaning: t('scape.k8s.legend.tentMeaning'), command: 'kubectl describe pod <名前>' },
    { sample: 'dark' as const, name: t('scape.k8s.legend.dark'), meaning: t('scape.k8s.legend.darkMeaning'), command: 'kubectl describe node <名前>' },
    { sample: 'marker' as const, icon: '🚧', name: t('scape.k8s.legend.cordon'), meaning: t('scape.k8s.legend.cordonMeaning'), command: 'kubectl cordon <ノード>' },
    { sample: 'marker' as const, icon: '🚏', name: t('scape.k8s.legend.stop'), meaning: t('scape.k8s.legend.stopMeaning'), command: 'kubectl expose deployment <名前> --port=80' },
    { sample: 'marker' as const, icon: '🔍', name: t('scape.k8s.legend.audit'), meaning: t('scape.k8s.legend.auditMeaning'), command: 'kubectl set image deployment/<名前> <コンテナ>=<イメージ>:<版>' },
  ];
  if (cluster === null) {
    return {
      width: 16,
      height: 10,
      items: [{ type: 'plot', id: 'vacant', x: 2, y: 2, w: 10, d: 6, tone: 'muted', label: t('scape.k8s.vacant') }],
      stats: [],
      legend,
      empty: { title: t('scape.k8s.noClusterTitle'), text: t('scape.k8s.noCluster') },
      focus: { x: 7, y: 5 },
    };
  }

  const items: SceneItem[] = [];
  const pods = [...cluster.pods.values()];
  const nodes = [...cluster.nodes.values()].sort((a, b) =>
    a.spec.role === b.spec.role ? a.metadata.name.localeCompare(b.metadata.name) : a.spec.role === 'control-plane' ? -1 : 1,
  );
  // 監査は、動いている部屋（Pod）と、入居企業の計画（Deployment のテンプレート）の両方を見る
  const podFindings = pods.flatMap((p) => p.spec.containers.map((c) => ({ owner: p.metadata.name, tenant: tenantOf(p), image: c.image, issue: auditImage(c.image) })));
  const planFindings = [...cluster.deployments.values()].flatMap((d) => d.spec.template.containers.map((c) => ({ owner: d.metadata.name, tenant: d.metadata.name, image: c.image, issue: auditImage(c.image) })));
  const findings = [...planFindings, ...podFindings.filter((f) => !planFindings.some((g) => g.tenant === f.tenant && g.image === f.image))].filter((f) => f.issue !== null);
  const flagged = new Set(pods.filter((p) => p.spec.containers.some((c) => auditImage(c.image) !== null)).map((p) => p.metadata.name));

  // 市役所（API サーバー）。ノードとしての control-plane が無いクラスタでも、街の中心として建てる
  const hasPlaneNode = nodes.some((n) => n.spec.role === 'control-plane');
  let x = 0;
  if (!hasPlaneNode) {
    items.push({
      type: 'building',
      id: 'hall',
      x,
      y: 0,
      w: 3,
      d: 3,
      floors: 2,
      style: 'solid',
      color: '#efe6d2',
      roof: 'hall',
      label: t('scape.k8s.hall'),
      info: { title: t('scape.k8s.hall'), kind: t('scape.k8s.hallKind'), lines: [t('scape.k8s.hallLine')], next: t('scape.k8s.hallNext') },
    });
    x += 5;
  }
  const nodePos = new Map<string, number>();
  for (const node of nodes) {
    const mine = pods.filter((p) => p.status.nodeName === node.metadata.name);
    const condition = nodeCondition(cluster, node);
    const plane = node.spec.role === 'control-plane';
    const badges: { icon: string; tone: Tone }[] = [];
    if (node.spec.unschedulable) badges.push({ icon: '🚧', tone: 'warn' });
    if (!condition.ready) badges.push({ icon: '⚡', tone: 'bad' });
    if (mine.some((p) => flagged.has(p.metadata.name))) badges.push({ icon: '🔍', tone: 'warn' });
    nodePos.set(node.metadata.name, x);
    items.push({
      type: 'building',
      id: `node:${node.metadata.name}`,
      x,
      y: 0,
      w: 3,
      d: 3,
      floors: Math.max(2, Math.min(7, Math.ceil(mine.length / 2) + 1)),
      style: condition.ready ? 'solid' : 'dark',
      color: plane ? '#efe6d2' : '#9cc3dc',
      roof: plane ? 'hall' : 'flat',
      label: node.metadata.name,
      badges,
      rooms: mine.map((p) => {
        const look = podLook(p).look;
        return { color: colorOf(tenantOf(p)), tone: flagged.has(p.metadata.name) && look === 'Running' ? 'warn' : ROOM_TONE[look] };
      }),
      info: {
        title: node.metadata.name,
        kind: plane ? t('scape.k8s.planeKind') : t('scape.k8s.nodeKind'),
        lines: [
          condition.ready ? t('scape.k8s.nodeReady') : t('scape.k8s.nodeNotReady', { reason: condition.reason }),
          t('scape.k8s.nodeRooms', { n: mine.length }),
          ...mine.slice(0, 6).map((p) => `${p.metadata.name}: ${podLook(p).detail}`),
          ...(node.spec.unschedulable ? [t('scape.k8s.nodeCordoned')] : []),
        ],
        next: node.spec.unschedulable ? t('scape.k8s.uncordonNext', { name: node.metadata.name }) : t('scape.k8s.nodeNext', { name: node.metadata.name }),
      },
    });
    x += 5;
  }
  const streetEnd = Math.max(x, 10);
  items.push({ type: 'road', id: 'avenue', cells: Array.from({ length: streetEnd + 4 }, (_, i) => ({ x: i - 1, y: 4 })), kind: 'main' });

  // 監査局
  items.push({
    type: 'building',
    id: 'audit',
    x: streetEnd + 1,
    y: 0,
    w: 3,
    d: 3,
    floors: 2,
    style: 'solid',
    color: '#d7c3a5',
    roof: 'hall',
    label: t('scape.k8s.audit'),
    badges: findings.length > 0 ? [{ icon: `⚠${String(findings.length)}`, tone: 'warn' }] : [{ icon: '✓', tone: 'ok' }],
    info: {
      title: t('scape.k8s.audit'),
      kind: t('scape.k8s.auditKind'),
      lines:
        findings.length === 0
          ? [t('scape.k8s.auditClean')]
          : findings.slice(0, 6).map((f) => t(f.issue === 'latest' ? 'scape.k8s.auditLatest' : 'scape.k8s.auditUntagged', { pod: f.owner, image: f.image })),
      next: findings.length === 0 ? undefined : t('scape.k8s.auditNext'),
    },
  });

  // 待機広場（置き場の無い Pod）
  const waiting = pods.filter((p) => p.status.nodeName === null && p.status.phase === 'Pending');
  const yardW = Math.max(6, waiting.length * 2 + 2);
  items.push({ type: 'plot', id: 'yard', x: 0, y: 6, w: yardW, d: 3, tone: 'warn', label: t('scape.k8s.yard') });
  waiting.forEach((p, i) => {
    items.push({
      type: 'building',
      id: `pending:${p.metadata.name}`,
      x: 1 + i * 2,
      y: 6.5,
      w: 1.4,
      d: 1.4,
      floors: 1,
      style: 'tent',
      color: colorOf(tenantOf(p)),
      roof: 'gable',
      label: p.metadata.name,
      info: {
        title: p.metadata.name,
        kind: t('scape.k8s.tentKind'),
        lines: [p.status.message ?? t('scape.k8s.tentWhy')],
        next: t('scape.k8s.tentNext', { name: p.metadata.name }),
      },
    });
  });

  // 入居企業（Deployment）の看板
  let sx = yardW + 2;
  for (const d of cluster.deployments.values()) {
    const ok = d.status.readyReplicas >= d.spec.replicas;
    items.push({
      type: 'marker',
      id: `deploy:${d.metadata.name}`,
      x: sx,
      y: 7,
      icon: '🏢',
      label: `${d.metadata.name} ${String(d.status.readyReplicas)}/${String(d.spec.replicas)}`,
      tone: ok ? 'ok' : 'warn',
      info: {
        title: d.metadata.name,
        kind: t('scape.k8s.tenantKind'),
        lines: [t('scape.k8s.tenantLine', { ready: d.status.readyReplicas, want: d.spec.replicas }), ...d.spec.template.containers.map((c) => c.image)],
        next: t('scape.k8s.tenantNext', { name: d.metadata.name }),
      },
    });
    sx += 4;
  }

  // バス停（Service）と、つながる部屋のあるビルへの線
  let bx = 0.5;
  for (const svc of cluster.services.values()) {
    const backing = pods.filter((p) => Object.entries(svc.spec.selector).length > 0 && Object.entries(svc.spec.selector).every(([k, v]) => p.metadata.labels[k] === v));
    items.push({
      type: 'marker',
      id: `svc:${svc.metadata.name}`,
      x: bx,
      y: 5,
      icon: '🚏',
      label: svc.metadata.name,
      tone: svc.status.endpoints.length > 0 ? 'info' : 'bad',
      info: {
        title: svc.metadata.name,
        kind: t('scape.k8s.stopKind'),
        lines: [t('scape.k8s.stopLine', { n: svc.status.endpoints.length, type: svc.spec.type })],
        next: svc.status.endpoints.length === 0 ? t('scape.k8s.stopEmpty') : t('scape.k8s.stopNext', { name: svc.metadata.name }),
      },
    });
    const hosts = new Set(backing.map((p) => p.status.nodeName).filter((n): n is string => n !== null));
    for (const host of hosts) {
      const nx = nodePos.get(host);
      if (nx === undefined) continue;
      items.push({ type: 'link', id: `svc:${svc.metadata.name}:${host}`, from: { x: bx, y: 5 }, to: { x: nx + 1.5, y: 3 }, style: 'dashed', tone: 'info', flow: true });
    }
    bx += 4;
  }
  for (const ing of cluster.ingresses.values()) {
    items.push({ type: 'marker', id: `ing:${ing.metadata.name}`, x: -1.5, y: 4, icon: '⛩', label: ing.metadata.name, tone: 'accent', info: { title: ing.metadata.name, kind: t('scape.k8s.gateKind'), lines: [], next: undefined } });
  }

  const looks = pods.map((p) => podLook(p).look);
  return {
    width: Math.max(streetEnd + 5, sx + 2),
    height: 10,
    items,
    legend,
    stats: [
      { icon: '🏢', label: t('scape.k8s.stat.buildings'), value: nodes.length },
      { icon: '💡', label: t('scape.k8s.stat.running'), value: looks.filter((l) => l === 'Running').length },
      { icon: '🏗', label: t('scape.k8s.stat.creating'), value: looks.filter((l) => l === 'Creating').length },
      { icon: '⛺', label: t('scape.k8s.stat.waiting'), value: waiting.length },
      { icon: '🔥', label: t('scape.k8s.stat.broken'), value: looks.filter((l) => l === 'BackOff' || l === 'Failed').length },
      { icon: '🔍', label: t('scape.k8s.stat.audit'), value: findings.length },
    ],
    focus: { x: Math.min(streetEnd, 8), y: 4 },
  };
}
