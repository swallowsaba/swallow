import { describe, expect, it } from 'vitest';
import { FACILITY_DEFS } from './facilities';
import { sampleCity } from './sample';
import { buildScene, frontOf, roadCells } from './scene';
import { generateTerrain } from './terrain';
import type { City } from './types';

const city = sampleCity();
const terrain = generateTerrain(city.seed);
const scene = buildScene(city, terrain);
const roads = roadCells(city.roads);
const cellKey = (x: number, y: number): string => `${String(x)},${String(y)}`;
const isProp = (id: string): boolean => id.startsWith('tree-') || id.startsWith('lamp-');

describe('見本の街の描く物', () => {
  it('区画の建物は道路に面したマスにだけ建ち、正面が道路を向く', () => {
    const buildings = scene.filter((o) => o.id.startsWith('b-'));
    expect(buildings.length).toBeGreaterThan(40);
    for (const b of buildings) {
      const front = frontOf({ x: b.x, y: b.y }, roads);
      expect(front).not.toBeNull();
      expect(b.facing).toBe(front);
    }
  });

  it('道路に面していない区画のマスには建たない', () => {
    const lonely: City = {
      ...city,
      zones: [{ id: 'z-x', kind: 'residential', cells: [{ x: 30, y: 30 }] }],
      buildings: [{ id: 'b-x', zoneId: 'z-x', cell: { x: 30, y: 30 }, variant: 'r', level: 1, builtDay: 0 }],
    };
    expect(buildScene(lonely, terrain).some((o) => o.id === 'b-x')).toBe(false);
  });

  it('施設 3 種（Lv1）がある。敷地の大きさは施設の定義の通り', () => {
    const types: string[] = [];
    for (const f of scene) {
      if (f.source.kind !== 'facility') continue;
      types.push(f.source.type);
      const def = FACILITY_DEFS[f.source.type];
      expect(f.w * f.d).toBe(def.w * def.d);
      expect(f.source.level).toBe(1);
    }
    expect(types.sort()).toEqual(['academy', 'network', 'server']);
  });

  it('建物・施設・道路は互いに重ならない', () => {
    const cells = new Map<string, string>();
    for (const o of scene) {
      if (isProp(o.id)) continue;
      for (let x = o.x; x < o.x + o.w; x += 1) {
        for (let y = o.y; y < o.y + o.d; y += 1) {
          const k = cellKey(x, y);
          expect(cells.get(k), `${o.id} と ${cells.get(k) ?? ''}`).toBeUndefined();
          expect(roads.has(k), `${o.id} が道路 ${k} の上`).toBe(false);
          cells.set(k, o.id);
        }
      }
    }
  });

  it('木は道路・区画・施設のマスに生えない', () => {
    const taken = new Set(roads);
    for (const o of scene) {
      if (isProp(o.id)) continue;
      for (let x = o.x; x < o.x + o.w; x += 1) for (let y = o.y; y < o.y + o.d; y += 1) taken.add(cellKey(x, y));
    }
    for (const t of scene.filter((o) => o.id.startsWith('tree-'))) {
      expect(taken.has(cellKey(Math.floor(t.x + t.w / 2), Math.floor(t.y + t.d / 2)))).toBe(false);
    }
  });

  it('同じ状態からは同じ物の並びになる', () => {
    const again = buildScene(sampleCity(), generateTerrain(city.seed));
    expect(again.map((o) => [o.id, o.x, o.y, o.facing])).toEqual(scene.map((o) => [o.id, o.x, o.y, o.facing]));
  });

  it('見本の街は道路を直線と曲線の両方で持ち、細い道と一般道がある', () => {
    expect(city.roads.some((r) => r.path.length > 2)).toBe(true);
    expect(city.roads.some((r) => r.kind === 'street')).toBe(true);
    expect(city.roads.some((r) => r.kind === 'lane')).toBe(true);
  });
});
