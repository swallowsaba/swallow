import { FACILITY_DEFS } from '@/city/facilities';
import { CAPACITY } from '@/city/rules';
import type { City, Facility, ZoneKind } from '@/city/types';
import { DISTRICT_COUNT, districtOf, facilityCenter, indexOf, inMap, NEIGHBORS, SIZE, type Space } from './space';
import type { PoliticsRules, PowerState, World } from './types';

/**
 * 電力（docs/game-design.md 24.1・docs/city-design.md 9.4）。
 * 使う量: 住宅 0.5 / 1,000 人・店 1 / 1,000 人の仕事・事務所 1.5 / 1,000 人・工場 3 / 1,000 人・施設は定義の MW × Lv（譲歩の power を掛ける）。
 * 来る電気: 道路網ごとに、陸揚げ所からの外の電気（上限まで）と、道路に面した発電所の出力（財政が赤字の間は 7 割）。
 * 足りない網は、足りない分だけ地区を番号の順に止める（輪番の停電。止める始めの地区は週ごとに回る。乱数でない）。
 * 申請中・工事中の施設は数えない（15.2）。止まっても学習には効かない
 */

/** 区画の建物の、1,000 人あたりの使う量（MW） */
export const ZONE_POWER_PER_1000: Record<ZoneKind, number> = { residential: 0.5, commercial: 1, office: 1.5, industrial: 3 };
/** 財政が赤字の間の、発電所の出力の割合（22.2） */
export const DEFICIT_OUTPUT = 0.7;
/** 停電の記録を持つ週の数（直近 28 日） */
export const OUTAGE_WEEKS = 4;

/** 区画の建物 1 つの使う量（建物の大きさの人数・仕事から） */
export function zonePowerOf(kind: ZoneKind, level: number): number {
  return ((CAPACITY[kind][level - 1] ?? 0) / 1000) * ZONE_POWER_PER_1000[kind];
}

/** 施設の使う量（MW）。発電所は 0（作る量は plantOutput） */
export function facilityPowerOf(f: Pick<Facility, 'type' | 'level' | 'mods'>, rules: Pick<PoliticsRules, 'facilities'>): number {
  const mw = rules.facilities[f.type]?.powerMW ?? FACILITY_DEFS[f.type].powerMW ?? 0;
  return mw > 0 ? mw * f.level * (f.mods?.power ?? 1) : 0;
}

/** 発電所の出力（MW。譲歩の power で出力を絞った発電所はその割合。財政が赤字の間は 7 割） */
export function plantOutput(f: Pick<Facility, 'type'> & Partial<Pick<Facility, 'mods'>>, deficit: boolean): number {
  const mw = FACILITY_DEFS[f.type].powerMW ?? 0;
  return mw < 0 ? -mw * (f.mods?.power ?? 1) * (deficit ? DEFICIT_OUTPUT : 1) : 0;
}

/** 都市の使う量（MW） */
export function powerUse(city: Pick<City, 'zones' | 'buildings' | 'facilities'>, rules: Pick<PoliticsRules, 'facilities'>): number {
  const kindOf = new Map(city.zones.map((z) => [z.id, z.kind]));
  let mw = 0;
  for (const b of city.buildings) {
    const kind = kindOf.get(b.zoneId);
    if (kind) mw += zonePowerOf(kind, b.level);
  }
  for (const f of city.facilities) if (f.state === 'active') mw += facilityPowerOf(f, rules);
  return mw;
}

/** 来る電気の合計（MW）: 外からの電気の上限と、完成した発電所の出力 */
export function powerSupply(world: Pick<World, 'sim' | 'city' | 'budget'>): number {
  const deficit = world.budget.treasury < 0;
  let mw = world.sim.power.externalCapMW;
  for (const f of world.city.facilities) if (f.state === 'active') mw += plantOutput(f, deficit);
  return mw;
}

/** 施設の止まる・止まらないを決める地区（敷地の中心のマスの地区。毎日の技術力の計算と、週の計算で同じ物を使う） */
export const facilityPowerDistrict = (f: Facility): number => {
  const c = facilityCenter(f);
  return districtOf(Math.floor(c.x), Math.floor(c.y));
};

export interface PowerNet {
  /** 来る電気（MW） */
  supply: number;
  /** 発電所の出力（MW） */
  plants: number;
  /** 使う量（MW） */
  use: number;
  /** 地区 → その地区の、この網での使う量 */
  districts: Map<number, number>;
  /** 陸揚げ所がつながる網 */
  landing: boolean;
}

export interface PowerGrid {
  /** マス → 道路網の番号（道路でなければ −1） */
  net: Int32Array;
  nets: PowerNet[];
  /** 外から買う電気（MW。陸揚げ所の網で、発電所で足りない分。上限まで） */
  external: number;
}

/** 道路のつながりごとに網へ分ける */
function netsOf(space: Pick<Space, 'roadKind' | 'roadCells'>): { net: Int32Array; count: number; size: number[] } {
  const net = new Int32Array(space.roadKind.length).fill(-1);
  const size: number[] = [];
  let count = 0;
  for (const start of space.roadCells) {
    if ((net[start] as number) >= 0) continue;
    const queue = [start];
    net[start] = count;
    let n = 0;
    while (queue.length > 0) {
      const i = queue.pop() as number;
      n += 1;
      const x = i % SIZE;
      const y = Math.floor(i / SIZE);
      for (const [dx, dy] of NEIGHBORS) {
        const nx = x + dx;
        const ny = y + dy;
        if (!inMap(nx, ny)) continue;
        const j = indexOf(nx, ny);
        if ((space.roadKind[j] ?? -1) < 0 || (net[j] as number) >= 0) continue;
        net[j] = count;
        queue.push(j);
      }
    }
    size.push(n);
    count += 1;
  }
  return { net, count, size };
}

/**
 * 道路網ごとの来る電気と使う量。陸揚げ所は隣の道路の網へ、つながる道路が無ければ一番大きい網へ地中線でつなぐ（9.4）
 */
export function powerGridOf(world: Pick<World, 'sim' | 'budget'>, space: Pick<Space, 'roadKind' | 'roadCells' | 'residential' | 'workplaces' | 'facilities' | 'civic'>, rules: Pick<PoliticsRules, 'facilities'>): PowerGrid {
  const { net, count, size } = netsOf(space);
  const nets: PowerNet[] = Array.from({ length: count }, () => ({ supply: 0, plants: 0, use: 0, districts: new Map<number, number>(), landing: false }));
  const add = (cell: number, district: number, mw: number): void => {
    const n = nets[net[cell] ?? -1];
    if (!n || mw <= 0) return;
    n.use += mw;
    n.districts.set(district, (n.districts.get(district) ?? 0) + mw);
  };
  for (const zb of [...space.residential, ...space.workplaces]) add(zb.front, zb.district, zonePowerOf(zb.kind, zb.building.level));
  for (const af of space.facilities) if (af.fronts[0] !== undefined) add(af.fronts[0], facilityPowerDistrict(af.facility), facilityPowerOf(af.facility, rules));
  const deficit = world.budget.treasury < 0;
  for (const af of space.civic) {
    const n = af.fronts[0] !== undefined ? nets[net[af.fronts[0]] ?? -1] : undefined;
    const out = plantOutput(af.facility, deficit);
    if (n && out > 0) n.plants += out;
  }
  // 陸揚げ所の網
  let landing = -1;
  const { x, y } = world.sim.power.landing;
  for (const [dx, dy] of [[0, 0], ...NEIGHBORS]) {
    const nx = x + (dx as number);
    const ny = y + (dy as number);
    if (inMap(nx, ny) && (net[indexOf(nx, ny)] as number) >= 0) {
      landing = net[indexOf(nx, ny)] as number;
      break;
    }
  }
  if (landing < 0 && count > 0) landing = size.indexOf(Math.max(...size));
  let external = 0;
  nets.forEach((n, i) => {
    n.supply = n.plants;
    if (i === landing) {
      n.landing = true;
      external = Math.min(world.sim.power.externalCapMW, Math.max(0, n.use - n.plants));
      n.supply += world.sim.power.externalCapMW;
    }
  });
  return { net, nets, external };
}

/**
 * 次の週の輪番の停電: 足りない網ごとに、使う量のある地区を、回る始めの地区から番号の順に止め、止めた使う量が足りない分に届くまで続ける。
 * 返す rotation は、最後に止めた地区の次（止めなければ同じ）
 */
export function outageOf(grid: PowerGrid, rotation: number): { stopped: number[]; rotation: number } {
  const stopped = new Set<number>();
  let last = -1;
  for (const n of grid.nets) {
    let short = n.use - n.supply;
    if (short <= 1e-9) continue;
    const order = [...n.districts.keys()].sort((a, b) => ((a - rotation + DISTRICT_COUNT) % DISTRICT_COUNT) - ((b - rotation + DISTRICT_COUNT) % DISTRICT_COUNT));
    for (const d of order) {
      if (short <= 1e-9) break;
      stopped.add(d);
      short -= n.districts.get(d) ?? 0;
      last = d;
    }
  }
  return { stopped: [...stopped].sort((a, b) => a - b), rotation: last >= 0 ? (last + 1) % DISTRICT_COUNT : rotation };
}

/** 今の週に止まっている地区 */
export function stoppedNow(power: Pick<PowerState, 'recent'>): ReadonlySet<number> {
  return new Set(power.recent?.at(-1) ?? []);
}

/** 週の終わりに、次の週の停電を決めて記録する（直近 4 週の止まった地区と、地区ごとの止まった日の数） */
export function stepPower(world: World, space: Space, rules: Pick<PoliticsRules, 'facilities'>): World {
  const grid = powerGridOf(world, space, rules);
  const { stopped, rotation } = outageOf(grid, world.sim.power.rotation);
  const recent = [...(world.sim.power.recent ?? []), stopped].slice(-OUTAGE_WEEKS);
  const outageDays = new Array<number>(DISTRICT_COUNT).fill(0);
  for (const week of recent) for (const d of week) outageDays[d] = (outageDays[d] as number) + 7;
  return { ...world, sim: { ...world.sim, power: { ...world.sim.power, rotation, recent, outageDays } } };
}
