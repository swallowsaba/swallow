import { describe, expect, it } from 'vitest';
import { createCamera, pan, rotateCamera, screenToWorld, worldToScreen, zoomAt, ZOOM_LEVELS } from './camera';

const size = 96;
const vp = { width: 1920, height: 1080 };

describe('カメラ', () => {
  it('焦点は画面の中央に映る', () => {
    const cam = createCamera({ x: 40, y: 50 });
    const s = worldToScreen(cam, vp, { x: 40, y: 50, z: 0 }, size);
    expect(s.sx).toBeCloseTo(960);
    expect(s.sy).toBeCloseTo(540);
  });

  it('画面の点と地図の点を行き来できる（全ての回転と拡大率で）', () => {
    for (const rotation of [0, 1, 2, 3] as const) {
      for (const zoom of ZOOM_LEVELS) {
        const cam = createCamera({ x: 48, y: 48 }, zoom, rotation);
        const p = { x: 30.5, y: 61.25 };
        const back = screenToWorld(cam, vp, worldToScreen(cam, vp, { ...p, z: 0 }, size), size);
        expect(back.x).toBeCloseTo(p.x, 6);
        expect(back.y).toBeCloseTo(p.y, 6);
      }
    }
  });

  it('引きずると、指の下にあった地図の点が指に付いて動く', () => {
    const cam = createCamera({ x: 48, y: 48 });
    const grabbed = screenToWorld(cam, vp, { sx: 500, sy: 300 }, size);
    const moved = pan(cam, vp, 120, -40, size);
    const after = worldToScreen(moved, vp, { ...grabbed, z: 0 }, size);
    expect(after.sx).toBeCloseTo(620);
    expect(after.sy).toBeCloseTo(260);
  });

  it('拡大縮小しても、マウスの下の地図の点は動かない', () => {
    const cam = createCamera({ x: 48, y: 48 });
    const at = { sx: 1400, sy: 700 };
    const under = screenToWorld(cam, vp, at, size);
    const zoomed = zoomAt(cam, vp, 2, at, size);
    expect(zoomed.zoom).toBeGreaterThan(cam.zoom);
    const after = worldToScreen(zoomed, vp, { ...under, z: 0 }, size);
    expect(after.sx).toBeCloseTo(at.sx, 4);
    expect(after.sy).toBeCloseTo(at.sy, 4);
  });

  it('拡大率は段の端で止まる', () => {
    let cam = createCamera({ x: 48, y: 48 });
    for (let i = 0; i < 20; i += 1) cam = zoomAt(cam, vp, 1, { sx: 960, sy: 540 }, size);
    expect(cam.zoom).toBe(ZOOM_LEVELS[ZOOM_LEVELS.length - 1]);
    for (let i = 0; i < 20; i += 1) cam = zoomAt(cam, vp, -1, { sx: 960, sy: 540 }, size);
    expect(cam.zoom).toBe(ZOOM_LEVELS[0]);
  });

  it('90 度ずつ回り、4 回で元の向きに戻る。焦点は変わらない', () => {
    let cam = createCamera({ x: 20, y: 70 });
    const seen: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      cam = rotateCamera(cam, 1);
      seen.push(cam.rotation);
    }
    expect(seen).toEqual([1, 2, 3, 0]);
    expect(cam.focus).toEqual({ x: 20, y: 70 });
    expect(rotateCamera(createCamera({ x: 1, y: 1 }), -1).rotation).toBe(3);
  });

  it('焦点は地図の外へ出ない', () => {
    const cam = pan(createCamera({ x: 2, y: 2 }), vp, 50_000, 50_000, size);
    expect(cam.focus.x).toBeGreaterThanOrEqual(0);
    expect(cam.focus.y).toBeGreaterThanOrEqual(0);
    expect(cam.focus.x).toBeLessThanOrEqual(size);
    expect(cam.focus.y).toBeLessThanOrEqual(size);
  });
});
