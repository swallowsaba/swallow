/**
 * 市長が自分で作る街のシミュレーション。
 *
 * 36×36 マスの土地に、道路を引き、住宅・商業・工業の区画を塗り、学んで建設を決めた施設を置く。
 * 1 日ごとに、幹線道路につながった区画が需要と地価に応じて育つ。
 * 施設は、その章の任務（コマンド）をこなした割合＝稼働率に応じて範囲と地価が上がる。
 * 予算は税収のほか、理解度（問題の正解）とコマンド（手順の通過・任務の完了）で入る。
 *
 * 決定論：Date / Math.random は使わない。同じ入力からは必ず同じ街になる。
 */

export const SIZE = 36;
/** 幹線道路が入ってくる行 */
export const HIGHWAY_ROW = 18;
/** 最初からある幹線道路の長さ */
export const HIGHWAY_LENGTH = 6;
/** 区画を塗れる、道路からの距離 */
export const ZONE_REACH = 3;

/** g=草地 w=水 t=林 */
export type Terrain = 'g' | 'w' | 't';
/** .=空き地 r=道路 R=住宅 C=商業 I=工業 p=公園 F=施設 */
export type Tile = '.' | 'r' | 'R' | 'C' | 'I' | 'p' | 'F';
export type ZoneTile = 'R' | 'C' | 'I';
export type Tool = 'inspect' | 'road' | 'res' | 'com' | 'ind' | 'park' | 'facility' | 'bulldoze';

export const COST = { road: 10, bridge: 40, park: 80, facility: 400 } as const;

/** 学びとコマンドで入る予算。一度だけ受け取れる */
export const REWARD = {
  learn: 600,
  quiz: 200,
  quizRetry: 80,
  check: 120,
  checkRetry: 50,
  step: 80,
  clear: 250,
} as const;

export const START_MONEY = 3000;

/** 放置した苦情 1 件あたりに下がる、満足度と住宅の需要 */
export const UNREST = { happiness: 8, demand: 12 } as const;

/** 段階ごとの住民数と働き口 */
const HOUSING = [0, 8, 20, 45, 90] as const;
const COM_JOBS = [0, 4, 10, 20, 40] as const;
const IND_JOBS = [0, 6, 14, 28, 50] as const;

export interface PlacedFacility {
  id: string;
  /** 2×2 の左上 */
  x: number;
  y: number;
}

/** 保存する街の中身。地形は種から毎回作る */
export interface CitySave {
  tiles: string;
  /** 各マスの建物の段階 0〜4 */
  levels: string;
  facilities: PlacedFacility[];
  money: number;
  day: number;
  /** 受け取った報酬のキー */
  earned: string[];
}

/** シミュレーションに渡す、施設の学びと稼働の状況 */
export interface FacilityInfo {
  id: string;
  /** 学んで建設を決めたか */
  learned: boolean;
  /** 稼働率 0..1（任務をこなした割合） */
  ratio: number;
}

export interface Point {
  x: number;
  y: number;
}

export const idx = (x: number, y: number): number => y * SIZE + x;
const inside = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < SIZE && y < SIZE;

/** 整数のハッシュ（決定論的な乱数の代わり） */
export function hash(...values: number[]): number {
  let h = 0x811c9dc5;
  for (const v of values) {
    h = Math.imul(h ^ (v | 0), 0x01000193);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 12;
  }
  return h >>> 0;
}

export function seedOf(text: string): number {
  let h = 7;
  for (let i = 0; i < text.length; i += 1) h = hash(h, text.charCodeAt(i));
  return h;
}

/* ---------------- 地形 ---------------- */

/** 滑らかなノイズ 0..1 */
function smoothNoise(seed: number, x: number, y: number, scale: number): number {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const v = (a: number, b: number): number => (hash(seed, a, b) % 1000) / 1000;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const top = v(x0, y0) * (1 - sx) + v(x0 + 1, y0) * sx;
  const bottom = v(x0, y0 + 1) * (1 - sx) + v(x0 + 1, y0 + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}

/** 土地の形。東側に川が流れ、ところどころに林がある */
export function terrainOf(key: string): string {
  const seed = seedOf(key);
  const phase = (seed % 628) / 100;
  const cells: Terrain[] = [];
  for (let y = 0; y < SIZE; y += 1) {
    const center = 26 + Math.round(3 * Math.sin(y / 5 + phase));
    const width = 1 + (hash(seed, y) % 2);
    for (let x = 0; x < SIZE; x += 1) {
      if (Math.abs(x - center) <= width - (x > center ? 1 : 0)) {
        cells.push('w');
      } else if (y !== HIGHWAY_ROW && smoothNoise(seed + 1, x, y, 5) > 0.68) {
        cells.push('t');
      } else {
        cells.push('g');
      }
    }
  }
  return cells.join('');
}

export function createCity(): CitySave {
  const tiles: Tile[] = Array.from({ length: SIZE * SIZE }, () => '.');
  for (let x = 0; x < HIGHWAY_LENGTH; x += 1) tiles[idx(x, HIGHWAY_ROW)] = 'r';
  return {
    tiles: tiles.join(''),
    levels: '0'.repeat(SIZE * SIZE),
    facilities: [],
    money: START_MONEY,
    day: 0,
    earned: [],
  };
}

/** 保存データが壊れていたら作り直す */
export function isValidCity(save: CitySave): boolean {
  return (
    save.tiles.length === SIZE * SIZE &&
    save.levels.length === SIZE * SIZE &&
    /^[.rRCIpF]*$/.test(save.tiles) &&
    /^[0-4]*$/.test(save.levels)
  );
}

/* ---------------- 道具 ---------------- */

export type ToolError = 'money' | 'blocked' | 'reach' | 'notLearned' | 'placed' | 'nothing' | 'water' | 'road';

export interface ToolResult {
  save: CitySave;
  cost: number;
  changed: number;
  error?: ToolError;
}

/** ドラッグの始点と終点から、道路が通るマス（横 → 縦の L 字） */
export function roadPath(from: Point, to: Point): Point[] {
  const points: Point[] = [];
  const sx = Math.sign(to.x - from.x);
  for (let x = from.x; ; x += sx) {
    points.push({ x, y: from.y });
    if (x === to.x || sx === 0) break;
  }
  const sy = Math.sign(to.y - from.y);
  for (let y = from.y + sy; sy !== 0; y += sy) {
    points.push({ x: to.x, y });
    if (y === to.y) break;
  }
  return points.filter((p) => inside(p.x, p.y));
}

/** ドラッグの矩形 */
export function rectOf(from: Point, to: Point): Point[] {
  const points: Point[] = [];
  for (let y = Math.min(from.y, to.y); y <= Math.max(from.y, to.y); y += 1) {
    for (let x = Math.min(from.x, to.x); x <= Math.max(from.x, to.x); x += 1) {
      if (inside(x, y)) points.push({ x, y });
    }
  }
  return points;
}

/** 道具が触るマス。画面の下見にも使う */
export function toolArea(tool: Tool, from: Point, to: Point): Point[] {
  if (tool === 'road') return roadPath(from, to);
  if (tool === 'park' || tool === 'inspect') return inside(to.x, to.y) ? [to] : [];
  if (tool === 'facility') return rectOf(to, { x: to.x + 1, y: to.y + 1 });
  return rectOf(from, to);
}

const ZONE_OF: Partial<Record<Tool, ZoneTile>> = { res: 'R', com: 'C', ind: 'I' };

/** 道路から一定の距離にあるマス */
function nearRoad(tiles: string, reach: number, roads?: Uint8Array): Uint8Array {
  const near = new Uint8Array(SIZE * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const i = idx(x, y);
      if (tiles[i] !== 'r' || (roads !== undefined && roads[i] !== 1)) continue;
      for (let dy = -reach; dy <= reach; dy += 1) {
        for (let dx = -reach; dx <= reach; dx += 1) {
          if (inside(x + dx, y + dy)) near[idx(x + dx, y + dy)] = 1;
        }
      }
    }
  }
  return near;
}

function withTiles(save: CitySave, tiles: string[], levels: string[], extra: Partial<CitySave> = {}): CitySave {
  return { ...save, tiles: tiles.join(''), levels: levels.join(''), ...extra };
}

/**
 * 道具を使う。予算が足りない・置けない場所のときは何も変えずに理由を返す。
 * facilityId は施設を置くときだけ使う。
 */
export function applyTool(
  save: CitySave,
  terrain: string,
  tool: Tool,
  from: Point,
  to: Point,
  facilities: readonly FacilityInfo[],
  facilityId?: string,
): ToolResult {
  const tiles = save.tiles.split('');
  const levels = save.levels.split('');
  const none = (error: ToolError): ToolResult => ({ save, cost: 0, changed: 0, error });

  if (tool === 'inspect') return { save, cost: 0, changed: 0 };

  if (tool === 'road') {
    let cost = 0;
    let changed = 0;
    for (const p of roadPath(from, to)) {
      const i = idx(p.x, p.y);
      if (tiles[i] === 'F') return none('blocked');
      if (tiles[i] === 'r') continue;
      cost += terrain[i] === 'w' ? COST.bridge : COST.road;
      tiles[i] = 'r';
      levels[i] = '0';
      changed += 1;
    }
    if (changed === 0) return none('nothing');
    if (cost > save.money) return none('money');
    return { save: withTiles(save, tiles, levels, { money: save.money - cost }), cost, changed };
  }

  const zone = ZONE_OF[tool];
  if (zone !== undefined) {
    const near = nearRoad(save.tiles, ZONE_REACH);
    let changed = 0;
    let far = 0;
    for (const p of rectOf(from, to)) {
      const i = idx(p.x, p.y);
      const tile = tiles[i];
      if (terrain[i] === 'w' || (tile !== '.' && tile !== 'R' && tile !== 'C' && tile !== 'I') || tile === zone) continue;
      if (near[i] !== 1) {
        far += 1;
        continue;
      }
      tiles[i] = zone;
      levels[i] = '0';
      changed += 1;
    }
    if (changed === 0) return none(far > 0 ? 'reach' : 'nothing');
    return { save: withTiles(save, tiles, levels), cost: 0, changed };
  }

  if (tool === 'park') {
    const i = idx(to.x, to.y);
    if (!inside(to.x, to.y)) return none('nothing');
    if (terrain[i] === 'w') return none('water');
    if (tiles[i] !== '.' && tiles[i] !== 'R' && tiles[i] !== 'C' && tiles[i] !== 'I') return none('blocked');
    if (COST.park > save.money) return none('money');
    tiles[i] = 'p';
    levels[i] = '0';
    return { save: withTiles(save, tiles, levels, { money: save.money - COST.park }), cost: COST.park, changed: 1 };
  }

  if (tool === 'facility') {
    const info = facilities.find((f) => f.id === facilityId);
    if (!info?.learned) return none('notLearned');
    if (save.facilities.some((f) => f.id === info.id)) return none('placed');
    const area = toolArea('facility', to, to);
    if (area.length < 4) return none('blocked');
    for (const p of area) {
      const i = idx(p.x, p.y);
      if (terrain[i] === 'w') return none('water');
      if (tiles[i] === 'r' || tiles[i] === 'F' || tiles[i] === 'p') return none('blocked');
    }
    const touchesRoad = area.some((p) =>
      [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx = 0, dy = 0]) => inside(p.x + dx, p.y + dy) && tiles[idx(p.x + dx, p.y + dy)] === 'r'),
    );
    if (!touchesRoad) return none('road');
    if (COST.facility > save.money) return none('money');
    for (const p of area) {
      tiles[idx(p.x, p.y)] = 'F';
      levels[idx(p.x, p.y)] = '0';
    }
    return {
      save: withTiles(save, tiles, levels, {
        money: save.money - COST.facility,
        facilities: [...save.facilities, { id: info.id, x: to.x, y: to.y }],
      }),
      cost: COST.facility,
      changed: 4,
    };
  }

  // 撤去
  let placed = save.facilities;
  let changed = 0;
  for (const p of rectOf(from, to)) {
    const i = idx(p.x, p.y);
    const tile = tiles[i];
    if (tile === '.' || (tile === 'r' && p.x === 0 && p.y === HIGHWAY_ROW)) continue;
    if (tile === 'F') {
      const owner = placed.find((f) => p.x >= f.x && p.x <= f.x + 1 && p.y >= f.y && p.y <= f.y + 1);
      if (owner) {
        placed = placed.filter((f) => f !== owner);
        for (const q of toolArea('facility', owner, owner)) {
          tiles[idx(q.x, q.y)] = '.';
          levels[idx(q.x, q.y)] = '0';
          changed += 1;
        }
      }
      continue;
    }
    tiles[i] = '.';
    levels[i] = '0';
    changed += 1;
  }
  if (changed === 0) return none('nothing');
  return { save: withTiles(save, tiles, levels, { facilities: placed }), cost: 0, changed };
}

/* ---------------- 街の分析 ---------------- */

export interface Demand {
  r: number;
  c: number;
  i: number;
}

export interface CityAnalysis {
  /** 幹線につながった道路 */
  connected: Uint8Array;
  /** 区画が道路網につながっている（道路から 3 マス以内） */
  access: Uint8Array;
  /** 地価（0 以上） */
  landValue: Float32Array;
  /** 施設の範囲内 */
  covered: Uint8Array;
  /** そのマスで建物が育てる上限の段階 */
  maxLevel: Uint8Array;
  population: number;
  jobs: number;
  demand: Demand;
  happiness: number;
  income: number;
  upkeep: number;
  roads: number;
  zones: number;
  /** 道路につながっていない区画 */
  unconnected: number;
  /** 施設の範囲の外に住む住宅のマス */
  unserved: number;
}

/** 施設の範囲の半径。稼働するほど広がる */
export function facilityRadius(ratio: number): number {
  return 4 + Math.round(Math.max(0, Math.min(1, ratio)) * 6);
}

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * 街を調べる。unrest は放置している苦情の数。多いほど満足度と住宅の需要が下がる
 */
export function analyze(save: CitySave, terrain: string, facilities: readonly FacilityInfo[], unrest = 0): CityAnalysis {
  const n = SIZE * SIZE;
  const { tiles } = save;

  // 幹線からたどれる道路
  const connected = new Uint8Array(n);
  const start = idx(0, HIGHWAY_ROW);
  if (tiles[start] === 'r') {
    const queue = [start];
    connected[start] = 1;
    while (queue.length > 0) {
      const i = queue.pop() ?? 0;
      const x = i % SIZE;
      const y = Math.floor(i / SIZE);
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        if (!inside(x + dx, y + dy)) continue;
        const j = idx(x + dx, y + dy);
        if (tiles[j] === 'r' && connected[j] === 0) {
          connected[j] = 1;
          queue.push(j);
        }
      }
    }
  }
  const access = nearRoad(tiles, ZONE_REACH, connected);

  const landValue = new Float32Array(n);
  const covered = new Uint8Array(n);
  for (const placed of save.facilities) {
    const info = facilities.find((f) => f.id === placed.id);
    const ratio = info?.ratio ?? 0;
    const radius = facilityRadius(ratio);
    const cx = placed.x + 0.5;
    const cy = placed.y + 0.5;
    const bonus = 1 + (ratio >= 0.5 ? 1 : 0) + (ratio >= 1 ? 1 : 0);
    for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y += 1) {
      for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x += 1) {
        if (!inside(x, y) || Math.hypot(x - cx, y - cy) > radius) continue;
        const i = idx(x, y);
        covered[i] = 1;
        landValue[i] = Math.max(landValue[i] ?? 0, bonus);
      }
    }
  }
  // 公園（重ねても +2 まで）と水辺（+0.5）は地価を上げ、工業の近くの住宅・商業は下がる
  const park = new Uint8Array(n);
  const water = new Uint8Array(n);
  const dirty = new Uint8Array(n);
  const spread = (x: number, y: number, reach: number, into: Uint8Array, add: boolean): void => {
    for (let dy = -reach; dy <= reach; dy += 1) {
      for (let dx = -reach; dx <= reach; dx += 1) {
        if (!inside(x + dx, y + dy)) continue;
        const j = idx(x + dx, y + dy);
        into[j] = add ? Math.min(2, (into[j] ?? 0) + 1) : 1;
      }
    }
  };
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const i = idx(x, y);
      if (tiles[i] === 'p') spread(x, y, 3, park, true);
      if (tiles[i] === 'I') spread(x, y, 2, dirty, false);
      if (terrain[i] === 'w') spread(x, y, 2, water, false);
    }
  }
  for (let i = 0; i < n; i += 1) {
    const tile = tiles[i];
    const polluted = dirty[i] === 1 && (tile === 'R' || tile === 'C') ? 1 : 0;
    landValue[i] = Math.max(0, (landValue[i] ?? 0) + (park[i] ?? 0) + (water[i] ?? 0) * 0.5 - polluted);
  }

  const maxLevel = new Uint8Array(n);
  let population = 0;
  let comJobs = 0;
  let indJobs = 0;
  let roads = 0;
  let zones = 0;
  let unconnected = 0;
  let resTiles = 0;
  let unserved = 0;
  let valueSum = 0;
  let parks = 0;
  for (let i = 0; i < n; i += 1) {
    const tile = tiles[i];
    const level = Number(save.levels[i] ?? '0');
    if (tile === 'r') roads += 1;
    if (tile === 'p') parks += 1;
    if (tile !== 'R' && tile !== 'C' && tile !== 'I') continue;
    zones += 1;
    const lv = landValue[i] ?? 0;
    if (access[i] !== 1) {
      unconnected += 1;
    } else if (covered[i] !== 1) {
      maxLevel[i] = 1;
    } else {
      maxLevel[i] = lv >= 3 ? 4 : lv >= 2 ? 3 : 2;
    }
    if (tile === 'R') {
      population += HOUSING[level as 0] ?? 0;
      resTiles += 1;
      if (covered[i] !== 1) unserved += 1;
      valueSum += Math.max(0, lv);
    } else if (tile === 'C') {
      comJobs += COM_JOBS[level as 0] ?? 0;
    } else {
      indJobs += IND_JOBS[level as 0] ?? 0;
    }
  }
  const jobs = comJobs + indJobs;
  const workers = population * 0.5;
  const demand: Demand = {
    r: Math.round(clamp(60 + (jobs - workers) / 2 - unrest * UNREST.demand, 0, 100)),
    c: Math.round(clamp(10 + (population * 0.3 - comJobs) * 1.5, 0, 100)),
    i: Math.round(clamp(20 + (workers - jobs), 0, 100)),
  };
  const coverageShare = resTiles === 0 ? 0 : (resTiles - unserved) / resTiles;
  const happiness =
    resTiles === 0
      ? Math.round(clamp(50 - unrest * UNREST.happiness, 0, 100))
      : Math.round(clamp(35 + 40 * coverageShare + 15 * Math.min(1, valueSum / resTiles / 3) + (demand.r > 20 ? 10 : 0) - unrest * UNREST.happiness, 0, 100));
  const income = Math.round(population * 0.15 + jobs * 0.1);
  // 最初からある幹線道路の維持費はかからない
  const upkeep = save.facilities.length * 4 + Math.round(Math.max(0, roads - HIGHWAY_LENGTH) * 0.1) + parks;
  return {
    connected, access, landValue, covered, maxLevel,
    population, jobs, demand, happiness, income, upkeep, roads, zones, unconnected, unserved,
  };
}

/** 需要があると見なす下限 */
const DEMAND_MIN = 15;

/** 1 日進める。つながった区画が需要に応じて育ち、税収と維持費が動く */
export function tick(save: CitySave, terrain: string, facilities: readonly FacilityInfo[], unrest = 0): CitySave {
  const a = analyze(save, terrain, facilities, unrest);
  const levels = save.levels.split('');
  const demand = { R: a.demand.r, C: a.demand.c, I: a.demand.i };
  const candidates: number[] = [];
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    const tile = save.tiles[i];
    if (tile !== 'R' && tile !== 'C' && tile !== 'I') continue;
    const level = Number(levels[i]);
    const max = a.maxLevel[i] ?? 0;
    // 道路や施設が無くなった区画は、上限まで下がる
    if (level > max) levels[i] = String(max);
    else if (level < max) candidates.push(i);
  }
  candidates.sort((p, q) => hash(save.day, p) - hash(save.day, q));
  let budget = Math.min(8, 2 + Math.floor(a.population / 150));
  for (const i of candidates) {
    if (budget <= 0) break;
    const tile = save.tiles[i] as ZoneTile;
    if (demand[tile] <= DEMAND_MIN) continue;
    levels[i] = String(Number(levels[i]) + 1);
    demand[tile] -= 4;
    budget -= 1;
  }
  const next = { ...save, levels: levels.join('') };
  const after = analyze(next, terrain, facilities, unrest);
  return { ...next, money: Math.max(0, save.money + after.income - after.upkeep), day: save.day + 1 };
}

/** 学びとコマンドの報酬を受け取る。同じキーは一度だけ */
export function grant(save: CitySave, key: string, amount: number): CitySave {
  if (save.earned.includes(key)) return save;
  return { ...save, money: save.money + amount, earned: [...save.earned, key] };
}

/* ---------------- 住民の声 ---------------- */

export type Advice =
  | { kind: 'noRoad' }
  | { kind: 'noZone' }
  | { kind: 'unconnected'; count: number }
  | { kind: 'needRes' }
  | { kind: 'needCom' }
  | { kind: 'needInd' }
  | { kind: 'place'; facilityId: string }
  | { kind: 'idle'; facilityId: string }
  | { kind: 'unserved'; count: number }
  | { kind: 'trouble'; facilityId: string }
  | { kind: 'growing' };

/**
 * いま住民が市長に伝えたいこと。大事な順。
 * order は施設を学ぶ順（最初の未学習の施設の困りごとを出す）。
 */
export function advise(
  save: CitySave,
  analysis: CityAnalysis,
  facilities: readonly FacilityInfo[],
  order: readonly string[],
): Advice[] {
  const list: Advice[] = [];
  const placed = new Set(save.facilities.map((f) => f.id));
  for (const f of facilities) if (f.learned && !placed.has(f.id)) list.push({ kind: 'place', facilityId: f.id });
  if (analysis.roads <= HIGHWAY_LENGTH) list.push({ kind: 'noRoad' });
  else if (analysis.zones === 0) list.push({ kind: 'noZone' });
  if (analysis.unconnected > 0) list.push({ kind: 'unconnected', count: analysis.unconnected });
  if (analysis.zones > 0) {
    if (analysis.demand.r >= 60) list.push({ kind: 'needRes' });
    if (analysis.demand.c >= 50) list.push({ kind: 'needCom' });
    if (analysis.demand.i >= 50) list.push({ kind: 'needInd' });
  }
  if (analysis.unserved > 0) list.push({ kind: 'unserved', count: analysis.unserved });
  for (const f of facilities) if (placed.has(f.id) && f.ratio === 0) list.push({ kind: 'idle', facilityId: f.id });
  const nextToLearn = order.find((id) => facilities.find((f) => f.id === id)?.learned !== true);
  if (nextToLearn !== undefined) list.push({ kind: 'trouble', facilityId: nextToLearn });
  if (list.length === 0) list.push({ kind: 'growing' });
  return list;
}
