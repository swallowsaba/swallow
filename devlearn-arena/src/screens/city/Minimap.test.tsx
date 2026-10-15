import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCamera, type Camera } from '@/city/camera';
import { fromMinimap, minimapFrame, toMinimap } from '@/city/minimap';
import { generateTerrain, MAP_SIZE } from '@/city/terrain';
import { DEFAULT_SETTINGS } from '@/save/schema';
import { SettingsContext } from '../settingsContext';
import { createSettingsStore, type SettingsStore } from '../settingsStore';
import { createCityStore } from './cityStore';
import { Minimap, type MinimapSource } from './Minimap';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
beforeEach(() => {
  // jsdom は Canvas を描けない（下絵は src/city/minimap.test.ts で確かめる）
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
});
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const terrain = generateTerrain(20260917);

function mount(camera: Camera, settings: SettingsStore = createSettingsStore(DEFAULT_SETTINGS)) {
  const store = createCityStore(20260917);
  const focusOn = vi.fn((x: number, y: number) => {
    source.camera = { ...source.camera, focus: { x, y } };
  });
  const source: MinimapSource & { camera: Camera } = {
    camera,
    view: () => ({ camera: source.camera, viewport: { width: 1920, height: 1080 }, terrain }),
    focusOn,
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<SettingsContext.Provider value={settings}><Minimap store={store} source={() => source} /></SettingsContext.Provider>));
  return { host, source, focusOn, settings };
}

/** ミニマップの (mx, my) を押す（ミニマップは画面の (10, 500) に置いたことにする） */
function press(canvas: HTMLCanvasElement, mx: number, my: number, box: number, type = 'pointerdown', buttons = 1): void {
  vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({ left: 10, top: 500, width: box, height: box, right: 10 + box, bottom: 500 + box, x: 10, y: 500, toJSON: () => ({}) });
  act(() => {
    canvas.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: 10 + mx, clientY: 500 + my, button: 0, buttons }));
  });
}

describe('ミニマップ（docs/ui-design.md 3 章、docs/decisions.md D-18）', () => {
  it('押した所へカメラが動く。都市を回すとミニマップも回り、同じ所を押すと別の地点へ動く', () => {
    window.innerHeight = 1080;
    const { host, source, focusOn } = mount(createCamera({ x: 30, y: 30 }, 1, 0));
    const canvas = host.querySelector<HTMLCanvasElement>('[data-testid="minimap"] canvas');
    if (!canvas) throw new Error('ミニマップが無い');
    // 真ん中を押すと、地図の真ん中へ
    press(canvas, 80, 80, 160);
    expect(focusOn).toHaveBeenLastCalledWith(MAP_SIZE / 2, MAP_SIZE / 2);
    // 右上を押すと、その下にある地図の点へ（回していない時）
    press(canvas, 120, 50, 160);
    const p0 = fromMinimap(minimapFrame(terrain.slab, MAP_SIZE, 160, 0), 120, 50);
    expect(source.camera.focus.x).toBeCloseTo(p0.x, 9);
    expect(source.camera.focus.y).toBeCloseTo(p0.y, 9);
    // 都市を 90 度回すと、同じ所は別の地点。今いる所は、ミニマップの上で回った位置に描かれる
    source.camera = { ...source.camera, rotation: 1 };
    press(canvas, 120, 50, 160);
    const p1 = fromMinimap(minimapFrame(terrain.slab, MAP_SIZE, 160, 1), 120, 50);
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeGreaterThan(5);
    expect(source.camera.focus.x).toBeCloseTo(p1.x, 9);
    const there = toMinimap(minimapFrame(terrain.slab, MAP_SIZE, 160, 1), source.camera.focus);
    expect(there.mx).toBeCloseTo(120, 6);
    expect(there.my).toBeCloseTo(50, 6);
  });

  it('押したまま引きずると、カメラが付いて動く。押していない時に上を通っても動かない', () => {
    window.innerHeight = 1080;
    const { host, source, focusOn } = mount(createCamera({ x: 48, y: 48 }, 1, 0));
    const canvas = host.querySelector<HTMLCanvasElement>('[data-testid="minimap"] canvas');
    if (!canvas) throw new Error('ミニマップが無い');
    press(canvas, 60, 90, 160, 'pointermove', 0);
    expect(focusOn).not.toHaveBeenCalled();
    press(canvas, 60, 90, 160);
    press(canvas, 70, 95, 160, 'pointermove', 1);
    press(canvas, 90, 100, 160, 'pointermove', 1);
    const end = fromMinimap(minimapFrame(terrain.slab, MAP_SIZE, 160, 0), 90, 100);
    expect(focusOn).toHaveBeenCalledTimes(3);
    expect(source.camera.focus.x).toBeCloseTo(end.x, 9);
    expect(source.camera.focus.y).toBeCloseTo(end.y, 9);
  });

  it('画面の高さが 900 未満では 100×100 にし、押した所の換算も 100 の縮尺で行う', () => {
    window.innerHeight = 720;
    const { host, source } = mount(createCamera({ x: 30, y: 30 }, 1, 0));
    const map = host.querySelector<HTMLElement>('[data-testid="minimap"]');
    expect(map?.style.width).toBe('100px');
    expect(map?.style.height).toBe('100px');
    const canvas = map?.querySelector('canvas');
    if (!canvas) throw new Error('ミニマップが無い');
    press(canvas, 70, 30, 100);
    const p = fromMinimap(minimapFrame(terrain.slab, MAP_SIZE, 100, 0), 70, 30);
    expect(source.camera.focus.x).toBeCloseTo(p.x, 9);
    // 画面を広げると 160×160 に戻る
    act(() => {
      window.innerHeight = 1080;
      window.dispatchEvent(new Event('resize'));
    });
    expect(host.querySelector<HTMLElement>('[data-testid="minimap"]')?.style.width).toBe('160px');
  });

  it('設定の「ミニマップ」を「出さない」にすると消え、「出す」に戻すと出る', () => {
    window.innerHeight = 1080;
    const settings = createSettingsStore({ ...DEFAULT_SETTINGS, minimap: false });
    const { host } = mount(createCamera({ x: 48, y: 48 }, 1, 0), settings);
    expect(host.querySelector('[data-testid="minimap"]')).toBeNull();
    act(() => settings.getState().set({ minimap: true }));
    expect(host.querySelector('[data-testid="minimap"]')).not.toBeNull();
    act(() => settings.getState().set({ minimap: false }));
    expect(host.querySelector('[data-testid="minimap"]')).toBeNull();
  });
});
