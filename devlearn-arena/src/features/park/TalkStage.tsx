import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import type { BriefingLine, Tryout } from '@/engines/lesson/briefing';
import type { ShellState } from '@/engines/kernel/registry';
import type { MissionTrack } from '@/engines/lesson/types';
import { StateDiagram } from '@/features/city/LessonVisuals';
import { useT } from '@/i18n/useT';
import { CITY_COLOR } from '@/visual/game/cityColor';

/**
 * 依頼の話に添える「動く絵」。
 *
 * 話を読むだけにせず、いま話している中身がそのまま動いて見えるようにする。
 * 要望・理由は「いまの現場」、言葉は看板が建つ場面、道具は打った前と後の現場、段取りは道すじ。
 */

const INK = '#2b2118';

/** 1 文字ずつ出す。動きを止めている人には最初から全部出す */
function useTyped(text: string, on: boolean, ms = 34): string {
  const [shown, setShown] = useState(on ? 0 : text.length);
  useEffect(() => {
    if (!on) {
      setShown(text.length);
      return;
    }
    setShown(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setShown(i);
      if (i >= text.length) clearInterval(id);
    }, ms);
    return () => {
      clearInterval(id);
    };
  }, [text, on, ms]);
  return text.slice(0, shown);
}

function Stage({ label, children, testId, right }: { label: string; children: React.ReactNode; testId: string; right?: React.ReactNode }) {
  return (
    <figure data-testid={testId} className="border-4 border-wood-dark bg-[#eaf4df] shadow-[4px_4px_0_rgba(0,0,0,0.15)]">
      <figcaption className="flex items-center gap-2 bg-[var(--wood)] px-3 py-1 text-xs font-extrabold text-cream">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {right}
      </figcaption>
      <div className="p-2">{children}</div>
    </figure>
  );
}

/** 要望・理由：コマンドを打つ前の現場を、そのまま見せる */
function SiteNow({ track, state }: { track: MissionTrack; state: ShellState }) {
  const t = useT();
  return (
    <Stage label={t('brief.stageNow')} testId="talk-stage-now">
      <StateDiagram track={track} state={state} height="h-40" />
    </Stage>
  );
}

/** 言葉：覚える言葉の看板が街に建つ */
function SignRise({ term, track, animate }: { term: string; track: MissionTrack; animate: boolean }) {
  const t = useT();
  const color = CITY_COLOR[track];
  return (
    <Stage label={t('brief.stageConcept')} testId="talk-stage-concept">
      <svg viewBox="0 0 360 96" className="h-auto w-full" aria-hidden>
        <rect x={0} y={0} width={360} height={96} fill="#8cc063" />
        <rect x={0} y={74} width={360} height={22} fill="#8a8f96" />
        <line x1={0} x2={360} y1={85} y2={85} stroke="#fff" strokeDasharray="10 8" strokeWidth={2} />
        <motion.g
          initial={animate ? { y: 44, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 110, damping: 13 }}
        >
          <rect x={176} y={40} width={8} height={38} fill="#6b4a2f" stroke={INK} strokeWidth={2} />
          <rect x={64} y={16} width={232} height={32} rx={4} fill="#f6e8cd" stroke={INK} strokeWidth={3} />
          <rect x={68} y={20} width={224} height={24} rx={2} fill={color.roof} opacity={0.18} />
          <text x={180} y={38} fontSize={18} fontWeight={900} textAnchor="middle" fill={INK}>
            {term}
          </text>
        </motion.g>
        {animate
          ? [0, 1, 2].map((i) => (
              <motion.circle
                key={i}
                cx={90 + i * 90}
                cy={22}
                r={3}
                fill="#fff3b0"
                stroke={INK}
                strokeWidth={1}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 1, 0], scale: [0.4, 1.4, 0.4] }}
                transition={{ repeat: Infinity, duration: 1.8, delay: i * 0.35 }}
              />
            ))
          : null}
      </svg>
    </Stage>
  );
}

/** 道具：打つところを見せ、打つ前と打った後の現場を切り替える */
export function ToolRun({ tryout, track, animate, onReplay, label }: { tryout: Tryout; track: MissionTrack; animate: boolean; onReplay: () => void; label?: string }) {
  const t = useT();
  const typed = useTyped(tryout.command, animate);
  const done = typed.length >= tryout.command.length;
  const [after, setAfter] = useState(!animate);

  useEffect(() => {
    if (!done) {
      setAfter(!animate);
      return;
    }
    const id = setTimeout(() => {
      setAfter(true);
    }, animate ? 520 : 0);
    return () => {
      clearTimeout(id);
    };
  }, [done, animate]);

  return (
    <Stage
      label={label ?? t('brief.stageTool')}
      testId="talk-stage-tool"
      right={
        <button type="button" data-testid="talk-replay" onClick={onReplay} className="knob px-2 py-0.5 text-[10px] text-ink">
          {t('brief.replay')}
        </button>
      }
    >
      <div className="flex flex-col gap-2">
        <pre className="overflow-hidden bg-[#0a0d12] px-3 py-2 font-mono text-xs leading-relaxed text-[#e6edf3]" data-testid="talk-term">
          <span className="text-[#9fd67a]">learner@practice:~$ </span>
          {typed}
          {done ? null : <span className="animate-pulse">▋</span>}
          {done && after ? `\n${tryout.output.slice(0, 4).join('\n') || (tryout.ok ? t('brief.tryNoOutput') : t('brief.tryFailed'))}` : ''}
        </pre>
        <div className="relative">
          <span
            data-testid="talk-when"
            className={`absolute left-1 top-1 z-10 px-2 py-0.5 text-[10px] font-extrabold ${after ? 'bg-[var(--ok)] text-ink' : 'bg-[var(--cream-dark)] text-ink-soft'}`}
          >
            {after ? t('brief.after') : t('brief.before')}
          </span>
          <StateDiagram track={track} state={after ? tryout.after : tryout.before} previous={after ? tryout.before : undefined} height="h-40" />
        </div>
      </div>
    </Stage>
  );
}

/** 現場で穴埋めして使う道具。穴の部分が順に光る */
export function ToolBlank({ command, animate }: { command: string; animate: boolean }) {
  const t = useT();
  const parts = command.split(/(<[^>]+>|…)/g).filter((p) => p !== '');
  return (
    <Stage label={t('brief.stageToolField')} testId="talk-stage-blank">
      <div className="flex flex-wrap items-center gap-1 bg-[#0a0d12] px-3 py-4 font-mono text-base text-[#e6edf3]">
        <span className="text-[#9fd67a]">$</span>
        {parts.map((part, i) =>
          /^<|…/.test(part) ? (
            <motion.span
              key={`${String(i)}-${part}`}
              className="border-2 border-dashed border-[#f2c14e] px-1 text-[#f2c14e]"
              animate={animate ? { opacity: [1, 0.35, 1] } : undefined}
              transition={{ repeat: Infinity, duration: 1.4, delay: i * 0.2 }}
            >
              {part}
            </motion.span>
          ) : (
            <span key={`${String(i)}-${part}`} className="whitespace-pre">
              {part}
            </span>
          ),
        )}
      </div>
      <p className="mt-2 text-xs text-ink-soft">{t('brief.blankLead')}</p>
    </Stage>
  );
}

/** 段取り：停留所を順に回る道すじ。荷車がひとりでに進む */
function PlanRoute({ steps, track, animate }: { steps: readonly string[]; track: MissionTrack; animate: boolean }) {
  const t = useT();
  const [at, setAt] = useState(0);
  const count = Math.max(1, steps.length);
  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => {
      setAt((n) => (n + 1) % count);
    }, 1400);
    return () => {
      clearInterval(id);
    };
  }, [animate, count]);

  const width = 360;
  const gap = count <= 1 ? 0 : (width - 60) / (count - 1);
  const xOf = (i: number) => 30 + i * gap;
  const color = CITY_COLOR[track];
  return (
    <Stage label={t('brief.stagePlan')} testId="talk-stage-plan">
      <svg viewBox={`0 0 ${String(width)} 92`} className="h-auto w-full" aria-hidden>
        <rect x={0} y={0} width={width} height={92} fill="#8cc063" />
        <rect x={10} y={52} width={width - 20} height={18} rx={9} fill="#8a8f96" />
        <line x1={20} x2={width - 20} y1={61} y2={61} stroke="#fff" strokeDasharray="8 7" strokeWidth={2} />
        {Array.from({ length: count }, (_, i) => (
          <g key={i} data-plan-station={i}>
            <rect x={xOf(i) - 2} y={26} width={4} height={28} fill="#5a4630" />
            <circle cx={xOf(i)} cy={22} r={i === at ? 14 : 11} fill={i <= at ? '#f2c14e' : '#e7e1d2'} stroke={INK} strokeWidth={2} />
            <text x={xOf(i)} y={27} fontSize={i === at ? 14 : 12} fontWeight={900} textAnchor="middle" fill={INK}>
              {i + 1}
            </text>
          </g>
        ))}
        <motion.g initial={false} animate={{ x: xOf(at) - 18 }} transition={animate ? { type: 'spring', stiffness: 90, damping: 14 } : { duration: 0 }}>
          <rect x={0} y={44} width={30} height={16} rx={3} fill={color.roof} stroke={INK} strokeWidth={2} />
          <rect x={20} y={38} width={14} height={14} rx={2} fill="#dfe9f0" stroke={INK} strokeWidth={2} />
          <circle cx={8} cy={64} r={5} fill={INK} />
          <circle cx={28} cy={64} r={5} fill={INK} />
        </motion.g>
      </svg>
      <p className="mt-1 truncate text-xs font-bold">
        {at + 1}. {steps[at] ?? ''}
      </p>
    </Stage>
  );
}

/**
 * いま話している 1 行に合う動く絵を選ぶ。
 * どの行にも必ず何かが動くようにして、読むだけの画面にしない。
 */
export function TalkStage({ line, track, initial, tries, animate, replay, onReplay }: {
  line: BriefingLine;
  track: MissionTrack;
  /** コマンドを打つ前の現場 */
  initial: ShellState;
  tries: readonly Tryout[];
  animate: boolean;
  /** 押すたびに増える値。道具の再生をやり直すのに使う */
  replay: number;
  onReplay: () => void;
}) {
  if (line.kind === 'concept') return <SignRise term={line.term} track={track} animate={animate} />;
  if (line.kind === 'plan') return <PlanRoute steps={line.steps} track={track} animate={animate} />;
  if (line.kind === 'tool') {
    const tryout = tries.find((tr) => tr.command === line.command);
    if (tryout) return <ToolRun key={`${line.command}:${String(replay)}`} tryout={tryout} track={track} animate={animate} onReplay={onReplay} />;
    return <ToolBlank command={line.command} animate={animate} />;
  }
  return <SiteNow track={track} state={initial} />;
}
