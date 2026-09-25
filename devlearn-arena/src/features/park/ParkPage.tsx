import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { restoreShell, snapshotShell } from '@/engines/kernel/session';
import { isHelpCommand, lessonHelpCommands } from '@/engines/lesson/helpCommands';
import { allMissions, mainMissions, missionById, recommendedNext } from '@/engines/lesson/registry';
import {
  buildContext, createProgress, currentStep, evaluate, markSkipped, passes, solutionThrough, useHint,
} from '@/engines/lesson/runner';
import { takeawaysOf } from '@/engines/lesson/takeaways';
import type { LessonDefinition, LessonProgressState, LessonStep, MissionTrack } from '@/engines/lesson/types';
import type { DesignKind } from '@/city/model';
import { journeyOf, type WorldState } from '@/city/journey';
import { tourOf } from '@/city/tour';
import type { JourneyPlay } from '@/city3d/journey';
import type { InfoView } from '@/city3d/overlay';
import type { TerminalHandle } from '@/features/terminal/TerminalView';
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
import { Icon } from '@/ui/Icon';
import { CITIES, CITY_TRACKS, cityOf, facilityById } from '@/content/city';
import { growCity, growthOf } from '@/features/citymap/cityStore';
import { useDerivedCity } from '@/features/citymap/derive';
import { CityStage } from '@/features/citymap/CityStage';
import { EditorPanel, type EditorTarget } from './EditorPanel';
import { MissionPicker } from './MissionPicker';
import { NO_HINTS, reveal, revealedCount, stepKey, type HintReveal } from './hints';
import { gainFor, growsFromCommand, type GrowthTrigger } from './growth';
import { nextTrip, type Trip } from './trip';
import { faultsOf, troubles as troublesOf } from './faults';
import { TerminalDock } from './hud/TerminalDock';
import { TaskCard } from './hud/TaskCard';
import { TourPanel } from './hud/TourPanel';
import { JourneyStrip } from './hud/JourneyStrip';
import { FaultMenu } from './hud/FaultMenu';
import { ExplainDrawer } from './hud/ExplainDrawer';
import { TopBar } from './hud/TopBar';
import { BuildingPanel } from './hud/BuildingPanel';
import { buildingInfo } from './hud/buildingInfo';
import { BuildMenu } from './hud/BuildMenu';
import { InfoViews } from './hud/InfoViews';
import { Voices } from './hud/Voices';
import { voicesOf } from './hud/voiceFeed';
import { variantsOf, type BuildVariant } from './hud/buildTools';
import { cityMetrics, clockOf, milestoneOf, type Speed } from './hud/metrics';
import { HUD, SIZE } from './hud/theme';

const STEP_XP = 10;

/** 何も指定が無いときに開く任務 */
const FALLBACK = mainMissions()[0];

function isTrack(value: string | undefined): value is MissionTrack {
  return CITY_TRACKS.includes(value as MissionTrack);
}

/** その施設（章）で、次に取り組む任務。本編だけを見る（値だけ違う反復演習は挟まない） */
function missionForFacility(facilityId: string, cleared: ReadonlySet<string>): string | undefined {
  const mine = mainMissions().filter((m) => m.chapterId === facilityId);
  return (mine.find((m) => !cleared.has(m.id)) ?? mine[0])?.id;
}

/**
 * カテゴリ（シェル / Git / GitHub / Kubernetes / ネットワーク）ごとの作業画面。
 *
 * 画面いっぱいが 3D の街で、その上に HUD を重ねる。
 * 端末は左に常駐し、いつでも打てる。読ませてから開く段は無い。
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
      if (picked !== undefined) return picked;
    }
    if (lastMissionId !== null && missionById(lastMissionId)?.track === track) return lastMissionId;
    const mine = mainMissions().filter((m) => m.track === track);
    const city = cityOf(CITIES[track], new Set(facilitiesBuilt), mine, cleared);
    const next = city.nextFacilityId === null ? undefined : missionForFacility(city.nextFacilityId, cleared);
    return next ?? mine[0]?.id ?? FALLBACK?.id ?? '';
  };
  const [missionId, setMissionId] = useState(initialMission);

  // 全体図や用語集から任務・施設を指定して来たときは、そちらを開く
  useEffect(() => {
    if (requested !== null && requested !== missionId) setMissionId(requested);
    // 指定が変わったときだけ反応する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);
  useEffect(() => {
    if (requestedFacility === null) return;
    const { lessons } = useStore.getState();
    const cleared = new Set(Object.entries(lessons).filter(([, p]) => p.cleared).map(([id]) => id));
    const picked = missionForFacility(requestedFacility, cleared);
    if (picked !== undefined) setMissionId(picked);
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
    <Arena
      key={`${mission.id}:${String(attempt)}`}
      mission={mission}
      onSwitch={(id) => {
        setMissionId(id);
      }}
      onRetry={() => {
        resetMission(mission.id);
        setAttempt((n) => n + 1);
      }}
      onResetCity={() => {
        // このカテゴリの街を最初から：施設・任務の進み・シェルの状態を消す
        const missions = allMissions().filter((m) => m.track === mission.track);
        useStore.getState().resetCity(missions.map((m) => m.id), CITIES[mission.track].facilities.map((f) => f.id));
        flushSave();
        const first = missions[0]?.id;
        if (first !== undefined) setMissionId(first);
        setAttempt((n) => n + 1);
      }}
    />
  );
}

/**
 * 作業画面の中身。街の上に HUD を重ねる。
 * 街・端末・課題の札はいつでも生きていて、どれかを閉じないと他が使えない作りにはしない。
 */
function Arena({
  mission,
  onSwitch,
  onRetry,
  onResetCity,
}: {
  mission: LessonDefinition;
  onSwitch: (id: string) => void;
  onRetry: () => void;
  onResetCity: () => void;
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

  // 復元は開いた瞬間の1回だけ。以後の保存で作り直さない
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
  const [toasts, setToasts] = useState<ToastData[]>([]);
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditorTarget | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [explaining, setExplaining] = useState(false);
  const [retryOpen, setRetryOpen] = useState(false);
  const [speed, setSpeed] = useState<Speed>('normal');
  // 建設メニューで選んでいる道具と種類。選んだままでも端末は生きている
  const [tool, setTool] = useState<DesignKind | null>(null);
  const [variant, setVariant] = useState<BuildVariant | null>(null);
  // 街の上に重ねる情報表示。何も選ばなければ街はそのまま見える
  const [infoView, setInfoView] = useState<InfoView | null>(null);
  // いま街を旅しているコマンド。打った 1 行ごとに 1 度だけ走る
  const [trip, setTrip] = useState<Trip | null>(null);
  // 旅の進み方。学習者が止めたり、速さを変えたり、1 段ずつ進めたりできる
  const [play, setPlay] = useState<JourneyPlay>({ playing: true, rate: 1, step: 0 });
  // 光の粒がいま着いている停留所。帯の印はこれで動く
  const [playAt, setPlayAt] = useState(0);
  // 案内ツアー。いま何番目の施設を案内しているか。null なら案内していない
  const [tourAt, setTourAt] = useState<number | null>(null);
  // ツアーの勧めを断ったか。断ったら、自分から始めるまで二度と勧めない
  const [tourDeclined, setTourDeclined] = useState(false);

  const xp = useStore((s) => s.profile.xp);
  const soundEnabled = useStore((s) => s.settings.soundEnabled);
  const grantXp = useStore((s) => s.grantXp);
  const clearLesson = useStore((s) => s.clearLesson);
  const scheduleReview = useStore((s) => s.scheduleReview);
  const buildFacility = useStore((s) => s.buildFacility);
  const placeBuilding = useStore((s) => s.place);

  const step = currentStep(mission, progress);
  const hintKey = stepKey(mission.id, progress.stepIndex);
  helpRef.current = { step: progress.cleared ? undefined : step, stepIndex: progress.stepIndex, key: hintKey };
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
  // 学習の流れ・街の育ち・進み具合は本編だけで数える
  const catalogue = mainMissions();
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

  const shellState = session.state;
  const designs = useStore((s) => s.designs);
  const designed = useMemo(() => designs[mission.track] ?? [], [designs, mission.track]);
  const city = useDerivedCity(mission.track, shellState, clearedIds, designed);
  const plan = CITIES[mission.track];

  // 上の帯に出す数。どれも状態から導く
  const activeDays = useStore((s) => s.profile.activeDays.length);
  const growth = useStore((s) => s.growth);
  const placed = designed.length;
  const clock = clockOf(activeDays, shellState.history.length);
  const metrics = cityMetrics({ city, xp, growth: growthOf(growth, mission.track), placed });
  const milestone = useMemo(
    () => milestoneOf(plan, catalogue.filter((m) => m.track === mission.track), clearedIds),
    [plan, catalogue, mission.track, clearedIds],
  );
  /**
   * 打ったコマンドが街を旅する道のり。
   *
   * 打つ前と打った後の模型を見比べて導く。台本ではないので、
   * 「そのコマンドで実際に何が動いたか」だけが停留所になる。
   */
  const journey = useMemo(
    () =>
      trip === null
        ? null
        : journeyOf({ command: trip.line, before: trip.before, after: trip.after, city, serial: trip.serial }),
    [trip, city],
  );
  // 旅が始まったら、帯の印と進み方を最初に戻す
  const journeyId = journey?.id ?? null;
  useEffect(() => {
    if (journeyId === null) return;
    setPlayAt(0);
    setPlay((p) => ({ ...p, playing: true, step: 0 }));
  }, [journeyId]);

  /**
   * 起こせる障害と、いま起きている障害。どちらも模型から読む。
   * 障害は端末で打つのと同じコマンドで起こすので、裏で状態を書き換えたりしない。
   */
  const faults = useMemo(
    () => faultsOf({ cluster: shellState.cluster, net: shellState.net }),
    [shellState.cluster, shellState.net],
  );
  const troubles = useMemo(() => troublesOf(faults), [faults]);
  // 直った直後かどうか。少しの間だけ「直った」と出す
  const [healed, setHealed] = useState(false);
  const hadTrouble = useRef(false);
  useEffect(() => {
    const now = troubles.length > 0;
    if (hadTrouble.current && !now) {
      setHealed(true);
      const timer = setTimeout(() => {
        setHealed(false);
      }, 6000);
      hadTrouble.current = now;
      return () => {
        clearTimeout(timer);
      };
    }
    hadTrouble.current = now;
    return undefined;
  }, [troubles.length]);

  // 案内ツアーの道のり。街に建っている施設だけを巡る
  const tour = useMemo(() => tourOf(city, mission.track), [city, mission.track]);
  const tourStop = tourAt === null ? null : (tour[Math.min(tourAt, tour.length - 1)]?.building ?? null);

  // 選んだ建物の中身。街の状態から導くので、選び直すたびに数え直す必要が無い
  const chosen = selected === null ? null : buildingInfo(city, shellState.cluster, selected);
  // 住人の声。街の状態から毎回読み直す。貯めた台帳ではない
  const voices = useMemo(() => voicesOf(city, shellState.cluster), [city, shellState.cluster]);

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

  /** きっかけに応じて街を育てる。増え方は `growth.ts` の表だけが決める */
  const grow = useCallback(
    (trigger: GrowthTrigger, times = 1) => {
      const gain = gainFor(trigger);
      if (gain.houses > 0) growCity(mission.track, 'houses', gain.houses * times);
      if (gain.floors > 0) growCity(mission.track, 'floors', gain.floors * times);
    },
    [mission.track],
  );

  const pushToast = useCallback((text: string) => {
    const key = Date.now() + Math.random();
    setToasts((list) => [...list, { key, text }]);
    setTimeout(() => {
      setToasts((list) => list.filter((item) => item.key !== key));
    }, 2000);
  }, []);

  // 手順を飛ばすために解答を流している間は、手数にも失敗にも数えない
  const skippingRef = useRef(false);

  /** コマンド実行では回数と失敗数だけを数える。合否の判定は下の効果で行う */
  const handleExecuted = useCallback(
    (line: string, exitCode: number) => {
      // 助けを求めたことは、手数にも失敗にも数えない
      if (skippingRef.current || isHelpCommand(line)) return;
      setProgress((p) => ({
        ...p,
        commandsUsed: p.commandsUsed + 1,
        mistakes: p.mistakes + (exitCode === 0 ? 0 : 1),
      }));
      // コマンドが 1 本通れば、それだけで街が育つ
      if (growsFromCommand(line, exitCode)) grow('command');
      // 通った 1 行は、光の粒になって街を旅する。
      // 道のりは、打つ前と打った後を見比べて導くので、その 2 つをここで掴む
      const timeline = session.getTimeline();
      const world = (state: (typeof timeline)[number] | undefined): WorldState => ({
        vfs: state?.vfs ?? null,
        git: state?.git ?? null,
        cluster: state?.cluster ?? null,
        net: state?.net ?? null,
        repo: state?.repo ?? null,
      });
      const shots = {
        before: world(timeline[timeline.length - 2]),
        after: world(timeline[timeline.length - 1]),
      };
      setTrip((before) => nextTrip(before, line, exitCode, shots));
      // 旅が始まったら案内は終わる。カメラを取り合わせない
      setTourAt(null);
    },
    [grow, session],
  );

  /**
   * いまの手順を飛ばす。解答を端末で実際に打つので、何をすれば通ったのかが端末に残る。
   * 途中で別の道に進んでいて解答が合わないときは、初期状態からその手順までの解答を打ち直す。
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
  }, [step, progress, mission, session, t, scheduleReview]);

  // 状態が変われば必ず judge する。コマンド実行の瞬間だけに頼らない
  useEffect(() => {
    setProgress((p) => evaluate(mission, p, session.getTimeline()));
    // session は毎描画で作り直されるため、状態そのものを依存に置く
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellState, mission]);

  /** 祝いの画面に出す、街の施設の稼働の行 */
  const cityLines = (): { lines: string[]; href: string } | undefined => {
    const chapterId = missionById(mission.id)?.chapterId;
    const facility = chapterId === undefined ? undefined : facilityById(chapterId);
    if (!facility || chapterId === undefined) return undefined;
    const { lessons: done } = useStore.getState();
    const mine = mainMissions().filter((m) => m.chapterId === chapterId);
    const cleared = mine.filter((m) => m.id === mission.id || done[m.id]?.cleared === true).length;
    const href = `/world/${mission.track}?facility=${encodeURIComponent(facility.id)}`;
    return {
      href,
      lines: [
        cleared >= mine.length
          ? t('celebration.facilityComplete', { name: facility.name })
          : t('celebration.facility', { name: facility.name, a: cleared, b: mine.length }),
      ],
    };
  };

  // 進んだ / 通らなかった に応じて見返りを出す
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
      // 任務を終えた章は、街の施設として建ったことにする
      const chapterId = missionById(mission.id)?.chapterId;
      if (chapterId !== undefined) buildFacility(chapterId);
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
      // 任務を終えた。街がもう一段育つ
      grow('clear');
      if (soundEnabled) sfx.clear();
    } else if (progress.stepIndex > prevStep.current) {
      grantXp(STEP_XP, now);
      pushToast(`+${String(STEP_XP)} XP`);
      grow('step', Math.max(1, progress.stepIndex - prevStep.current));
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

  /**
   * 街を押したときに、対応するコマンドを端末へ打ち込んで実行する。
   * 1 文字ずつ打つので、何が打たれたのかが端末に残る。
   */
  const runFromCity = useCallback((line: string) => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.type(line);
    terminal.focus();
  }, []);

  /**
   * 空いている区画を押したとき。建設メニューで選んだものを、そこに建てる。
   * 建築権が無いときは何も起きない（建築権は学習で得た分から置いた分を引いた残り）。
   */
  const placeOnSite = useCallback(
    (site: string) => {
      if (variant === null || metrics.rights <= 0) return;
      placeBuilding(mission.track, { site, kind: variant.kind, level: variant.level });
    },
    [variant, metrics.rights, placeBuilding, mission.track],
  );

  // 開いたらすぐ打てるようにする。端末に条件は付けない
  useEffect(() => {
    const timer = setTimeout(() => {
      terminalRef.current?.focus();
    }, 50);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ background: HUD.bg, color: HUD.text }}
      data-testid="arena"
    >
      <CityStage
        city={city}
        label={plan.name}
        selected={selected}
        speed={speed}
        view={infoView}
        district={mission.track}
        showSites={tool !== null}
        onSite={placeOnSite}
        onSelect={setSelected}
        onCommand={runFromCity}
        journey={journey}
        journeyPlay={play}
        onJourneyStop={setPlayAt}
        tour={tourStop}
        trouble={troubles[0]?.where ?? null}
      />

      <TopBar
        name={plan.name}
        clock={clock}
        metrics={metrics}
        milestone={milestone}
        speed={speed}
        onSpeed={setSpeed}
      >
        <MissionPicker currentId={mission.id} cleared={(id) => clearedIds.has(id)} onPick={onSwitch} />
        <button
          type="button"
          data-testid="retry-open"
          onClick={() => {
            setRetryOpen(true);
          }}
          className="h-8 rounded px-2.5 text-[13px]"
          style={{ border: `1px solid ${HUD.lineStrong}`, color: HUD.soft }}
        >
          {t('park.retry')}
        </button>
      </TopBar>

      <TerminalDock session={session} innerRef={terminalRef} onExecuted={handleExecuted} onEditor={setEditing} />

      <TaskCard
        mission={mission}
        progress={progress}
        passingNow={passingNow}
        diagnosis={diagnosis}
        revealedHints={revealed}
        reward={{ xp: mission.kind === 'boss' ? 120 : 40, rights: 2 }}
        onHint={revealHint}
        onWhy={() => {
          setExplaining((open) => !open);
        }}
      />

      {journey === null ? null : (
        <JourneyStrip
          journey={journey}
          at={playAt}
          play={play}
          onPlaying={(playing) => {
            setPlay((p) => ({ ...p, playing }));
          }}
          onRate={(rate) => {
            setPlay((p) => ({ ...p, rate }));
          }}
          onStep={() => {
            setPlay((p) => ({ ...p, playing: false, step: p.step + 1 }));
          }}
          onClose={() => {
            setTrip(null);
          }}
        />
      )}

      <TourPanel
        stops={tour}
        at={tourAt}
        // 街を開いたばかりで、まだ 1 行も打っていないときだけ勧める。強制はしない
        invited={!tourDeclined && shellState.history.length === 0 && !progress.cleared}
        onAt={setTourAt}
        onLeave={() => {
          setTourAt(null);
          setTourDeclined(true);
          terminalRef.current?.focus();
        }}
        onDecline={() => {
          setTourDeclined(true);
        }}
        busy={journey !== null}
      />

      <FaultMenu
        faults={faults}
        troubles={troubles}
        healed={healed}
        onCommand={(line) => {
          terminalRef.current?.submit(line);
          terminalRef.current?.focus();
        }}
        onMission={onSwitch}
      />

      <InfoViews view={infoView} onView={setInfoView} />

      <BuildMenu
        milestone={milestone.n}
        rights={metrics.rights}
        tool={tool}
        variant={variant}
        onTool={(kind) => {
          setTool(kind);
          setVariant(kind === null ? null : (variantsOf(kind)[0] ?? null));
        }}
        onVariant={setVariant}
      />

      <div
        data-testid="right-column"
        className="absolute z-20 flex flex-col gap-2.5 overflow-hidden"
        style={{ right: 16, top: SIZE.panelTop, width: SIZE.info, bottom: 210 }}
      >
        {chosen === null ? null : (
          <BuildingPanel
            info={chosen}
            onCommand={runFromCity}
            onClose={() => {
              setSelected(null);
            }}
          />
        )}
        <Voices voices={voices} />
      </div>

      {explaining ? (
        <ExplainDrawer
          mission={mission}
          stepIndex={progress.stepIndex}
          onType={runFromCity}
          onClose={() => {
            setExplaining(false);
          }}
          onAnswer={() => {
            grow('quiz');
          }}
        />
      ) : null}

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
        onRetry={() => {
          setCelebration(null);
          onRetry();
        }}
      />
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
      {retryOpen ? (
        <RetryMenu
          cityName={plan.name}
          onMission={() => {
            setRetryOpen(false);
            onRetry();
          }}
          onCity={() => {
            setRetryOpen(false);
            onResetCity();
          }}
          onSkipStep={() => {
            setRetryOpen(false);
            skipStep();
          }}
          onClose={() => {
            setRetryOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** やり直しの選択。この手順を飛ばす / この任務だけ / このカテゴリの街ごと */
function RetryMenu({
  cityName,
  onMission,
  onCity,
  onSkipStep,
  onClose,
}: {
  cityName: string;
  onMission: () => void;
  onCity: () => void;
  onSkipStep: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('retry.title')}
      data-testid="retry-menu"
      className="ui fixed inset-0 z-50 grid place-items-center bg-[rgba(10,13,17,0.6)] p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="ui-card w-full max-w-md p-5"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <p className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
          <Icon name="replay" size={18} />
          {t('retry.title')}
        </p>
        {confirm ? (
          <>
            <p className="ui-note ui-note-bad mt-3 leading-relaxed">{t('retry.cityConfirm', { name: cityName })}</p>
            <div className="mt-3 flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => { setConfirm(false); }} className="ui-btn ui-btn-plain h-9 px-3 text-[13px]">
                {t('retry.back')}
              </button>
              <button type="button" data-testid="retry-city-confirm" onClick={onCity} className="ui-btn ui-btn-primary h-9 px-4 text-[13px]" style={{ background: 'var(--u-bad)' }}>
                {t('retry.cityYes')}
              </button>
            </div>
          </>
        ) : (
          <div className="mt-4 flex flex-col gap-2">
            <button type="button" data-testid="retry-skip" onClick={onSkipStep} className="ui-option flex-col items-start gap-0.5">
              <span className="text-[14px] font-semibold">{t('park.skip')}</span>
              <span className="text-[12px] text-[var(--u-text-2)]">{t('park.skipLead')}</span>
            </button>
            <button type="button" data-testid="retry-mission" onClick={onMission} className="ui-option flex-col items-start gap-0.5">
              <span className="text-[14px] font-semibold">{t('retry.mission')}</span>
              <span className="text-[12px] text-[var(--u-text-2)]">{t('retry.missionLead')}</span>
            </button>
            <button type="button" data-testid="retry-city" onClick={() => { setConfirm(true); }} className="ui-option flex-col items-start gap-0.5">
              <span className="text-[14px] font-semibold">{t('retry.city', { name: cityName })}</span>
              <span className="text-[12px] text-[var(--u-text-2)]">{t('retry.cityLead')}</span>
            </button>
            <button type="button" onClick={onClose} className="ui-btn ui-btn-plain h-8 self-end px-3 text-[13px]">
              {t('retry.cancel')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
