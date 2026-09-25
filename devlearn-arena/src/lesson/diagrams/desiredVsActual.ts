import { emptyCluster, node } from '@/engines/k8s/factory';
import { key, type ClusterState, type PodPhase } from '@/engines/k8s/types';
import { applyCommand, boot, note, run, unknownMove, type Playground, type Sim } from './sim';

/**
 * `desired-vs-actual`: 注文の数（replicas）と、いまの数。
 *
 * 住人を消すと、監督（コントローラ）が注文との差に気付いて作り直す。
 * 作り直すのは本物の `reconcile` で、図はその結果を数えているだけ。
 */

const NAME = 'web';
/** つまみで選べる注文の数 */
export const REPLICA_CHOICES = [1, 2, 3, 4, 5] as const;

export interface DesiredVsActualView {
  /** 注文書に書いてある数 */
  desired: number;
  pods: { name: string; phase: PodPhase }[];
  /** いま動いている（Running の）数 */
  running: number;
}

function clusterOf(sim: Sim): ClusterState {
  const cluster = sim.session.state.cluster;
  if (cluster === null) throw new Error('図解のクラスタがありません');
  return cluster;
}

function start(): Sim {
  return boot(
    { cluster: emptyCluster([node('node-1', 4000, 8192), node('node-2', 4000, 8192)]), files: { '/home/learner': null } },
    [`kubectl create deployment ${NAME} --image=nginx --replicas=3`, 'kubectl wait 8'],
  );
}

function view(sim: Sim): DesiredVsActualView {
  const cluster = clusterOf(sim);
  const pods = [...cluster.pods.values()]
    .filter((p) => p.metadata.labels['app'] === NAME)
    .sort((a, b) => a.metadata.createdAt - b.metadata.createdAt || (a.metadata.name < b.metadata.name ? -1 : 1))
    .map((p) => ({ name: p.metadata.name, phase: p.status.phase }));
  return {
    desired: cluster.deployments.get(key('default', NAME))?.spec.replicas ?? 0,
    pods,
    running: pods.filter((p) => p.phase === 'Running').length,
  };
}

function moves(sim: Sim) {
  const current = view(sim);
  return [
    ...current.pods.map((p) => ({
      id: `delete:${p.name}`,
      label: `${p.name} を消す`,
      command: `kubectl delete pod ${p.name}`,
    })),
    ...REPLICA_CHOICES.filter((n) => n !== current.desired).map((n) => ({
      id: `scale:${String(n)}`,
      label: `注文を ${String(n)} 人にする`,
      command: `kubectl scale deployment ${NAME} --replicas=${String(n)}`,
    })),
  ];
}

function apply(sim: Sim, moveId: string) {
  const [verb, arg = ''] = moveId.split(':');
  if (verb === 'delete') {
    // 名前は作り直すたびに変わる。`delete:first` は、いまいる一番古い住人を指す
    const name = arg === 'first' ? view(sim).pods[0]?.name ?? '' : arg;
    const applied = applyCommand(sim, `kubectl delete pod ${name}`);
    return applied.ok ? { ...applied, sim: note(applied.sim, 'deleted') } : applied;
  }
  if (verb === 'scale' && REPLICA_CHOICES.some((n) => String(n) === arg)) {
    return applyCommand(sim, `kubectl scale deployment ${NAME} --replicas=${arg}`);
  }
  return unknownMove(sim, moveId);
}

/** 注文と実際が合うまで、時間を 1 つずつ進める。監督が数え直すのはこの時 */
function settle(sim: Sim): Sim | null {
  const current = view(sim);
  const done = current.pods.length === current.desired && current.running === current.desired;
  return done ? null : run(sim, 'kubectl wait 1').sim;
}

export const desiredVsActual: Playground<DesiredVsActualView> = {
  id: 'desired-vs-actual',
  goal: '住人を 1 人消して、監督が注文どおりの数に戻すのを見届けよ',
  notes: [
    'Deployment は「住人を何人そろえるか」の注文書。監督はいまの数と見比べ続ける。',
    '住人を押すと消える。足りなくなると、監督が新しい住人を呼ぶ。',
    'つまみで注文の数を変えると、監督は増やしたり減らしたりして合わせる。',
  ],
  start,
  moves,
  apply,
  settle,
  view,
  reached: (sim) => {
    const current = view(sim);
    return (
      (sim.notes['deleted'] ?? 0) > 0 &&
      current.pods.length === current.desired &&
      current.running === current.desired
    );
  },
  solution: ['delete:first'],
};
