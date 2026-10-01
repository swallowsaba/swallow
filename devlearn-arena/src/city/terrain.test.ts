import { describe, expect, it } from 'vitest';
import {
  distanceToOutline, generateTerrain, heightLevel, inRiver, isLand, MAP_SIZE, pointInPolygon, START_AREA,
} from './terrain';

const terrain = generateTerrain(20261002);

describe('地形', () => {
  it('同じ seed からは同じ地形になる', () => {
    expect(generateTerrain(20261002)).toEqual(terrain);
    expect(generateTerrain(7).coast).not.toEqual(terrain.coast);
  });

  it('初めに使える中央の 24×24 は、全て平らな陸で、川も丘も無い', () => {
    for (let y = START_AREA.y; y < START_AREA.y + START_AREA.h; y += 1) {
      for (let x = START_AREA.x; x < START_AREA.x + START_AREA.w; x += 1) {
        const p = { x: x + 0.5, y: y + 0.5 };
        expect(isLand(terrain, p), `(${String(x)}, ${String(y)})`).toBe(true);
        expect(heightLevel(terrain, p)).toBe(0);
      }
    }
  });

  it('陸は地盤の中にあり、陸の外には海が残る', () => {
    for (const p of terrain.coast) expect(pointInPolygon(p, terrain.slab)).toBe(true);
    // 地盤の縁の少し内側は、どこも海
    const c = terrain.size / 2;
    for (const p of terrain.slab) {
      const len = Math.hypot(p.x - c, p.y - c);
      const q = { x: p.x - ((p.x - c) / len) * 1.5, y: p.y - ((p.y - c) / len) * 1.5 };
      expect(pointInPolygon(q, terrain.slab)).toBe(true);
      expect(pointInPolygon(q, terrain.coast)).toBe(false);
    }
  });

  it('丘は陸の中に収まり、海岸から離れている', () => {
    for (const hill of terrain.hills) {
      for (const p of hill.levels[0] ?? []) {
        expect(pointInPolygon(p, terrain.coast)).toBe(true);
        expect(distanceToOutline(p, terrain.coast)).toBeGreaterThan(1.5);
      }
    }
  });

  it('丘は 1〜3 段で、上の段ほど狭い', () => {
    for (const hill of terrain.hills) {
      expect(hill.levels.length).toBeGreaterThanOrEqual(1);
      expect(hill.levels.length).toBeLessThanOrEqual(3);
      for (let i = 1; i < hill.levels.length; i += 1) {
        for (const p of hill.levels[i] ?? []) expect(pointInPolygon(p, hill.levels[i - 1] ?? [])).toBe(true);
      }
    }
  });

  it('川は陸を横切って海まで流れる', () => {
    const first = terrain.river.center[0];
    const last = terrain.river.center[terrain.river.center.length - 1];
    expect(first && pointInPolygon(first, terrain.coast)).toBe(true);
    expect(last && pointInPolygon(last, terrain.coast)).toBe(false);
    const mid = terrain.river.center[Math.floor(terrain.river.center.length / 2)];
    expect(mid && inRiver(terrain, mid)).toBe(true);
    expect(mid && isLand(terrain, mid)).toBe(false);
  });

  it('海岸線は階段でなく曲線（隣り合う辺の向きが少しずつ変わる）', () => {
    let maxTurn = 0;
    const n = terrain.coast.length;
    for (let i = 0; i < n; i += 1) {
      const a = terrain.coast[i];
      const b = terrain.coast[(i + 1) % n];
      const c = terrain.coast[(i + 2) % n];
      if (!a || !b || !c) continue;
      const t1 = Math.atan2(b.y - a.y, b.x - a.x);
      const t2 = Math.atan2(c.y - b.y, c.x - b.x);
      let d = Math.abs(t2 - t1);
      if (d > Math.PI) d = 2 * Math.PI - d;
      maxTurn = Math.max(maxTurn, d);
    }
    // マスの階段なら 90 度の曲がりが出る
    expect(maxTurn).toBeLessThan(Math.PI / 6);
  });

  it('木は海・川・初めの範囲には生えない。丘の上には森がある', () => {
    expect(terrain.trees.length).toBeGreaterThan(200);
    for (const t of terrain.trees) {
      expect(isLand(terrain, t)).toBe(true);
      const inStart = t.x > START_AREA.x && t.x < START_AREA.x + START_AREA.w && t.y > START_AREA.y && t.y < START_AREA.y + START_AREA.h;
      expect(inStart).toBe(false);
    }
    expect(terrain.trees.filter((t) => t.z > 0).length).toBeGreaterThan(50);
  });

  it('地図は 96×96', () => {
    expect(MAP_SIZE).toBe(96);
    expect(terrain.size).toBe(96);
  });
});
