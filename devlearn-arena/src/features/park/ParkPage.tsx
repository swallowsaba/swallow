import { useCallback, useMemo, useRef, useState } from 'react';
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
import { describeChange } from './describe';

const STEP_XP = 10;
const FALLBACK = missions[0];

export default function ParkPage() {
  const [missionId, setMissionId] = useState(FALLBACK?.id ?? '');
  const mission = findMission(missionId) ?? FALLBACK;
  if (!mission) return null;
  return <Park key={mission.id} mission={mission} onSwitch={setMissionId} />;
}

/**
 * 学習画面。
 * 左＝手を動かす場所（やること・ターミナル・入力）、右＝結果を見る場所（図・説明・履歴）。
 * 重なる浮きパネルはやめ、左右で役割を分ける。
 */
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

  const xp = useStore((s) => s.profile.xp);
  const soundEnabled = useStore((s) => s.settings.soundEnabled);
  const grantXp = useStore((s) => s.grantXp);
  const clearLesson = useStore((s) => s.clearLesson);

  const entries = session.journal.entries;
  const cursor = session.journal.cursor;
  const previous = entries[cursor - 1]?.state;
  const step = currentStep(mission, progress);

  /** 直近の操作を、コマンドと「何が起きたか」の対で並べる */
  const log = useMemo(() => {
    const rows: { key: number; command: string; text: string }[] = [];
    for (let i = Math.max(1, cursor - 5); i <= cursor; i += 1) {
      const entry = entries[i];
      const before = entries[i - 1];
      if (!entry || !before) continue;
      rows.push({
        key: i,
        command: entry.label,
        text: describeChange(before.state.vfs, entry.state.vfs, before.state.cwd, entry.state.cwd, 0)
          .text,
      });
    }
    return rows.reverse();
  }, [entries, cursor]);

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
          title: 'クリア',
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
    <div className="flex h-full flex-col bg-cream">
      <XpToast toasts={toasts} />
      <Celebration
        data={celebration}
        onDismiss={() => {
          setCelebration(null);
        }}
      />

      {/* 上部：任務の切り替えと現在地 */}
      <header className="flex flex-wrap items-center gap-3 border-b-4 border-wood-dark bg-[var(--wood)] px-5 py-3">
        <span className="sign px-4 py-1.5 text-lg font-extrabold">DEVLEARN</span>
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
            {m.title}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-sm text-cream">
            進捗 {Math.min(progress.stepIndex + (progress.cleared ? 1 : 0), mission.steps.length)} /{' '}
            {mission.steps.length}
          </span>
          <button type="button" onClick={retry} className="knob px-3 py-2 text-sm">
            やり直す
          </button>
          <Link to="/map" className="knob px-3 py-2 text-sm">
            全体図
          </Link>
          <Link to="/settings" className="knob px-3 py-2 text-sm">
            設定
          </Link>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* 左：手を動かす場所 */}
        <div className="flex min-h-0 flex-col border-r-4 border-wood-dark">
          <div className="border-b-2 border-wood-dark bg-[var(--cream-dark)] px-5 py-4">
            <p className="text-sm font-bold text-ink-soft">
              {progress.cleared ? '完了' : `やること ${String(progress.stepIndex + 1)}`}
            </p>
            <p className="mt-1 text-xl font-bold leading-snug">
              {progress.cleared ? '全部できました。次の任務へ進めます。' : (step?.prompt ?? '')}
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setProgress(useHint);
                  setRevealedHints((n) => n + 1);
                }}
                disabled={step === undefined || revealedHints >= step.hints.length}
                className="knob px-4 py-1.5 text-sm disabled:opacity-50"
              >
                ヒント
              </button>
              {step?.hints.slice(0, revealedHints).map((hint) => (
                <span key={hint} className="font-mono text-sm text-ink">
                  › {hint}
                </span>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 bg-[var(--wood-dark)]">
            <TerminalView
              key={attempt}
              ref={terminalRef}
              session={session}
              onExecuted={handleExecuted}
            />
          </div>

          <CommandBar terminal={terminalRef} />
        </div>

        {/* 右：結果を見る場所 */}
        <div className="flex min-h-0 flex-col">
          <div
            className="min-h-[280px] flex-1"
            style={{
              backgroundColor: 'var(--grass)',
              backgroundImage:
                'radial-gradient(circle at 12px 9px, var(--grass-dark) 2.5px, transparent 2.6px), radial-gradient(circle at 33px 19px, var(--grass-dark) 2px, transparent 2.1px)',
              backgroundSize: '46px 26px',
            }}
          >
            <FileWorld vfs={session.state.vfs} previous={previous?.vfs} cwd={session.state.cwd} />
          </div>

          <TimeScrubber session={session} />

          {/* 何が起きたかを言葉で残す */}
          <div className="h-[190px] overflow-auto border-t-4 border-wood-dark bg-cream px-5 py-3">
            <p className="text-sm font-bold text-ink-soft">実行の記録</p>
            {log.length === 0 ? (
              <p className="mt-2 text-sm text-ink-soft">
                下の入力欄にコマンドを打つと、ここに「何が起きたか」が残ります。
              </p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {log.map((row) => (
                  <li key={row.key} className="border-l-4 border-[var(--gold-dark)] pl-3">
                    <p className="font-mono text-sm text-ink">$ {row.command}</p>
                    <p className="text-sm text-ink-soft">{row.text}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
