import { describe, expect, it } from 'vitest';
import { createCamera, screenToWorld, worldToScreen } from './camera';
import { fromMinimap, minimapBox, minimapFrame, minimapKey, toMinimap, viewOutline } from './minimap';
import { sampleCity } from './sample';
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

describe('ミニマップの大きさと下絵', () => {
  it('画面の高さが 900 以上は 160×160、900 未満は 100×100（docs/decisions.md D-18）', () => {
    expect(minimapBox(1080)).toBe(160);
    expect(minimapBox(900)).toBe(160);
    expect(minimapBox(899)).toBe(100);
    expect(minimapBox(720)).toBe(100);
  });

  it('今の視野の枠は、画面の四隅の下の地面を、左上・右上・右下・左下の順に結ぶ', () => {
    const vp = { width: 1280, height: 720 };
    const cam = createCamera({ x: 50, y: 47 }, 0.8, 2);
    const f = minimapFrame(terrain.slab, MAP_SIZE, 100, 2);
    const outline = viewOutline(f, cam, vp);
    const expected = [[0, 0], [1280, 0], [1280, 720], [0, 720]].map(([sx = 0, sy = 0]) => toMinimap(f, screenToWorld(cam, vp, { sx, sy }, MAP_SIZE)));
    expect(outline).toEqual(expected);
    expect(outline[0]?.mx).toBeLessThan(outline[1]?.mx ?? 0);
    expect(outline[0]?.my).toBeLessThan(outline[3]?.my ?? 0);
  });

  it('下絵の印は、都市の日付が進んでも変わらず、道路・区画・施設・晴れた範囲・向き・大きさが変わると変わる', () => {
    const city = sampleCity();
    const f = minimapFrame(terrain.slab, MAP_SIZE, 160, 0);
    const key = minimapKey(city, f);
    const later: typeof city = { ...city, day: city.day + 3, funds: city.funds + 100 };
    expect(minimapKey(later, f)).toBe(key);
    expect(minimapKey({ ...city, roads: city.roads.slice(1) }, f)).not.toBe(key);
    expect(minimapKey({ ...city, zones: city.zones.slice(1) }, f)).not.toBe(key);
    expect(minimapKey({ ...city, facilities: city.facilities.slice(1) }, f)).not.toBe(key);
    expect(minimapKey({ ...city, revealed: [{ x: 0, y: 0, w: MAP_SIZE, h: MAP_SIZE }] }, f)).not.toBe(key);
    expect(minimapKey(city, minimapFrame(terrain.slab, MAP_SIZE, 160, 1))).not.toBe(key);
    expect(minimapKey(city, minimapFrame(terrain.slab, MAP_SIZE, 100, 0))).not.toBe(key);
    // 施設が建ち終わると点の色が変わるので、印も変わる
    const building = { ...city, facilities: city.facilities.map((x, i) => (i === 0 ? { ...x, state: 'constructing' as const } : x)) };
    expect(minimapKey(building, f)).not.toBe(key);
  });
});
