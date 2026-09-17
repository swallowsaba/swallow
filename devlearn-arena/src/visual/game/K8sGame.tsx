import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { isReady } from '@/engines/k8s/kubelet';
import type { ClusterState, Pod } from '@/engines/k8s/types';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';
import {
  activationOrder, activeComponents, GENERATION_COLOR, podGeneration, podLook, rollingDeployments,
  type Component, type Generation, type PodLook,
} from '../clusterModel';
import { k8sCommands, type RunCommand } from '../commands';
import { clip, type Box } from '../sceneKit';
import { EmptyWorld, GameStage } from './GameStage';
import { CELL_W, FIELD_HEAD, layoutRanch, waitingPods } from './k8sRanch';
import { Sprite } from './pixel';
import { CONTAINER, containerPalette, HERO, heroPalette, INK, WORKER, workerPalette } from './sprites';
import { BAD, Bubble, Castle, Clickable, Field, GOLD, Kiosk, OK, Sign } from './scenery';

interface Props {
  cluster: ClusterState | null;
  previous?: ClusterState | null;
  onCommand?: RunCommand;
}

/** 港湾管理棟で働く係。見た目と役目 */
const STAFF: Record<Component, { role: string; shirt: string; hat: string }> = {
  apiserver: { role: '受付', shirt: '#c0604a', hat: '#8f4b3f' },
  etcd: { role: '記録帳', shirt: '#3f6f8f', hat: '#2c4a6b' },
  controller: { role: '見張り係', shirt: '#6f8f3f', hat: '#3f6a2b' },
  scheduler: { role: '配置係', shirt: '#8f6f3f', hat: '#f2c14e' },
};

/** 命令が係から係へ伝わる間隔（秒） */
const RELAY_STEP = 0.35;

const CONTAINER_TONE: Record<PodLook, [string, string]> = {
  Pending: ['#ddc79f', '#b8a27a'],
  Creating: ['#f6d27a', '#c9a24a'],
  Running: ['#79c46a', '#4f9a44'],
  BackOff: ['#f0a293', '#c0604a'],
  Completed: ['#9cc9e6', '#6a9cc0'],
  Failed: ['#c9c9c9', '#8f8f8f'],
};

const LOOK_TEXT: Record<PodLook, string> = {
  Pending: '#5d4630',
  Creating: '#8a5f10',
  Running: '#2f6a25',
  BackOff: '#a5311f',
  Completed: '#2c5a80',
  Failed: '#5d5d5d',
};

interface SlimeProps {
  pod: Pod;
  x: number;
  y: number;
  animate: boolean;
  fresh: boolean;
  generation: Generation | null;
  onCommand?: RunCommand;
}

/**
 * コンテナ（Pod）。塗りの色と下の文字で状態を出す。
 * 置き場所が決まると待ち場からクレーンで埠頭へ運ばれ、作られたものは上から降ろされ、消されたものは引き上げられて消える。
 */
function Slime({ pod, x, y, animate, fresh, generation, onCommand }: SlimeProps) {
  const t = useT();
  const { look, detail } = podLook(pod);
  const [body, shade] = CONTAINER_TONE[look];
  const name = pod.metadata.name;
  const label = look === 'BackOff' ? detail : look;
  return (
    <motion.g
      data-pod={name}
      data-look={look}
      data-generation={generation ?? undefined}
      initial={animate && fresh ? { x, y: y - 120, opacity: 0 } : false}
      animate={{ x, y, opacity: 1, scale: 1 }}
      exit={animate ? { opacity: 0, scale: 1.8, transition: { duration: 0.6 } } : undefined}
      transition={animate ? { type: 'spring', stiffness: 120, damping: 14 } : { duration: 0 }}
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
    >
      <Clickable command={k8sCommands.describePod(name)} onCommand={onCommand} label={`${name} / ${detail}`}>
        <rect x={0} y={0} width={CELL_W - 4} height={70} fill="transparent" />
        <ellipse cx={30} cy={41} rx={18} ry={4} fill="rgba(0,0,0,0.22)" />
        <motion.g
          animate={animate && look === 'Running' ? { y: [0, -1, 0] } : { y: 0 }}
          transition={animate && look === 'Running' ? { repeat: Infinity, duration: 1.4, ease: 'easeInOut' } : { duration: 0 }}
        >
          <Sprite map={CONTAINER} palette={containerPalette(body, shade)} x={9} y={4} scale={3} />
          {look === 'BackOff' || look === 'Failed' ? (
            <text x={30} y={4} fontSize={14} fontWeight={900} textAnchor="middle" fill={BAD}>
              ✗
            </text>
          ) : look === 'Creating' || look === 'Pending' ? (
            <text x={30} y={4} fontSize={12} fontWeight={900} textAnchor="middle" fill={INK}>
              …
            </text>
          ) : null}
          {generation !== null ? (
            <g>
              <rect x={20} y={-6} width={20} height={12} fill={GENERATION_COLOR[generation]} stroke={INK} strokeWidth={2} />
              <text x={30} y={1} fontSize={9} fontWeight={900} textAnchor="middle" dominantBaseline="middle" fill={INK}>
                {t(generation === 'new' ? 'viz.genNew' : 'viz.genOld')}
              </text>
            </g>
          ) : null}
        </motion.g>
        <text x={30} y={55} fontSize={10} fontWeight={700} textAnchor="middle" fontFamily="var(--f-mono)" fill={INK} stroke="#f6e8cd" strokeWidth={3} paintOrder="stroke">
          {clip(name.length > 10 ? name.slice(-10) : name, CELL_W, 10)}
        </text>
        <text x={30} y={67} fontSize={9} fontWeight={900} textAnchor="middle" fontFamily="var(--f-mono)" fill={LOOK_TEXT[look]} stroke="#f6e8cd" strokeWidth={3} paintOrder="stroke">
          {clip(label, CELL_W + 6, 9)}
        </text>
      </Clickable>
      {onCommand ? (
        <Clickable command={k8sCommands.deletePod(name)} onCommand={onCommand} label={t('viz.deletePod', { name })} data-delete={name}>
          <circle cx={50} cy={8} r={8} fill="#f6e8cd" stroke={BAD} strokeWidth={2.5} />
          <text x={50} y={9} fontSize={11} fontWeight={900} textAnchor="middle" dominantBaseline="middle" fill={BAD}>
            ×
          </text>
        </Clickable>
      ) : null}
    </motion.g>
  );
}

/**
 * Kubernetes のコンテナ港。
 * 港湾管理棟の4人の係（受付・記録帳・見張り係・配置係）は、コマンドのあと仕事をした順に「！」を出す。
 * コンテナは Pod。置き場所待ちの間は管理棟の横の待機ヤードにいて、配置係が決めるとノード（埠頭）へ運ばれる。
 * 埠頭の遮断機を押すと cordon / uncordon、配送計画の看板の ± で scale、コンテナで describe、× で delete を打つ。
 */
export function K8sGame({ cluster, previous, onCommand }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const active = useMemo(() => activeComponents(previous, cluster), [previous, cluster]);
  const ranch = useMemo(() => (cluster === null ? null : layoutRanch(cluster)), [cluster]);

  if (cluster === null || ranch === null) {
    return <EmptyWorld title={t('game.k8s.title')} lead={t('game.k8s.noCluster')} testId="game-k8s" />;
  }

  const relay = activationOrder(active);
  const pods = [...cluster.pods.values()];
  const waiting = waitingPods(cluster);
  const rolling = rollingDeployments(cluster);
  const generationFor = (pod: Pod): Generation | null => {
    const rs = pod.metadata.ownerReferences.find((o) => o.kind === 'ReplicaSet');
    const owner = rs ? cluster.replicaSets.get(`${pod.metadata.namespace}/${rs.name}`)?.metadata.ownerReferences[0]?.name : undefined;
    return owner !== undefined && rolling.has(owner) ? podGeneration(cluster, pod) : null;
  };
  const isFresh = (pod: Pod) => previous != null && !previous.pods.has(`${pod.metadata.namespace}/${pod.metadata.name}`);
  const byIp = new Map(pods.filter((p) => p.status.podIP !== null).map((p) => [p.status.podIP, p.metadata.name]));

  const occupied: Box[] = [
    { x: 0, y: 0, w: ranch.pen.x + ranch.pen.w + 30, h: Math.max(ranch.castle.y + ranch.castle.h, ranch.pen.y + ranch.pen.h) + 20 },
    ...ranch.banners.map((b) => ({ x: b.x, y: b.y, w: 240, h: 40 })),
    ...ranch.fields.map((f) => f.box),
    ...ranch.services.map((s) => ({ x: s.box.x - 90, y: s.box.y - 30, w: s.box.w + 120, h: s.box.h + 60 })),
  ];

  return (
    <GameStage
      title={t('game.k8s.title')}
      testId="game-k8s"
      width={ranch.width}
      height={ranch.height}
      occupied={occupied}
      interactive={onCommand !== undefined}
      hud={
        <>
          <span className="font-mono text-xs font-bold text-cream" data-testid="game-summary">
            {t('game.k8s.summary', { tick: cluster.tick, nodes: cluster.nodes.size, pods: pods.length })}
          </span>
          {onCommand ? (
            <button
              type="button"
              className="knob px-2 py-0.5 text-xs"
              title={k8sCommands.advance()}
              onClick={() => {
                onCommand(k8sCommands.advance());
              }}
            >
              {t('game.k8s.advance')}
            </button>
          ) : null}
        </>
      }
      footer={
        waiting.some((p) => p.status.message !== null) ? (
          <div className="mt-2">
            <p className="text-xs font-extrabold text-[var(--bad)]">{t('game.k8s.unplaced')}</p>
            <ul className="border-l-4 border-[var(--bad)] px-2">
              {waiting
                .filter((p) => p.status.message !== null)
                .map((pod) => (
                  <li key={pod.metadata.name} className="font-mono text-xs text-[var(--bad)]">
                    {t('viz.unplacedLine', { name: pod.metadata.name, reason: pod.status.message ?? '' })}
                  </li>
                ))}
            </ul>
          </div>
        ) : undefined
      }
    >
      {/* 自分（kubectl を打つ人） */}
      <g aria-hidden>
        <Sprite map={HERO} palette={heroPalette('#c0604a')} x={ranch.hero.x} y={ranch.hero.y} scale={3} />
        <text x={ranch.hero.x + 18} y={ranch.hero.y + 64} fontSize={11} fontWeight={800} textAnchor="middle" fontFamily="var(--f-mono)" fill={INK} stroke="#f6e8cd" strokeWidth={3} paintOrder="stroke">
          kubectl
        </text>
        {relay.length > 0 ? (
          <line x1={ranch.hero.x + 40} x2={ranch.castle.x} y1={ranch.hero.y + 24} y2={ranch.hero.y + 24} stroke={GOLD} strokeWidth={4} strokeDasharray="6 5" />
        ) : null}
      </g>

      {/* 港湾管理棟と4人の係 */}
      <Castle {...ranch.castle} />
      <Sign cx={ranch.castle.x + ranch.castle.w / 2} y={ranch.castle.y + 14} text={t('game.k8s.castle')} strong />
      {ranch.booths.map(({ component, box }) => {
        const step = relay.indexOf(component);
        const on = step !== -1;
        const staff = STAFF[component];
        return (
          <g key={component} data-part={component} data-active={on ? 'true' : 'false'} data-order={on ? step : undefined}>
            <motion.rect
              x={box.x}
              y={box.y}
              width={box.w}
              height={box.h}
              stroke={on ? BAD : INK}
              strokeWidth={on ? 4 : 3}
              initial={false}
              animate={{ fill: on ? '#ffe69a' : '#f1dfbc' }}
              transition={{ duration: 0.3, delay: animate && on ? step * RELAY_STEP : 0 }}
            />
            <motion.g
              key={on ? `${component}-on-${String(cluster.tick)}-${String(pods.length)}` : `${component}-off`}
              initial={false}
              animate={animate && on ? { y: [0, -14, 0, -6, 0] } : { y: 0 }}
              transition={{ duration: 0.7, delay: animate && on ? step * RELAY_STEP : 0 }}
            >
              <Sprite map={WORKER} palette={workerPalette(staff.shirt, staff.hat)} x={box.x + 10} y={box.y + 26} scale={3} />
              {on ? (
                <text x={box.x + 28} y={box.y + 20} fontSize={18} fontWeight={900} textAnchor="middle" fill={BAD}>
                  ！
                </text>
              ) : null}
            </motion.g>
            <text x={box.x + 54} y={box.y + 42} fontSize={13} fontWeight={800} fill={INK}>
              {staff.role}
            </text>
            <text x={box.x + 54} y={box.y + 60} fontSize={11} fontFamily="var(--f-mono)" fill="#5d4630">
              {component}
            </text>
            {component === 'scheduler' && waiting.length > 0 ? (
              <text x={box.x + 54} y={box.y + 80} fontSize={10} fontWeight={800} fill={BAD}>
                → {waiting.length}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* 置き場所待ちの囲い */}
      <g aria-hidden>
        <rect {...{ x: ranch.pen.x, y: ranch.pen.y, width: ranch.pen.w, height: ranch.pen.h }} fill="#d9c39a" stroke="#7a5230" strokeWidth={4} strokeDasharray="10 6" />
        <text x={ranch.pen.x + 10} y={ranch.pen.y + 18} fontSize={12} fontWeight={800} fill={INK}>
          {t('game.k8s.waiting')} ({waiting.length})
        </text>
      </g>

      {/* 群れの看板（Deployment）。± であるべき数を変える */}
      {[...cluster.deployments.values()]
        .sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1))
        .map((d) => {
          const banner = ranch.banners.find((b) => b.name === d.metadata.name);
          if (!banner) return null;
          const ready = pods.filter(
            (p) => isReady(p) && Object.entries(d.spec.selector).every(([k, v]) => p.metadata.labels[k] === v),
          ).length;
          const isRolling = rolling.has(d.metadata.name);
          return (
            <g key={d.metadata.name} data-deployment={d.metadata.name} data-rolling={isRolling ? 'true' : 'false'}>
              <rect x={banner.x} y={banner.y} width={236} height={34} fill={isRolling ? '#bfe3f5' : '#f6e8cd'} stroke={INK} strokeWidth={3} />
              <rect x={banner.x} y={banner.y} width={8} height={34} fill="#7a5230" />
              <text x={banner.x + 16} y={banner.y + 13} fontSize={12} fontWeight={800} fontFamily="var(--f-mono)" fill={INK}>
                {clip(`🚩 ${d.metadata.name}`, 150, 12)}
              </text>
              <text x={banner.x + 16} y={banner.y + 28} fontSize={10} fontWeight={700} fontFamily="var(--f-mono)" fill={ready >= d.spec.replicas ? OK : BAD}>
                {`${String(d.spec.replicas)} / ${String(ready)} Ready${isRolling ? ` ${t('viz.rolling')}` : ''}`}
              </text>
              {onCommand ? (
                <>
                  <Clickable command={d.spec.replicas > 0 ? k8sCommands.scale(d.metadata.name, d.spec.replicas - 1) : null} onCommand={onCommand} label={t('viz.scaleDown', { name: d.metadata.name })} data-scale="down">
                    <rect x={banner.x + 170} y={banner.y + 5} width={26} height={24} fill="#f1dfbc" stroke={INK} strokeWidth={2} opacity={d.spec.replicas > 0 ? 1 : 0.4} />
                    <text x={banner.x + 183} y={banner.y + 18} fontSize={16} fontWeight={900} textAnchor="middle" dominantBaseline="middle" fill={INK}>
                      −
                    </text>
                  </Clickable>
                  <Clickable command={k8sCommands.scale(d.metadata.name, d.spec.replicas + 1)} onCommand={onCommand} label={t('viz.scaleUp', { name: d.metadata.name })} data-scale="up">
                    <rect x={banner.x + 202} y={banner.y + 5} width={26} height={24} fill={GOLD} stroke={INK} strokeWidth={2} />
                    <text x={banner.x + 215} y={banner.y + 18} fontSize={16} fontWeight={900} textAnchor="middle" dominantBaseline="middle" fill={INK}>
                      +
                    </text>
                  </Clickable>
                </>
              ) : null}
            </g>
          );
        })}

      {/* ノードの土地 */}
      {ranch.fields.map(({ node: name, box }) => {
        const node = cluster.nodes.get(name);
        if (!node) return null;
        const mine = pods.filter((p) => p.status.nodeName === name);
        const used = mine.reduce((sum, p) => sum + p.spec.containers.reduce((n, c) => n + c.requests.cpu, 0), 0);
        const ratio = Math.min(1, used / Math.max(1, node.status.allocatable.cpu));
        const closed = node.spec.unschedulable;
        return (
          <g key={name} data-node={name} data-cordoned={closed ? 'true' : 'false'}>
            <Field {...box} gateOpen={!closed} dim={closed} />
            <Clickable command={k8sCommands.toggleCordon(name, closed)} onCommand={onCommand} label={t(closed ? 'viz.uncordon' : 'viz.cordon')} data-gate={name}>
              <rect x={box.x - 18} y={box.y + box.h / 2 - 28} width={36} height={56} fill="transparent" />
            </Clickable>
            <rect x={box.x + 10} y={box.y + 10} width={box.w - 20} height={40} fill="#f6e8cd" stroke={INK} strokeWidth={2.5} />
            <text x={box.x + 20} y={box.y + 26} fontSize={13} fontWeight={800} fontFamily="var(--f-mono)" fill={INK}>
              {`🖳 ${clip(name, 140, 13)}`}
            </text>
            <text x={box.x + box.w - 20} y={box.y + 26} fontSize={10} fontWeight={800} textAnchor="end" fontFamily="var(--f-mono)" fill={closed ? BAD : OK}>
              {closed ? `SchedulingDisabled（${t('game.k8s.cordoned')}）` : 'Ready'}
            </text>
            <rect x={box.x + 20} y={box.y + 34} width={box.w - 120} height={9} fill="#fff" stroke={INK} strokeWidth={1.5} />
            <rect x={box.x + 21} y={box.y + 35} width={Math.max(0, (box.w - 122) * ratio)} height={7} fill={ratio > 0.85 ? BAD : GOLD} />
            <text x={box.x + box.w - 20} y={box.y + 43} fontSize={10} textAnchor="end" fontFamily="var(--f-mono)" fill={INK}>
              {`cpu ${String(used)}/${String(node.status.allocatable.cpu)}m`}
            </text>
            {mine.length === 0 ? (
              <text x={box.x + 20} y={box.y + FIELD_HEAD + 30} fontSize={12} fill="#3f6a2b" fontWeight={700}>
                {t('viz.noPods')}
              </text>
            ) : null}
          </g>
        );
      })}

      {/* Service の窓口と、Endpoints に載っているコンテナへの配線 */}
      {[...cluster.services.values()].map((svc) => {
        const spot = ranch.services.find((s) => s.name === svc.metadata.name);
        if (!spot) return null;
        const from = { x: spot.box.x, y: spot.box.y + spot.box.h / 2 };
        const targets = svc.status.endpoints
          .map((ip) => byIp.get(ip))
          .filter((n): n is string => n !== undefined)
          .map((n) => ({ name: n, at: ranch.pods.get(n) }))
          .filter((x): x is { name: string; at: { x: number; y: number } } => x.at !== undefined);
        return (
          <g key={svc.metadata.name} data-service={svc.metadata.name} data-endpoints={targets.length}>
            {targets.map(({ name, at }) => (
              <path
                key={name}
                data-rope={name}
                d={`M ${String(from.x)} ${String(from.y)} Q ${String((from.x + at.x + 30) / 2)} ${String(Math.max(from.y, at.y) + 40)} ${String(at.x + 30)} ${String(at.y + 30)}`}
                fill="none"
                stroke={OK}
                strokeWidth={3}
                strokeDasharray="7 5"
              />
            ))}
            <Kiosk {...spot.box} alarm={targets.length === 0} />
            <Sign cx={spot.box.x + spot.box.w / 2} y={spot.box.y + spot.box.h + 6} text={t('game.k8s.service', { name: svc.metadata.name })} maxWidth={180} />
            {targets.length === 0 ? <Bubble x={spot.box.x + spot.box.w / 2} y={spot.box.y - 6} text={t('viz.noEndpoints')} color={BAD} maxWidth={200} /> : null}
          </g>
        );
      })}

      {/* コンテナ。待機ヤードか、置かれたノードの埠頭にある */}
      <AnimatePresence initial={false}>
        {pods
          .sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1))
          .map((pod) => {
            const at = ranch.pods.get(pod.metadata.name);
            if (!at) return null;
            return (
              <Slime
                key={pod.metadata.name}
                pod={pod}
                x={at.x}
                y={at.y}
                animate={animate}
                fresh={isFresh(pod)}
                generation={generationFor(pod)}
                onCommand={onCommand}
              />
            );
          })}
      </AnimatePresence>
    </GameStage>
  );
}
