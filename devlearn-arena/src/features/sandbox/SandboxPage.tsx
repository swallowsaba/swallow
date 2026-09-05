import { useRef, useState } from 'react';
import { shellWarmup } from '@/engines/lesson/missions';
import { advance, createProgress, useHint } from '@/engines/lesson/runner';
import type { LessonProgressState } from '@/engines/lesson/types';
import { CommandBar } from '@/features/terminal/CommandBar';
import { TerminalView, type TerminalHandle } from '@/features/terminal/TerminalView';
import { TimeScrubber } from '@/features/terminal/TimeScrubber';
import { useShellSession } from '@/features/terminal/useShellSession';
import { FileTree } from '@/visual/FileTree';
import { MissionPanel } from './MissionPanel';

export default function SandboxPage() {
  const session = useShellSession(shellWarmup.initial);
  const terminalRef = useRef<TerminalHandle>(null);
  const [progress, setProgress] = useState<LessonProgressState>(createProgress);
  const [revealedHints, setRevealedHints] = useState(0);

  const previous = session.journal.entries[session.journal.cursor - 1]?.state;

  return (
    <div className="flex flex-col gap-4" data-track="git">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">サンドボックス</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          コマンドを打つと右のファイルツリーが変わります。下のスライダーで、どのコマンドで何が変わったかを行き来できます。
        </p>
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <section aria-label="ターミナル" className="flex min-h-[380px] flex-col border border-line bg-void">
          <h2 className="border-b border-line px-3 py-1.5 font-mono text-[11px] text-muted">ターミナル</h2>
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

        <section aria-label="ファイルツリー" className="flex min-h-[380px] flex-col border border-line bg-panel">
          <h2 className="border-b border-line px-3 py-1.5 font-mono text-[11px] text-muted">
            ライブ図解 — 仮想ファイルシステム
          </h2>
          <div className="flex-1 overflow-auto">
            <FileTree vfs={session.state.vfs} previous={previous?.vfs} cwd={session.state.cwd} />
          </div>
        </section>
      </div>

      <p className="font-mono text-[11px] text-muted">
        スナップショット {session.journal.entries.length} 件 / 仮想時計 tick {session.clock.tick}
      </p>
    </div>
  );
}
