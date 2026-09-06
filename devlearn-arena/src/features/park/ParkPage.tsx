import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { findMission, missions } from '@/engines/lesson/missions';
import { advance, createProgress, currentStep, useHint } from '@/engines/lesson/runner';
import type { LessonDefinition, LessonProgressState } from '@/engines/lesson/types';
import { CommandBar } from '@/features/terminal/CommandBar';
import { TerminalView, type TerminalHandle } from '@/features/terminal/TerminalView';
import { TimeScrubber } from '@/features/terminal/TimeScrubber';
import { useShellSession } from '@/features/terminal/useShellSession';
import { sfx } from '@/lib/sfx';
import { levelFromXp, rankFromLevel, scoreAttempt, xpForScore } from '@/lib/xp';
import { useStore } from '@/store';
import { Celebration, type CelebrationData } from '@/ui/Celebration';
import { XpToast, type ToastData } from '@/ui/XpToast';
import { FileWorld } from '@/visual/FileWorld';

const STEP_XP = 10;
const FALLBACK = missions[0];

/**
 * 1枚の画面で完結させる。景色が主役で、案内板と操作盤がその上に乗る。
 * 別ページへ移動しないと遊べない作りをやめた。
 */
export default function ParkPage() {
  const [missionId, setMissionId] = useState(FALLBACK?.id ?? '');
  const mission = findMission(missionId) ?? FALLBACK;
  if (!mission) return null;
  return <Park key={mission.id} mission={mission} onSwitch={setMissionId} />;
}

function Park({
  mission,
  onSwitch,
}: {
  mission: LessonDefinition;
  onSwitch: (id: string) => void;
}) {
  const session = useShellSession(mission.initial);
  const terminalRef = useRef<TerminalHandle>(null);
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState<LessonProgressState>(() => createProgress(mission));
  const [revealedHints, setRevealedHints] = useState(0);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const [guideOpen, setGuideOpen] = useState(true);

  const xp = useStore((s) => s.profile.xp);
  const soundEnabled = useStore((s) => s.settings.soundEnabled);
  const grantXp = useStore((s) => s.grantXp);
  const clearLesson = useStore((s) => s.clearLesson);

  const previous = session.journal.entries[session.journal.cursor - 1]?.state;
  const step = currentStep(mission, progress);

  const pushToast = useCallback((text: string) => {
    const key = Date.now() + Math.random();
    setToasts((list) => [...list, { key, text }]);
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.key !== key));
    }, 2000);
  }, []);

  const handleExecuted = useCallback(
    (_line: string, exitCode: number) => {
      const next = advance(mission, progress, session.getTimeline(), exitCode);
      const stepped = next.stepIndex > progress.stepIndex;
      const justCleared = next.cleared && !progress.cleared;
      setProgress(next);
      setRevealedHints(0);
      if (exitCode !== 0 && soundEnabled) sfx.error();

      const now = Date.now();
      if (justCleared) {
        const score = scoreAttempt({
          hintsUsed: next.hintsUsed,
          commandsUsed: next.commandsUsed,
          parCommands: mission.parCommands,
        });
        const reward = xpForScore(score, mission.kind === 'boss' ? 'boss' : 'drill');
        const before = levelFromXp(xp);
        const after = levelFromXp(xp + reward);
        clearLesson({ lessonId: mission.id, score, xp: reward, now });
        setCelebration({
          key: now,
          title: mission.kind === 'boss' ? '営業再開' : 'クリア',
          subtitle: `${mission.title} — スコア ${String(score)}`,
          xp: reward,
          levelUp: after > before ? { level: after, rank: rankFromLevel(after) } : undefined,
        });
        if (soundEnabled) sfx.clear();
        return;
      }
      if (stepped) {
        grantXp(STEP_XP, now);
        pushToast(`+${String(STEP_XP)} XP`);
        if (soundEnabled) sfx.step();
      }
    },
    [mission, progress, session, xp, soundEnabled, grantXp, clearLesson, pushToast],
  );

  const retry = useCallback(() => {
    session.reset();
    setProgress(createProgress(mission));
    setRevealedHints(0);
    setAttempt((n) => n + 1);
  }, [mission, session]);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{
        backgroundColor: 'var(--grass)',
        backgroundImage:
          'radial-gradient(circle at 12px 9px, var(--grass-dark) 2.5px, transparent 2.6px), radial-gradient(circle at 33px 19px, var(--grass-dark) 2px, transparent 2.1px)',
        backgroundSize: '46px 26px',
      }}
    >
      <XpToast toasts={toasts} />
      <Celebration
        data={celebration}
        onDismiss={() => {
          setCelebration(null);
        }}
      />

      {/* 景色。画面いっぱいに広がる */}
      <div className="absolute inset-0">
        <FileWorld vfs={session.state.vfs} previous={previous?.vfs} cwd={session.state.cwd} />
      </div>

      {/* 上部：看板と持ち物 */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-start justify-between gap-3 p-4">
        <div className="sign pointer-events-auto px-5 py-2">
          <span className="title text-xl">DEVLEARN PARK</span>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          {missions.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={m.id === mission.id}
              onClick={() => {
                onSwitch(m.id);
              }}
              className="knob px-4 py-2 text-sm font-bold"
            >
              {m.kind === 'boss' ? '★ ' : ''}
              {m.title}
            </button>
          ))}
          <Link to="/map" className="knob px-4 py-2 text-sm font-bold">
            全体図
          </Link>
          <Link to="/settings" className="knob px-4 py-2 text-sm font-bold">
            設定
          </Link>
        </div>
      </div>

      {/* 右上：進行と HP */}
      <div className="bevel absolute right-4 top-20 w-[260px] p-4">
        <p className="text-sm font-bold text-ink-soft">
          {mission.kind === 'boss' ? '★ 障害対応' : '案内つき見学'}
        </p>
        <p className="title text-lg">{mission.title}</p>
        <p className="mt-2 text-sm text-ink-soft">
          停留所 {Math.min(progress.stepIndex + 1, mission.steps.length)} / {mission.steps.length}
        </p>
        <div className="mt-2 flex gap-1">
          {mission.steps.map((_, i) => (
            <span
              key={i}
              aria-hidden
              className={`h-3 flex-1 border-2 border-wood-dark ${
                progress.cleared || i < progress.stepIndex ? 'bg-ok' : 'bg-cream-dark'
              }`}
            />
          ))}
        </div>
        <p className="mt-3 text-sm font-bold text-ink-soft">
          修理費 {progress.hp} / {mission.maxHp}
        </p>
        <div className="mt-1 flex gap-1" role="img" aria-label={`残り HP ${String(progress.hp)}`}>
          {Array.from({ length: mission.maxHp }, (_, i) => (
            <span
              key={i}
              aria-hidden
              className={`h-4 w-4 border-2 border-wood-dark ${i < progress.hp ? 'bg-bad' : 'bg-cream-dark'}`}
            />
          ))}
        </div>
        <button type="button" onClick={retry} className="knob mt-4 w-full px-3 py-2 text-sm font-bold">
          最初からやり直す
        </button>
      </div>

      {/* 左下：案内板 */}
      <div className="absolute bottom-4 left-4 w-[min(560px,calc(100%-2rem))]">
        <div className="bevel p-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-base font-bold">
              {progress.cleared ? '見学完了' : `やること: ${step?.prompt ?? ''}`}
            </p>
            <button
              type="button"
              onClick={() => {
                setGuideOpen((v) => !v);
              }}
              className="knob shrink-0 px-3 py-1 text-sm"
            >
              {guideOpen ? '案内を隠す ▴' : '案内を出す ▾'}
            </button>
          </div>

          {guideOpen ? (
            <>
              <p className="mt-2 text-sm text-ink-soft">
                {progress.cleared ? step?.explain : '下の入力欄にコマンドを打つと、園内の建物と荷物が動きます。'}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProgress(useHint);
                    setRevealedHints((n) => n + 1);
                  }}
                  disabled={step === undefined || revealedHints >= step.hints.length}
                  className="knob px-3 py-1.5 text-sm disabled:opacity-50"
                >
                  ヒント
                </button>
                {step?.hints.slice(0, revealedHints).map((hint) => (
                  <span key={hint} className="font-mono text-sm text-ink-soft">
                    › {hint}
                  </span>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div className="bevel mt-3">
          <div className="h-[190px] overflow-hidden bg-[var(--wood-dark)]">
            <TerminalView key={attempt} ref={terminalRef} session={session} onExecuted={handleExecuted} />
          </div>
          <CommandBar terminal={terminalRef} />
          <TimeScrubber session={session} />
        </div>
      </div>
    </div>
  );
}
