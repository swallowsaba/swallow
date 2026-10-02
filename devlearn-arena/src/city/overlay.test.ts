import { describe, expect, it } from 'vitest';
import { advance } from './growth';
import { facilityCondition, nextLevelOf, domainsOfFacility } from './facilityInfo';
import { newCity } from './newCity';
import { overlayOf, stageProgress } from './overlay';
import { cellKey, roadCells } from './cells';
import { checkFacility, checkRoad, checkZone, placeFacility, placeRoad, placeZone } from './place';
import { generateTerrain } from './terrain';
import { agentsOf, roadNetwork } from './traffic';
import type { City } from './types';

const base = newCity();
const terrain = generateTerrain(base.seed);
let city: City = placeZone(base, 'residential', checkZone(base, terrain, 'residential', { x: 38, y: 46 }, { x: 56, y: 46 }));
city = placeFacility(city, 'server', { x: 40, y: 48 }, 180, checkFacility(city, terrain, 'server', { x: 40, y: 48 }, 180));
city = placeFacility(city, 'container', { x: 50, y: 48 }, 180, checkFacility(city, terrain, 'container', { x: 50, y: 48 }, 180));
const grown = advance(city, 20);

describe('施設の情報', () => {
  it('状態: 建設中（基礎 → 骨組み）から稼働へ', () => {
    const f = city.facilities[0];
    if (!f) throw new Error('施設が無い');
    expect(facilityCondition(f, city)).toEqual({ kind: 'constructing', stage: 'foundation' });
    expect(facilityCondition(f, advance(city, 1.2))).toEqual({ kind: 'constructing', stage: 'frame' });
    expect(facilityCondition(grown.facilities[0] as never, grown)).toEqual({ kind: 'active' });
  });

  it('状態: 道路が無くなると止まる', () => {
    const noRoad = { ...grown, roads: [] };
    expect(facilityCondition(grown.facilities[0] as never, noRoad)).toEqual({ kind: 'no-road' });
  });

  it('次のレベルは、その分野のスキル段階がレベル以上と資金（docs/game-design.md 5 章）', () => {
    const f = grown.facilities[0];
    if (!f) throw new Error('施設が無い');
    expect(nextLevelOf(f)).toEqual({ level: 2, skillStage: 2, cost: 400 });
    expect(nextLevelOf({ ...f, level: 5 })).toBeNull();
  });

  it('対応する分野: コンテナ施設はコンテナと Docker', () => {
    expect(domainsOfFacility('container').map((d) => d.id)).toEqual(['ctr', 'docker']);
    expect(domainsOfFacility('server').map((d) => d.id)).toEqual(['linux']);
  });
});

describe('表示の切り替え', () => {
  it('学習の進み: 施設のマスを、対応する分野のスキルで塗る（記録が無ければ 0）', () => {
    const o = overlayOf('learning', grown, { skills: { linux: 60 } });
    if (o.kind !== 'cells') throw new Error('マスの表示ではない');
    const server = o.cells.filter((c) => c.x >= 40 && c.x <= 41 && c.y >= 48 && c.y <= 49);
    expect(server).toHaveLength(4);
    expect(server.every((c) => c.value === 0.6)).toBe(true);
    expect(o.cells.filter((c) => c.x >= 50).every((c) => c.value === 0)).toBe(true);
  });

  it('人口: 住宅の建物に住む人の多さ（一番多い所が 1）', () => {
    const o = overlayOf('population', grown);
    if (o.kind !== 'cells') throw new Error('マスの表示ではない');
    expect(o.cells.length).toBeGreaterThan(0);
    expect(Math.max(...o.cells.map((c) => c.value))).toBe(1);
    expect(o.cells.every((c) => c.y === 46)).toBe(true);
  });

  it('交通: 車の通る道路の線に沿って塗り、多い所ほど強い。曲線の道路でも道路の外を塗らない', () => {
    const curve = checkRoad(grown, terrain, { kind: 'lane', shape: 'curve', from: { x: 46, y: 48 }, ctrl: { x: 46.5, y: 55.5 }, to: { x: 54, y: 55 } });
    expect(curve.ok).toBe(true);
    const withCurve = advance(placeRoad(grown, curve), 2);
    const net = roadNetwork(withCurve.roads);
    const o = overlayOf('traffic', withCurve, { net, agents: agentsOf(withCurve, net) });
    if (o.kind !== 'paths') throw new Error('道路の線の表示ではない');
    expect(o.paths.length).toBeGreaterThan(5);
    expect(Math.max(...o.paths.map((p) => p.value))).toBe(1);
    const roads = roadCells(withCurve.roads);
    for (const p of o.paths) {
      expect(p.value).toBeGreaterThan(0);
      for (const q of p.pts) expect(roads.has(cellKey(Math.floor(q.x), Math.floor(q.y)))).toBe(true);
    }
    // 曲線の道路の上にも塗る
    expect(o.paths.some((p) => p.pts.some((q) => q.y > 50))).toBe(true);
  });

  it('発展段階: 今の範囲・次に晴れる範囲・次までに要る物', () => {
    const o = overlayOf('stage', grown);
    if (o.kind !== 'areas') throw new Error('範囲の表示ではない');
    expect(o.current).toEqual({ x: 36, y: 36, w: 24, h: 24 });
    expect(o.next?.w).toBe(40);
    expect(o.need).toEqual({ techPower: 5, population: 500 });
    expect(stageProgress(grown)).toMatchObject({ next: 2, techPower: [2, 5], population: [grown.population, 500] });
  });
});
