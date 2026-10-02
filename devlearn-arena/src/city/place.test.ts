import { describe, expect, it } from 'vitest';
import { cellKey, cellKindAt, entranceCells, roadCells } from './cells';
import { FACILITY_DEFS } from './facilities';
import { newCity } from './newCity';
import {
  checkFacility, checkRoad, checkZone, demolish, demolishTargetAt, placeFacility, placeRoad, placeZone, type PlanCheck,
} from './place';
import { revealedFor } from './rules';
import { generateTerrain } from './terrain';
import type { City } from './types';

const base = newCity();
const terrain = generateTerrain(base.seed);
const codes = (c: PlanCheck): string[] => c.reasons.map((r) => r.code);

/** 町の段階の都市（橋と商業区画が使える。霧が 40×40 まで晴れている） */
const town: City = { ...base, stage: 2, revealed: revealedFor(2) };

/** 行 y で、川のマスの x（町の範囲の中） */
function riverXs(y: number): number[] {
  const xs: number[] = [];
  for (let x = 28; x < 68; x += 1) if (cellKindAt(terrain, x, y) === 'river') xs.push(x);
  return xs;
}

describe('道路を引く', () => {
  it('霧の晴れた陸に直線を引ける。費用は新しいマスの数 × 1 マスの費用', () => {
    const check = checkRoad(base, terrain, { kind: 'lane', shape: 'straight', from: { x: 40, y: 40 }, to: { x: 40, y: 45 } });
    expect(check.ok).toBe(true);
    expect(check.cells).toHaveLength(6);
    expect(check.cost).toBe(60);
    const after = placeRoad(base, check);
    expect(after.roads).toHaveLength(2);
    expect(roadCells(after.roads).has(cellKey(40, 43))).toBe(true);
  });

  it('直線は縦か横にそろう（斜めに引いても）', () => {
    const check = checkRoad(base, terrain, { kind: 'lane', shape: 'straight', from: { x: 40, y: 40 }, to: { x: 46, y: 42 } });
    expect(check.cells.every((c) => c.y === 40)).toBe(true);
  });

  it('曲線は始点・制御点・終点を通る形で、通るマスが階段でなく続いている', () => {
    const check = checkRoad(base, terrain, { kind: 'lane', shape: 'curve', from: { x: 40, y: 40 }, ctrl: { x: 50.5, y: 40.5 }, to: { x: 50, y: 46 } });
    expect(check.ok).toBe(true);
    const cells = new Set(check.cells.map((c) => cellKey(c.x, c.y)));
    expect(cells.has(cellKey(40, 40))).toBe(true);
    expect(cells.has(cellKey(50, 46))).toBe(true);
    // 全てのマスが、隣（上下左右）のどれかとつながっている
    for (const c of check.cells) {
      const linked = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => cells.has(cellKey(c.x + (dx as number), c.y + (dy as number))));
      expect(linked).toBe(true);
    }
  });

  it('霧の中には引けない', () => {
    const check = checkRoad(base, terrain, { kind: 'lane', shape: 'straight', from: { x: 40, y: 30 }, to: { x: 40, y: 40 } });
    expect(check.ok).toBe(false);
    expect(codes(check)).toContain('fog');
    expect(check.cells.filter((c) => !c.ok).every((c) => c.y < 36)).toBe(true);
  });

  it('村では川を渡れない（橋は町から）。町では川を渡る所に橋が架かる', () => {
    const y = 50;
    const xs = riverXs(y);
    expect(xs.length).toBeGreaterThan(0);
    const from = { x: (xs[0] as number) - 3, y };
    const to = { x: (xs[xs.length - 1] as number) + 2, y };
    const village = { ...town, stage: 1 as const };
    expect(codes(checkRoad(village, terrain, { kind: 'lane', shape: 'straight', from, to }))).toContain('bridge-stage');

    const check = checkRoad(town, terrain, { kind: 'lane', shape: 'straight', from, to });
    expect(check.ok).toBe(true);
    expect(check.roads.map((r) => r.kind)).toEqual(['lane', 'bridge', 'lane']);
    const bridge = check.roads[1];
    // 橋は川の全てのマスを覆う
    const covered = roadCells(bridge ? [bridge] : []);
    for (const x of xs) expect(covered.has(cellKey(x, y))).toBe(true);
    // 川の上は費用が高い
    const land = checkRoad(town, terrain, { kind: 'lane', shape: 'straight', from: { x: 40, y: 38 }, to: { x: 40 + (to.x - from.x), y: 38 } });
    expect(check.cost).toBeGreaterThan(land.cost);
  });

  it('大通りとロータリーは地方都市から', () => {
    const avenue = checkRoad(town, terrain, { kind: 'avenue', shape: 'straight', from: { x: 40, y: 40 }, to: { x: 46, y: 40 } });
    expect(avenue.reasons.find((r) => r.code === 'stage')?.text).toContain('地方都市');
    const ring = checkRoad({ ...town, stage: 3 }, terrain, { kind: 'roundabout', center: { x: 44, y: 41 } });
    expect(ring.ok).toBe(true);
    expect(ring.cells).toHaveLength(9);
  });

  it('大通りは 2 マスの幅', () => {
    const check = checkRoad({ ...town, stage: 3 }, terrain, { kind: 'avenue', shape: 'straight', from: { x: 40, y: 40 }, to: { x: 46, y: 40 } });
    expect(new Set(check.cells.map((c) => c.y))).toEqual(new Set([40, 41]));
  });

  it('交差は引ける。同じ所に重ねて引くことはできない', () => {
    const cross = checkRoad(base, terrain, { kind: 'street', shape: 'straight', from: { x: 47, y: 40 }, to: { x: 47, y: 55 } });
    expect(cross.ok).toBe(true);
    const same = checkRoad(base, terrain, { kind: 'street', shape: 'straight', from: { x: 40, y: 47 }, to: { x: 50, y: 47 } });
    expect(same.ok).toBe(false);
    expect(codes(same)).toContain('road-overlap');
  });

  it('1 マスだけの道路は短すぎる', () => {
    expect(codes(checkRoad(base, terrain, { kind: 'lane', shape: 'straight', from: { x: 40, y: 40 }, to: { x: 40, y: 40 } }))).toContain('short');
  });

  it('資金より高い道路は置けない', () => {
    const poor = { ...base, funds: 30 };
    expect(codes(checkRoad(poor, terrain, { kind: 'street', shape: 'straight', from: { x: 40, y: 40 }, to: { x: 40, y: 45 } }))).toContain('funds');
  });
});

describe('区画を塗る', () => {
  it('道路に面したマスだけを塗れる。面していないマスは赤の枠と理由', () => {
    const check = checkZone(base, terrain, 'residential', { x: 40, y: 45 }, { x: 42, y: 46 });
    expect(check.ok).toBe(true);
    expect(check.paint.map((c) => cellKey(c.x, c.y)).sort()).toEqual(['40,46', '41,46', '42,46']);
    expect(check.cells.filter((c) => !c.ok)).toHaveLength(3);
    expect(codes(check)).toContain('no-road');
    const after = placeZone(base, 'residential', check);
    expect(after.zones).toHaveLength(1);
    expect(after.zones[0]?.cells).toHaveLength(3);
  });

  it('道路のマスは塗らず、枠も出さない', () => {
    const check = checkZone(base, terrain, 'residential', { x: 40, y: 46 }, { x: 40, y: 48 });
    expect(check.cells.map((c) => c.y)).toEqual([46, 48]);
  });

  it('商業区画は町から', () => {
    const check = checkZone(base, terrain, 'commercial', { x: 40, y: 46 }, { x: 42, y: 46 });
    expect(check.ok).toBe(false);
    expect(check.reasons.find((r) => r.code === 'stage')?.text).toContain('町');
    expect(checkZone(town, terrain, 'commercial', { x: 40, y: 46 }, { x: 42, y: 46 }).ok).toBe(true);
  });

  it('別の種類で塗り替えると、建っていた建物は取り壊される', () => {
    let city = placeZone(base, 'residential', checkZone(base, terrain, 'residential', { x: 40, y: 46 }, { x: 42, y: 46 }));
    city = { ...city, buildings: [{ id: 'b1', zoneId: city.zones[0]?.id ?? '', cell: { x: 41, y: 46 }, variant: 'x', level: 1, builtDay: 0 }] };
    const check = checkZone(city, terrain, 'office', { x: 41, y: 46 }, { x: 41, y: 46 });
    const after = placeZone(city, 'office', check);
    expect(after.buildings).toHaveLength(0);
    expect(after.zones.map((z) => [z.kind, z.cells.length])).toEqual([['residential', 2], ['office', 1]]);
  });
});

describe('施設と公園を置く', () => {
  it('入口が道路に面していれば置ける。建設中から始まる', () => {
    // 道路は y=47。2×2 の施設を y=45〜46 に置くと、向き 0（入口 +y）で道路に面する
    const check = checkFacility(base, terrain, 'server', { x: 40, y: 45 }, 0);
    expect(check.ok).toBe(true);
    expect(check.cost).toBe(FACILITY_DEFS.server.cost);
    const after = placeFacility(base, 'server', { x: 40, y: 45 }, 0, check);
    expect(after.facilities[0]).toMatchObject({ type: 'server', domain: 'linux', level: 1, state: 'constructing', builtDay: 0 });
  });

  it('入口が道路の反対を向いていれば、回すように案内する', () => {
    const check = checkFacility(base, terrain, 'server', { x: 40, y: 45 }, 180);
    expect(check.ok).toBe(false);
    expect(codes(check)).toEqual(['entrance']);
    expect(check.reasons[0]?.text).toContain('R');
  });

  it('入口のマスは向きに合う辺にある', () => {
    const f = { type: 'deploy' as const, origin: { x: 10, y: 20 } };
    // 3×2。90 度回すと 2×3 になり、入口は -x
    expect(entranceCells({ ...f, rotation: 0 }).map((c) => cellKey(c.x, c.y))).toEqual(['10,22', '11,22', '12,22']);
    expect(entranceCells({ ...f, rotation: 90 }).map((c) => cellKey(c.x, c.y))).toEqual(['9,20', '9,21', '9,22']);
    expect(entranceCells({ ...f, rotation: 180 }).map((c) => cellKey(c.x, c.y))).toEqual(['10,19', '11,19', '12,19']);
    expect(entranceCells({ ...f, rotation: 270 }).map((c) => cellKey(c.x, c.y))).toEqual(['12,20', '12,21', '12,22']);
  });

  it('道路から離れていれば置けない。道路・施設・区画と重なれば置けない', () => {
    expect(codes(checkFacility(base, terrain, 'server', { x: 40, y: 40 }, 0))).toEqual(['no-road']);
    expect(codes(checkFacility(base, terrain, 'server', { x: 40, y: 46 }, 0))).toContain('road-overlap');
    const placed = placeFacility(base, 'server', { x: 40, y: 45 }, 0, checkFacility(base, terrain, 'server', { x: 40, y: 45 }, 0));
    expect(codes(checkFacility(placed, terrain, 'network', { x: 41, y: 45 }, 0))).toContain('overlap');
    const zoned = placeZone(base, 'residential', checkZone(base, terrain, 'residential', { x: 44, y: 46 }, { x: 45, y: 46 }));
    expect(codes(checkFacility(zoned, terrain, 'network', { x: 44, y: 45 }, 0))).toContain('overlap');
  });

  it('公園は向きを問わず、どこかの辺が道路に面していればよい', () => {
    expect(checkFacility(base, terrain, 'park', { x: 40, y: 45 }, 180).ok).toBe(true);
  });

  it('広場と噴水は町から（公園の種類が増える）', () => {
    expect(codes(checkFacility(base, terrain, 'plaza', { x: 40, y: 45 }, 0))).toContain('stage');
    expect(checkFacility(town, terrain, 'plaza', { x: 40, y: 45 }, 0).ok).toBe(true);
  });

  it('資金より高い施設は置けない', () => {
    expect(codes(checkFacility({ ...base, funds: 100 }, terrain, 'academy', { x: 40, y: 44 }, 0))).toContain('funds');
  });
});

describe('取り壊す', () => {
  const city = (() => {
    let c = placeFacility(base, 'server', { x: 40, y: 45 }, 0, checkFacility(base, terrain, 'server', { x: 40, y: 45 }, 0));
    c = placeZone(c, 'residential', checkZone(c, terrain, 'residential', { x: 44, y: 48 }, { x: 46, y: 48 }));
    return c;
  })();

  it('マスにある物を、施設 → 区画 → 道路の順に見つける', () => {
    expect(demolishTargetAt(city, { x: 41, y: 46 })).toMatchObject({ kind: 'facility', name: 'サーバ施設' });
    expect(demolishTargetAt(city, { x: 45, y: 48 })).toMatchObject({ kind: 'zone', name: '住宅の区画' });
    expect(demolishTargetAt(city, { x: 50, y: 47 })).toMatchObject({ kind: 'road', name: '一般道' });
    expect(demolishTargetAt(city, { x: 50, y: 40 })).toBeNull();
  });

  it('施設を取り壊すと、その施設だけが消える', () => {
    const target = demolishTargetAt(city, { x: 41, y: 46 });
    if (!target) throw new Error('施設が無い');
    const after = demolish(city, target);
    expect(after.facilities).toHaveLength(0);
    expect(after.zones).toEqual(city.zones);
    expect(after.roads).toEqual(city.roads);
  });

  it('道路を取り壊すと、その道路だけに面していた建物も取り壊される（区画は残る）', () => {
    const built: City = { ...city, buildings: [{ id: 'b1', zoneId: city.zones[0]?.id ?? '', cell: { x: 45, y: 48 }, variant: 'x', level: 1, builtDay: 0 }] };
    const target = demolishTargetAt(built, { x: 50, y: 47 });
    if (!target) throw new Error('道路が無い');
    const after = demolish(built, target);
    expect(after.roads).toHaveLength(0);
    expect(after.buildings).toHaveLength(0);
    expect(after.zones).toEqual(built.zones);
  });

  it('区画を取り壊すと、そのマスだけが区画から外れる', () => {
    const target = demolishTargetAt(city, { x: 45, y: 48 });
    if (!target) throw new Error('区画が無い');
    const after = demolish(city, target);
    expect(after.zones[0]?.cells.map((c) => c.x)).toEqual([44, 46]);
  });
});
