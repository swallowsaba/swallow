import { emptyCluster, node } from '@/engines/k8s/factory';
import { key, type ClusterState, type PodPhase } from '@/engines/k8s/types';
import { applyCommand, boot, unknownMove, type Playground, type Sim } from './sim';

/**
 * `pod-lifecycle`: 住人が暮らし始めるまでの段。
 *
 * 「時間を進める」は `kubectl wait 1`。1 回押すと、本物の kubelet が 1 tick ぶん進む。
 * 壊れた荷物（取れないイメージ）を選ぶと、再試行の間隔が伸びていくのが数字で見える。
 */

const NAME = 'web';
/** 住人が持ってくる荷物（イメージ）。壊れた方は取り寄せに失敗する */
export const IMAGES = { good: 'nginx', broken: 'does-not-exist' } as const;
/** 段の並び。Pending（部屋待ち）→ ContainerCreating（荷ほどき）→ Running（暮らし始めた） */
export const STAGES: readonly PodPhase[] = ['Pending', 'ContainerCreating', 'Running'];

export interface PodLifecycleView {
  /** 住人がいなければ null */
  pod: {
    image: string;
    phase: PodPhase;
    /** 止まっている理由（ImagePullBackOff など） */
    waiting: string | null;
    /** 取り寄せを試した回数 */
    attempts: number;
    /** 次に試すまでの残り時間（tick）。待っていなければ null */
    retryIn: number | null;
  } | null;
  tick: number;
}

function clusterOf(sim: Sim): ClusterState {
  const cluster = sim.session.state.cluster;
  if (cluster === null) throw new Error('図解のクラスタがありません');
  return cluster;
}

function start(): Sim {
  return boot({ cluster: emptyCluster([node('node-1', 4000, 8192)]), files: { '/home/learner': null } });
}

function view(sim: Sim): PodLifecycleView {
  const cluster = clusterOf(sim);
  const found = cluster.pods.get(key('default', NAME));
  const status = found?.status.containerStatuses[0];
  return {
    tick: cluster.tick,
    pod:
      found === undefined
        ? null
        : {
            image: found.spec.containers[0]?.image ?? '',
            phase: found.status.phase,
            waiting: status?.waitingReason ?? null,
            attempts: status?.restartCount ?? 0,
            retryIn: status?.restartAt == null ? null : Math.max(0, status.restartAt - cluster.tick),
          },
  };
}

function moves(sim: Sim) {
  const here = view(sim).pod !== null;
  if (!here) {
    return [
      { id: 'run:good', label: `${IMAGES.good} の荷物で入居させる`, command: `kubectl run ${NAME} --image=${IMAGES.good}` },
      { id: 'run:broken', label: '壊れた荷物で入居させる', command: `kubectl run ${NAME} --image=${IMAGES.broken}` },
    ];
  }
  return [
    { id: 'tick', label: '時間を進める', command: 'kubectl wait 1' },
    { id: 'reset', label: '住人を帰して、やり直す', command: `kubectl delete pod ${NAME}` },
  ];
}

function apply(sim: Sim, moveId: string) {
  const found = moves(sim).find((m) => m.id === moveId);
  if (found === undefined) {
    const reason = moveId.startsWith('run:') ? '住人はもういる。やり直すなら先に帰す' : null;
    return reason === null ? unknownMove(sim, moveId) : { sim, command: '', ok: false, reason };
  }
  return applyCommand(sim, found.command);
}

export const podLifecycle: Playground<PodLifecycleView> = {
  id: 'pod-lifecycle',
  goal: '住人を Running（暮らし始めた）まで進めよ',
  notes: [
    '住人（Pod）は、部屋が決まるまで Pending、荷ほどき中は ContainerCreating、暮らし始めたら Running。',
    '「時間を進める」を押すたびに、1 段ずつ進む。',
    '壊れた荷物だと取り寄せに失敗し、次に試すまでの間隔が 2 倍ずつ伸びる。',
  ],
  start,
  moves,
  apply,
  view,
  reached: (sim) => view(sim).pod?.phase === 'Running',
  solution: ['run:good', 'tick', 'tick', 'tick'],
};
