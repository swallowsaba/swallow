import { cellKey, cellKindAt } from '@/city/cells';
import { FACILITY_DEFS, FACILITY_TYPES, footprintOf } from '@/city/facilities';
import { newCity } from '@/city/newCity';
import { revealedFor } from '@/city/rules';
import { sampleCity } from '@/city/sample';
import type { Terrain } from '@/city/terrain';
import type { Building, City, Facility, FacilityType, Road, Zone, ZoneKind } from '@/city/types';
import { NAME_PARTS, POLITICS_RULES } from '@/content/politics';
import type { Command, Op } from '../commands';
import { SimRunner, terrainOf } from '../runner';
import type { World } from '../types';
import { newWorld, worldFromCity } from '../world';

/**
 * 見本の都市（docs/testing-strategy.md 10.1: 村・町・地方都市の 3 つ）と、決めた命令の列。
 * 決定性のテストと、性能の計測（tools/bench-sim.mjs）が使う。
 */

export const SEED = 20261002;

const cmd = (seq: number, day: number, op: Op): Command => ({ seq, day, op });

/** 公共サービスのそろった村に初めからある物（一般道の西の端と、サーバ施設の両隣。docs/game-design.md 24.2）。維持費（週 120）を払えるように財政を足しておく */
export const VILLAGE_SERVICES: readonly Facility[] = [
  { id: 'c1', type: 'police', origin: { x: 36, y: 48 }, rotation: 0, level: 1, state: 'active', builtDay: 0 },
  { id: 'c2', type: 'fire', origin: { x: 36, y: 45 }, rotation: 0, level: 1, state: 'active', builtDay: 0 },
  { id: 'c3', type: 'clinic', origin: { x: 50, y: 48 }, rotation: 0, level: 1, state: 'active', builtDay: 0 },
  { id: 'c4', type: 'school', origin: { x: 53, y: 48 }, rotation: 0, level: 1, state: 'active', builtDay: 0 },
];
export const VILLAGE_TREASURY = 8000;

/**
 * 村: 新しい都市に、命令で道路・住宅・工業・施設を足していく（何日目に何をしたか）。
 * 一般道（y = 47）の両側に住宅、東に工業、サーバ施設、北へ細い道とオフィス。
 * services: 一般道の南に、初めから公共サービスが 4 つある（財政 8,000）
 */
export function village(services = false): { world: World; terrain: Terrain; commands: Command[] } {
  const terrain = terrainOf(SEED);
  const base = newWorld(terrain, NAME_PARTS, SEED);
  const world: World = services ? { ...base, city: { ...base.city, facilities: [...VILLAGE_SERVICES] }, budget: { ...base.budget, treasury: VILLAGE_TREASURY } } : base;
  const commands: Command[] = [
    cmd(1, 0, { kind: 'funds', amount: 4000 }),
    cmd(2, 0, { kind: 'zone', zone: 'residential', a: { x: 38, y: 48 }, b: { x: 49, y: 48 } }),
    cmd(3, 1, { kind: 'zone', zone: 'residential', a: { x: 38, y: 46 }, b: { x: 46, y: 46 } }),
    cmd(4, 3, { kind: 'facility', type: 'server', origin: { x: 51, y: 48 }, rotation: 180 }),
    cmd(5, 10, { kind: 'road', plan: { kind: 'lane', shape: 'straight', from: { x: 48, y: 46 }, to: { x: 48, y: 38 } } }),
    cmd(6, 12, { kind: 'zone', zone: 'office', a: { x: 49, y: 39 }, b: { x: 49, y: 45 } }),
    cmd(7, 20, { kind: 'zone', zone: 'industrial', a: { x: 54, y: 46 }, b: { x: 57, y: 46 } }),
    cmd(8, 30, { kind: 'zone', zone: 'residential', a: { x: 47, y: 39 }, b: { x: 47, y: 45 } }),
    cmd(9, 45, { kind: 'facility', type: 'park', origin: { x: 44, y: 49 }, rotation: 0 }),
  ];
  return { world, terrain, commands };
}

/**
 * 命令の列を日付どおりに当てながら 90 日進めた村（住宅に人が住み、店と工場が動いている。資金 20,000）。
 * 市政のデータ（反対の理由）を入れて動かす。反対・公聴会のテストが使う
 */
export function grownVillage(days = 90, services = false): { world: World; terrain: Terrain } {
  const { world, terrain, commands } = village(services);
  const runner = new SimRunner(world);
  runner.load(world, 0, POLITICS_RULES);
  let i = 0;
  for (let d = 0; d <= days; d += 1) {
    while (i < commands.length && (commands[i] as Command).day <= d) {
      runner.apply(commands[i] as Command);
      i += 1;
    }
    if (d < days) runner.advance(d + 1);
  }
  const w = runner.current;
  return { world: { ...w, city: { ...w.city, funds: 20000 } }, terrain };
}

/** 町: 見本の街（src/city/sample.ts。住宅・商業・オフィスと施設 3 つ） */
export function town(): { world: World; terrain: Terrain } {
  const city = sampleCity(SEED);
  const terrain = terrainOf(city.seed);
  return { world: worldFromCity({ ...city, day: 7 }, terrain, NAME_PARTS), terrain };
}

/**
 * 碁盤の都市: 霧の晴れた範囲に 3 マスごとの道路を引き、全ての空いたマスを区画にして、建物を建てる。
 * full = true なら島の全体（技術都市・最も重い形。docs/architecture.md 9.3）
 */
export function gridCity(full: boolean): { world: World; terrain: Terrain } {
  const terrain = terrainOf(SEED);
  const stage = full ? 5 : 3;
  const base = newCity(SEED);
  const revealed = revealedFor(stage);
  const area = revealed[0] as { x: number; y: number; w: number; h: number };
  const land = (x: number, y: number): boolean => cellKindAt(terrain, x, y) === 'land';
  const roads: Road[] = [];
  let rid = 0;
  const x0 = Math.max(1, area.x);
  const y0 = Math.max(1, area.y);
  const x1 = Math.min(94, area.x + area.w - 1);
  const y1 = Math.min(94, area.y + area.h - 1);
  // 道路は land のマスが続く所だけを、短い区切りで引く
  const roadCells = new Set<string>();
  for (let y = y0; y <= y1; y += 3) {
    let start = -1;
    for (let x = x0; x <= x1 + 1; x += 1) {
      const ok = x <= x1 && land(x, y);
      if (ok && start < 0) start = x;
      if (!ok && start >= 0) {
        if (x - 1 - start >= 1) {
          rid += 1;
          roads.push({ id: `r${String(rid)}`, kind: y % 12 === 0 ? 'avenue' : 'street', path: [{ x: start + 0.5, y: y + 0.5 }, { x: x - 0.5, y: y + 0.5 }] });
          for (let c = start; c < x; c += 1) roadCells.add(cellKey(c, y));
        }
        start = -1;
      }
    }
  }
  // 縦の道路は 12 マスごと（横の道路の間の 2 列は全て横の道路に面する。建物を最も多く置ける形）
  for (let x = x0; x <= x1; x += 12) {
    let start = -1;
    for (let y = y0; y <= y1 + 1; y += 1) {
      const ok = y <= y1 && land(x, y);
      if (ok && start < 0) start = y;
      if (!ok && start >= 0) {
        if (y - 1 - start >= 1) {
          rid += 1;
          roads.push({ id: `r${String(rid)}`, kind: 'street', path: [{ x: x + 0.5, y: start + 0.5 }, { x: x + 0.5, y: y - 0.5 }] });
          for (let c = start; c < y; c += 1) roadCells.add(cellKey(x, c));
        }
        start = -1;
      }
    }
  }
  // 施設: ブロックの中に 2×2 の施設を間をあけて置く（夜も動く施設を含む）
  const facilities: Facility[] = [];
  const used = new Set<string>();
  const types = FACILITY_TYPES.filter((t) => FACILITY_DEFS[t].group === 'facility' && FACILITY_DEFS[t].w === 2 && FACILITY_DEFS[t].d === 2) as FacilityType[];
  const night: FacilityType[] = ['datacenter', 'cluster', 'cloud'];
  let fid = 0;
  const want = full ? 60 : 12;
  for (let by = y0 + 1; by + 1 <= y1 && facilities.length < want; by += 6) {
    for (let bx = x0 + 2; bx + 1 <= x1 && facilities.length < want; bx += 7) {
      const cells = [[bx, by], [bx + 1, by], [bx, by + 1], [bx + 1, by + 1]] as const;
      if (!cells.every(([x, y]) => land(x, y) && !roadCells.has(cellKey(x, y)))) continue;
      fid += 1;
      const type = fid % 4 === 0 ? (night[fid % 3] as FacilityType) : (types[fid % types.length] as FacilityType);
      const size = footprintOf(type, 180);
      const fcells: [number, number][] = [];
      for (let dy = 0; dy < size.d; dy += 1) for (let dx = 0; dx < size.w; dx += 1) fcells.push([bx + dx, by + dy]);
      if (!fcells.every(([x, y]) => land(x, y) && !roadCells.has(cellKey(x, y)) && !used.has(cellKey(x, y)))) continue;
      for (const [x, y] of fcells) used.add(cellKey(x, y));
      const def = FACILITY_DEFS[type];
      facilities.push({ id: `f${String(fid)}`, type, ...(def.domain ? { domain: def.domain } : {}), origin: { x: bx, y: by }, rotation: 180, level: (1 + (fid % 5)) as Facility['level'], state: 'active', builtDay: 0 });
    }
  }
  // 区画と建物: 道路に面した空いたマスを、住宅 6・商業 1・オフィス 2・工業 1 の割合で塗る
  const kinds: ZoneKind[] = ['residential', 'residential', 'residential', 'office', 'residential', 'commercial', 'residential', 'office', 'residential', 'industrial'];
  const zones = new Map<ZoneKind, Zone>();
  const buildings: Building[] = [];
  let bid = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const k = cellKey(x, y);
      if (!land(x, y) || roadCells.has(k) || used.has(k)) continue;
      const faces = [[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => roadCells.has(cellKey(x + (dx as number), y + (dy as number))));
      if (!faces) continue;
      const kind = kinds[(x * 7 + y * 3) % kinds.length] as ZoneKind;
      let zone = zones.get(kind);
      if (!zone) {
        zone = { id: `z-${kind}`, kind, cells: [] };
        zones.set(kind, zone);
      }
      zone.cells.push({ x, y });
      bid += 1;
      const level = full ? 1 + ((x + y) % 5) : 1 + ((x + y) % 3);
      buildings.push({ id: `b${String(bid)}`, zoneId: zone.id, cell: { x, y }, variant: `${kind}:${String(bid % 1000)}`, level, builtDay: 0 });
    }
  }
  const city: City = { ...base, day: 7, stage, revealed, roads, zones: [...zones.values()], buildings, facilities, funds: 100000 };
  return { world: worldFromCity(city, terrain, NAME_PARTS), terrain };
}
