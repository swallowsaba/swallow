import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import type { DiagramId } from '@/engines/lesson/diagramIds';
import { HUD } from '@/features/park/hud/theme';
import { Icon } from '@/ui/Icon';
import { PLAYGROUNDS } from './playgrounds';
import type { Playground, Sim } from './sim';
import { DesiredVsActualView } from './views/DesiredVsActualView';
import { FileTreeView } from './views/FileTreeView';
import { GitThreeAreasView } from './views/GitThreeAreasView';
import { PacketHopsView } from './views/PacketHopsView';
import { PodInNodeView } from './views/PodInNodeView';
import { PodLifecycleView } from './views/PodLifecycleView';
import { ServiceEndpointsView } from './views/ServiceEndpointsView';
import type { ViewProps } from './views/helpers';

/**
 * 遊べる図解の枠（REWORK 6-2）。
 *
 * 上に目標、真ん中に図、下に「いまの操作 = コマンド」と「端末で打つ」。
 * 図の中身は模型（`Playground`）の状態を描くだけで、操作は模型に渡す。
 * 時間がかかる変化（監督が作り直す、など）は、少しずつ進めて動きで見せる。
 */

/** 落ち着くまでの 1 歩の間隔。速すぎると何が起きたか追えない */
const SETTLE_MS = 650;

const VIEWS: Record<DiagramId, ComponentType<ViewProps<never>>> = {
  'pod-in-node': PodInNodeView,
  'desired-vs-actual': DesiredVsActualView,
  'pod-lifecycle': PodLifecycleView,
  'service-endpoints': ServiceEndpointsView,
  'git-three-areas': GitThreeAreasView,
  'packet-hops': PacketHopsView,
  'file-tree': FileTreeView,
};

interface Props {
  id: DiagramId;
  /** 「端末で打つ」を押したとき。学習者の端末にコマンドを入れる（走らせはしない） */
  onType?: ((command: string) => void) | undefined;
}

/** 目標に届いたときに弾ける光の粒 */
function Burst() {
  const dots = Array.from({ length: 14 }, (_, i) => (i / 14) * Math.PI * 2);
  return (
    <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2">
      {dots.map((angle) => (
        <motion.span
          key={angle}
          className="absolute block h-1.5 w-1.5 rounded-full"
          style={{ background: HUD.warn, boxShadow: `0 0 6px ${HUD.warn}` }}
          initial={{ x: 0, y: 0, opacity: 1, scale: 1 }}
          animate={{ x: Math.cos(angle) * 34, y: Math.sin(angle) * 34, opacity: 0, scale: 0.4 }}
          transition={{ duration: 0.9, ease: 'easeOut' }}
        />
      ))}
    </span>
  );
}

export function PlaygroundFrame({ id, onType }: Props) {
  const playground = PLAYGROUNDS[id] as Playground<unknown>;
  const View = VIEWS[id] as ComponentType<ViewProps<unknown>>;
  const [sim, setSim] = useState<Sim>(() => playground.start());
  const [command, setCommand] = useState<string | null>(null);
  const [refused, setRefused] = useState<{ moveId: string; reason: string; key: number } | null>(null);
  const [stars, setStars] = useState(0);
  const [burst, setBurst] = useState(0);

  // 図解を切り替えたら、はじめから
  useEffect(() => {
    setSim(playground.start());
    setCommand(null);
    setRefused(null);
  }, [playground]);

  const next = useMemo(() => playground.settle?.(sim) ?? null, [playground, sim]);
  const busy = next !== null;
  const view = useMemo(() => playground.view(sim), [playground, sim]);
  const moves = useMemo(() => playground.moves(sim), [playground, sim]);
  const reached = !busy && playground.reached(sim);

  // 仕組みが落ち着くまで、少しずつ時間を進める。歯車が回って作り直される所を見せる
  useEffect(() => {
    if (next === null) return;
    const timer = setTimeout(() => {
      setSim(next);
    }, SETTLE_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [next]);

  // 目標に届いた瞬間に、星を 1 つ足して粒を弾かせる
  useEffect(() => {
    if (!reached) return;
    setStars((n) => n + 1);
    setBurst((n) => n + 1);
  }, [reached]);

  const act = (moveId: string): void => {
    if (busy) return;
    const applied = playground.apply(sim, moveId);
    if (applied.command !== '') setCommand(applied.command);
    if (!applied.ok) {
      setRefused((was) => ({ moveId, reason: applied.reason ?? '', key: (was?.key ?? 0) + 1 }));
      setSim(applied.sim);
      return;
    }
    setRefused(null);
    setSim(applied.sim);
  };

  return (
    <div data-testid="playground" data-diagram={id} data-reached={reached ? 'true' : undefined} className="flex flex-col gap-2">
      <div className="flex items-center gap-2 rounded-md px-2.5 py-2" style={{ background: HUD.accentFill, border: `1px solid ${HUD.accentEdge}` }}>
        <span className="relative grid h-6 w-6 shrink-0 place-items-center" style={{ color: reached ? HUD.warn : HUD.muted }}>
          <Icon name={reached ? 'star' : 'starOutline'} size={18} />
          <AnimatePresence>{burst > 0 && reached ? <Burst key={burst} /> : null}</AnimatePresence>
        </span>
        <span data-testid="playground-goal" className="min-w-0 flex-1 text-[13px] font-bold leading-snug">
          {playground.goal}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-[12px]" style={{ color: HUD.warn }} aria-label="達成した数">
          <Icon name="star" size={12} />
          <span className="relative inline-block h-4 w-3 overflow-hidden">
            <AnimatePresence initial={false}>
              <motion.span
                key={stars}
                data-testid="playground-stars"
                className="absolute inset-0 text-center"
                initial={{ y: 14, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -14, opacity: 0 }}
                transition={{ duration: 0.35 }}
              >
                {stars}
              </motion.span>
            </AnimatePresence>
          </span>
        </span>
        <button
          type="button"
          data-testid="playground-reset"
          title="はじめから"
          onClick={() => {
            setSim(playground.start());
            setCommand(null);
            setRefused(null);
          }}
          className="grid h-6 w-6 shrink-0 place-items-center rounded"
          style={{ color: HUD.soft, background: HUD.fill }}
        >
          <Icon name="replay" size={12} />
        </button>
      </div>

      <div className="relative rounded-md p-2.5" style={{ background: 'rgba(5,9,14,0.7)', border: `1px solid ${HUD.line}`, boxShadow: 'inset 0 0 24px rgba(47,143,216,0.08)' }}>
        <View view={view} moves={moves} act={act} busy={busy} refused={refused} />
      </div>

      <AnimatePresence>
        {refused === null ? null : (
          <motion.p
            key={refused.key}
            data-testid="playground-refused"
            className="rounded px-2 py-1 text-[12px] leading-snug"
            style={{ color: HUD.bad, background: 'rgba(255,138,122,0.08)', border: '1px solid rgba(255,138,122,0.3)' }}
            initial={{ x: -6, opacity: 0 }}
            animate={{ x: [6, -4, 2, 0], opacity: 1 }}
            transition={{ duration: 0.35 }}
          >
            {refused.reason}
          </motion.p>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-2 text-[12px]">
        <span style={{ color: HUD.muted }}>いまの操作 =</span>
        <code data-testid="playground-command" className="min-w-0 flex-1 truncate font-mono" style={{ color: command === null ? HUD.dim : HUD.accentText }}>
          {command ?? '（図の中で手を動かすと、ここに同じコマンドが出る）'}
        </code>
        {command === null || onType === undefined ? null : (
          <button
            type="button"
            data-testid="playground-type"
            onClick={() => {
              onType(command);
            }}
            className="flex h-7 shrink-0 items-center gap-1 rounded px-2"
            style={{ border: `1px solid ${HUD.accentEdge}`, color: HUD.accentText }}
          >
            <Icon name="terminal" size={12} />
            端末で打つ
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-0.5 text-[12px] leading-relaxed" style={{ color: HUD.soft }}>
        {playground.notes.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
