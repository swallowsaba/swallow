import { useEffect, useMemo, useRef } from 'react';
import { CityRenderer } from '@/city/render/CityRenderer';
import { sampleCity } from '@/city/sample';
import { STAGE_NAMES } from '@/game/stage';
import { TopBar } from '@/ui/TopBar';
import { attachControls } from './controls';
import './CityScreen.css';

/**
 * 都市画面（docs/ui-design.md 3 章）。全画面の都市ビューに、上の帯を小さく重ねる。
 * Phase 1 は見本の街を描く。配置の操作・学習・保存は後の Phase。
 */
export function CityScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const city = useMemo(() => sampleCity(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const renderer = new CityRenderer(canvas, city, () => {
      document.body.dataset.cityReady = '1';
    });
    const fit = (): void => renderer.resize(window.innerWidth, window.innerHeight);
    fit();
    window.addEventListener('resize', fit);
    renderer.start();
    const detach = attachControls(canvas, renderer);
    // 撮影と計測の道具（tools/shoot.mjs）から読む
    (window as unknown as { __city?: CityRenderer }).__city = renderer;
    return () => {
      detach();
      renderer.stop();
      window.removeEventListener('resize', fit);
      delete document.body.dataset.cityReady;
    };
  }, [city]);

  return (
    <div className="city-screen" data-testid="city-screen">
      <canvas ref={canvasRef} className="city-canvas" aria-label={`${city.name}の都市ビュー`} />
      <TopBar
        cityName={city.name}
        funds={city.funds}
        xp={0}
        population={city.population}
        stageName={STAGE_NAMES[city.stage]}
        disabled={['learn', 'mission', 'glossary', 'settings']}
      />
    </div>
  );
}
