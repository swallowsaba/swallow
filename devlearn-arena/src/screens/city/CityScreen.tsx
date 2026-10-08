import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { overlayOf, stageProgress, type OverlayKind } from '@/city/overlay';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { demolish } from '@/city/place';
import { displayOf, type Display } from '@/city/render/display';
import type { Settings } from '@/save/schema';
import { Intro } from './Intro';
import { CityRenderer } from '@/city/render/CityRenderer';
import { RANK_NAMES, rankOf } from '@/game/rank';
import { STAGE_NAMES } from '@/game/stage';
import { TopBar, type EntryId } from '@/ui/TopBar';
import { BuildMenu } from './BuildMenu';
import { attachBuildControls } from './buildControls';
import { CityNotice, DemolishConfirm, PlacementHint } from './CityOverlays';
import { InfoPanel } from './InfoPanel';
import { panelModel } from './infoPanelModel';
import { OverlayToggle, type OverlayLegend } from './OverlayToggle';
import { RecommendPanel } from './RecommendPanel';
import { unplacedLandmarks } from '@/learning/missions';
import type { DomainId } from '@/city/types';
import type { CityStore } from './cityStore';
import type { Session } from '../session';
import { useSkills, type SkillMap } from '../skills';
import { attachControls } from './controls';
import './CityScreen.css';

/**
 * 都市画面（docs/ui-design.md 3 章）。全画面の都市ビューに、上の帯と建設メニューを小さく重ねる。
 * 学習者が道路を引き、区画を塗り、施設と公園を置く。区画の建物は自動で建ち、育つ（docs/decisions.md D-03）。
 */
export function CityScreen({ session, active = true, current, disabled = [], onEntry, onLesson, onLibrary, onMission }: {
  session: Session;
  active?: boolean;
  /** 上の帯の入口のうち、開けない物 */
  disabled?: readonly EntryId[];
  /** 上の帯で、今開いている画面の入口を光らせる */
  current?: EntryId | undefined;
  onEntry?: (id: EntryId) => void;
  /** 情報パネルの「ここで学ぶ」からレッスンを始める */
  onLesson?: (id: string) => void;
  /** 情報パネルから学習ライブラリを、施設の分野に絞って開く */
  onLibrary?: (domain: DomainId | null) => void;
  /** 情報パネルとおすすめの欄から、ミッションを開く */
  onMission?: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<CityRenderer | null>(null);
  const store: CityStore = session.city;
  const progress = useStore(session.progress, (s) => s.progress);
  const xp = progress.xp;
  const skills = useSkills(session.progress);
  const skillsRef = useRef<SkillMap>(skills);
  skillsRef.current = skills;
  // 都市の上に別の画面（成長画面など）が開いている間は、都市のキーボードの操作を止める
  const activeRef = useRef(active);
  activeRef.current = active;
  // 画面に出す物だけを選んで読む（都市の日付は毎フレーム進むが、画面の部品は必要な時だけ描き直す）
  const state = useStore(store, useShallow((s) => ({
    name: s.city.name, funds: s.city.funds, population: s.city.population, stage: s.city.stage,
    tool: s.tool, menu: s.menu, hint: s.hint, confirm: s.confirm, notice: s.notice, paused: s.paused,
    openMenu: s.openMenu, setTool: s.setTool, selected: s.selected, overlay: s.overlay, setOverlay: s.setOverlay, select: s.select,
    techPower: s.city.techPower,
  })));
  // 受け取ったが、まだ置いていない記念碑（建設メニューの公園の引き出しに並ぶ）
  const facilities = useStore(store, (s) => s.city.facilities);
  const landmarks = useMemo(() => unplacedLandmarks(progress, facilities), [progress, facilities]);
  // 情報パネルは、選んだ物の状態が変わった時だけ作り直す
  const panelKey = useStore(store, (s) => (s.selected ? panelKeyOf(s) : ''));
  const panel = useMemo(() => {
    const s = store.getState();
    return s.selected ? panelModel(s.city, s.selected, skills, progress) : null;
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
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new CityRenderer(canvas, store.getState().city, () => {
      document.body.dataset.cityReady = '1';
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
    const sync = (s: ReturnType<CityStore['getState']>): void => {
      renderer.setCity(s.city);
      // 学習から戻った時の変化の場所へカメラを寄せ、光の輪で示す
      if (s.focus && s.focus.seq !== focusSeq) {
        focusSeq = s.focus.seq;
        renderer.focusOn(s.focus.at.x, s.focus.at.y);
        renderer.setHighlight(s.focus.at, s.focus.size);
      }
      renderer.setSelection(s.selected);
      renderer.setLabelInsets({ right: s.selected ? 14 + 360 + 12 : 8 });
      const values = Object.fromEntries(Object.entries(skillsRef.current).map(([d, v]) => [d, v.value]));
      const key = s.overlay ? `${s.overlay}|${overlayKeyOf(s)}|${JSON.stringify(values)}` : '';
      if (key !== overlayKey) {
        overlayKey = key;
        renderer.setOverlay(s.overlay ? { kind: s.overlay, data: overlayOf(s.overlay, s.city, { ...renderer.traffic(), skills: values }) } : null);
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
    if (s.confirm) s.setCity(demolish(s.city, s.confirm));
    s.askDemolish(null);
  }, [store]);
  const onNo = useCallback(() => store.getState().askDemolish(null), [store]);

  return (
    <div className="city-screen" data-testid="city-screen" data-tool={state.tool.kind}>
      <canvas ref={canvasRef} className="city-canvas" aria-label={`${state.name}の都市ビュー`} />
      <TopBar
        cityName={state.name}
        funds={state.funds}
        xp={xp}
        rankName={RANK_NAMES[rankOf(xp)]}
        population={state.population}
        stageName={STAGE_NAMES[state.stage]}
        disabled={disabled}
        current={current}
        {...(onEntry ? { onEntry } : {})}
      />
      {/* 都市の上に別の画面が開いている間は、上の帯だけを残し、都市の操作の部品は隠す */}
      {active ? (
        <>
          <CityNotice text={state.notice?.text ?? null} paused={state.paused} shifted={panel !== null} />
          {onLesson ? <RecommendPanel progress={session.progress} onLesson={onLesson} {...(onMission ? { onMission } : {})} /> : null}
          <InfoPanel
            model={panel}
            onClose={() => state.select(null)}
            onUpgrade={(id) => {
              const values = Object.fromEntries(Object.entries(skillsRef.current).map(([d, v]) => [d, v.value]));
              store.getState().upgrade(id, values, performance.now());
            }}
            {...(onLesson ? { onLesson } : {})} {...(onLibrary ? { onLibrary } : {})} {...(onMission ? { onMission } : {})} />
          <OverlayToggle value={state.overlay} onChange={state.setOverlay} legend={state.menu === null && state.overlay ? legendOf(state.overlay, store) : null} />
          <BuildMenu state={state} landmarks={landmarks} />
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
  const target = sel.kind === 'facility' ? c.facilities.find((f) => f.id === sel.id) : c.buildings.find((b) => b.id === sel.id);
  // 状態（建設の段階・道路・周りの施設）と、アップグレードの条件（資金・発展段階）が変わったら作り直す
  return `${sel.id}|${JSON.stringify(target)}|${String(Math.floor(c.day))}|${String(c.roads.length)}|${String(c.facilities.length)}|${String(c.buildings.length)}|${String(c.funds)}|${String(c.stage)}`;
}

function overlayKeyOf(s: ReturnType<CityStore['getState']>): string {
  const c = s.city;
  return `${String(c.roads.length)}|${String(c.buildings.length)}|${String(c.population)}|${String(c.facilities.length)}|${String(c.stage)}|${c.roads.map((r) => r.id).join(',')}`;
}

function legendOf(kind: OverlayKind, store: CityStore): OverlayLegend {
  const city = store.getState().city;
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
