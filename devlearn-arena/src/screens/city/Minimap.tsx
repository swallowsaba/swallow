import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Camera, Viewport } from '@/city/camera';
import { fromMinimap, minimapBox, minimapFrame, minimapKey, viewOutline, type MinimapFrame } from '@/city/minimap';
import { drawMinimapBase, drawViewFrame } from '@/city/render/minimap';
import type { Terrain } from '@/city/terrain';
import { useSettings } from '../settingsContext';
import type { CityStore } from './cityStore';
import './Minimap.css';

/** ミニマップが読む、都市ビューの今の姿（CityRenderer が満たす） */
export interface MinimapSource {
  view(): { camera: Camera; viewport: Viewport; terrain: Terrain };
  focusOn(x: number, y: number): void;
}

/**
 * ミニマップ（docs/ui-design.md 3 章、docs/decisions.md D-18）。
 * 左下に、島の形・道路・区画・施設の点と、今の視野の枠を描く。押した所（引きずればその先）へカメラが動く。都市の回転に合わせて回る。
 * 設定の「ミニマップ」で消せる。
 */
export function Minimap({ store, source }: { store: CityStore; source: () => MinimapSource | null }) {
  const { minimap } = useSettings();
  const [height, setHeight] = useState(() => window.innerHeight);
  useEffect(() => {
    const onResize = (): void => setHeight(window.innerHeight);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  if (!minimap) return null;
  return <MinimapView store={store} source={source} box={minimapBox(height)} />;
}

function MinimapView({ store, source, box }: { store: CityStore; source: () => MinimapSource | null; box: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 下絵（島・道路・区画・施設）は都市の形か向きが変わった時だけ描き、視野の枠はカメラが動いた時だけ重ね直す
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(box * dpr);
    canvas.height = Math.round(box * dpr);
    const ctx = canvas.getContext('2d');
    const base = document.createElement('canvas');
    base.width = canvas.width;
    base.height = canvas.height;
    const bctx = base.getContext('2d');
    if (!ctx || !bctx) return;
    let frame: { f: MinimapFrame; terrain: Terrain } | null = null;
    let parts: unknown[] = [];
    let baseKey = '';
    let viewKey = '';
    let raf = 0;
    const loop = (): void => {
      raf = requestAnimationFrame(loop);
      const src = source();
      if (!src) return;
      const { camera, viewport, terrain } = src.view();
      if (frame?.terrain !== terrain || frame.f.rotation !== camera.rotation) frame = { f: minimapFrame(terrain.slab, terrain.size, box, camera.rotation), terrain };
      const f = frame.f;
      const city = store.getState().city;
      // 都市の日付は毎フレーム進むので、形の部分が入れ替わった時だけ印を作り直す
      const next = [terrain, f, city.roads, city.zones, city.facilities, city.revealed];
      if (next.some((x, i) => x !== parts[i])) {
        parts = next;
        const key = `${String(terrain.seed)}|${minimapKey(city, f)}`;
        if (key !== baseKey) {
          baseKey = key;
          viewKey = '';
          bctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawMinimapBase(bctx, f, terrain, city);
        }
      }
      const vk = `${String(camera.focus.x)},${String(camera.focus.y)},${String(camera.zoom)},${String(camera.rotation)},${String(viewport.width)},${String(viewport.height)}`;
      if (vk === viewKey) return;
      viewKey = vk;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(base, 0, 0);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawViewFrame(ctx, f, viewOutline(f, camera, viewport));
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [store, source, box]);

  const jump = (e: ReactPointerEvent<HTMLCanvasElement>): void => {
    const src = source();
    if (!src) return;
    const { camera, terrain } = src.view();
    const rect = e.currentTarget.getBoundingClientRect();
    const f = minimapFrame(terrain.slab, terrain.size, box, camera.rotation);
    const p = fromMinimap(f, ((e.clientX - rect.left) / (rect.width || box)) * box, ((e.clientY - rect.top) / (rect.height || box)) * box);
    src.focusOn(p.x, p.y);
  };

  return (
    <div className="minimap" data-testid="minimap" data-label-block style={{ width: box, height: box }}>
      <canvas
        ref={canvasRef}
        className="minimap-canvas"
        role="img"
        aria-label="ミニマップ。押した所へカメラが動く"
        style={{ width: box, height: box }}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          jump(e);
        }}
        onPointerMove={(e) => {
          if ((e.buttons & 1) === 1) jump(e);
        }}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}
