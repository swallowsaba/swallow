import { useEffect, useRef, useState } from 'react';
import type { MissionTrack } from '@/engines/lesson/types';
import { project, TRACK_ACCENT } from '@/features/citymap/isoDraw';
import { cityAt, CITY_D, CITY_W, drawRegion, REGION_BOUNDS, REGION_SPOTS, type RegionCity } from './regionDraw';

interface Props {
  cities: readonly RegionCity[];
  selected: MissionTrack | null;
  onSelect: (track: MissionTrack) => void;
  label: string;
}

function canvasAvailable(): boolean {
  if (/jsdom/i.test(navigator.userAgent)) return false;
  try {
    return document.createElement('canvas').getContext('2d') !== null;
  } catch {
    return false;
  }
}

/** 全体図の地図。ドラッグで移動、ホイールで拡大縮小、街を押すと選ぶ */
export function RegionMap({ cities, selected, onSelect, label }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  const state = useRef({ cities, selected, onSelect });
  state.current = { cities, selected, onSelect };
  const layerDirty = useRef(true);

  useEffect(() => {
    layerDirty.current = true;
  }, [cities]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    if (!canvasAvailable()) {
      setFailed(true);
      return;
    }
    const ctx = canvas.getContext('2d');
    const layer = document.createElement('canvas');
    const layerCtx = layer.getContext('2d');
    if (!ctx || !layerCtx) {
      setFailed(true);
      return;
    }
    const view = { x: 0, y: 0, zoom: 1 };
    let width = 1;
    let height = 1;
    let moved = false;
    let layerScale = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const fit = (): void => {
      // 海の余白ではなく陸地が枠いっぱいに入るように寄せる
      view.zoom = Math.max(0.3, Math.min(1.6, (width - 20) / (REGION_BOUNDS.width * 0.8), (height - 20) / (REGION_BOUNDS.height * 0.78)));
      view.x = width / 2 - (REGION_BOUNDS.left + REGION_BOUNDS.width / 2) * view.zoom;
      view.y = height / 2 - (REGION_BOUNDS.top + REGION_BOUNDS.height / 2) * view.zoom;
    };
    const resize = (): void => {
      width = Math.max(1, host.clientWidth);
      height = Math.max(1, host.clientHeight);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      if (!moved) fit();
      layerDirty.current = true;
    };
    resize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
    observer?.observe(host);

    const toMap = (event: PointerEvent | WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      return { sx: (event.clientX - rect.left - view.x) / view.zoom, sy: (event.clientY - rect.top - view.y) / view.zoom };
    };
    let drag: { x: number; y: number; vx: number; vy: number; moved: boolean } | null = null;
    let hover: MissionTrack | null = null;
    const onDown = (e: PointerEvent): void => {
      canvas.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
    };
    const onMove = (e: PointerEvent): void => {
      if (drag) {
        if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 4) drag.moved = true;
        if (drag.moved) {
          view.x = drag.vx + e.clientX - drag.x;
          view.y = drag.vy + e.clientY - drag.y;
          moved = true;
        }
        return;
      }
      const p = toMap(e);
      hover = cityAt(p.sx, p.sy, state.current.cities);
      canvas.style.cursor = hover === null ? 'grab' : 'pointer';
    };
    const onUp = (e: PointerEvent): void => {
      const click = drag !== null && !drag.moved;
      drag = null;
      if (!click) return;
      const p = toMap(e);
      const track = cityAt(p.sx, p.sy, state.current.cities);
      if (track !== null) state.current.onSelect(track);
    };
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const next = Math.max(0.3, Math.min(3, view.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
      const k = next / view.zoom;
      view.x = px - (px - view.x) * k;
      view.y = py - (py - view.y) * k;
      view.zoom = next;
      moved = true;
    };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    let frame = 0;
    const loop = (now: number): void => {
      frame = requestAnimationFrame(loop);
      const { cities: list, selected: chosen } = state.current;
      if (layerDirty.current) {
        const scale = 1.5;
        layer.width = Math.ceil(REGION_BOUNDS.width * scale);
        layer.height = Math.ceil(REGION_BOUNDS.height * scale);
        layerCtx.setTransform(scale, 0, 0, scale, -REGION_BOUNDS.left * scale, -REGION_BOUNDS.top * scale);
        drawRegion(layerCtx, list);
        layerScale = scale;
        layerDirty.current = false;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = '#4896c6';
      ctx.fillRect(0, 0, width, height);
      const k = view.zoom / layerScale;
      ctx.drawImage(layer, view.x + REGION_BOUNDS.left * view.zoom, view.y + REGION_BOUNDS.top * view.zoom, layer.width * k, layer.height * k);
      ctx.setTransform(dpr * view.zoom, 0, 0, dpr * view.zoom, dpr * view.x, dpr * view.y);
      for (const city of list) {
        const s = REGION_SPOTS[city.track];
        const accent = TRACK_ACCENT[city.track];
        if (city.track === chosen || city.track === hover) {
          ctx.strokeStyle = city.track === chosen ? '#ffd24a' : 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 5;
          ctx.beginPath();
          const corners = [project(s.x, s.y), project(s.x + CITY_W, s.y), project(s.x + CITY_W, s.y + CITY_D), project(s.x, s.y + CITY_D)];
          corners.forEach((p, i) => {
            if (i === 0) ctx.moveTo(p.sx, p.sy);
            else ctx.lineTo(p.sx, p.sy);
          });
          ctx.closePath();
          ctx.stroke();
        }
        const signW = project(s.x + CITY_W / 2, s.y + CITY_D + 1.2);
        const sign = { sx: view.x + signW.sx * view.zoom, sy: view.y + signW.sy * view.zoom };
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        const text = `${city.name}  ${String(Math.round(city.progress * 100))}%`;
        ctx.font = '800 16px system-ui, sans-serif';
        const w = ctx.measureText(text).width + 22;
        ctx.fillStyle = '#fbf3df';
        ctx.strokeStyle = accent;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.roundRect(sign.sx - w / 2, sign.sy - 14, w, 28, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#2b2118';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, sign.sx, sign.sy + 1);
        if (city.complaints > 0) {
          const topW = project(s.x + CITY_W / 2, s.y, 0);
          const top = { sx: view.x + topW.sx * view.zoom, sy: view.y + topW.sy * view.zoom + 40 };
          const bob = Math.sin(now / 400 + s.x) * 4;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(top.sx - 30, top.sy - 86 + bob, 60, 34, 17);
          ctx.fill();
          ctx.strokeStyle = '#e0483a';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.font = '900 20px system-ui';
          ctx.fillStyle = '#2b2118';
          ctx.fillText(String(city.complaints), top.sx, top.sy - 69 + bob);
        }
        ctx.restore();
      }
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <div ref={hostRef} role="img" aria-label={label} data-testid="region-map" className="relative h-full w-full overflow-hidden bg-[#4896c6]">
      <canvas ref={canvasRef} className="block h-full w-full" style={{ touchAction: 'none', cursor: 'grab' }} />
      {failed ? <div className="absolute inset-0 grid place-items-center bg-[#6fab49] p-6 text-center text-sm font-bold">{label}</div> : null}
    </div>
  );
}
