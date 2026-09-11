import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { restoreShell, snapshotShell } from '@/engines/kernel/session';
import { allMissions, missionById } from '@/engines/lesson/registry';
import {
  buildContext, createProgress, currentStep, evaluate, markSkipped, passes, solutionThrough, useHint,
} from '@/engines/lesson/runner';
import type { LessonDefinition, LessonProgressState } from '@/engines/lesson/types';
import { TerminalView, type TerminalHandle } from '@/features/terminal/TerminalView';
import { useShellSession } from '@/features/terminal/useShellSession';
import { useT } from '@/i18n/useT';
import { dayKey } from '@/lib/date';
import { shouldReview } from '@/lib/review';
import { sfx } from '@/lib/sfx';
import { levelFromXp, rankFromLevel, scoreAttempt, xpForScore } from '@/lib/xp';
import { useStore } from '@/store';
import { flushSave } from '@/store/persistence';
import { Celebration, type CelebrationData } from '@/ui/Celebration';
import { XpToast, type ToastData } from '@/ui/XpToast';
import { Splitter } from '@/ui/Splitter';
import { EditorPanel, type EditorTarget } from './EditorPanel';
import { IntroScreen } from './IntroScreen';
import { MissionPanel } from './MissionPanel';
import { MissionPicker } from './MissionPicker';
import {
  attemptsUntilNextHint, NO_HINTS, reveal, revealedCount, shouldShowAnswer, shownHints, stepKey,
  type HintReveal,
} from './hints';
import type { PartState } from './StepChecklist';
import { evaluateParts } from '@/engines/lesson/authoring/conditions';
import { VisualPanel } from './VisualPanel';
import { relevantTabs, tabForTrack, type VisualTab } from './visualTabs';

const STEP_XP = 10;

/** 何も指定が無いときに開く任務 */
const FALLBACK = allMissions()[0];

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
  // 初期状態の組み立ては開いたときだけ。一覧を作るために全部を組み立てたりはしない
  const mission = useMemo(
    () => missionById(missionId)?.build() ?? FALLBACK?.build() ?? null,
    [missionId],
  );

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
  const [initialProgress] = useState<LessonProgressState>(() =>
    savedProgress ? { ...createProgress(mission), ...savedProgress } : createProgress(mission),
  );

  const session = useShellSession(options);
  const terminalRef = useRef<TerminalHandle>(null);
  const [progress, setProgress] = useState<LessonProgressState>(initialProgress);
  const [hintReveal, setHintReveal] = useState<HintReveal>(NO_HINTS);
  // いまの手順で何回つまずいたか。ヒントを自分から開く判断に使う
  const [attempts, setAttempts] = useState(0);
  const [lastError, setLastError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  // 開いた瞬間から、その任務の世界が見える図を選んでおく
  const [rightTab, setRightTab] = useState<VisualTab>(() => tabForTrack(mission.track));
  const relevant = useMemo(() => relevantTabs(mission.track), [mission.track]);
  const [editing, setEditing] = useState<EditorTarget | null>(null);

  const xp = useStore((s) => s.profile.xp);
  const soundEnabled = useStore((s) => s.settings.soundEnabled);
  const grantXp = useStore((s) => s.grantXp);
  const clearLesson = useStore((s) => s.clearLesson);
  const scheduleReview = useStore((s) => s.scheduleReview);
  const paneMain = useStore((s) => s.settings.paneMain);
  const updateSettings = useStore((s) => s.updateSettings);
  const markIntroRead = useStore((s) => s.markIntroRead);
  // 開いた瞬間に「学ぶ」画面を出すか。読んだ任務は、設定で頼まれない限り省く
  const [showIntro, setShowIntro] = useState(() => {
    const { introsRead, settings } = useStore.getState();
    return settings.introAlways || !introsRead.includes(mission.id);
  });
  const startMission = useCallback(() => {
    markIntroRead(mission.id);
    // 読んだ直後にリロードされても、また出てこないようにその場で書き込む
    flushSave();
    setShowIntro(false);
    terminalRef.current?.focus();
  }, [markIntroRead, mission.id]);

  const entries = session.journal.entries;
  const cursor = session.journal.cursor;
  const previous = entries[cursor - 1]?.state;
  const step = currentStep(mission, progress);
  const hintKey = stepKey(mission.id, progress.stepIndex);

  // 判定に使う文脈。条件の内訳を出すのにも使い回す
  const context = useMemo(() => {
    try {
      return buildContext(session.getTimeline());
    } catch {
      return null;
    }
    // session は毎描画で作り直されるので、状態そのものを見る
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.state]);

  /** いまどこまで満たせているか。通らない理由を自分で確かめられるようにする */
  const parts = useMemo<PartState[]>(() => {
    if (!step?.parts || context === null) return [];
    return evaluateParts(step.parts, context).map(({ condition, passing }) => ({
      label: condition.label,
      passing,
      howTo: condition.howTo,
    }));
  }, [step, context]);

  // 手順が変われば、つまずいた回数も直前の失敗も数え直す
  useEffect(() => {
    setAttempts(0);
    setLastError(null);
  }, [mission.id, progress.stepIndex]);

  const hintCount = step?.hints.length ?? 0;
  const revealed = shownHints(hintReveal, hintKey, attempts, hintCount);
  const autoOpened = revealed > revealedCount(hintReveal, hintKey);
  const answer =
    step?.answer !== undefined && shouldShowAnswer(attempts, hintCount) ? step.answer : null;

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
  const catalogue = allMissions();
  const clearedIds = useMemo(
    () => new Set(catalogue.filter((m) => lessons[m.id]?.cleared === true).map((m) => m.id)),
    [catalogue, lessons],
  );
  // 同じ章の続きを優先し、無ければ全体から次の1本を選ぶ
  const nextMission = useMemo(() => {
    const chapter = mission.id.split('/').slice(0, 2).join('/');
    const inChapter = catalogue.find(
      (m) => m.id !== mission.id && m.chapterId === chapter && !clearedIds.has(m.id),
    );
    const found = inChapter ?? catalogue.find((m) => m.id !== mission.id && !clearedIds.has(m.id));
    return found ?? null;
  }, [catalogue, clearedIds, mission.id]);

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
        skipped: [...progress.skipped],
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

  // 手順を飛ばすために解答を流している間は、手数にも失敗にも数えない
  const skippingRef = useRef(false);

  /** コマンド実行では回数と失敗数だけを数える。合否の判定は下の効果で行う */
  const handleExecuted = useCallback(
    (_line: string, exitCode: number, stderr: string) => {
      if (skippingRef.current) return;
      setProgress((p) => ({
        ...p,
        commandsUsed: p.commandsUsed + 1,
        mistakes: p.mistakes + (exitCode === 0 ? 0 : 1),
      }));
      setAttempts((n) => n + 1);
      setLastError(exitCode === 0 ? null : stderr.trim() === '' ? null : stderr);
    },
    [],
  );

  /**
   * いまの手順を飛ばす。解答を端末で実際に打つので、何をすれば通ったのかが端末に残る。
   * 途中で別の道に進んでいて解答が合わないときは、初期状態からその手順までの解答を打ち直す。
   * どちらの場合も手順は必ず通る。「前が終わらないと進めない」で詰まらないようにするため。
   */
  const skipStep = useCallback(() => {
    if (!step || progress.cleared) return;
    const index = progress.stepIndex;
    const terminal = terminalRef.current;
    if (!terminal) return;
    skippingRef.current = true;
    try {
      terminal.note(t('park.skipNote', { n: index + 1 }));
      if (step.solution.length > 0) terminal.submit(step.solution.join('\n'));
      const after = evaluate(mission, progress, session.getTimeline());
      if (!after.cleared && after.stepIndex <= index) {
        terminal.note(t('park.skipReplay', { n: index + 1 }));
        session.load(mission.initial);
        terminal.submit(solutionThrough(mission, index).join('\n'));
      }
    } finally {
      skippingRef.current = false;
    }
    setProgress((p) => markSkipped(p, index));
    // 飛ばしたところは、クリアしたかどうかにかかわらず見直しに回す
    scheduleReview(mission.id, dayKey(Date.now()));
    setAttempts(0);
    setLastError(null);
  }, [step, progress, mission, session, t, scheduleReview]);

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
      const attempt = {
        hintsUsed: progress.hintsUsed,
        commandsUsed: progress.commandsUsed,
        parCommands: mission.parCommands,
      };
      // 飛ばした手順はスコアから引く。XP は飛ばさなかったときと同じだけ渡す
      const score = scoreAttempt({ ...attempt, skipped: progress.skipped.length });
      const reward = xpForScore(scoreAttempt(attempt), mission.kind === 'boss' ? 'boss' : 'drill');
      const after = levelFromXp(xp + reward);
      clearLesson({ lessonId: mission.id, score, xp: reward, now });
      // 躓いた任務は、日を置いて見直しの対象にする
      if (
        shouldReview({
          hintsUsed: progress.hintsUsed,
          mistakes: progress.mistakes,
          score,
          skipped: progress.skipped.length,
        })
      ) {
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

  // 図を押したときは、そのコマンドを端末で実際に打つ。打ったものは端末に残る
  const runFromDiagram = useCallback((line: string) => {
    terminalRef.current?.submit(line);
  }, []);

  const retry = useCallback(() => {
    onRetry();
  }, [onRetry]);

  return (
    <div className="flex h-full min-w-0 flex-col overflow-x-hidden bg-cream">
      <XpToast toasts={toasts} />
      {showIntro ? <IntroScreen mission={mission} onStart={startMission} /> : null}
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
        {/* 任務は 700 本を超える。並べるのではなく、絞り込んで選ぶ */}
        <MissionPicker
          currentId={mission.id}
          cleared={(id: string) => clearedIds.has(id)}
          onPick={onSwitch}
        />
        <span className="font-mono text-sm text-cream">
          {t('park.clearedCount', { a: clearedIds.size, b: catalogue.length })}
        </span>
        <div className="ml-auto flex items-center gap-3">
          <span className="font-mono text-sm text-cream">
            {t('park.progress', {
              a: Math.min(progress.stepIndex + (progress.cleared ? 1 : 0), mission.steps.length),
              b: mission.steps.length,
            })}
          </span>
          <button
            type="button"
            onClick={() => {
              setShowIntro(true);
            }}
            className="knob px-3 py-2 text-sm"
          >
            {t('intro.reopen')}
          </button>
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
            total={catalogue.length}
            progress={progress}
            step={step}
            passingNow={passingNow}
            diagnosis={diagnosis}
            revealedHints={revealed}
            parts={parts}
            lastError={lastError}
            attempts={attempts}
            untilNextHint={attemptsUntilNextHint(attempts)}
            answer={answer}
            autoOpened={autoOpened}
            onInsert={(text) => {
              terminalRef.current?.insertText(text);
              terminalRef.current?.focus();
            }}
            nextMission={nextMission}
            onRevealHint={() => {
              setProgress(useHint);
              setHintReveal((h) => reveal(h, hintKey));
            }}
            onSkip={skipStep}
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
          relevant={relevant}
          onCommand={runFromDiagram}
          previous={previous}
        />
      </div>
    </div>
  );
}
