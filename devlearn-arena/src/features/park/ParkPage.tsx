import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { restoreShell, snapshotShell } from '@/engines/kernel/session';
import { TRACK_LABEL } from '@/engines/lesson/catalog';
import { findMission, missions } from '@/engines/lesson/missions';
import {
  buildContext, createProgress, currentStep, evaluate, passes, useHint,
} from '@/engines/lesson/runner';
import type { LessonDefinition, LessonProgressState, MissionTrack } from '@/engines/lesson/types';
import { TerminalView, type TerminalHandle } from '@/features/terminal/TerminalView';
import { useShellSession } from '@/features/terminal/useShellSession';
import { useT } from '@/i18n/useT';
import { dayKey } from '@/lib/date';
import { shouldReview } from '@/lib/review';
import { sfx } from '@/lib/sfx';
import { levelFromXp, rankFromLevel, scoreAttempt, xpForScore } from '@/lib/xp';
import { useStore } from '@/store';
import { Celebration, type CelebrationData } from '@/ui/Celebration';
import { XpToast, type ToastData } from '@/ui/XpToast';
import { Splitter } from '@/ui/Splitter';
import { EditorPanel, type EditorTarget } from './EditorPanel';
import { MissionPanel } from './MissionPanel';
import { VisualPanel, type VisualTab } from './VisualPanel';

const STEP_XP = 10;

/** 選択欄に並べる順。序章から始めて、あとは目次と同じ並びにする */
const TRACK_ORDER: MissionTrack[] = ['kernel', 'git', 'k8s', 'net', 'github'];
const FALLBACK = missions[0];

export default function ParkPage() {
  const lastMissionId = useStore((s) => s.lastMissionId);
  const setLastMission = useStore((s) => s.setLastMission);
  const resetMission = useStore((s) => s.resetMission);
  const [params] = useSearchParams();
  const requested = params.get('mission');
  const [missionId, setMissionId] = useState(requested ?? lastMissionId ?? FALLBACK?.id ?? '');

  // 地図から任務を指定して来たときは、そちらを開く
  useEffect(() => {
    if (requested !== null && requested !== missionId) setMissionId(requested);
    // 指定が変わったときだけ反応する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);
  const [attempt, setAttempt] = useState(0);
  const mission = findMission(missionId) ?? FALLBACK;

  useEffect(() => {
    if (mission) setLastMission(mission.id);
  }, [mission, setLastMission]);

  if (!mission) return null;
  return (
    <Park
      key={`${mission.id}:${String(attempt)}`}
      mission={mission}
      onSwitch={setMissionId}
      onRetry={() => {
        resetMission(mission.id);
        setAttempt((n) => n + 1);
      }}
    />
  );
}

/**
 * 学習画面。
 * 左＝手を動かす場所（やること・ターミナル・入力）、右＝結果を見る場所（図・説明・履歴）。
 * 重なる浮きパネルはやめ、左右で役割を分ける。
 */
function Park({
  mission,
  onSwitch,
  onRetry,
}: {
  mission: LessonDefinition;
  onSwitch: (id: string) => void;
  onRetry: () => void;
}) {
  const t = useT();
  const saveMission = useStore((s) => s.saveMission);
  const savedProgress = useStore((s) => s.missionProgress[mission.id]);
  const savedState = useStore((s) => s.missionState[mission.id]);

  // 復元は開いた瞬間の1回だけ。以後の保存で作り直さない
  const [options] = useState(() =>
    savedState ? { ...mission.initial, restore: restoreShell(savedState) } : mission.initial,
  );
  const [initialProgress] = useState(() =>
    savedProgress ? { ...createProgress(mission), ...savedProgress } : createProgress(mission),
  );

  const session = useShellSession(options);
  const terminalRef = useRef<TerminalHandle>(null);
  const [progress, setProgress] = useState<LessonProgressState>(initialProgress);
  const [revealedHints, setRevealedHints] = useState(0);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<VisualTab>('world');
  const [editing, setEditing] = useState<EditorTarget | null>(null);

  const xp = useStore((s) => s.profile.xp);
  const soundEnabled = useStore((s) => s.settings.soundEnabled);
  const grantXp = useStore((s) => s.grantXp);
  const clearLesson = useStore((s) => s.clearLesson);
  const scheduleReview = useStore((s) => s.scheduleReview);
  const paneMain = useStore((s) => s.settings.paneMain);
  const updateSettings = useStore((s) => s.updateSettings);

  const entries = session.journal.entries;
  const cursor = session.journal.cursor;
  const previous = entries[cursor - 1]?.state;
  const step = currentStep(mission, progress);

  // いま条件を満たしているか。毎回描画時に評価する
  const passingNow = useMemo(() => {
    if (!step) return false;
    try {
      return passes(step, buildContext(session.getTimeline()));
    } catch {
      return false;
    }
  }, [step, session]);

  const lessons = useStore((s) => s.lessons);
  const clearedIds = useMemo(
    () => new Set(missions.filter((m) => lessons[m.id]?.cleared === true).map((m) => m.id)),
    [lessons],
  );
  const nextMission = useMemo(
    () => missions.find((m) => m.id !== mission.id && !clearedIds.has(m.id)) ?? null,
    [clearedIds, mission.id],
  );

  const shellState = session.state;

  // 状態が変わるたびに保存する（書き込み自体はストア側で間引かれる）
  useEffect(() => {
    saveMission(
      mission.id,
      {
        stepIndex: progress.stepIndex,
        cleared: progress.cleared,
        hintsUsed: progress.hintsUsed,
        commandsUsed: progress.commandsUsed,
        mistakes: progress.mistakes,
      },
      snapshotShell(shellState),
    );
  }, [mission.id, progress, shellState, saveMission]);

  const pushToast = useCallback((text: string) => {
    const key = Date.now() + Math.random();
    setToasts((list) => [...list, { key, text }]);
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.key !== key));
    }, 2000);
  }, []);

  /** コマンド実行では回数と失敗数だけを数える。合否の判定は下の効果で行う */
  const handleExecuted = useCallback(
    (_line: string, exitCode: number) => {
      setProgress((p) => ({
        ...p,
        commandsUsed: p.commandsUsed + 1,
        mistakes: p.mistakes + (exitCode === 0 ? 0 : 1),
      }));
      setRevealedHints(0);
    },
    [],
  );

  // 状態が変われば必ず judge する。コマンド実行の瞬間だけに頼らない
  useEffect(() => {
    setProgress((p) => evaluate(mission, p, session.getTimeline()));
    // session は毎描画で作り直されるため、状態そのものを依存に置く
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellState, mission]);

  // 進んだ / 通らなかった に応じて見返りと助言を出す
  const prevStep = useRef(progress.stepIndex);
  const prevCleared = useRef(progress.cleared);
  useEffect(() => {
    const now = Date.now();
    if (progress.cleared && !prevCleared.current) {
      const score = scoreAttempt({
        hintsUsed: progress.hintsUsed,
        commandsUsed: progress.commandsUsed,
        parCommands: mission.parCommands,
      });
      const reward = xpForScore(score, mission.kind === 'boss' ? 'boss' : 'drill');
      const after = levelFromXp(xp + reward);
      clearLesson({ lessonId: mission.id, score, xp: reward, now });
      // 躓いた任務は、日を置いて見直しの対象にする
      if (shouldReview({ hintsUsed: progress.hintsUsed, mistakes: progress.mistakes, score })) {
        scheduleReview(mission.id, dayKey(now));
      }
      setCelebration({
        key: now,
        title: t('park.clear'),
        subtitle: t('park.score', { title: mission.title, score }),
        xp: reward,
        levelUp: after > levelFromXp(xp) ? { level: after, rank: rankFromLevel(after) } : undefined,
      });
      setDiagnosis(null);
      if (soundEnabled) sfx.clear();
    } else if (progress.stepIndex > prevStep.current) {
      grantXp(STEP_XP, now);
      pushToast(`+${String(STEP_XP)} XP`);
      setDiagnosis(null);
      if (soundEnabled) sfx.step();
    }
    prevStep.current = progress.stepIndex;
    prevCleared.current = progress.cleared;
    // xp を依存に入れると付与のたびに再実行されるため、進行の変化だけを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress.stepIndex, progress.cleared]);

  // 通らなかったときの助言
  useEffect(() => {
    if (passingNow || progress.cleared || !step) {
      setDiagnosis(null);
      return;
    }
    if (progress.commandsUsed === 0) return;
    try {
      setDiagnosis(step.diagnose?.(buildContext(session.getTimeline())) ?? null);
    } catch {
      setDiagnosis(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellState, passingNow, progress.cleared, progress.commandsUsed]);

  const retry = useCallback(() => {
    onRetry();
  }, [onRetry]);

  return (
    <div className="flex h-full min-w-0 flex-col overflow-x-hidden bg-cream">
      <XpToast toasts={toasts} />
      <Celebration
        data={celebration}
        nextLabel={nextMission?.title}
        onNext={
          nextMission
            ? () => {
                setCelebration(null);
                onSwitch(nextMission.id);
              }
            : undefined
        }
        onDismiss={() => {
          setCelebration(null);
        }}
      />

      {/* 上部：任務の切り替えと現在地 */}
      {editing ? (
        <EditorPanel
          target={editing}
          onSave={(content) => {
            session.saveFile(editing.path, content);
            setEditing(null);
          }}
          onCancel={() => {
            setEditing(null);
          }}
        />
      ) : null}

      <header className="flex flex-wrap items-center gap-3 border-b-8 border-wood-dark bg-[var(--wood)] px-5 py-3 shadow-[inset_0_-6px_0_rgba(0,0,0,0.2)]">
        <span className="sign px-4 py-1.5 text-lg font-extrabold">DEVLEARN</span>
        <label htmlFor="mission-picker" className="font-mono text-sm font-bold text-cream">
          {t('park.mission')}
        </label>
        {/* 任務は 40 本を超える。全部を並べると見出しが画面を埋めるので、1つの選択欄にまとめる */}
        <select
          id="mission-picker"
          value={mission.id}
          onChange={(event) => {
            onSwitch(event.target.value);
          }}
          className="knob max-w-[26rem] px-3 py-2 text-sm font-bold"
        >
          {TRACK_ORDER.map((track) => {
            const items = missions.filter((m) => m.track === track);
            if (items.length === 0) return null;
            return (
              <optgroup key={track} label={TRACK_LABEL[track]}>
                {items.map((m) => (
                  <option key={m.id} value={m.id}>
                    {clearedIds.has(m.id) ? '✓ ' : '　'}
                    {m.title}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
        <span className="font-mono text-sm text-cream">
          {t('park.clearedCount', { a: clearedIds.size, b: missions.length })}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-sm text-cream">
            {t('park.progress', {
              a: Math.min(progress.stepIndex + (progress.cleared ? 1 : 0), mission.steps.length),
              b: mission.steps.length,
            })}
          </span>
          <button type="button" onClick={retry} className="knob px-3 py-2 text-sm">
            {t('park.retry')}
          </button>
          <Link to="/map" className="knob px-3 py-2 text-sm">
            {t('park.map')}
          </Link>
          <Link to="/settings" className="knob px-3 py-2 text-sm">
            {t('park.settings')}
          </Link>
        </div>
      </header>

      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: `minmax(0, ${String(paneMain)}fr) auto minmax(0, ${String(100 - paneMain)}fr)` }}
      >
        {/* 左：手を動かす場所 */}
        {/* 上＝やること（溢れたらこの中で送る）、下＝端末。端末が画面外へ出ないよう行を固定する */}
        <div className="grid min-h-0 min-w-0 grid-rows-[minmax(0,auto)_minmax(0,1fr)]">
          <MissionPanel
            mission={mission}
            clearedIds={clearedIds}
            progress={progress}
            step={step}
            passingNow={passingNow}
            diagnosis={diagnosis}
            revealedHints={revealedHints}
            nextMission={nextMission}
            onRevealHint={() => {
              setProgress(useHint);
              setRevealedHints((n) => n + 1);
            }}
            onSwitch={onSwitch}
          />

          <div className="mx-3 mb-3 flex min-h-0 min-w-0 flex-1 flex-col border-4 border-wood-dark">
            <div className="plate flex items-center gap-2 px-4 py-1.5 text-sm font-extrabold">
              <span aria-hidden>🖥</span> {t('park.terminal')}
              <span className="ml-auto font-mono text-xs opacity-80">
                {session.state.cwd}
              </span>
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--wood-dark)]">
            <TerminalView
              ref={terminalRef}
              session={session}
              onExecuted={handleExecuted}
              onEditor={setEditing}
            />
            </div>
          </div>
        </div>

        <Splitter
          orientation="vertical"
          value={paneMain}
          min={30}
          max={75}
          label={t('park.splitLabel')}
          onChange={(next) => {
            updateSettings({ paneMain: next });
          }}
        />

        <VisualPanel
          session={session}
          tab={rightTab}
          onTab={setRightTab}
          previousVfs={previous?.vfs}
        />
      </div>
    </div>
  );
}
