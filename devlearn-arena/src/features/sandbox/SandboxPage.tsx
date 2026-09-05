import { useRef, useState } from 'react';
import { shellWarmup } from '@/engines/lesson/missions';
import { advance, createProgress, useHint } from '@/engines/lesson/runner';
import type { LessonProgressState } from '@/engines/lesson/types';
import { CommandBar } from '@/features/terminal/CommandBar';
import { TerminalView, type TerminalHandle } from '@/features/terminal/TerminalView';
import { TimeScrubber } from '@/features/terminal/TimeScrubber';
import { useShellSession } from '@/features/terminal/useShellSession';
import { useT } from '@/i18n/useT';
import { FileTree } from '@/visual/FileTree';
import { MissionPanel } from './MissionPanel';

export default function SandboxPage() {
  const t = useT();
  const session = useShellSession(shellWarmup.initial);
  const terminalRef = useRef<TerminalHandle>(null);
  const [progress, setProgress] = useState<LessonProgressState>(createProgress);
  const [revealedHints, setRevealedHints] = useState(0);

  const previous = session.journal.entries[session.journal.cursor - 1]?.state;

  return (
    <div data-track="git" className="flex flex-col gap-8">
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
            <TerminalView
              ref={terminalRef}
              session={session}
              onExecuted={() => {
                setProgress((p) => advance(shellWarmup, p, session.getTimeline()));
                setRevealedHints(0);
              }}
            />
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

