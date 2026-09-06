import { useCallback, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { findMission } from '@/engines/lesson/missions';
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
import { FileTree } from '@/visual/FileTree';
import NotFoundPage from '../NotFoundPage';
import { DefeatOverlay } from './DefeatOverlay';
import { QuestHud } from './QuestHud';

const STEP_XP = 10;

export default function QuestPage() {
  const { missionId = '' } = useParams();
  const mission = findMission(missionId);
  if (!mission) return <NotFoundPage />;
  // 任務が変わったら状態を作り直す
  return <Quest key={mission.id} mission={mission} />;
}

function Quest({ mission }: { mission: LessonDefinition }) {
  const session = useShellSession(mission.initial);
  const terminalRef = useRef<TerminalHandle>(null);
  const [attempt, setAttempt] = useState(0);
  const [progress, setProgress] = useState<LessonProgressState>(() => createProgress(mission));
  const [revealedHints, setRevealedHints] = useState(0);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);

  const xp = useStore((s) => s.profile.xp);
  const soundEnabled = useStore((s) => s.settings.soundEnabled);
  const grantXp = useStore((s) => s.grantXp);
  const clearLesson = useStore((s) => s.clearLesson);

  const pushToast = useCallback((text: string) => {
    const key = Date.now() + Math.random();
    setToasts((list) => [...list, { key, text }]);
    setTimeout(() => {
      setToasts((list) => list.filter((toast) => toast.key !== key));
    }, 2000);
  }, []);

  const handleExecuted = useCallback(
    (_line: string, exitCode: number) => {
      const next = advance(mission, progress, session.getTimeline(), exitCode);
      const stepped = next.stepIndex > progress.stepIndex;
      const justCleared = next.cleared && !progress.cleared;
      const damaged = next.hp < progress.hp;
      setProgress(next);
      setRevealedHints(0);

      if (damaged && soundEnabled) sfx.error();
      const now = Date.now();

      if (justCleared) {
        const score = scoreAttempt({
          hintsUsed: next.hintsUsed,
          commandsUsed: next.commandsUsed,
          parCommands: mission.parCommands,
        });
        const reward = xpForScore(score, mission.kind === 'boss' ? 'boss' : 'drill');
        const levelBefore = levelFromXp(xp);
        const levelAfter = levelFromXp(xp + reward);
        clearLesson({ lessonId: mission.id, score, xp: reward, now });
        setCelebration({
          key: now,
          title: mission.kind === 'boss' ? 'BOSS DEFEATED' : 'MISSION CLEAR',
          subtitle: `${mission.title} — スコア ${String(score)}`,
          xp: reward,
          levelUp:
            levelAfter > levelBefore
              ? { level: levelAfter, rank: rankFromLevel(levelAfter) }
              : undefined,
        });
        if (soundEnabled) {
          sfx.clear();
          if (levelAfter > levelBefore) setTimeout(() => { sfx.levelUp(); }, 500);
        }
        return;
      }

      if (stepped) {
        grantXp(STEP_XP, now);
        pushToast(`手順 ${String(progress.stepIndex + 1)} 達成  +${String(STEP_XP)} XP`);
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

  const step = currentStep(mission, progress);
  const previous = session.journal.entries[session.journal.cursor - 1]?.state;

  return (
    <div data-track={mission.kind === 'boss' ? 'git' : 'net'} className="flex flex-col gap-5">
      <XpToast toasts={toasts} />
      <Celebration
        data={celebration}
        onDismiss={() => {
          setCelebration(null);
        }}
      />
      {progress.defeated ? <DefeatOverlay onRetry={retry} /> : null}

      <div className="flex items-center justify-between gap-4">
        <Link to="/map" className="font-mono text-base text-muted hover:text-ink">
          ← 地図へ戻る
        </Link>
        <button
          type="button"
          onClick={retry}
          className="border border-line px-4 py-2 font-mono text-sm text-muted hover:border-accent"
        >
          最初からやり直す
        </button>
      </div>

      <QuestHud mission={mission} progress={progress} />

      {/* 目的は常に1行。読ませる文章は勝ってから出す */}
      <div className="border-l-4 border-accent bg-panel/70 px-6 py-4">
        {progress.cleared ? (
          <p className="text-xl text-[var(--c-ok)]">討伐完了。{step?.explain}</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <p className="text-xl">{step?.prompt}</p>
            <button
              type="button"
              onClick={() => {
                setProgress(useHint);
                setRevealedHints((n) => n + 1);
              }}
              disabled={step === undefined || revealedHints >= step.hints.length}
              className="border border-line px-4 py-1.5 font-mono text-sm text-muted hover:border-[var(--c-warn)] hover:text-[var(--c-warn)] disabled:opacity-40"
            >
              ヒント
            </button>
            {step?.hints.slice(0, revealedHints).map((hint) => (
              <span key={hint} className="font-mono text-base text-[var(--c-warn)]">
                › {hint}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        <section
          aria-label="ターミナル"
          className="flex min-h-[560px] flex-col border-2 border-line bg-void"
        >
          <div className="flex-1">
            <TerminalView key={attempt} ref={terminalRef} session={session} onExecuted={handleExecuted} />
          </div>
          <CommandBar terminal={terminalRef} />
          <TimeScrubber session={session} />
        </section>

        <section
          aria-label="ファイルツリー"
          className="flex min-h-[560px] flex-col border-2 border-line bg-panel"
        >
          <div className="flex-1 overflow-auto">
            <FileTree vfs={session.state.vfs} previous={previous?.vfs} cwd={session.state.cwd} />
          </div>
        </section>
      </div>
    </div>
  );
}
