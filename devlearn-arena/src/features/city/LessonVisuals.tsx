import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import type { Facility } from '@/content/city';
import type { ShellState } from '@/engines/kernel/registry';
import { demoFrames } from '@/engines/lesson/demo';
import type { MissionTrack } from '@/engines/lesson/types';
import { WorldView } from '@/features/park/WorldView';
import { tabForTrack } from '@/features/park/visualTabs';
import { useT } from '@/i18n/useT';
import { CITY_COLOR } from '@/visual/game/cityColor';
import { FacilityPlot, PLOT_H, PLOT_W } from '@/visual/game/cityArt';

/**
 * 施設の学習と依頼に添える図解。文章だけで終わらせず、街の絵と実際の状態図で「何が起きるのか」を見せる。
 */

const INK = '#2b2118';

/** 絵の枠 */
function Frame({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return (
    <figure data-testid={testId} className="border-4 border-wood-dark bg-[#eaf4df] shadow-[4px_4px_0_rgba(0,0,0,0.15)]">
      <figcaption className="bg-[var(--wood)] px-3 py-1 text-xs font-extrabold text-cream">🖼 {label}</figcaption>
      <div className="p-2">{children}</div>
    </figure>
  );
}

/** 小さな家（斜め見下ろし風） */
function House({ x, y, color, roof }: { x: number; y: number; color: string; roof: string }) {
  return (
    <g>
      <polygon points={`${String(x)},${String(y + 14)} ${String(x + 22)},${String(y + 24)} ${String(x + 22)},${String(y + 50)} ${String(x)},${String(y + 40)}`} fill={color} stroke={INK} strokeWidth={1.5} />
      <polygon points={`${String(x + 22)},${String(y + 24)} ${String(x + 44)},${String(y + 14)} ${String(x + 44)},${String(y + 40)} ${String(x + 22)},${String(y + 50)}`} fill={color} stroke={INK} strokeWidth={1.5} style={{ filter: 'brightness(0.85)' }} />
      <polygon points={`${String(x - 3)},${String(y + 15)} ${String(x + 22)},${String(y - 4)} ${String(x + 47)},${String(y + 15)} ${String(x + 22)},${String(y + 26)}`} fill={roof} stroke={INK} strokeWidth={1.5} />
    </g>
  );
}

function Face({ x, y, mood }: { x: number; y: number; mood: 'angry' | 'happy' }) {
  return (
    <text x={x} y={y} fontSize={22} textAnchor="middle">
      {mood === 'angry' ? '😠' : '😊'}
    </text>
  );
}

/** 1. 困りごと：施設が無い街で、住民が困っている場面 */
export function TroubleScene({ facility, track, animate }: { facility: Facility; track: MissionTrack; animate: boolean }) {
  const t = useT();
  const color = CITY_COLOR[track];
  return (
    <Frame label={t('visual.trouble', { name: facility.name })} testId="visual-trouble">
      <svg viewBox="0 0 360 150" className="h-auto w-full" role="img" aria-label={t('visual.trouble', { name: facility.name })}>
        <rect x={0} y={96} width={360} height={54} fill="#8cc063" />
        <rect x={0} y={112} width={360} height={16} fill="#8a8f96" />
        <line x1={0} x2={360} y1={120} y2={120} stroke="#fff" strokeDasharray="10 8" strokeWidth={2} />
        <House x={20} y={52} color="#f2e4cf" roof={color.roof} />
        <House x={80} y={58} color="#e8c9a2" roof="#7a4f3f" />
        {/* 施設の予定地 */}
        <g transform="translate(160 30) scale(0.55)">
          <FacilityPlot kind={facility.building} track={track} state="locked" x={0} y={0} animate={false} />
        </g>
        <g>
          <polygon points="290,70 305,44 320,70" fill="#f2c14e" stroke={INK} strokeWidth={2} />
          <text x={305} y={66} fontSize={16} fontWeight={900} textAnchor="middle" fill={INK}>
            !
          </text>
          <rect x={303} y={70} width={4} height={30} fill="#6b4a2f" />
        </g>
        <motion.g
          animate={animate ? { y: [0, -3, 0] } : { y: 0 }}
          transition={animate ? { repeat: Infinity, duration: 1.2 } : { duration: 0 }}
        >
          <Face x={140} y={108} mood="angry" />
          <Face x={245} y={108} mood="angry" />
          <rect x={112} y={4} width={176} height={26} rx={12} fill="#fff" stroke={INK} strokeWidth={2} />
          <text x={200} y={22} fontSize={12} fontWeight={800} textAnchor="middle" fill={INK}>
            {t('visual.troubleBubble')}
          </text>
        </motion.g>
      </svg>
    </Frame>
  );
}

/** 2. 何なのか：IT の言葉と、街の施設を並べる */
export function AnalogyVisual({ facility, track }: { facility: Facility; track: MissionTrack }) {
  const t = useT();
  return (
    <Frame label={t('visual.analogy')} testId="visual-analogy">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex h-full flex-col items-center justify-center gap-2 border-2 border-dashed border-wood-dark bg-[#1d252c] p-3 text-center">
          <span className="text-xs font-bold text-[#9fd67a]">💻 {t('visual.itWorld')}</span>
          <code className="font-mono text-base font-extrabold text-white">{facility.concept}</code>
        </div>
        <span className="text-3xl font-black text-wood-dark" aria-hidden>
          ⇄
        </span>
        <div className="flex flex-col items-center gap-1 border-2 border-wood-dark bg-white p-2 text-center">
          <span className="text-xs font-bold text-ink-soft">🏙 {t('visual.cityWorld')}</span>
          <svg viewBox={`0 0 ${String(PLOT_W)} ${String(PLOT_H)}`} className="h-24 w-auto" aria-hidden>
            <FacilityPlot kind={facility.building} track={track} state="complete" x={0} y={0} animate={false} />
          </svg>
          <span className="plate px-2 text-xs font-extrabold">{facility.name}</span>
        </div>
      </div>
    </Frame>
  );
}

/** 3. なぜ必要か：無い街とある街を比べる */
export function WhyVisual({ facility, track }: { facility: Facility; track: MissionTrack }) {
  const t = useT();
  const side = (ok: boolean) => (
    <div className={`flex flex-col items-center gap-1 border-4 p-2 ${ok ? 'border-[var(--ok)] bg-[#dff0cf]' : 'border-[var(--bad)] bg-[#fbe3de]'}`}>
      <span className="text-sm font-extrabold">{ok ? t('visual.with', { name: facility.name }) : t('visual.without', { name: facility.name })}</span>
      <svg viewBox={`0 0 ${String(PLOT_W)} ${String(PLOT_H + 24)}`} className="h-28 w-auto" aria-hidden>
        <FacilityPlot kind={facility.building} track={track} state={ok ? 'complete' : 'locked'} x={0} y={0} animate={false} />
        <Face x={30} y={PLOT_H + 20} mood={ok ? 'happy' : 'angry'} />
        <Face x={75} y={PLOT_H + 20} mood={ok ? 'happy' : 'angry'} />
        <Face x={120} y={PLOT_H + 20} mood={ok ? 'happy' : 'angry'} />
      </svg>
      <span className="text-xs font-bold">{ok ? t('visual.withLead') : t('visual.withoutLead')}</span>
    </div>
  );
  return (
    <Frame label={t('visual.why')} testId="visual-why">
      <div className="grid grid-cols-2 gap-2">
        {side(false)}
        {side(true)}
      </div>
    </Frame>
  );
}

/** 4. 仕組み：手順を道沿いの停留所として並べ、荷車がいまの手順まで走る */
export function HowRoute({ count, index, track, animate }: { count: number; index: number; track: MissionTrack; animate: boolean }) {
  const t = useT();
  const width = 360;
  const gap = count <= 1 ? 0 : (width - 60) / (count - 1);
  const xOf = (i: number) => 30 + i * gap;
  const color = CITY_COLOR[track];
  return (
    <Frame label={t('visual.route', { a: index + 1, b: count })} testId="visual-route">
      <svg viewBox={`0 0 ${String(width)} 92`} className="h-auto w-full" aria-hidden>
        <rect x={0} y={0} width={width} height={92} fill="#8cc063" />
        <rect x={10} y={52} width={width - 20} height={18} rx={9} fill="#8a8f96" />
        <line x1={20} x2={width - 20} y1={61} y2={61} stroke="#fff" strokeDasharray="8 7" strokeWidth={2} />
        {Array.from({ length: count }, (_, i) => {
          const done = i < index;
          const now = i === index;
          return (
            <g key={i} data-station={i} data-station-state={done ? 'done' : now ? 'now' : 'next'}>
              <rect x={xOf(i) - 2} y={26} width={4} height={28} fill="#5a4630" />
              <circle cx={xOf(i)} cy={22} r={now ? 14 : 11} fill={done ? '#6cbf5a' : now ? '#f2c14e' : '#e7e1d2'} stroke={INK} strokeWidth={2} />
              <text x={xOf(i)} y={27} fontSize={now ? 14 : 12} fontWeight={900} textAnchor="middle" fill={INK}>
                {done ? '✓' : i + 1}
              </text>
            </g>
          );
        })}
        <motion.g
          initial={false}
          animate={{ x: xOf(index) - 18 }}
          transition={animate ? { type: 'spring', stiffness: 90, damping: 14 } : { duration: 0 }}
        >
          <rect x={0} y={44} width={30} height={16} rx={3} fill={color.roof} stroke={INK} strokeWidth={2} />
          <rect x={20} y={38} width={14} height={14} rx={2} fill="#dfe9f0" stroke={INK} strokeWidth={2} />
          <circle cx={8} cy={64} r={5} fill={INK} />
          <circle cx={28} cy={64} r={5} fill={INK} />
        </motion.g>
      </svg>
    </Frame>
  );
}

/** 5. 落とし穴：道の上の注意看板 */
export function PitfallRoad({ count }: { count: number }) {
  const t = useT();
  const width = 360;
  const gap = (width - 80) / Math.max(1, count - 1);
  return (
    <Frame label={t('visual.pitfalls')} testId="visual-pitfalls">
      <svg viewBox={`0 0 ${String(width)} 90`} className="h-auto w-full" aria-hidden>
        <rect x={0} y={0} width={width} height={90} fill="#8cc063" />
        <path d={`M0 70 Q ${String(width / 2)} 40 ${String(width)} 70`} stroke="#8a8f96" strokeWidth={18} fill="none" />
        {Array.from({ length: count }, (_, i) => {
          const x = count === 1 ? width / 2 : 40 + i * gap;
          return (
            <g key={i}>
              <rect x={x - 2} y={30} width={4} height={30} fill="#5a4630" />
              <polygon points={`${String(x - 16)},${String(34)} ${String(x)},${String(6)} ${String(x + 16)},${String(34)}`} fill="#f2c14e" stroke={INK} strokeWidth={2} />
              <text x={x} y={30} fontSize={13} fontWeight={900} textAnchor="middle" fill={INK}>
                {i + 1}
              </text>
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}

/** 状態図。任務の世界（ファイル・履歴・クラスタ・ネットワーク・PR）を、前の状態との違いを光らせて見せる */
export function StateDiagram({ track, state, previous, height = 'h-64' }: { track: MissionTrack; state: ShellState; previous?: ShellState | undefined; height?: string }) {
  return (
    <div className={`${height} overflow-hidden border-2 border-wood-dark bg-cream`}>
      <WorldView tab={tabForTrack(track)} state={state} previous={previous} />
    </div>
  );
}

/** 動きを見る：その施設の最初の任務の模範解答を、1 コマンドずつ実際の状態図で再生する */
export function DemoPlayer({ facility, track, animate }: { facility: Facility; track: MissionTrack; animate: boolean }) {
  const t = useT();
  const frames = useMemo(() => demoFrames(facility.id), [facility.id]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const last = frames.length - 1;

  useEffect(() => {
    if (!playing) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => {
      setIndex((i) => Math.min(last, i + 1));
    }, animate ? 1600 : 0);
    return () => {
      clearTimeout(timer);
    };
  }, [playing, index, last, animate]);

  const frame = frames[index];
  if (!frame) {
    return <p className="text-sm">{t('visual.demoNone')}</p>;
  }
  return (
    <Frame label={t('visual.demo', { a: index, b: last })} testId="visual-demo">
      <div className="flex flex-col gap-2">
        <pre className="min-h-[4.5rem] overflow-auto bg-[#0a0d12] px-3 py-2 font-mono text-xs leading-relaxed text-[#e6edf3]" data-testid="demo-command">
          {frame.command === null ? (
            <span className="text-[#9fb0c0]">{t('visual.demoStart')}</span>
          ) : (
            <>
              <span className="text-[#9fd67a]">learner@city:~$ </span>
              {frame.command}
              {frame.output.length > 0 ? `\n${frame.output.join('\n')}` : ''}
            </>
          )}
        </pre>
        <StateDiagram track={track} state={frame.state} previous={frames[index - 1]?.state} />
        <p className="text-xs text-ink-soft">{t('visual.demoLead')}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="demo-prev"
            disabled={index === 0}
            onClick={() => {
              setPlaying(false);
              setIndex((i) => Math.max(0, i - 1));
            }}
            className="knob w-24 px-2 py-1 text-sm disabled:opacity-40"
          >
            {t('visual.demoPrev')}
          </button>
          <button
            type="button"
            data-testid="demo-play"
            onClick={() => {
              if (index >= last) setIndex(0);
              setPlaying((p) => !p);
            }}
            className="knob w-24 px-2 py-1 text-sm"
          >
            {playing ? t('visual.demoPause') : t('visual.demoPlay')}
          </button>
          <button
            type="button"
            data-testid="demo-next"
            disabled={index >= last}
            onClick={() => {
              setPlaying(false);
              setIndex((i) => Math.min(last, i + 1));
            }}
            className="knob w-24 px-2 py-1 text-sm disabled:opacity-40"
          >
            {t('visual.demoNext')}
          </button>
          <div className="flex flex-1 gap-0.5" aria-hidden>
            {frames.map((_, i) => (
              <span key={i} className={`h-2 flex-1 ${i <= index ? 'bg-[var(--gold-dark)]' : 'bg-[var(--cream-dark)]'}`} />
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}
