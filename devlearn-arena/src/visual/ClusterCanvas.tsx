import { AnimatePresence, LayoutGroup, motion } from 'framer-motion';
import { useMemo } from 'react';
import { isReady } from '@/engines/k8s/kubelet';
import type { ClusterState, Pod } from '@/engines/k8s/types';
import { useMotionEnabled } from '@/ui/motion';
import { useT } from '@/i18n/useT';
import { Term } from '@/ui/Term';
import {
  activationOrder, activeComponents, COMPONENTS, GENERATION_COLOR, GRAPH, LOOK_COLOR, ownershipGraph,
  podGeneration, podLabel, podLook, rollingDeployments, type Component, type Generation,
} from './clusterModel';
import { k8sCommands, type RunCommand } from './commands';

interface Props {
  cluster: ClusterState | null;
  /** 1つ前の状態。どの部品が動いたかを光らせるのに使う */
  previous?: ClusterState | null;
  /** 図の操作をコマンドとして端末に流す。無ければ見るだけの図になる */
  onCommand?: RunCommand;
}

const PART: Record<Component, { icon: string; role: string }> = {
  apiserver: { icon: '🛎', role: '受付' },
  scheduler: { icon: '🧭', role: '配置係' },
  controller: { icon: '👀', role: '見張り係' },
  etcd: { icon: '📒', role: '記録帳' },
};

/** 光らせる部品を、命令が伝わる順に1つずつ点けていく間隔（秒） */
const RELAY_STEP = 0.35;

function sortByName<T extends { metadata: { name: string } }>(items: Iterable<T>): T[] {
  return [...items].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1));
}

interface PodChipProps {
  pod: Pod;
  animate: boolean;
  onCommand?: RunCommand;
  /** 入れ替えの最中なら、新しい型か前の型か */
  generation: Generation | null;
  /** 直前には無かった Pod。上から降ってくる */
  fresh: boolean;
}

/**
 * Pod の粒。同じ layoutId の粒が別の場所に出ると、そこへ飛んでいく（配置係 → ノード）。
 * 作られた Pod は上から降ってきて、消された Pod は煙のようにふくらんで消える。
 */
function PodChip({ pod, animate, onCommand, generation, fresh }: PodChipProps) {
  const t = useT();
  const { look, detail } = podLook(pod);
  return (
    <motion.div
      layoutId={animate ? `pod-${pod.metadata.name}` : undefined}
      layout={animate}
      data-pod={pod.metadata.name}
      data-look={look}
      data-generation={generation ?? undefined}
      initial={animate && fresh ? { y: -48, opacity: 0 } : false}
      animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
      exit={animate ? { opacity: 0, scale: 1.6, y: -18, filter: 'blur(6px)', transition: { duration: 0.6 } } : undefined}
      transition={{ type: 'spring', stiffness: 220, damping: 20 }}
      className="relative border-2 border-wood-dark"
      style={{
        backgroundColor: LOOK_COLOR[look],
        boxShadow: generation === null ? undefined : `inset 6px 0 0 ${GENERATION_COLOR[generation]}`,
      }}
      title={`${pod.metadata.name} / ${detail}`}
    >
      <button
        type="button"
        disabled={!onCommand}
        aria-label={t('viz.describePod', { name: pod.metadata.name })}
        className="block px-2 py-1 pr-6 text-left disabled:cursor-default"
        onClick={() => {
          onCommand?.(k8sCommands.describePod(pod.metadata.name));
        }}
      >
        <span className="block max-w-[130px] truncate font-mono text-xs font-bold text-ink">
          {pod.metadata.name}
        </span>
        <span className="block font-mono text-[11px] font-extrabold text-ink">
          {podLabel(pod)}
          {generation === null ? null : (
            <span
              className="ml-1 border border-wood-dark px-0.5 font-bold"
              style={{ backgroundColor: GENERATION_COLOR[generation] }}
            >
              {t(generation === 'new' ? 'viz.genNew' : 'viz.genOld')}
            </span>
          )}
        </span>
      </button>
      {onCommand ? (
        <button
          type="button"
          aria-label={t('viz.deletePod', { name: pod.metadata.name })}
          title={k8sCommands.deletePod(pod.metadata.name)}
          className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center border-2 border-wood-dark bg-cream text-xs font-extrabold leading-none"
          onClick={() => {
            onCommand(k8sCommands.deletePod(pod.metadata.name));
          }}
        >
          ×
        </button>
      ) : null}
    </motion.div>
  );
}

/**
 * クラスタの様子。
 * 上にコントロールプレーン（受付・記録帳・見張り係・配置係）を命令が伝わる順に並べ、動いた部品をその順に光らせる。
 * 置き場所の決まっていない Pod は配置係の中で待ち、ノードが決まるとそこへ飛んで着地する。
 * 下の系図で Deployment → ReplicaSet → Pod の持ち主関係と、Service が繋いでいる Pod を線で結ぶ。
 * 入れ替え（ローリングアップデート）の最中は、新しい型と前の型の Pod を色で分ける。
 */
export function ClusterCanvas({ cluster, previous, onCommand }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const active = useMemo(() => activeComponents(previous, cluster), [previous, cluster]);
  const relay = activationOrder(active);
  const graph = useMemo(() => (cluster === null ? null : ownershipGraph(cluster)), [cluster]);

  if (cluster === null || graph === null) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-bold">{t('viz.noCluster')}</p>
          <p className="mt-2 text-sm text-ink-soft">
            {t('viz.noClusterLead')}
          </p>
        </div>
      </div>
    );
  }

  const nodes = sortByName(cluster.nodes.values());
  const pods = sortByName(cluster.pods.values());
  const pending = pods.filter((p) => p.status.nodeName === null && p.status.phase === 'Pending');
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const rolling = rollingDeployments(cluster);

  // 入れ替えの最中の Deployment の Pod にだけ、新旧の印を付ける
  const generationFor = (pod: Pod): Generation | null => {
    const rs = pod.metadata.ownerReferences.find((o) => o.kind === 'ReplicaSet');
    const owner = rs
      ? cluster.replicaSets.get(`${pod.metadata.namespace}/${rs.name}`)?.metadata.ownerReferences[0]?.name
      : undefined;
    return owner !== undefined && rolling.has(owner) ? podGeneration(cluster, pod) : null;
  };
  const isFresh = (pod: Pod) =>
    previous != null && !previous.pods.has(`${pod.metadata.namespace}/${pod.metadata.name}`);
  const chip = (pod: Pod) => (
    <PodChip
      key={pod.metadata.name}
      pod={pod}
      animate={animate}
      onCommand={onCommand}
      generation={generationFor(pod)}
      fresh={isFresh(pod)}
    />
  );

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-sm text-ink-soft">
          {t('viz.clusterSummary', { tick: cluster.tick, nodes: nodes.length, pods: pods.length })}
        </p>
        {onCommand ? (
          <button
            type="button"
            className="knob ml-auto px-3 py-1 text-sm"
            title={k8sCommands.advance()}
            onClick={() => {
              onCommand(k8sCommands.advance());
            }}
          >
            {t('viz.advance')}
          </button>
        ) : null}
      </div>
      {onCommand ? <p className="mt-1 text-xs text-ink-soft">{t('viz.clickHint')}</p> : null}

      <LayoutGroup>
        {/* コントロールプレーン。命令が伝わる順に左から並べ、動いた部品をその順に1つずつ光らせる */}
        <section aria-label={t('viz.controlPlane')} className="mt-3 border-4 border-wood-dark bg-[var(--cream-dark)] p-2">
          <p className="px-1 text-xs font-extrabold text-ink-soft">
            <Term term="コントロールプレーン" />
          </p>
          <div className="mt-1 flex flex-wrap items-stretch gap-1">
            <div className="flex items-center px-1 font-mono text-xs font-bold" data-part="kubectl">
              kubectl
            </div>
            {COMPONENTS.map((part) => {
              const step = relay.indexOf(part);
              const on = step !== -1;
              return (
                <div key={part} className="flex min-w-[118px] flex-1 items-stretch gap-1">
                  <span aria-hidden className={`self-center font-extrabold ${on ? 'text-[var(--bad)]' : 'text-ink-soft'}`}>
                    →
                  </span>
                  <motion.div
                    key={on ? `${part}-on-${String(cluster.tick)}-${String(pods.length)}` : `${part}-off`}
                    data-part={part}
                    data-active={on ? 'true' : 'false'}
                    data-order={on ? step : undefined}
                    initial={animate && on ? { backgroundColor: '#f6e8cd' } : false}
                    animate={{ backgroundColor: on ? '#f2c14e' : '#f6e8cd', scale: on && animate ? [1, 1.08, 1] : 1 }}
                    transition={{ duration: 0.45, delay: animate && on ? step * RELAY_STEP : 0 }}
                    className={`flex-1 border-4 px-2 py-1 ${on ? 'border-[var(--bad)]' : 'border-wood-dark'}`}
                  >
                    <p className="text-sm font-extrabold">
                      <span aria-hidden>{PART[part].icon}</span> {PART[part].role}
                    </p>
                    <p className="font-mono text-xs">
                      <Term term={part} />
                    </p>
                    {part === 'scheduler' ? (
                      <div className="mt-1 flex min-h-[8px] flex-wrap gap-1">
                        <AnimatePresence initial={false}>{pending.map(chip)}</AnimatePresence>
                      </div>
                    ) : null}
                  </motion.div>
                </div>
              );
            })}
          </div>
          {pending.some((p) => p.status.message !== null) ? (
            <ul className="mt-2 flex flex-col gap-0.5 border-l-4 border-[var(--bad)] px-2">
              {pending
                .filter((p) => p.status.message !== null)
                .map((pod) => (
                  <li key={pod.metadata.name} className="font-mono text-xs text-[var(--bad)]">
                    {t('viz.unplacedLine', { name: pod.metadata.name, reason: pod.status.message ?? '' })}
                  </li>
                ))}
            </ul>
          ) : null}
        </section>

        {/* Deployment。± であるべき数を変える */}
        {cluster.deployments.size > 0 ? (
          <div className="mt-3 border-4 border-wood-dark bg-cream p-3">
            <p className="text-sm font-bold text-ink-soft">{t('viz.deployments')}</p>
            <ul className="mt-1 flex flex-col gap-1">
              {sortByName(cluster.deployments.values()).map((d) => {
                const ready = pods.filter(
                  (p) => isReady(p) && Object.entries(d.spec.selector).every(([k, v]) => p.metadata.labels[k] === v),
                ).length;
                return (
                  <li key={d.metadata.name} className="flex flex-wrap items-center gap-2 font-mono text-sm">
                    <span className="sign px-2 py-0.5 text-xs font-extrabold">Deployment</span>
                    <span className="font-bold">{d.metadata.name}</span>
                    <span className="text-ink-soft">
                      {d.spec.replicas} / {ready}
                    </span>
                    {rolling.has(d.metadata.name) ? (
                      <span data-rolling={d.metadata.name} className="text-xs font-bold">
                        {t('viz.rolling')}{' '}
                        <span className="border border-wood-dark px-1" style={{ backgroundColor: GENERATION_COLOR.old }}>
                          {t('viz.genOld')}
                        </span>{' '}
                        →{' '}
                        <span className="border border-wood-dark px-1" style={{ backgroundColor: GENERATION_COLOR.new }}>
                          {t('viz.genNew')}
                        </span>
                      </span>
                    ) : null}
                    {onCommand ? (
                      <span className="ml-auto flex gap-1">
                        <button
                          type="button"
                          aria-label={t('viz.scaleDown', { name: d.metadata.name })}
                          title={k8sCommands.scale(d.metadata.name, d.spec.replicas - 1)}
                          disabled={d.spec.replicas <= 0}
                          className="knob px-2 py-0.5 text-sm disabled:opacity-40"
                          onClick={() => {
                            onCommand(k8sCommands.scale(d.metadata.name, d.spec.replicas - 1));
                          }}
                        >
                          −
                        </button>
                        <button
                          type="button"
                          aria-label={t('viz.scaleUp', { name: d.metadata.name })}
                          title={k8sCommands.scale(d.metadata.name, d.spec.replicas + 1)}
                          className="knob px-2 py-0.5 text-sm"
                          onClick={() => {
                            onCommand(k8sCommands.scale(d.metadata.name, d.spec.replicas + 1));
                          }}
                        >
                          +
                        </button>
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {/* ノードと、そこに着地した Pod */}
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {nodes.map((node) => {
            const mine = pods.filter((p) => p.status.nodeName === node.metadata.name);
            const used = mine.reduce((sum, p) => sum + p.spec.containers.reduce((n, c) => n + c.requests.cpu, 0), 0);
            const ratio = Math.min(1, used / Math.max(1, node.status.allocatable.cpu));
            return (
              <div key={node.metadata.name} data-node={node.metadata.name} className="border-4 border-wood-dark bg-cream">
                <div className="plate flex items-center gap-2 px-3 py-1.5 text-sm font-extrabold">
                  <span aria-hidden>🖳</span>
                  {node.metadata.name}
                  <span className="ml-auto font-mono text-xs">
                    {node.spec.unschedulable ? 'SchedulingDisabled' : 'Ready'}
                  </span>
                  {onCommand ? (
                    <button
                      type="button"
                      aria-label={t(node.spec.unschedulable ? 'viz.uncordon' : 'viz.cordon')}
                      title={k8sCommands.toggleCordon(node.metadata.name, node.spec.unschedulable)}
                      className="knob px-2 py-0.5 text-xs"
                      onClick={() => {
                        onCommand(k8sCommands.toggleCordon(node.metadata.name, node.spec.unschedulable));
                      }}
                    >
                      {node.spec.unschedulable ? '▶' : '⏸'}
                    </button>
                  ) : null}
                </div>
                <div className="px-3 pt-2">
                  <div className="h-3 w-full border-2 border-wood-dark bg-white">
                    <div className="h-full bg-gold" style={{ width: `${String(ratio * 100)}%` }} />
                  </div>
                  <p className="mt-1 font-mono text-xs text-ink-soft">
                    cpu {used} / {node.status.allocatable.cpu}m
                  </p>
                </div>
                <div className="flex min-h-[86px] flex-wrap content-start gap-2 p-3">
                  <AnimatePresence initial={false}>{mine.map(chip)}</AnimatePresence>
                  {mine.length === 0 ? <p className="text-sm text-ink-soft">{t('viz.noPods')}</p> : null}
                </div>
              </div>
            );
          })}
        </div>
      </LayoutGroup>

      {/* 持ち主の系図と、Service が繋いでいる Pod */}
      {graph.nodes.length > 0 ? (
        <section aria-label={t('viz.ownership')} className="mt-4 border-4 border-wood-dark bg-cream p-3">
          <p className="text-sm font-bold text-ink-soft">{t('viz.ownership')}</p>
          <p className="text-xs text-ink-soft">{t('viz.ownershipLead')}</p>
          <div className="mt-2 overflow-auto">
            <svg width={graph.width} height={graph.height} role="img" aria-label={t('viz.ownership')}>
              {graph.edges.map((edge) => {
                const from = byId.get(edge.from);
                const to = byId.get(edge.to);
                if (!from || !to) return null;
                // Service は右にあるので、線は Service の左端から Pod の右端へ伸びる
                const [a, b] = edge.type === 'serve' ? [to, from] : [from, to];
                const x1 = a.x + GRAPH.nodeW;
                const y1 = a.y + GRAPH.nodeH / 2;
                const x2 = b.x;
                const y2 = b.y + GRAPH.nodeH / 2;
                const mid = (x1 + x2) / 2;
                return (
                  <path
                    key={`${edge.from}->${edge.to}`}
                    data-edge={edge.type}
                    d={`M ${String(x1)} ${String(y1)} C ${String(mid)} ${String(y1)}, ${String(mid)} ${String(y2)}, ${String(x2)} ${String(y2)}`}
                    fill="none"
                    stroke={edge.type === 'serve' ? 'var(--ok)' : 'var(--wood)'}
                    strokeWidth={edge.type === 'serve' ? 3 : 2.5}
                    strokeDasharray={edge.type === 'serve' ? '6 4' : undefined}
                  />
                );
              })}
              {graph.nodes.map((n) => (
                <g key={n.id} transform={`translate(${String(n.x)} ${String(n.y)})`} data-generation={n.generation}>
                  <rect
                    width={GRAPH.nodeW}
                    height={GRAPH.nodeH}
                    fill={
                      n.look
                        ? LOOK_COLOR[n.look]
                        : n.kind === 'Service'
                          ? 'var(--gold)'
                          : n.generation !== undefined
                            ? GENERATION_COLOR[n.generation]
                            : 'var(--cream-dark)'
                    }
                    stroke="var(--wood-dark)"
                    strokeWidth={2}
                  />
                  {n.look && n.generation !== undefined ? (
                    <rect width={7} height={GRAPH.nodeH} fill={GENERATION_COLOR[n.generation]} stroke="var(--wood-dark)" strokeWidth={1} />
                  ) : null}
                  <text x={10} y={17} fontSize={11} fontFamily="monospace" fill="var(--ink)">
                    {n.look
                      ? `${n.name.slice(-11)} ${n.look}`
                      : `${n.kind === 'ReplicaSet' ? 'RS' : n.kind} ${n.name}`.slice(0, 22)}
                  </text>
                  <title>{`${n.kind}/${n.name}${n.look ? ` (${n.look})` : ''}${n.generation ? ` [${n.generation}]` : ''}`}</title>
                </g>
              ))}
            </svg>
          </div>
        </section>
      ) : null}
    </div>
  );
}
