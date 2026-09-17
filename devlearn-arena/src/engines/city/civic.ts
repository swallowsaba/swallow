import {
  analyze, applyTool, COST, HIGHWAY_LENGTH, HIGHWAY_ROW, idx, SIZE, tick,
  type CitySave, type FacilityInfo, type Point,
} from './sim';

/**
 * 市政：住民から届く苦情と評価、施設の仮置き、出来事で街の時間を進めること。
 *
 * 市長はまず街を作る。人口が増えたり日がたったりすると、まだ無い施設の困りごとが「苦情」として届く。
 * 苦情に対応する（施設の仕組みを学んで建設を決め、要望にコマンドで応える）と施設が動き、「評価」が届く。
 */

/** 施設の状況（content の FacilityStatus から必要なところだけ） */
export interface CivicFacility {
  id: string;
  /** locked / available / built / operating / complete */
  state: string;
  ratio: number;
}

export type CityVoice =
  /** まだ建設を決めていない施設への苦情 */
  | { kind: 'complaint'; facilityId: string }
  /** 建設を決めたが、まだ要望に応えきっていない */
  | { kind: 'waiting'; facilityId: string }
  /** 施設がフル稼働して感謝されている */
  | { kind: 'praise'; facilityId: string };

/** k 番目（0 始まり）の施設の苦情が届く人口 */
export function complaintPopulation(k: number): number {
  return k === 0 ? 1 : 20 * k + 6 * k * k;
}

/** k 番目の施設の苦情が、人口が足りなくても届く日数 */
export function complaintDay(k: number): number {
  return 4 + 8 * k;
}

/** いま住民から届いている声。苦情 → 対応待ち → 評価 の順 */
export function voicesOf(facilities: readonly CivicFacility[], population: number, day: number): CityVoice[] {
  const complaints: CityVoice[] = [];
  const waiting: CityVoice[] = [];
  const praise: CityVoice[] = [];
  facilities.forEach((f, k) => {
    if (f.state === 'available') {
      if (population >= complaintPopulation(k) || day >= complaintDay(k)) complaints.push({ kind: 'complaint', facilityId: f.id });
    } else if (f.state === 'built' || f.state === 'operating') {
      waiting.push({ kind: 'waiting', facilityId: f.id });
    } else if (f.state === 'complete') {
      praise.push({ kind: 'praise', facilityId: f.id });
    }
  });
  return [...complaints, ...waiting, ...praise];
}

/** 次の苦情が届くまで。無ければ null */
export function nextComplaint(facilities: readonly CivicFacility[], population: number, day: number): { facilityId: string; population: number; day: number } | null {
  for (const [k, f] of facilities.entries()) {
    if (f.state !== 'available') continue;
    if (population >= complaintPopulation(k) || day >= complaintDay(k)) continue;
    return { facilityId: f.id, population: complaintPopulation(k), day: complaintDay(k) };
  }
  return null;
}

/** 放置している苦情の数（満足度と需要を下げる） */
export function unrestOf(voices: readonly CityVoice[]): number {
  return voices.filter((v) => v.kind === 'complaint').length;
}

/**
 * 建設を決めた施設を、道路に接する空き地へ仮置きする。
 * 街の道路の重心に近い場所から探す。置けなければそのまま返す。費用はかかる（予算が足りなければ無料で置く）。
 */
export function autoPlace(save: CitySave, terrain: string, infos: readonly FacilityInfo[], facilityId: string): CitySave {
  if (save.facilities.some((f) => f.id === facilityId)) return save;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      if (save.tiles[idx(x, y)] === 'r') {
        sx += x;
        sy += y;
        n += 1;
      }
    }
  }
  const cx = n === 0 ? HIGHWAY_LENGTH : sx / n;
  const cy = n === 0 ? HIGHWAY_ROW : sy / n;
  const spots: Point[] = [];
  for (let y = 0; y < SIZE - 1; y += 1) for (let x = 0; x < SIZE - 1; x += 1) spots.push({ x, y });
  spots.sort((a, b) => Math.hypot(a.x + 1 - cx, a.y + 1 - cy) - Math.hypot(b.x + 1 - cx, b.y + 1 - cy));
  // 区画を潰さない場所を先に、無ければ区画の上でも
  for (const allowZones of [false, true]) {
    for (const spot of spots) {
      const area = [spot, { x: spot.x + 1, y: spot.y }, { x: spot.x, y: spot.y + 1 }, { x: spot.x + 1, y: spot.y + 1 }];
      if (!allowZones && area.some((p) => save.tiles[idx(p.x, p.y)] !== '.')) continue;
      const funded = save.money >= COST.facility ? save : { ...save, money: COST.facility };
      const result = applyTool(funded, terrain, 'facility', spot, spot, infos, facilityId);
      if (result.error !== undefined) continue;
      return save.money >= COST.facility ? result.save : { ...result.save, money: save.money };
    }
  }
  return save;
}

/** 施設を別の場所へ移す。費用はかからない。置けなければ理由を返す */
export function moveFacility(
  save: CitySave,
  terrain: string,
  infos: readonly FacilityInfo[],
  facilityId: string,
  to: Point,
): { save: CitySave; error?: string } {
  const placed = save.facilities.find((f) => f.id === facilityId);
  if (!placed) return { save, error: 'nothing' };
  const tiles = save.tiles.split('');
  for (const [dx, dy] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ] as const) {
    tiles[idx(placed.x + dx, placed.y + dy)] = '.';
  }
  const lifted: CitySave = {
    ...save,
    tiles: tiles.join(''),
    facilities: save.facilities.filter((f) => f.id !== facilityId),
    money: save.money + COST.facility,
  };
  const result = applyTool(lifted, terrain, 'facility', to, to, infos, facilityId);
  if (result.error !== undefined) return { save, error: result.error };
  return { save: result.save };
}

/** 出来事で街の時間を数日進める（対応すると住民が動き、建物が育つのが見える） */
export function advanceDays(save: CitySave, terrain: string, infos: readonly FacilityInfo[], days: number, unrest = 0): CitySave {
  let s = save;
  for (let d = 0; d < days; d += 1) s = tick(s, terrain, infos, unrest);
  return s;
}

/** 人口（苦情の判定に使う） */
export function populationOf(save: CitySave, terrain: string, infos: readonly FacilityInfo[]): number {
  return analyze(save, terrain, infos).population;
}
