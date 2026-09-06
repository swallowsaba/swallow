import { useCallback, useRef, useState } from 'react';
import { shellWarmup } from '@/engines/lesson/missions';
import { advance, createProgress, useHint } from '@/engines/lesson/runner';
import type { LessonProgressState } from '@/engines/lesson/types';
import { CommandBar } from '@/features/terminal/CommandBar';
import { TerminalView, type TerminalHandle } from '@/features/terminal/TerminalView';
import { TimeScrubber } from '@/features/terminal/TimeScrubber';
import { useShellSession } from '@/features/terminal/useShellSession';
import { useT } from '@/i18n/useT';
import { sfx } from '@/lib/sfx';
import { levelFromXp, rankFromLevel, scoreAttempt, xpForScore } from '@/lib/xp';
import { useStore } from '@/store';
import { Celebration, type CelebrationData } from '@/ui/Celebration';
import { XpToast, type ToastData } from '@/ui/XpToast';
import { FileTree } from '@/visual/FileTree';
import { MissionPanel } from './MissionPanel';

const STEP_XP = 10;

export default function SandboxPage() {
  const t = useT();
  const session = useShellSession(shellWarmup.initial);
  const terminalRef = useRef<TerminalHandle>(null);
  const [progress, setProgress] = useState<LessonProgressState>(createProgress);
  const [revealedHints, setRevealedHints] = useState(0);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);

  const xp = useStore((s) => s.profile.xp);
  const soundEnabled = useStore((s) => s.settings.soundEnabled);
  const grantXp = useStore((s) => s.grantXp);
  const clearLesson = useStore((s) => s.clearLesson);

  const previous = session.journal.entries[session.journal.cursor - 1]?.state;

  const pushToast = useCallback((text: string) => {
    const key = Date.now() + Math.random();
    setToasts((list) => [...list, { key, text }]);
    setTimeout(() => {
      setToasts((list) => list.filter((toast) => toast.key !== key));
    }, 2000);
  }, []);

  /** コマンド実行のたびに、状態から手順の達成を判定して見返りを出す */
  const handleExecuted = useCallback(() => {
    const next = advance(shellWarmup, progress, session.getTimeline());
    const stepped = next.stepIndex > progress.stepIndex;
    const justCleared = next.cleared && !progress.cleared;
    setProgress(next);
    setRevealedHints(0);
    if (!stepped && !justCleared) return;

    const now = Date.now();

    if (justCleared) {
      const score = scoreAttempt({
        hintsUsed: next.hintsUsed,
        commandsUsed: next.commandsUsed,
        parCommands: shellWarmup.parCommands,
      });
      const reward = xpForScore(score, 'drill');
      const levelBefore = levelFromXp(xp);
      const levelAfter = levelFromXp(xp + reward);
      clearLesson({ lessonId: shellWarmup.id, score, xp: reward, now });
      setCelebration({
        key: now,
        title: 'MISSION CLEAR',
        subtitle: `${shellWarmup.title} — スコア ${String(score)}`,
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

    grantXp(STEP_XP, now);
    pushToast(`手順 ${String(progress.stepIndex + 1)} 達成  +${String(STEP_XP)} XP`);
    if (soundEnabled) sfx.step();
  }, [progress, session, xp, soundEnabled, grantXp, clearLesson, pushToast]);

  return (
    <div data-track="git" className="flex flex-col gap-8">
      <XpToast toasts={toasts} />
      <Celebration
        data={celebration}
        onDismiss={() => {
          setCelebration(null);
        }}
      />

      <header>
        <h1 className="display text-5xl">{t('sandbox.title')}</h1>
        <p className="mt-3 max-w-3xl text-lg text-muted">{t('sandbox.lead')}</p>
      </header>

      <MissionPanel
        lesson={shellWarmup}
        progress={progress}
        revealedHints={revealedHints}
        onHint={() => {
          setProgress(useHint);
          setRevealedHints((n) => n + 1);
        }}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section
          aria-label={t('lesson.terminal')}
          className="flex min-h-[520px] flex-col border-2 border-line bg-void"
        >
          <h2 className="flex items-center gap-3 border-b border-line px-5 py-3 font-mono text-sm uppercase tracking-[0.2em] text-muted">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-[var(--c-ok)]" />
            {t('lesson.terminal')}
          </h2>
          <div className="flex-1">
            <TerminalView ref={terminalRef} session={session} onExecuted={handleExecuted} />
          </div>
          <CommandBar terminal={terminalRef} />
          <TimeScrubber session={session} />
        </section>

        <section
          aria-label={t('sandbox.fileTree')}
          className="flex min-h-[520px] flex-col border-2 border-line bg-panel"
        >
          <h2 className="border-b border-line px-5 py-3 font-mono text-sm uppercase tracking-[0.2em] text-muted">
            {t('sandbox.fileTree')}
          </h2>
          <div className="flex-1 overflow-auto">
            <FileTree vfs={session.state.vfs} previous={previous?.vfs} cwd={session.state.cwd} />
          </div>
          <p className="border-t border-line px-5 py-3 font-mono text-sm text-muted">
            {t('sandbox.snapshots', {
              n: session.journal.entries.length,
              tick: session.clock.tick,
            })}
          </p>
        </section>
      </div>
    </div>
  );
}
