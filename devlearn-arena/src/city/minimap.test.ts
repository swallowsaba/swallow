import { describe, expect, it } from 'vitest';
import { createCamera, screenToWorld, worldToScreen } from './camera';
import { fromMinimap, minimapFrame, toMinimap } from './minimap';
import type { Rotation } from './projection';
import { generateTerrain, MAP_SIZE } from './terrain';

const ROTATIONS: Rotation[] = [0, 1, 2, 3];
const terrain = generateTerrain(20260917);

describe('ミニマップの座標', () => {
  it('島の全体が、どの向きでも縁の余白の内側に収まり、縮尺は向きで変わらない', () => {
    const scales = ROTATIONS.map((r) => {
      const f = minimapFrame(terrain.slab, MAP_SIZE, 160, r);
      for (const p of terrain.slab) {
        const m = toMinimap(f, p);
        expect(m.mx).toBeGreaterThanOrEqual(6 - 1e-9);
        expect(m.mx).toBeLessThanOrEqual(154 + 1e-9);
        expect(m.my).toBeGreaterThanOrEqual(6 - 1e-9);
        expect(m.my).toBeLessThanOrEqual(154 + 1e-9);
      }
      return f.scale;
    });
    expect(new Set(scales.map((s) => s.toFixed(9))).size).toBe(1);
    // 小さい画面の 100×100 では、同じ島が小さく収まる
    expect(minimapFrame(terrain.slab, MAP_SIZE, 100, 0).scale).toBeLessThan(scales[0] ?? 0);
  });

  it('押した所の地図の点を、そのまま元に戻せる（どの向きでも）', () => {
    for (const r of ROTATIONS) {
      const f = minimapFrame(terrain.slab, MAP_SIZE, 160, r);
      for (const p of [{ x: 48, y: 48 }, { x: 30.5, y: 61 }, { x: 70, y: 22.25 }]) {
        const m = toMinimap(f, p);
        const back = fromMinimap(f, m.mx, m.my);
        expect(back.x).toBeCloseTo(p.x, 9);
        expect(back.y).toBeCloseTo(p.y, 9);
      }
      // 地図の中心はミニマップの中心
      expect(toMinimap(f, { x: MAP_SIZE / 2, y: MAP_SIZE / 2 })).toEqual({ mx: 80, my: 80 });
    }
  });

  it('地図の外を押しても、地図の端に寄せた点になる', () => {
    const f = minimapFrame(terrain.slab, MAP_SIZE, 160, 0);
    for (const [mx, my] of [[0, 0], [160, 0], [0, 160], [160, 160], [80, -50]] as const) {
      const p = fromMinimap(f, mx, my);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(MAP_SIZE);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(MAP_SIZE);
    }
  });

  it('都市ビューと同じ向きに描く（画面で右・下にある物は、ミニマップでも右・下）', () => {
    const vp = { width: 1920, height: 1080 };
    const points = [{ x: 40, y: 52 }, { x: 55, y: 41 }, { x: 47, y: 47 }, { x: 60, y: 60 }];
    for (const r of ROTATIONS) {
      const cam = createCamera({ x: 48, y: 48 }, 1, r);
      const f = minimapFrame(terrain.slab, MAP_SIZE, 160, r);
      for (const a of points) {
        for (const b of points) {
          if (a === b) continue;
          const sa = worldToScreen(cam, vp, { ...a, z: 0 }, MAP_SIZE);
          const sb = worldToScreen(cam, vp, { ...b, z: 0 }, MAP_SIZE);
          const ma = toMinimap(f, a);
          const mb = toMinimap(f, b);
          // 等角投影は横 2 : 縦 1。ミニマップは真上から見るので、縦だけ 2 倍に伸びる
          expect(ma.mx - mb.mx).toBeCloseTo(((sa.sx - sb.sx) / 32) * f.scale, 6);
          expect(ma.my - mb.my).toBeCloseTo(((sa.sy - sb.sy) / 16) * f.scale, 6);
        }
      }
    }
  });

  it('今の視野（画面の四隅の地面）は、カメラの焦点を中心にした横長の枠になる', () => {
    const vp = { width: 1920, height: 1080 };
    for (const r of ROTATIONS) {
      const cam = createCamera({ x: 44, y: 51 }, 1.25, r);
      const f = minimapFrame(terrain.slab, MAP_SIZE, 160, r);
      const corners = [[0, 0], [vp.width, 0], [vp.width, vp.height], [0, vp.height]].map(([sx, sy]) => toMinimap(f, screenToWorld(cam, vp, { sx: sx ?? 0, sy: sy ?? 0 }, MAP_SIZE)));
      const [tl, tr, br, bl] = corners as [{ mx: number; my: number }, { mx: number; my: number }, { mx: number; my: number }, { mx: number; my: number }];
      // 枠の辺はミニマップの縦横に沿う
      expect(tl.my).toBeCloseTo(tr.my, 6);
      expect(bl.my).toBeCloseTo(br.my, 6);
      expect(tl.mx).toBeCloseTo(bl.mx, 6);
      expect(tr.mx).toBeCloseTo(br.mx, 6);
      // 中心が焦点
      const focus = toMinimap(f, cam.focus);
      expect((tl.mx + br.mx) / 2).toBeCloseTo(focus.mx, 6);
      expect((tl.my + br.my) / 2).toBeCloseTo(focus.my, 6);
      // 拡大すると枠が小さくなる
      const near = createCamera(cam.focus, 2.5, r);
      const a = toMinimap(f, screenToWorld(near, vp, { sx: 0, sy: 0 }, MAP_SIZE));
      expect(focus.mx - a.mx).toBeLessThan(focus.mx - tl.mx);
    }
  });
});
