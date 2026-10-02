import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { demolish } from '@/city/place';
import { CityRenderer } from '@/city/render/CityRenderer';
import { STAGE_NAMES } from '@/game/stage';
import { TopBar } from '@/ui/TopBar';
import { BuildMenu } from './BuildMenu';
import { attachBuildControls } from './buildControls';
import { CityNotice, DemolishConfirm, PlacementHint } from './CityOverlays';
import { createCityStore, type CityStore } from './cityStore';
import { attachControls } from './controls';
import './CityScreen.css';

/**
 * 都市画面（docs/ui-design.md 3 章）。全画面の都市ビューに、上の帯と建設メニューを小さく重ねる。
 * 学習者が道路を引き、区画を塗り、施設と公園を置く。区画の建物は自動で建ち、育つ（docs/decisions.md D-03）。
 */
export function CityScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const store: CityStore = useMemo(() => createCityStore(), []);
  // 画面に出す物だけを選んで読む（都市の日付は毎フレーム進むが、画面の部品は必要な時だけ描き直す）
  const state = useStore(store, useShallow((s) => ({
    name: s.city.name, funds: s.city.funds, population: s.city.population, stage: s.city.stage,
    tool: s.tool, menu: s.menu, hint: s.hint, confirm: s.confirm, notice: s.notice, paused: s.paused,
    openMenu: s.openMenu, setTool: s.setTool,
  })));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new CityRenderer(canvas, store.getState().city, () => {
      document.body.dataset.cityReady = '1';
    });
    const fit = (): void => renderer.resize(window.innerWidth, window.innerHeight);
    fit();
    window.addEventListener('resize', fit);
    renderer.start();
    const detach = attachControls(canvas, renderer);
    const detachBuild = attachBuildControls(canvas, renderer, store);
    const unsubscribe = store.subscribe((s) => renderer.setCity(s.city));
    // 都市の時計（Space で止まる）
    let last = performance.now();
    let raf = 0;
    const step = (now: number): void => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      store.getState().tick(dt);
      const notice = store.getState().notice;
      if (notice && now > notice.until) store.setState({ notice: null });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    // 撮影と計測の道具（tools/shoot.mjs）から読む
    const w = window as unknown as { __city?: CityRenderer; __cityStore?: CityStore };
    w.__city = renderer;
    w.__cityStore = store;
    return () => {
      cancelAnimationFrame(raf);
      unsubscribe();
      detachBuild();
      detach();
      renderer.stop();
      window.removeEventListener('resize', fit);
      delete document.body.dataset.cityReady;
    };
  }, [store]);

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
        xp={0}
        population={state.population}
        stageName={STAGE_NAMES[state.stage]}
        disabled={['learn', 'mission', 'glossary', 'settings']}
      />
      <CityNotice text={state.notice?.text ?? null} paused={state.paused} />
      <BuildMenu state={state} />
      <PlacementHint hint={state.confirm ? null : state.hint} />
      <DemolishConfirm target={state.confirm} onYes={onYes} onNo={onNo} />
    </div>
  );
}
