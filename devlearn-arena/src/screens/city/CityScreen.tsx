import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { overlayOf, stageProgress } from '@/city/overlay';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { displayOf, type Display } from '@/city/render/display';
import type { Settings } from '@/save/schema';
import { Intro } from './Intro';
import { CityRenderer } from '@/city/render/CityRenderer';
import { RANK_NAMES, rankOf } from '@/game/rank';
import { STAGE_NAMES } from '@/game/stage';
import { HEAT_KINDS, SERVICE_HEAT, type HeatKind } from '@/sim/heat';
import { reachAreaOf } from '@/sim/reachArea';
import { POLITICS_RULES } from '@/content/politics';
import { awardItems, openRewards, powerLine } from './civicView';
import { facilityPowerDistrict, poweredOffIds, stoppedNow } from '@/sim/power';
import { dateOf } from '@/sim/rules';
import { spaceOf } from '@/sim/space';
import type { WeeklyBreakdown } from '@/sim/types';
import { TopBar, type EntryId } from '@/ui/TopBar';
import { finishBoot } from '@/ui/boot';
import { BuildMenu } from './BuildMenu';
import { attachBuildControls } from './buildControls';
import { CityNotice, DemolishConfirm, PlacementHint } from './CityOverlays';
import { InfoPanel } from './InfoPanel';
import { Minimap } from './Minimap';
import { panelModel } from './infoPanelModel';
import { OverlayToggle, type OverlayLegend } from './OverlayToggle';
import { RecommendPanel } from './RecommendPanel';
import { unplacedLandmarks } from '@/learning/missions';
import type { City, DomainId, FacilityType } from '@/city/types';
import { FACILITY_DEFS } from '@/city/facilities';
import type { CityGameState, CityStore, ViewKind } from './cityStore';
import { HEAT_INFO, heatImage, heatLegend } from './heatScale';
import { VIEW_LABELS } from './viewKinds';
import { ViewWindow } from './ViewWindow';
import { PermitDetailWindow, PermitListWindow } from './PermitWindows';
import { AppealWindow } from './AppealWindow';
import { BudgetWindow, InboxWindow, NewsWindow, RewardsWindow } from './CivicWindows';
import { CouncilWindow } from './CouncilWindow';
import { HearingWindow } from './HearingWindow';
import { ElectionWindow } from './ElectionWindow';
import { electionDayOf } from '@/sim/election';
import { DAYS_PER_WEEK } from '@/sim/rules';
import { mayorCount, sitesOf } from './permitView';
import type { World } from '@/sim/types';
import type { Session } from '../session';
import { useSkills, type SkillMap } from '../skills';
import { attachControls } from './controls';
import './CityScreen.css';

/**
 * 都市画面（docs/ui-design.md 3 章）。全画面の都市ビューに、上の帯と建設メニューを小さく重ねる。
 * 学習者が道路を引き、区画を塗り、施設と公園を置く。区画の建物は自動で建ち、育つ（docs/decisions.md D-03）。
 */
export function CityScreen({ session, active = true, covered = false, current, disabled = [], onEntry, onLesson, onCard, onLibrary, onMission, onNewCity }: {
  session: Session;
  active?: boolean;
  /** 不透明な画面（レッスン・ミッションの実戦）が都市を覆っている。その間は都市を描かない */
  covered?: boolean;
  /** 上の帯の入口のうち、開けない物 */
  disabled?: readonly EntryId[];
  /** 上の帯で、今開いている画面の入口を光らせる */
  current?: EntryId | undefined;
  onEntry?: (id: EntryId) => void;
  /** 情報パネルの「ここで学ぶ」からレッスンを始める */
  onLesson?: (id: string) => void;
  /** 公聴会の「この論点を学ぶ」から、そのレッスンの入口の札を開く（公聴会は待つ。docs/learning-design.md 12.3） */
  onCard?: (id: string) => void;
  /** 情報パネルから学習ライブラリを、施設の分野に絞って開く */
  onLibrary?: (domain: DomainId | null) => void;
  /** 情報パネルとおすすめの欄から、ミッションを開く */
  onMission?: (id: string) => void;
  /** 落選の後、新しい都市で始める（学習の記録はそのまま。docs/game-design.md 21.2） */
  onNewCity?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const store: CityStore = session.city;
  const progress = useStore(session.progress, (s) => s.progress);
  const xp = progress.xp;
  const skills = useSkills(session.progress);
  const skillsRef = useRef<SkillMap>(skills);
  skillsRef.current = skills;
  /** スキルの値（公聴会の説明と技術の代案の段階を決める） */
  const skillValues = useMemo(() => Object.fromEntries(Object.entries(skills).map(([d, v]) => [d, v.value])), [skills]);
  // 都市の上に別の画面（成長画面など）が開いている間は、都市のキーボードの操作を止める
  const activeRef = useRef(active);
  activeRef.current = active;
  // 画面に出す物だけを選んで読む（都市の日付は毎フレーム進むが、画面の部品は必要な時だけ描き直す）
  const state = useStore(store, useShallow((s) => ({
    name: s.city.name, funds: s.city.funds, population: s.city.population, stage: s.city.stage,
    tool: s.tool, menu: s.menu, hint: s.hint, confirm: s.confirm, notice: s.notice, paused: s.paused,
    openMenu: s.openMenu, setTool: s.setTool, selected: s.selected, overlay: s.overlay, setOverlay: s.setOverlay, select: s.select,
    techPower: s.city.techPower, demand: s.world.sim.lastWeek.demand,
    // 発電所を選んでいる間は、上の帯の下に電力の使う量と来る量（docs/ui-design.md 11.5）
    powerLine: s.tool.kind === 'facility' && FACILITY_DEFS[s.tool.type].group === 'power' ? powerLine(s.world, POLITICS_RULES) : null,
    day: Math.floor(s.city.day), speed: s.speed, held: s.holds.length > 0, togglePause: s.togglePause, setSpeed: s.setSpeed,
    approval: s.world.city.population > 0 ? s.world.sim.lastWeek.approval : null,
    approvalDelta: approvalDeltaOf(s.world.history.breakdown),
    windows: s.windows, toggleWindow: s.toggleWindow, openWindow: s.openWindow, heat: s.heat,
    mayor: mayorCount(s.world), openPermit: s.openPermit,
    capital: s.world.politics.capital, defeated: s.world.politics.defeated === true,
    treasury: Math.round(s.world.budget.treasury), inbox: s.world.petitions.inbox.length, rewards: openRewards(s.world),
    // 褒賞の建物の様子は、文字列にして読む（毎回作る配列を選ぶと、描き直しが止まらない）
    awardsKey: awardItems(s.world).map((a) => `${a.type}:${a.status}`).join(','),
    weeksLeft: Math.max(0, Math.ceil((electionDayOf(s.world.politics.term) - Math.floor(s.world.city.day)) / DAYS_PER_WEEK)),
    openElection: s.openElection,
  })));
  const awards = useMemo(() => (state.awardsKey === '' ? [] : state.awardsKey.split(',').map((k) => {
    const [type, status] = k.split(':') as [FacilityType, 'open' | 'pending' | 'built'];
    return { type, status };
  })), [state.awardsKey]);
  // 公約を選んでいない任期なら、公約を選ぶ窓を出す（初回の操作説明の後。移行した都市の 1 期目も。docs/data-model.md 12 章）
  const introSeen = useStore(session.player, (p) => p.player.introSeen);
  const noPledges = useStore(store, (s) => s.world.politics.term.pledges.length === 0);
  useEffect(() => {
    if (active && !covered && introSeen && noPledges) store.getState().askPledges();
  }, [store, active, covered, introSeen, noPledges]);
  // 受け取ったが、まだ置いていない記念碑（建設メニューの公園の引き出しに並ぶ）
  const facilities = useStore(store, (s) => s.city.facilities);
  const landmarks = useMemo(() => unplacedLandmarks(progress, facilities), [progress, facilities]);
  // 情報パネルは、選んだ物の状態が変わった時だけ作り直す
  const panelKey = useStore(store, (s) => (s.selected ? panelKeyOf(s) : ''));
  const panel = useMemo(() => {
    const s = store.getState();
    if (!s.selected) return null;
    // 停電している地区の施設（状態に出す。学習には効かない。docs/game-design.md 24.1）
    const stopped = stoppedNow(s.world.sim.power);
    const f = s.selected.kind === 'facility' ? s.city.facilities.find((x) => x.id === s.selected?.id) : undefined;
    const off = f && f.state === 'active' && stopped.has(facilityPowerDistrict(f)) ? new Set([f.id]) : undefined;
    return panelModel(s.city, s.selected, skills, progress, s.world.applications, off);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelKey, store, skills, progress]);
  // L で学習ライブラリ、G で知識グラフ（都市画面が前にある時だけ）
  const onEntryRef = useRef(onEntry);
  onEntryRef.current = onEntry;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!activeRef.current || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'l') onEntryRef.current?.('learn');
      else if (k === 'g') onEntryRef.current?.('graph');
      else if (k === 'v') store.getState().toggleWindow('view');
      else if (k === 'p') store.getState().toggleWindow('permits');
      else if (k === 'i') store.getState().toggleWindow('inbox');
      else if (k === 'f') store.getState().toggleWindow('budget');
      else if (k === 'n') store.getState().toggleWindow('news');
      else if (k === '1' || k === '2' || k === '3') store.getState().setSpeed(Number(k) as 1 | 2 | 3);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [store]);

  // 都市画面が前に出ていない間と、ブラウザの窓が隠れている間は、都市の時間を止める（docs/game-design.md 13.1）
  useEffect(() => {
    store.getState().hold('screen', !active || covered);
  }, [store, active, covered]);
  useEffect(() => {
    const onVisibility = (): void => store.getState().hold('hidden', document.visibilityState === 'hidden');
    onVisibility();
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [store]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new CityRenderer(canvas, store.getState().city, () => {
      document.body.dataset.cityReady = '1';
      // 読み込み中の演出（index.html）を薄れさせる
      finishBoot();
    });
    rendererRef.current = renderer;
    const fit = (): void => renderer.resize(window.innerWidth, window.innerHeight);
    fit();
    window.addEventListener('resize', fit);
    renderer.start();
    // 表示品質と動きを減らす設定を、描き方に写す（変えたらその場で）
    const toDisplay = (x: Settings): Display => displayOf({ quality: x.quality, reduceMotion: x.reduceMotion });
    renderer.setDisplay(toDisplay(session.settings.getState().settings));
    const offSettings = session.settings.subscribe((x) => renderer.setDisplay(toDisplay(x.settings)));
    const isActive = (): boolean => activeRef.current;
    const detach = attachControls(canvas, renderer, isActive);
    const detachBuild = attachBuildControls(canvas, renderer, store, isActive);
    // 都市・選択・表示切替を描画に渡す。表示切替は、都市の形が変わった時だけ計算し直す
    let overlayKey = '';
    let focusSeq = store.getState().focus?.seq ?? 0;
    let sitesWorld: World | null = null;
    let areaFor: { city: City; id: string } | null = null;
    const sync = (s: ReturnType<CityStore['getState']>): void => {
      renderer.setCity(s.city);
      // 申請の囲いと看板（模擬の世界が変わった時だけ作り直す。docs/city-design.md 9.1）
      if (s.world !== sitesWorld) {
        const prev = sitesWorld;
        sitesWorld = s.world;
        renderer.setSites(sitesOf(s.world));
        // 陸揚げ所と停電している建物（停電は週ごとに変わる。docs/city-design.md 9.4）
        if (!prev || prev.sim.power !== s.world.sim.power || prev.city.buildings !== s.world.city.buildings || prev.city.facilities !== s.world.city.facilities) {
          const off = (s.world.sim.power.recent?.at(-1)?.length ?? 0) > 0 ? poweredOffIds(s.world, spaceOf(s.world.city, s.terrain)) : new Set<string>();
          renderer.setPower({ landing: s.world.sim.power.landing, off });
        }
      }
      // 学習から戻った時の変化の場所へカメラを寄せ、光の輪で示す
      if (s.focus && s.focus.seq !== focusSeq) {
        focusSeq = s.focus.seq;
        renderer.focusOn(s.focus.at.x, s.focus.at.y);
        renderer.setHighlight(s.focus.at, s.focus.size);
      }
      renderer.setSelection(s.selected);
      renderer.setLabelInsets({ right: s.selected ? 14 + 360 + 12 : 8 });
      // 模擬のヒートマップは、週に 1 回だけ画面の外の絵を作り直す（docs/architecture.md 9.3）
      const heatKind = s.overlay && isHeat(s.overlay) ? s.overlay : null;
      renderer.setHeat(heatKind && s.heat ? { key: `${heatKind}|${String(s.heat.week)}`, image: heatImage(heatKind, s.heat.cells[heatKind]) } : null);
      // 行き届き・電力のヒートマップで公共サービス・公園・発電所を押すと、その届く範囲を縁で示す（docs/ui-design.md 11.1）
      const picked = s.selected?.kind === 'facility' ? s.city.facilities.find((f) => f.id === s.selected?.id) : undefined;
      const group = picked ? FACILITY_DEFS[picked.type].group : null;
      const shows = heatKind === 'power' ? group === 'power' : heatKind !== null && (SERVICE_KINDS as readonly string[]).includes(heatKind) && (group === 'civic' || group === 'park');
      const area = shows && picked ? { city: s.city, id: picked.id } : null;
      if (area?.city !== areaFor?.city || area?.id !== areaFor?.id) {
        areaFor = area;
        renderer.setArea(area && picked ? reachAreaOf(spaceOf(s.city, s.terrain), picked) : null);
      }
      const plain = s.overlay && !isHeat(s.overlay) ? s.overlay : null;
      const values = Object.fromEntries(Object.entries(skillsRef.current).map(([d, v]) => [d, v.value]));
      const key = plain ? `${plain}|${overlayKeyOf(s)}|${JSON.stringify(values)}` : '';
      if (key !== overlayKey) {
        overlayKey = key;
        renderer.setOverlay(plain ? { kind: plain, data: overlayOf(plain, s.city, { ...renderer.traffic(), skills: values }) } : null);
      }
    };
    sync(store.getState());
    const unsubscribe = store.subscribe(sync);
    // 都市の時計（Space で止まる）
    let last = performance.now();
    let raf = 0;
    const step = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      store.getState().tick(dt);
      store.getState().expireNotice(now);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // 撮影と計測の道具（tools/shoot.mjs）から読む
    const w = window as unknown as { __city?: CityRenderer; __cityStore?: CityStore };
    w.__city = renderer;
    w.__cityStore = store;
    return () => {
      offSettings();
      cancelAnimationFrame(raf);
      unsubscribe();
      detachBuild();
      detach();
      renderer.stop();
      rendererRef.current = null;
      window.removeEventListener('resize', fit);
      delete document.body.dataset.cityReady;
    };
  }, [store, session.settings]);

  // レッスン・ミッションの実戦が都市を覆っている間は描かない（描く物を作り直した時も写し直す）
  useEffect(() => {
    rendererRef.current?.setCovered(covered);
    // 直リンクやリロードで、初めから覆う画面が開いた時は、都市を描かないので、読み込み中の演出をここで下げる（覆う画面を見せる）
    if (covered) finishBoot();
  }, [covered, store, session.settings]);

  // 名札は、都市の上に重ねた知らせと表示切替の所を避ける（描き直しのたびに、出ている部品の位置を測って渡す）
  useLayoutEffect(() => {
    const renderer = rendererRef.current;
    const root = canvasRef.current?.parentElement;
    if (!renderer || !root) return;
    const blocks = [...root.querySelectorAll('[data-label-block]')].map((el) => {
      const r = el.getBoundingClientRect();
      return { x0: r.left, y0: r.top, x1: r.right, y1: r.bottom };
    });
    renderer.setLabelBlocks(blocks);
  });

  const onYes = useCallback(() => {
    const s = store.getState();
    if (s.confirm) s.dispatch({ kind: 'demolish', target: s.confirm });
    s.askDemolish(null);
  }, [store]);
  const onNo = useCallback(() => store.getState().askDemolish(null), [store]);
  // 市政の知らせを押すと、その知らせの窓を開く（採決の結果・異議申し立て・申請の詳細）
  const openNotice = useCallback((n: CityGameState['notice']) => {
    const s = store.getState();
    if (n?.window === 'election') {
      // 選挙の結果の知らせ（落選の後・選挙の週）は結果を、それ以外（8 週前・公約）は見込みを開く
      const last = s.world.politics.pastTerms.at(-1);
      s.openElection(s.world.politics.defeated || (last && last.endDay >= Math.floor(s.world.city.day) - DAYS_PER_WEEK) ? 'result' : 'preview');
      return;
    }
    if (n?.window === 'inbox' || n?.window === 'news' || n?.window === 'rewards') {
      s.openWindow(n.window);
      return;
    }
    if (!n?.permitId) return;
    if (n.window === 'council') s.openCouncil(n.permitId);
    else if (n.window === 'appeal') s.openAppeal(n.permitId);
    else s.openPermit(n.permitId);
  }, [store]);
  // ミニマップは、描画器ができた後に、その今の姿を読む
  const minimapSource = useCallback(() => rendererRef.current, []);

  return (
    <div className="city-screen" data-testid="city-screen" data-tool={state.tool.kind}>
      <canvas ref={canvasRef} className="city-canvas" aria-label={`${state.name}の都市ビュー`} />
      <TopBar
        cityName={state.name}
        clock={{
          ...dateOf(state.day),
          speed: state.speed,
          paused: state.paused,
          held: state.held,
          onSpeed: (speed) => (speed === 0 ? state.togglePause() : state.setSpeed(speed)),
        }}
        approval={state.approval}
        approvalDelta={state.approvalDelta}
        onApproval={() => state.openWindow('view')}
        capital={state.capital}
        onCapital={() => state.openWindow('budget')}
        treasury={{ value: state.treasury, onOpen: () => state.openWindow('budget') }}
        term={{ weeksLeft: state.weeksLeft, defeated: state.defeated, onOpen: () => state.openElection(state.defeated ? 'result' : 'preview') }}
        funds={state.funds}
        xp={xp}
        rankName={RANK_NAMES[rankOf(xp)]}
        population={state.population}
        stageName={STAGE_NAMES[state.stage]}
        disabled={disabled}
        current={current}
        civic={{
          // 入口の数の印は、市長の手を待つ申請と、届いた請願（docs/ui-design.md 3.1）
          badge: state.mayor + state.inbox,
          items: [
            { id: 'permits', badge: state.mayor },
            { id: 'inbox', badge: state.inbox },
            { id: 'budget', badge: 0 },
            { id: 'news', badge: 0 },
            { id: 'rewards', badge: state.rewards },
          ],
          onItem: (id) => state.openWindow(id),
        }}
        {...(onEntry ? { onEntry } : {})}
      />
      {/* 都市の上に別の画面が開いている間は、上の帯だけを残し、都市の操作の部品は隠す */}
      {active ? (
        <>
          <CityNotice
            text={state.notice?.text ?? null}
            power={state.powerLine}
            paused={state.paused}
            shifted={panel !== null}
            windows={state.windows.length}
            {...(state.notice?.permitId || state.notice?.window ? { onOpen: () => openNotice(state.notice) } : {})}
          />
          {onLesson ? <RecommendPanel progress={session.progress} city={store} onLesson={onLesson} {...(onMission ? { onMission } : {})} /> : null}
          <InfoPanel
            model={panel}
            onClose={() => state.select(null)}
            onUpgrade={(id) => {
              const values = Object.fromEntries(Object.entries(skillsRef.current).map(([d, v]) => [d, v.value]));
              store.getState().upgrade(id, values, performance.now());
            }}
            onPermit={(id) => state.openPermit(id)}
            {...(onLesson ? { onLesson } : {})} {...(onLibrary ? { onLibrary } : {})} {...(onMission ? { onMission } : {})} />
          <Minimap store={store} source={minimapSource} />
          <OverlayToggle
            value={state.overlay}
            name={state.overlay ? VIEW_LABELS[state.overlay] : null}
            legend={state.menu === null && state.overlay ? legendOf(state.overlay, store) : null}
            open={state.windows.includes('view')}
            onOpen={() => state.toggleWindow('view')}
          />
          {state.windows.map((id, i) => {
            if (id === 'view') return <ViewWindow key={id} store={store} stack={i} shifted={panel !== null} />;
            if (id === 'permits') return <PermitListWindow key={id} store={store} stack={i} shifted={panel !== null} />;
            if (id === 'appeal') return <AppealWindow key={id} store={store} stack={i} shifted={panel !== null} skills={skillValues} />;
            if (id === 'inbox') return <InboxWindow key={id} store={store} stack={i} shifted={panel !== null} />;
            if (id === 'budget') return <BudgetWindow key={id} store={store} stack={i} shifted={panel !== null} />;
            if (id === 'news') return <NewsWindow key={id} store={store} stack={i} shifted={panel !== null} />;
            if (id === 'rewards') return <RewardsWindow key={id} store={store} stack={i} shifted={panel !== null} />;
            return <PermitDetailWindow key={id} store={store} stack={i} shifted={panel !== null} skills={skillValues} />;
          })}
          <HearingWindow store={store} skills={skillValues} {...(onCard ? { onLearn: onCard } : {})} />
          <CouncilWindow store={store} />
          <ElectionWindow store={store} {...(onNewCity ? { onNewCity } : {})} />
          <HeatHover store={store} canvas={canvasRef} renderer={rendererRef} />
          <BuildMenu state={state} landmarks={landmarks} treasury={state.treasury} demand={state.demand} awards={awards} />
          <PlacementHint hint={state.confirm ? null : state.hint} />
          <DemolishConfirm target={state.confirm} onYes={onYes} onNo={onNo} />
          <Intro session={session} />
        </>
      ) : null}
    </div>
  );
}

function panelKeyOf(s: ReturnType<CityStore['getState']>): string {
  const sel = s.selected;
  if (!sel) return '';
  const c = s.city;
  const target = sel.kind === 'facility'
    ? [c.facilities.find((f) => f.id === sel.id), s.world.applications.filter((a) => a.target.facilityId === sel.id).map((a) => a.stage)]
    : sel.kind === 'application' ? s.world.applications.find((a) => a.id === sel.id) : c.buildings.find((b) => b.id === sel.id);
  // 状態（建設の段階・道路・周りの施設）と、アップグレードの条件（資金・発展段階）が変わったら作り直す
  return `${sel.id}|${JSON.stringify(target)}|${String(s.world.sim.power.recent?.at(-1) ?? '')}|${String(Math.floor(c.day))}|${String(c.roads.length)}|${String(c.facilities.length)}|${String(c.buildings.length)}|${String(c.funds)}|${String(c.stage)}`;
}

function overlayKeyOf(s: ReturnType<CityStore['getState']>): string {
  const c = s.city;
  return `${String(c.roads.length)}|${String(c.buildings.length)}|${String(c.population)}|${String(c.facilities.length)}|${String(c.stage)}|${c.roads.map((r) => r.id).join(',')}`;
}

const isHeat = (k: ViewKind): k is HeatKind => (HEAT_KINDS as readonly string[]).includes(k);
/** 公共サービスの行き届きのヒートマップ（平均と 5 種） */
const SERVICE_KINDS = ['service', ...SERVICE_HEAT] as const;

/** 4 週前からの支持率の増減（上の帯の矢印。記録が足りなければ null） */
function approvalDeltaOf(breakdown: readonly WeeklyBreakdown[]): number | null {
  const last = breakdown.at(-1);
  const prev = last ? breakdown.find((b) => b.week === last.week - 4) : undefined;
  return last && prev ? last.approval - prev.approval : null;
}

/**
 * ヒートマップのマスを指すと、値と単位を小窓で出す（docs/ui-design.md 11.1: 色だけに頼らない）。
 * 雇用で住宅を指すと、その地区の失業率も出す
 */
function HeatHover({ store, canvas, renderer }: { store: CityStore; canvas: React.RefObject<HTMLCanvasElement>; renderer: React.RefObject<CityRenderer | null> }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const onMove = (e: PointerEvent): void => {
      const s = store.getState();
      const r = renderer.current;
      const kind = s.overlay && isHeat(s.overlay) ? s.overlay : null;
      if (!kind || !s.heat || !r || s.tool.kind !== 'none') {
        setTip(null);
        return;
      }
      const c = r.cellAt(e.clientX, e.clientY);
      const size = r.size;
      if (c.x < 0 || c.y < 0 || c.x >= size || c.y >= size) {
        setTip(null);
        return;
      }
      const i = c.y * size + c.x;
      const v = s.heat.cells[kind][i] as number;
      const jobless = s.heat.jobless[i] as number;
      // 雇用で住宅を指した時は、そこに住む人の地区の失業率
      const text = kind === 'jobs' && !Number.isNaN(jobless) ? `住民の地区の失業率 ${String(Math.round(jobless * 100))}%` : Number.isNaN(v) ? null : HEAT_INFO[kind].format(v);
      setTip(text ? { x: e.clientX, y: e.clientY, text } : null);
    };
    const onLeave = (): void => setTip(null);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
    };
  }, [store, canvas, renderer]);
  if (!tip) return null;
  return <div className="heat-tip" data-testid="heat-tip" style={{ left: tip.x + 14, top: tip.y + 14 }}>{tip.text}</div>;
}

function legendOf(kind: ViewKind, store: CityStore): OverlayLegend {
  const s = store.getState();
  const city = s.city;
  if (isHeat(kind)) {
    const l = heatLegend(kind, s.heat?.cells[kind] ?? new Float32Array(0));
    return { low: l.ends[0], high: l.ends[1], note: l.note, span: l.span, colors: l.colors };
  }
  switch (kind) {
    case 'learning':
      return { low: '未修得', high: '熟練', note: '施設ごとに、対応する分野のスキルで塗る。学習の記録が無いうちは灰色' };
    case 'population':
      return { low: '少ない', high: '多い', note: `住宅の区画に住む人の多さ（都市規模 ${city.population.toLocaleString('ja-JP')} 人）` };
    case 'traffic':
      return { low: '空いている', high: '混んでいる', note: '道路ごとの、車の通る多さ' };
    case 'stage': {
      const p = stageProgress(city);
      return {
        low: '今使える範囲',
        high: '次に晴れる範囲',
        note: p.next
          ? `「${STAGE_NAMES[p.next]}」まで: 技術力 ${String(p.techPower[0])} / ${String(p.techPower[1])}・都市規模 ${p.population[0].toLocaleString('ja-JP')} / ${p.population[1].toLocaleString('ja-JP')} 人`
          : '最高の発展段階',
      };
    }
  }
}
