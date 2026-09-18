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
import { Icon } from '@/ui/Icon';
import { FacilityPlot, PLOT_H, PLOT_W } from '@/visual/game/cityArt';
import { IsoCivic, IsoHouse, IsoLamp, IsoRoad, IsoTree, IsoVacantLot, SpeechBubble, Villager } from '@/visual/game/scene';
import { iso } from '@/visual/game/isoMath';

/**
 * 施設の学習と依頼に添える図解。文章だけで終わらせず、街の絵と実際の状態図で「何が起きるのか」を見せる。
 */

const INK = '#2b2118';

/** 絵の枠 */
function Frame({ label, children, testId }: { label: string; children: React.ReactNode; testId: string }) {
  return (
    <figure data-testid={testId} className="ui-card overflow-hidden">
      <figcaption className="ui-eyebrow border-b border-[var(--u-line)] px-3 py-1.5">{label}</figcaption>
      <div className="p-2">{children}</div>
    </figure>
  );
}

/** 1. 困りごと：施設が無い街の一角。住民が空き地の前で困っている */
export function TroubleScene({ facility, track, animate }: { facility: Facility; track: MissionTrack; animate: boolean }) {
  const t = useT();
  const color = CITY_COLOR[track];
  return (
    <Frame label={t('visual.trouble', { name: facility.name })} testId="visual-trouble">
      <svg viewBox="-120 -34 236 128" className="h-auto w-full" role="img" aria-label={t('visual.trouble', { name: facility.name })}>
        <defs>
          <linearGradient id="trouble-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#e2f1ff" />
            <stop offset="1" stopColor="#f5f9f0" />
          </linearGradient>
          <linearGradient id="trouble-grass" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8fc161" />
            <stop offset="1" stopColor="#74a64e" />
          </linearGradient>
        </defs>
        <rect x={-120} y={-34} width={236} height={128} fill="url(#trouble-sky)" />

        {/* 地面 */}
        <polygon
          points={[iso(-0.3, -0.35), iso(5, -0.35), iso(5, 3.8), iso(-0.3, 3.8)]
            .map((q) => `${String(q.x)},${String(q.y)}`)
            .join(' ')}
          fill="url(#trouble-grass)"
        />

        {/* 奥の木 */}
        <IsoTree x={-0.15} y={0.15} scale={0.55} seed={3} />
        <IsoTree x={4.85} y={0.35} scale={0.5} seed={11} />

        {/* 通り */}
        <IsoRoad x={-0.3} y={1.35} w={5.3} d={0.9} along="x" />

        {/* 両どなりは建っているのに、真ん中だけが空いている */}
        <IsoHouse x={0.25} y={-0.1} w={1.25} d={1.05} h={0.88} wall="#f2e6d2" roof={color.roof} lit />
        <IsoVacantLot x={1.95} y={-0.15} w={1.5} d={1.25} label="?" />
        <IsoHouse x={3.5} y={-0.1} w={1.25} d={1.05} h={0.8} wall="#e9d3b4" roof="#7a4f3f" />

        <IsoLamp x={4.6} y={2.55} />

        {/* 困っている住民 */}
        <Villager x={1.4} y={3.4} mood="angry" animate={animate} raiseArm coat="#6b7c8c" />
        <Villager x={2.15} y={3.55} mood="angry" animate={animate} coat="#8a6a5a" scale={0.9} />

        <SpeechBubble x={-40} y={2} text={t('visual.troubleBubble')} width={152} />
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
        <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg bg-[#12131a] p-3 text-center">
          <span className="text-[11px] font-semibold text-[#9fd67a]">{t('visual.itWorld')}</span>
          <code className="font-mono text-[15px] font-bold text-white">{facility.concept}</code>
        </div>
        <span className="text-2xl text-[var(--u-text-3)]" aria-hidden>
          ⇄
        </span>
        <div className="ui-flat flex flex-col items-center gap-1 p-2 text-center">
          <span className="ui-eyebrow">{t('visual.cityWorld')}</span>
          <svg viewBox={`0 0 ${String(PLOT_W)} ${String(PLOT_H)}`} className="h-24 w-auto" aria-hidden>
            <FacilityPlot kind={facility.building} track={track} state="complete" x={0} y={0} animate={false} />
          </svg>
          <span className="ui-chip">{facility.name}</span>
        </div>
      </div>
    </Frame>
  );
}

/** 3. なぜ必要か：同じ一角を、施設が無いときとあるときで見比べる */
export function WhyVisual({ facility, track }: { facility: Facility; track: MissionTrack }) {
  const t = useT();
  const color = CITY_COLOR[track];
  const side = (ok: boolean) => (
    <div className={`overflow-hidden rounded-lg border ${ok ? 'border-[var(--u-ok)]' : 'border-[var(--u-bad)]'}`}>
      <div className={`px-2 py-1 text-[11px] font-semibold ${ok ? 'bg-[var(--u-ok-soft)] text-[var(--u-ok)]' : 'bg-[var(--u-bad-soft)] text-[var(--u-bad)]'}`}>
        {ok ? t('visual.with', { name: facility.name }) : t('visual.without', { name: facility.name })}
      </div>
      <svg viewBox="-72 -50 148 118" className="h-auto w-full" aria-hidden>
        <rect x={-72} y={-50} width={148} height={118} fill={ok ? '#eef8f1' : '#fdf1ef'} />
        <polygon
          points={[iso(-0.3, -0.3), iso(3.3, -0.3), iso(3.3, 2.9), iso(-0.3, 2.9)]
            .map((q) => `${String(q.x)},${String(q.y)}`)
            .join(' ')}
          fill={ok ? '#8fc161' : '#9db77f'}
        />
        <IsoRoad x={-0.3} y={1.35} w={3.6} d={0.8} along="x" />
        {ok ? (
          <IsoCivic x={0.5} y={-0.2} w={1.6} d={1.3} h={1} roof={color.roof} />
        ) : (
          <IsoVacantLot x={0.5} y={-0.2} w={1.6} d={1.3} label="?" />
        )}
        <IsoHouse x={2.35} y={-0.15} w={0.95} d={0.95} h={0.72} wall="#f2e6d2" roof={color.roof} lit={ok} />
        <Villager x={0.75} y={2.55} mood={ok ? 'happy' : 'angry'} scale={0.8} coat="#6b7c8c" />
        <Villager x={1.45} y={2.7} mood={ok ? 'happy' : 'angry'} scale={0.74} coat="#8a6a5a" />
      </svg>
      <p className="px-2 pb-1.5 text-[11px] text-[var(--u-text-2)]">{ok ? t('visual.withLead') : t('visual.withoutLead')}</p>
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
    <div className={`${height} overflow-hidden rounded-lg border border-[var(--u-line)] bg-[var(--u-sunk)]`}>
      <WorldView tab={tabForTrack(track)} state={state} previous={previous} compact />
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
        <pre className="min-h-[4.5rem] overflow-hidden rounded-lg bg-[#12131a] px-3 py-2 font-mono text-[12px] leading-relaxed text-[#e6edf3]" data-testid="demo-command">
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
        <StateDiagram track={track} state={frame.state} previous={frames[index - 1]?.state} height="h-52" />
        <p className="text-[11px] text-[var(--u-text-3)]">{t('visual.demoLead')}</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="demo-prev"
            disabled={index === 0}
            onClick={() => {
              setPlaying(false);
              setIndex((i) => Math.max(0, i - 1));
            }}
            className="ui-btn ui-btn-quiet h-8 w-20 text-[12px]"
          >
            <Icon name="back" size={14} />
            {t('visual.demoPrev')}
          </button>
          <button
            type="button"
            data-testid="demo-play"
            onClick={() => {
              if (index >= last) setIndex(0);
              setPlaying((p) => !p);
            }}
            className="ui-btn ui-btn-primary h-8 w-20 text-[12px]"
          >
            <Icon name={playing ? 'pause' : 'play'} size={14} />
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
            className="ui-btn ui-btn-quiet h-8 w-20 text-[12px]"
          >
            {t('visual.demoNext')}
            <Icon name="next" size={14} />
          </button>
          <div className="flex flex-1 gap-0.5" aria-hidden>
            {frames.map((_, i) => (
              <span key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= index ? 'var(--accent)' : 'var(--u-line)' }} />
            ))}
          </div>
        </div>
      </div>
    </Frame>
  );
}
