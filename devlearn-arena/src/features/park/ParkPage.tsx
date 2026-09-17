import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { restoreShell, snapshotShell } from '@/engines/kernel/session';
import { isHelpCommand, lessonHelpCommands } from '@/engines/lesson/helpCommands';
import { allMissions, missingPrerequisites, missionById, recommendedNext } from '@/engines/lesson/registry';
import {
  buildContext, createProgress, currentStep, evaluate, markSkipped, passes, solutionThrough, useHint,
} from '@/engines/lesson/runner';
import { takeawaysOf } from '@/engines/lesson/takeaways';
import type { LessonDefinition, LessonProgressState, LessonStep } from '@/engines/lesson/types';
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
import { splitTemplate } from '@/ui/panes';
import { CITIES, CITY_TRACKS, cityOf, facilityById } from '@/content/city';
import { FacilityLesson } from '@/features/city/FacilityLesson';
import type { MissionTrack } from '@/engines/lesson/types';
import { REWARD } from '@/engines/city/sim';
import { CityPane } from '@/features/citymap/CityPane';
import { boostCity, placeFacility, rewardCity } from '@/features/citymap/cityStore';
import { CityBoard } from '@/features/citymap/CityBoard';
import type { CityEvent } from '@/features/citymap/CityMapView';
import { CityPortrait } from '@/visual/game/cityArt';
import { EditorPanel, type EditorTarget } from './EditorPanel';
import { Briefing } from './Briefing';
import { MissionPanel } from './MissionPanel';
import { MissionPicker } from './MissionPicker';
import { NO_HINTS, reveal, revealedCount, stepKey, type HintReveal } from './hints';
import type { PartState } from './StepChecklist';
import { evaluateParts } from '@/engines/lesson/authoring/conditions';

const STEP_XP = 10;

/** 何も指定が無いときに開く任務 */
const FALLBACK = allMissions()[0];

function isTrack(value: string | undefined): value is MissionTrack {
  return CITY_TRACKS.includes(value as MissionTrack);
}

/** その施設（章）で、次に取り組む任務。全部終えていれば最初の任務 */
function missionForFacility(facilityId: string, cleared: ReadonlySet<string>): string | undefined {
  const mine = allMissions().filter((m) => m.chapterId === facilityId);
  return (mine.find((m) => !cleared.has(m.id)) ?? mine[0])?.id;
}

/**
 * カテゴリ（シェル / Git / GitHub / Kubernetes / ネットワーク）ごとの作業画面。
 * 1 枚の中で、街づくり・施設の説明・依頼・コマンドをすべて行う。
 * 開く任務は、指定があればそれ、無ければ街の「次に取り組む施設」の任務。
 */
export default function ParkPage() {
  const { trackId } = useParams();
  const lastMissionId = useStore((s) => s.lastMissionId);
  const setLastMission = useStore((s) => s.setLastMission);
  const resetMission = useStore((s) => s.resetMission);
  const [params] = useSearchParams();
  const requested = params.get('mission');
  const requestedFacility = params.get('facility');
  const requestedTrack = requested === null ? undefined : missionById(requested)?.track;
  const track: MissionTrack = requestedTrack ?? (isTrack(trackId) ? trackId : 'kernel');

  const initialMission = (): string => {
    const { lessons, facilitiesBuilt } = useStore.getState();
    const cleared = new Set(Object.entries(lessons).filter(([, p]) => p.cleared).map(([id]) => id));
    if (requested !== null && missionById(requested)) return requested;
    if (requestedFacility !== null) {
      const picked = missionForFacility(requestedFacility, cleared);
      if (picked) return picked;
    }
    if (lastMissionId !== null && missionById(lastMissionId)?.track === track) return lastMissionId;
    const mine = allMissions().filter((m) => m.track === track);
    const city = cityOf(CITIES[track], new Set(facilitiesBuilt), mine, cleared);
    const next = city.nextFacilityId === null ? undefined : missionForFacility(city.nextFacilityId, cleared);
    return next ?? mine[0]?.id ?? FALLBACK?.id ?? '';
  };
  const [missionId, setMissionId] = useState(initialMission);
  // 苦情や要望に対応している最中か。違えば「街づくり」段（まず街を作る）。
  // 任務や施設を指定して来たとき、途中まで対応した任務があるときは対応から始める
  const [handling, setHandling] = useState(() => {
    if (requested !== null || requestedFacility !== null) return true;
    const { introsRead, lessons, facilitiesBuilt } = useStore.getState();
    const id = initialMission();
    const chapter = missionById(id)?.chapterId ?? '';
    return introsRead.includes(id) && facilitiesBuilt.includes(chapter) && lessons[id]?.cleared !== true;
  });

  // 全体図や用語集から任務・施設を指定して来たときは、そちらを開く
  useEffect(() => {
    if (requested !== null && requested !== missionId) setMissionId(requested);
    if (requested !== null) setHandling(true);
    // 指定が変わったときだけ反応する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);
  useEffect(() => {
    if (requestedFacility === null) return;
    const { lessons } = useStore.getState();
    const cleared = new Set(Object.entries(lessons).filter(([, p]) => p.cleared).map(([id]) => id));
    const picked = missionForFacility(requestedFacility, cleared);
    if (picked !== undefined) setMissionId(picked);
    setHandling(true);
  }, [requestedFacility]);
  useEffect(() => {
    if (!isTrack(trackId) || requested !== null || requestedFacility !== null) return;
    if (missionById(missionId)?.track !== trackId) setMissionId(initialMission());
    // カテゴリが変わったときだけ反応する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId]);

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
      handling={handling}
      onBackToCity={() => {
        setHandling(false);
      }}
      onSwitch={(id) => {
        setMissionId(id);
        setHandling(true);
      }}
      onPickFacility={(facilityId) => {
        const { lessons } = useStore.getState();
        const cleared = new Set(Object.entries(lessons).filter(([, p]) => p.cleared).map(([id]) => id));
        const picked = missionForFacility(facilityId, cleared);
        if (picked !== undefined) setMissionId(picked);
        setHandling(true);
      }}
      onRetry={() => {
        resetMission(mission.id);
        setAttempt((n) => n + 1);
      }}
    />
  );
}

/**
 * カテゴリの作業画面の中身。
 * 左上＝学習パネル（市長就任 → 施設の建設を決める → 住民の要望を聞く → コマンドで対応）、左下＝ターミナル、右＝街といまの状態。
 * 施設を建てて要望を聞くまで、ターミナルは使えない（説明と背景を理解してからコマンドを打つ）。
 */
function Park({
  mission,
  handling,
  onBackToCity,
  onSwitch,
  onPickFacility,
  onRetry,
}: {
  mission: LessonDefinition;
  /** 苦情・要望に対応している最中か（違えば街づくり） */
  handling: boolean;
  onBackToCity: () => void;
  onSwitch: (id: string) => void;
  /** 街の地区を押したとき、その施設の任務へ移る */
  onPickFacility: (facilityId: string) => void;
  onRetry: () => void;
}) {
  const t = useT();
  const saveMission = useStore((s) => s.saveMission);
  const savedProgress = useStore((s) => s.missionProgress[mission.id]);
  const savedState = useStore((s) => s.missionState[mission.id]);

  const [initialProgress] = useState<LessonProgressState>(() =>
    savedProgress ? { ...createProgress(mission), ...savedProgress } : createProgress(mission),
  );
  const [progress, setProgress] = useState<LessonProgressState>(initialProgress);
  const [hintReveal, setHintReveal] = useState<HintReveal>(NO_HINTS);
  // 端末の hint が読む、いまの手順と見たヒントの数。
  // コマンドは描画を待たずに続けて打たれることがあるので、ref に持って同期で読み書きする
  const helpRef = useRef<{ step: LessonStep | undefined; stepIndex: number; key: string }>({
    step: undefined,
    stepIndex: 0,
    key: '',
  });
  const revealRef = useRef<HintReveal>(NO_HINTS);
  const revealHint = useCallback(() => {
    revealRef.current = reveal(revealRef.current, helpRef.current.key);
    setHintReveal(revealRef.current);
    setProgress(useHint);
  }, []);

  // 復元は開いた瞬間の1回だけ。以後の保存で作り直さない。
  // ヒントは画面に勝手に出さず、端末で hint と打ったときだけ出す
  const [options] = useState(() => {
    const base = savedState ? { ...mission.initial, restore: restoreShell(savedState) } : mission.initial;
    const registry = (base.registry ?? createDefaultRegistry()).registerAll(
      lessonHelpCommands({
        step: () => helpRef.current.step,
        stepIndex: () => helpRef.current.stepIndex,
        revealed: () => revealedCount(revealRef.current, helpRef.current.key),
        onHint: revealHint,
        // 模範解答を見たのも、ヒントを1件使ったのと同じに数える
        onAnswer: () => {
          setProgress(useHint);
        },
      }),
    );
    return { ...base, registry };
  });

  const session = useShellSession(options);
  const terminalRef = useRef<TerminalHandle>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditorTarget | null>(null);

  const xp = useStore((s) => s.profile.xp);
  const soundEnabled = useStore((s) => s.settings.soundEnabled);
  const grantXp = useStore((s) => s.grantXp);
  const clearLesson = useStore((s) => s.clearLesson);
  const scheduleReview = useStore((s) => s.scheduleReview);
  const paneMain = useStore((s) => s.settings.paneMain);
  const paneTask = useStore((s) => s.settings.paneTask);
  const updateSettings = useStore((s) => s.updateSettings);
  const markIntroRead = useStore((s) => s.markIntroRead);
  // 開いた瞬間に「学ぶ」画面を出すか。読んだ任務は、設定で頼まれない限り省く
  const [showIntro, setShowIntro] = useState(() => {
    const { introsRead, settings } = useStore.getState();
    return settings.introAlways || !introsRead.includes(mission.id);
  });
  const [review, setReview] = useState<'facility' | 'briefing' | null>(null);
  const startMission = useCallback(() => {
    markIntroRead(mission.id);
    // 読んだ直後にリロードされても、また出てこないようにその場で書き込む
    flushSave();
    setShowIntro(false);
    setReview(null);
  }, [markIntroRead, mission.id]);

  // 街と施設
  const plan = CITIES[mission.track];
  const facilitiesBuilt = useStore((s) => s.facilitiesBuilt);
  const buildFacility = useStore((s) => s.buildFacility);
  const introsRead = useStore((s) => s.introsRead);
  const facility = facilityById(missionById(mission.id)?.chapterId ?? '');
  const facilityBuilt = facility === undefined || facilitiesBuilt.includes(facility.id);
  const [welcomed, setWelcomed] = useState(() => {
    const state = useStore.getState();
    return state.cities[mission.track] !== undefined || plan.facilities.some((f) => state.facilitiesBuilt.includes(f.id));
  });
  // 建てた直後は「建った！」を見せてから依頼へ進む
  const [justBuilt, setJustBuilt] = useState(false);
  // 建設を決めた施設は、右の地図で配置してもらう
  const [placeRequest, setPlaceRequest] = useState<string | null>(null);
  const stage: Stage =
    review ?? (!welcomed ? 'welcome' : !handling ? 'city' : !facilityBuilt || justBuilt ? 'facility' : showIntro ? 'briefing' : 'work');

  // 地図に出す出来事（正解・対応・完了）
  const [cityEvents, setCityEvents] = useState<CityEvent[]>([]);
  const cityEvent = useCallback((text: string, color: string) => {
    setCityEvents((list) => [...list.slice(-9), { id: (list[list.length - 1]?.id ?? 0) + 1, facilityId: facility?.id ?? null, text, color }]);
  }, [facility?.id]);

  const step = currentStep(mission, progress);
  const hintKey = stepKey(mission.id, progress.stepIndex);
  helpRef.current = { step: progress.cleared ? undefined : step, stepIndex: progress.stepIndex, key: hintKey };

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

  // 手順が変われば、直前の失敗は消す
  useEffect(() => {
    setLastError(null);
  }, [mission.id, progress.stepIndex]);

  const revealed = Math.min(step?.hints.length ?? 0, revealedCount(hintReveal, hintKey));

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
  // 推奨順で、いまの任務より後ろにあってまだ終えていないもの。無ければ最初から探す
  const nextMission = useMemo(() => {
    const here = missionById(mission.id)?.order ?? 0;
    const after = catalogue.find((m) => m.order > here && !clearedIds.has(m.id));
    return after ?? recommendedNext(clearedIds, mission.id);
  }, [catalogue, clearedIds, mission.id]);
  // 先にやっておくとよい任務のうち、まだのもの。遊べなくはしない
  const prerequisites = useMemo(
    () => missingPrerequisites(mission.id, clearedIds).map((m) => ({ id: m.id, title: m.title })),
    [mission.id, clearedIds],
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
        skipped: [...progress.skipped],
      },
      snapshotShell(shellState),
    );
  }, [mission.id, progress, shellState, saveMission]);

  /** 祝いの画面に出す、街の施設の稼働の行 */
  const cityLines = (): { lines: string[]; href: string } | undefined => {
    const chapterId = missionById(mission.id)?.chapterId;
    const facility = chapterId === undefined ? undefined : facilityById(chapterId);
    if (!facility || chapterId === undefined) return undefined;
    const { lessons: done, facilitiesBuilt } = useStore.getState();
    const mine = allMissions().filter((m) => m.chapterId === chapterId);
    const cleared = mine.filter((m) => m.id === mission.id || done[m.id]?.cleared === true).length;
    const href = `/world/${mission.track}?facility=${encodeURIComponent(facility.id)}`;
    if (!facilitiesBuilt.includes(facility.id)) {
      return { href, lines: [t('celebration.facilityUnbuilt', { name: facility.name })] };
    }
    return {
      href,
      lines: [
        cleared >= mine.length
          ? t('celebration.facilityComplete', { name: facility.name })
          : t('celebration.facility', { name: facility.name, a: cleared, b: mine.length }),
      ],
    };
  };

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
    (line: string, exitCode: number, stderr: string) => {
      // 助けを求めたことは、手数にも失敗にも数えない
      if (skippingRef.current || isHelpCommand(line)) return;
      setProgress((p) => ({
        ...p,
        commandsUsed: p.commandsUsed + 1,
        mistakes: p.mistakes + (exitCode === 0 ? 0 : 1),
      }));
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
    setLastError(null);
  }, [step, progress, mission, session, t, scheduleReview]);

  // 状態が変われば必ず judge する。コマンド実行の瞬間だけに頼らない
  useEffect(() => {
    setProgress((p) => evaluate(mission, p, session.getTimeline()));
    // session は毎描画で作り直されるため、状態そのものを依存に置く
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellState, mission]);

  /** 通過した手順ぶんの予算。解答を見て飛ばした手順には出さない */
  const rewardSteps = (from: number, to: number): void => {
    let total = 0;
    for (let i = from; i < to; i += 1) {
      if (progress.skipped.includes(i)) continue;
      if (rewardCity(mission.track, `step:${mission.id}:${String(i)}`, REWARD.step)) total += REWARD.step;
    }
    // コマンドで対応すると、施設の工事が進み、街の時間が進んで住民が動く
    if (total > 0) {
      pushToast(t('city.reward.step', { n: total }));
      boostCity(mission.track, city, CITY_BOOST.step);
    }
    cityEvent(total > 0 ? t('city.event.stepPaid', { n: total }) : t('city.event.step'), EVENT_COLOR.step);
  };
  /** 理解度の問題に正解したぶんの予算 */
  const rewardAnswer = (key: string, firstTry: boolean, full: number, retry: number): void => {
    const amount = firstTry ? full : retry;
    const paid = rewardCity(mission.track, key, amount);
    if (paid) pushToast(t('city.reward.quiz', { n: amount }));
    cityEvent(paid ? t('city.event.quizPaid', { n: amount }) : t('city.event.quiz'), EVENT_COLOR.quiz);
  };

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
      const townLines = cityLines();
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
        takeaways: takeawaysOf(mission),
        town: townLines,
      });
      setDiagnosis(null);
      // コマンドで要望を解決したら、街の予算が入る
      rewardSteps(prevStep.current, mission.steps.length);
      if (rewardCity(mission.track, `clear:${mission.id}`, REWARD.clear)) {
        pushToast(t('city.reward.clear', { n: REWARD.clear }));
        boostCity(mission.track, city, CITY_BOOST.clear);
      }
      cityEvent(t('city.event.clear', { n: REWARD.clear }), EVENT_COLOR.clear);
      if (soundEnabled) sfx.clear();
    } else if (progress.stepIndex > prevStep.current) {
      grantXp(STEP_XP, now);
      pushToast(`+${String(STEP_XP)} XP`);
      rewardSteps(prevStep.current, progress.stepIndex);
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

  const trackMissions = useMemo(() => catalogue.filter((m) => m.track === mission.track), [catalogue, mission.track]);
  const city = useMemo(
    () => cityOf(plan, new Set(facilitiesBuilt), trackMissions, clearedIds),
    [plan, facilitiesBuilt, trackMissions, clearedIds],
  );
  /** 苦情・地図・住民の声から施設を選んだとき：その施設の対応へ（いまの施設なら対応を始める） */
  const studyFacility = (id: string): void => {
    onPickFacility(id);
  };
  // いま取り組んでいる任務の手順の進み。終えた任務は街の状態にもう入っている
  const partial = useMemo(
    () =>
      facility === undefined || clearedIds.has(mission.id) || !facilityBuilt
        ? null
        : { facilityId: facility.id, fraction: progress.cleared ? 1 : progress.stepIndex / Math.max(1, mission.steps.length) },
    [facility, clearedIds, mission.id, mission.steps.length, facilityBuilt, progress.cleared, progress.stepIndex],
  );
  // 作業に入ったら、すぐ打てるようにターミナルへ
  useEffect(() => {
    if (stage !== 'work') return;
    const timer = setTimeout(() => {
      terminalRef.current?.focus();
    }, 50);
    return () => {
      clearTimeout(timer);
    };
  }, [stage]);

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
        <Link to="/map" className="sign px-3 py-1.5 text-base font-extrabold">
          {t('park.map')}
        </Link>
        <span className="text-xl font-extrabold text-cream" data-testid="world-title">
          🏙 {plan.name}
        </span>
        <span className="plate px-2 py-0.5 text-xs font-extrabold" data-testid="world-rank">
          {t(`world.rank.${city.rank}`)}
        </span>
        <span className="font-mono text-sm text-cream" data-testid="world-stats">
          {t('world.stats', { a: city.built, b: city.facilities.length })}
        </span>
        <label htmlFor="mission-picker" className="font-mono text-sm font-bold text-cream">
          {t('park.mission')}
        </label>
        {/* 任務は 700 本を超える。並べるのではなく、絞り込んで選ぶ */}
        <MissionPicker
          currentId={mission.id}
          cleared={(id: string) => clearedIds.has(id)}
          onPick={onSwitch}
        />
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm text-cream">
            {t('park.progress', {
              a: Math.min(progress.stepIndex + (progress.cleared ? 1 : 0), mission.steps.length),
              b: mission.steps.length,
            })}
          </span>
          {facility && facilityBuilt ? (
            <button
              type="button"
              onClick={() => {
                setReview('facility');
              }}
              className="knob px-3 py-2 text-sm"
            >
              {t('world.reviewFacility')}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setReview('briefing');
            }}
            className="knob px-3 py-2 text-sm"
          >
            {t('intro.reopen')}
          </button>
          <button type="button" onClick={retry} className="knob px-3 py-2 text-sm">
            {t('park.retry')}
          </button>
          <Link to="/glossary" className="knob px-3 py-2 text-sm">
            {t('nav.glossary')}
          </Link>
          <Link to="/settings" className="knob px-3 py-2 text-sm">
            {t('park.settings')}
          </Link>
        </div>
      </header>

      <div
        className="grid min-h-0 flex-1"
        style={{ gridTemplateColumns: splitTemplate(paneMain) }}
      >
        {/* 左：手を動かす場所 */}
        {/* 上＝やること（溢れたらこの中で送る）、下＝端末。間の仕切りで高さを変えられる */}
        <div className="grid min-h-0 min-w-0" style={{ gridTemplateRows: splitTemplate(stage === 'work' ? paneTask : 74) }}>
          <div className="flex min-h-0 min-w-0 flex-col" data-testid="learning-panel" data-stage={stage}>
            <StageBar stage={stage} onBackToCity={stage === 'city' || stage === 'welcome' ? undefined : onBackToCity} />
            {stage === 'work' ? (
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
                nextMission={nextMission}
                prerequisites={prerequisites}
                // ヒントは左上のこのパネルに出す。端末には打ち込まない（端末で hint と打てば端末にも出る）
                onRevealHint={revealHint}
                onSkip={skipStep}
                onSwitch={onSwitch}
              />
            ) : (
              <div className="scroll mx-3 mb-3 mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {stage === 'welcome' ? (
                  <Welcome
                    track={mission.track}
                    name={plan.name}
                    welcome={plan.welcome}
                    guide={plan.guide}
                    onStart={() => {
                      setWelcomed(true);
                    }}
                  />
                ) : stage === 'city' ? (
                  <CityBoard track={mission.track} city={city} onHandle={studyFacility} />
                ) : stage === 'facility' && facility ? (
                  <FacilityLesson
                    key={facility.id}
                    inline
                    facility={facility}
                    track={mission.track}
                    guide={plan.guide}
                    built={facilitiesBuilt.includes(facility.id) && !justBuilt}
                    firstMissionId={null}
                    onAnswer={(q, firstTry) => {
                      rewardAnswer(`quiz:${facility.id}:${String(q)}`, firstTry, REWARD.quiz, REWARD.quizRetry);
                    }}
                    onBuild={() => {
                      if (!facilitiesBuilt.includes(facility.id)) {
                        setJustBuilt(true);
                        buildFacility(facility.id);
                        if (rewardCity(mission.track, `learn:${facility.id}`, REWARD.learn)) pushToast(t('city.reward.learn', { n: REWARD.learn }));
                        // 建設を決めたら、すぐ地図に工事現場ができる（あとで移設できる）
                        placeFacility(mission.track, city, facility.id);
                        setPlaceRequest(facility.id);
                        cityEvent(t('city.event.build', { name: facility.name }), EVENT_COLOR.build);
                        flushSave();
                      }
                    }}
                    onContinue={() => {
                      setJustBuilt(false);
                      setReview(null);
                    }}
                    onClose={() => {
                      setReview(null);
                    }}
                  />
                ) : (
                  <Briefing
                    key={mission.id}
                    mission={mission}
                    prerequisites={prerequisites}
                    onStart={startMission}
                    onSwitch={onSwitch}
                    canSkip={introsRead.includes(mission.id)}
                    onAnswer={(q, firstTry) => {
                      rewardAnswer(`check:${mission.id}:${String(q)}`, firstTry, REWARD.check, REWARD.checkRetry);
                    }}
                  />
                )}
              </div>
            )}
          </div>

          <Splitter
            orientation="horizontal"
            value={paneTask}
            min={15}
            max={70}
            label={t('park.taskSplitLabel')}
            onChange={(next) => {
              updateSettings({ paneTask: next });
            }}
          />

          <div className="mx-3 mb-3 flex min-h-0 min-w-0 flex-1 flex-col border-4 border-wood-dark">
            <div className="plate flex items-center gap-2 px-4 py-1.5 text-sm font-extrabold">
              <span aria-hidden>🖥</span> {t('park.terminal')}
              <span className="ml-auto font-mono text-xs opacity-80">
                {session.state.cwd}
              </span>
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-[var(--wood-dark)]">
            {stage === 'work' ? (
              <TerminalView
                ref={terminalRef}
                session={session}
                onExecuted={handleExecuted}
                onEditor={setEditing}
              />
            ) : (
              <div data-testid="terminal-lock" className="grid h-full place-items-center p-4 text-center">
                <div className="flex max-w-md flex-col items-center gap-1">
                  <p className="text-base font-extrabold text-cream">
                    {stage === 'welcome'
                      ? t('world.lock.welcome')
                      : stage === 'city'
                        ? t('world.lock.city')
                      : stage === 'facility'
                        ? t('world.lock.facility', { name: facility?.name ?? '' })
                        : t('world.lock.briefing')}
                  </p>
                  <p className="text-xs text-cream opacity-80">{t('world.lockLead')}</p>
                </div>
              </div>
            )}
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

        <div className="flex min-h-0 min-w-0 flex-col">
          <CityPane
            track={mission.track}
            city={city}
            placeRequest={placeRequest}
            partial={partial}
            events={cityEvents}
            onStudy={studyFacility}
          />
        </div>
      </div>
    </div>
  );
}

type Stage = 'welcome' | 'city' | 'facility' | 'briefing' | 'work';
const STAGES = ['city', 'facility', 'briefing', 'work'] as const;

/** 出来事で進める街の日数 */
const CITY_BOOST = { step: 3, clear: 10 } as const;
const EVENT_COLOR = { quiz: '#2f6fb0', step: '#d9822b', clear: '#b8860b', build: '#7a63d6' } as const;

/** いまどの段階にいるか。街を作る → 施設の建設を決める → 住民の要望を聞く → コマンドで対応する */
function StageBar({ stage, onBackToCity }: { stage: Stage; onBackToCity?: (() => void) | undefined }) {
  const t = useT();
  const index = stage === 'welcome' ? -1 : STAGES.indexOf(stage);
  return (
    <ol aria-label={t('world.stages')} className="mx-3 mt-3 flex shrink-0 flex-wrap items-center gap-1 text-xs font-extrabold">
      {STAGES.map((s, i) => (
        <li
          key={s}
          data-stage-step={s}
          aria-current={i === index ? 'step' : undefined}
          className={`border-2 px-2 py-1 ${i === index ? 'border-[var(--gold-dark)] bg-gold text-ink' : i < index ? 'border-[var(--ok)] bg-[#dff0cf] text-ink' : 'border-[var(--cream-dark)] bg-cream text-ink-soft'}`}
        >
          {i < index ? '✓ ' : `${String(i + 1)}. `}
          {t(`world.stage.${s}`)}
        </li>
      ))}
      {onBackToCity ? (
        <li className="ml-auto">
          <button type="button" data-testid="back-to-city" onClick={onBackToCity} className="knob px-2 py-1 text-xs">
            {t('world.backToCity')}
          </button>
        </li>
      ) : null}
    </ol>
  );
}

/** はじめてそのカテゴリに来たときの、街の案内人の話 */
function Welcome({ track, name, welcome, guide, onStart }: { track: MissionTrack; name: string; welcome: string; guide: { name: string; role: string }; onStart: () => void }) {
  const t = useT();
  return (
    <section data-testid="welcome" className="flex flex-col gap-3 border-4 border-wood-dark bg-white p-4">
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 flex-col items-center">
          <CityPortrait track={track} size={4} talking animate />
          <span className="plate mt-1 px-2 py-0.5 text-xs font-extrabold">{t('brief.giver', guide)}</span>
        </div>
        <div className="min-w-0">
          <p className="text-lg font-extrabold">{t('world.welcomeTitle', { name })}</p>
          <p className="mt-1 text-base leading-relaxed">{welcome}</p>
        </div>
      </div>
      <p className="border-l-4 border-[var(--gold-dark)] bg-[var(--gold)]/20 px-3 py-2 text-sm leading-relaxed">{t('world.welcomeFlow')}</p>
      <button type="button" data-testid="welcome-start" onClick={onStart} className="sign w-fit px-6 py-2.5 text-base font-extrabold">
        {t('world.start')}
      </button>
    </section>
  );
}
