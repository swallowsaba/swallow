import { container, emptyCluster, node, pod } from '@/engines/k8s/factory';
import { requestOf, schedule, usedOn } from '@/engines/k8s/scheduler';
import { key, type ClusterState, type PodPhase } from '@/engines/k8s/types';
import { boot, run, unknownMove, type Playground, type Sim } from './sim';

/**
 * `pod-in-node`: 住人（Pod）を別のビル（ノード）へ引っ越させる。
 *
 * 引っ越し先に入れるかどうかは、本物の配置係（`schedule`）が決める。
 * 満員のビルには入れず、配置係が返した理由をそのまま数字で出す。
 */

/** ビル 1 棟が貸し出せる CPU。住人 1 人は 100m 使うので、2 人で満員 */
const CAPACITY = 200;
const NODES = ['node-1', 'node-2', 'node-3'] as const;
/** 最初の住まい。node-1 は満員で、ほかの 2 棟に 1 部屋ずつ空きがある */
const START: readonly [string, string][] = [
  ['web-1', 'node-1'],
  ['web-2', 'node-1'],
  ['web-3', 'node-2'],
  ['web-4', 'node-3'],
];
/** 点検のために空けたいビル */
const EMPTY = 'node-1';

export interface PodInNodeView {
  nodes: {
    name: string;
    /** 貸し出せる CPU（m） */
    capacity: number;
    /** 住人が申告している CPU の合計（m） */
    used: number;
    pods: { name: string; phase: PodPhase }[];
  }[];
  /** まだビルが決まっていない住人 */
  waiting: { name: string; phase: PodPhase }[];
}

function clusterOf(sim: Sim): ClusterState {
  const cluster = sim.session.state.cluster;
  if (cluster === null) throw new Error('図解のクラスタがありません');
  return cluster;
}

function withCluster(sim: Sim, cluster: ClusterState): Sim {
  return { ...sim, session: { ...sim.session, state: { ...sim.session.state, cluster } } };
}

/** そのビルに住まわせる、と決めた住人。ビルの名前札で行き先を指定する */
function resident(name: string, nodeName: string, createdAt: number) {
  return pod(name, [container(name, 'nginx')], {
    labels: { app: 'web' },
    nodeSelector: { 'kubernetes.io/hostname': nodeName },
    createdAt,
  });
}

/**
 * 配置係の答えを、平易な言葉に直す。本物の答えは英語で、関係ないビルの事情も混ざっている。
 * `kubectl describe pod` の Events に出るのと同じ言葉だけを、言い換えを添えて残す
 */
function answerOf(reason: string | null): string {
  if (reason?.includes('Insufficient cpu') === true) return '配置係の答えは Insufficient cpu（CPU が足りない）';
  if (reason?.includes('Insufficient memory') === true) return '配置係の答えは Insufficient memory（メモリが足りない）';
  return '配置係は入れる部屋を見つけられなかった';
}

function start(): Sim {
  const cluster = emptyCluster(NODES.map((n) => node(n, CAPACITY, 4096)));
  const pods = new Map(START.map(([name, at]) => [key('default', name), resident(name, at, 0)]));
  return boot({ cluster: { ...cluster, pods }, files: { '/home/learner': null } }, ['kubectl wait 3']);
}

function view(sim: Sim): PodInNodeView {
  const cluster = clusterOf(sim);
  const pods = [...cluster.pods.values()].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1));
  return {
    nodes: NODES.map((name) => ({
      name,
      capacity: cluster.nodes.get(name)?.status.allocatable.cpu ?? 0,
      used: usedOn(cluster, name).cpu,
      pods: pods
        .filter((p) => p.status.nodeName === name)
        .map((p) => ({ name: p.metadata.name, phase: p.status.phase })),
    })),
    waiting: pods
      .filter((p) => p.status.nodeName === null)
      .map((p) => ({ name: p.metadata.name, phase: p.status.phase })),
  };
}

function moves(sim: Sim) {
  const current = view(sim);
  return current.nodes.flatMap((from) =>
    from.pods.flatMap((p) =>
      NODES.filter((to) => to !== from.name).map((to) => ({
        id: `move:${p.name}:${to}`,
        label: `${p.name} を ${to} へ`,
        command: `kubectl describe pod ${p.name}`,
      })),
    ),
  );
}

function apply(sim: Sim, moveId: string) {
  const [verb, name, to] = moveId.split(':');
  const cluster = clusterOf(sim);
  const id = key('default', name ?? '');
  const was = cluster.pods.get(id);
  if (verb !== 'move' || name === undefined || to === undefined || was === undefined || !cluster.nodes.has(to)) {
    return unknownMove(sim, moveId);
  }
  const command = `kubectl describe pod ${name}`;
  if (was.status.nodeName === to) return { sim, command, ok: false, reason: `${name} はもう ${to} にいる` };

  // 引っ越しは「出て、行き先を決めて入り直す」こと。出た後の街で、配置係に行き先を尋ねる
  const without = new Map(cluster.pods);
  without.delete(id);
  const moving = resident(name, to, cluster.tick);
  const asked = schedule({ ...cluster, pods: without }, moving);
  if (asked.nodeName === null) {
    const free = CAPACITY - usedOn(cluster, to).cpu;
    return {
      sim,
      command,
      ok: false,
      reason: `${to} は満員。空きは CPU ${String(free)}m、この住人は ${String(requestOf(moving).cpu)}m 要る。${answerOf(asked.reason)}`,
    };
  }
  without.set(id, moving);
  return { sim: withCluster(sim, { ...cluster, pods: without }), command, ok: true, reason: null };
}

/** 入り直した住人が落ち着くまで、時間を 1 つずつ進める */
function settle(sim: Sim): Sim | null {
  const busy = [...clusterOf(sim).pods.values()].some((p) => p.status.phase !== 'Running');
  return busy ? run(sim, 'kubectl wait 1').sim : null;
}

export const podInNode: Playground<PodInNodeView> = {
  id: 'pod-in-node',
  goal: `点検のため、${EMPTY} を空き家にせよ（住人を別のビルへ引っ越させる）`,
  notes: [
    '住人（動いているアプリ）は、どれかのビル（ノード）の中で動く。どのビルに入るかは配置係が決める。',
    '住人は「CPU をこれだけ使う」と申告している。空きが足りないビルには入れない。',
    '住人をドラッグして別のビルへ落とすと、配置係が入れるかどうかを判定する。',
  ],
  start,
  moves,
  apply,
  settle,
  view,
  reached: (sim) => {
    const current = view(sim);
    const target = current.nodes.find((n) => n.name === EMPTY);
    const all = current.nodes.flatMap((n) => n.pods);
    return target?.pods.length === 0 && current.waiting.length === 0 && all.every((p) => p.phase === 'Running');
  },
  solution: ['move:web-1:node-2', 'move:web-2:node-3'],
};
