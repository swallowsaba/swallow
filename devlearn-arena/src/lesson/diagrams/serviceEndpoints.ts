import { emptyCluster, node } from '@/engines/k8s/factory';
import { matches } from '@/engines/k8s/controllers';
import { isReady } from '@/engines/k8s/kubelet';
import { key, type ClusterState, type Service } from '@/engines/k8s/types';
import { applyCommand, boot, run, unknownMove, type Playground, type Sim } from './sim';

/**
 * `service-endpoints`: バス停（Service）から住人への路線。
 *
 * 路線が伸びるのは、バス停の探す札（セレクタ）と住人の名札（ラベル）が合う所だけ。
 * 線を引くのは本物の `reconcile` が作る Endpoints で、図はそれを読むだけ。
 */

const SERVICE = 'web';
/** 名札の柄。付け替えられるのはこの 2 つ */
export const LABELS = ['web', 'api'] as const;
const PODS: readonly [string, string][] = [
  ['a', 'web'],
  ['b', 'web'],
  ['c', 'api'],
];

export interface ServiceEndpointsView {
  /** バス停が探している柄（app=...） */
  selector: string;
  pods: {
    name: string;
    /** 名札の柄 */
    label: string;
    ip: string | null;
    /** バス停から線が伸びているか（Endpoints に載っているか） */
    linked: boolean;
  }[];
}

function clusterOf(sim: Sim): ClusterState {
  const cluster = sim.session.state.cluster;
  if (cluster === null) throw new Error('図解のクラスタがありません');
  return cluster;
}

function serviceOf(cluster: ClusterState): Service | undefined {
  return cluster.services.get(key('default', SERVICE));
}

function start(): Sim {
  return boot(
    { cluster: emptyCluster([node('node-1', 4000, 8192)]), files: { '/home/learner': null } },
    [
      ...PODS.map(([name, label]) => `kubectl run ${name} --image=nginx --labels=app=${label}`),
      `kubectl expose pod a --port=80 --name=${SERVICE}`,
      'kubectl wait 4',
    ],
  );
}

function view(sim: Sim): ServiceEndpointsView {
  const cluster = clusterOf(sim);
  const service = serviceOf(cluster);
  const endpoints = new Set(service?.status.endpoints ?? []);
  return {
    selector: service?.spec.selector['app'] ?? '',
    pods: PODS.map(([name]) => {
      const found = cluster.pods.get(key('default', name));
      const ip = found?.status.podIP ?? null;
      return { name, label: found?.metadata.labels['app'] ?? '', ip, linked: ip !== null && endpoints.has(ip) };
    }),
  };
}

function moves(sim: Sim) {
  const current = view(sim);
  return [
    ...current.pods.flatMap((p) =>
      LABELS.filter((l) => l !== p.label).map((l) => ({
        id: `label:${p.name}:${l}`,
        label: `${p.name} の名札を ${l} にする`,
        command: `kubectl label pod ${p.name} app=${l} --overwrite`,
      })),
    ),
    ...LABELS.filter((l) => l !== current.selector).map((l) => ({
      id: `selector:${l}`,
      label: `バス停が探す柄を ${l} にする`,
      command: `kubectl set selector svc ${SERVICE} app=${l}`,
    })),
  ];
}

function apply(sim: Sim, moveId: string) {
  const found = moves(sim).find((m) => m.id === moveId);
  return found === undefined ? unknownMove(sim, moveId) : applyCommand(sim, found.command);
}

/** 路線の引き直しは、監督が次に見回った時に起きる。合うまで時間を進める */
function settle(sim: Sim): Sim | null {
  const cluster = clusterOf(sim);
  const service = serviceOf(cluster);
  if (service === undefined) return null;
  const want = [...cluster.pods.values()]
    .filter((p) => matches(p.metadata.labels, service.spec.selector) && isReady(p))
    .map((p) => p.status.podIP)
    .filter((ip): ip is string => ip !== null)
    .sort();
  const have = [...service.status.endpoints].sort();
  return want.join(',') === have.join(',') ? null : run(sim, 'kubectl wait 1').sim;
}

export const serviceEndpoints: Playground<ServiceEndpointsView> = {
  id: 'service-endpoints',
  goal: 'バス停から 3 人全員へ路線をつなげ',
  notes: [
    'Service はバス停。「app=web の札を付けた住人」のように、札の柄で行き先を探す。',
    '住人を押すと名札の柄が変わる。柄が合わない住人には路線が伸びない。',
    '路線の一覧が Endpoints。ここに載らない住人には、誰も訪ねて来ない。',
  ],
  start,
  moves,
  apply,
  settle,
  view,
  reached: (sim) => view(sim).pods.every((p) => p.linked),
  solution: ['label:c:web'],
};
