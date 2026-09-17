/**
 * 市政：住民から届く苦情と評価。
 *
 * 街はコマンドでしか変わらない。苦情は学びの進みから届く。
 * 最初の施設の苦情は就任直後に届き、施設の要望を解決（任務を 1 つ終える）するたびに街が育ち、次の施設の苦情が届く。
 * 苦情に対応する（施設の仕組みを学んで建設を決め、要望にコマンドで応える）と施設が動き、全部こなすと評価が届く。
 */

/** 施設の状況（content の FacilityStatus から必要なところだけ） */
export interface CivicFacility {
  id: string;
  /** locked / available / built / operating / complete */
  state: string;
  /** 終えた任務の数 */
  missionsCleared: number;
}

export type CityVoice =
  /** まだ建設を決めていない施設への苦情 */
  | { kind: 'complaint'; facilityId: string }
  /** 建設を決めたが、まだ要望に応えきっていない */
  | { kind: 'waiting'; facilityId: string }
  /** 施設がフル稼働して感謝されている */
  | { kind: 'praise'; facilityId: string };

/** 要望を解決した（任務を 1 つ以上終えた）施設の数 */
export function solvedCount(facilities: readonly CivicFacility[]): number {
  return facilities.filter((f) => f.missionsCleared >= 1).length;
}

/**
 * いくつ苦情を出してよいか。解決した数 + 1 から、建設を決めたがまだ 1 つも解決していない施設の数を引く
 * （対応中の施設があるうちは、次の苦情は届かない）
 */
function reachOf(facilities: readonly CivicFacility[]): number {
  const pending = facilities.filter((f) => (f.state === 'built' || f.state === 'operating') && f.missionsCleared === 0).length;
  return Math.max(0, solvedCount(facilities) + 1 - pending);
}

/** いま住民から届いている声。苦情 → 対応待ち → 評価 の順 */
export function voicesOf(facilities: readonly CivicFacility[]): CityVoice[] {
  const reach = reachOf(facilities);
  const complaints: CityVoice[] = [];
  const waiting: CityVoice[] = [];
  const praise: CityVoice[] = [];
  let unlocked = 0;
  for (const f of facilities) {
    if (f.state === 'available') {
      unlocked += 1;
      if (unlocked <= reach) complaints.push({ kind: 'complaint', facilityId: f.id });
    } else if (f.state === 'built' || f.state === 'operating') {
      waiting.push({ kind: 'waiting', facilityId: f.id });
    } else if (f.state === 'complete') {
      praise.push({ kind: 'praise', facilityId: f.id });
    }
  }
  return [...complaints, ...waiting, ...praise];
}

/** 次の苦情が届くまでに、あといくつ要望を解決すればよいか。届く施設が無ければ null */
export function nextComplaint(facilities: readonly CivicFacility[]): { facilityId: string; remaining: number } | null {
  const reach = reachOf(facilities);
  let unlocked = 0;
  for (const f of facilities) {
    if (f.state !== 'available') continue;
    unlocked += 1;
    if (unlocked > reach) return { facilityId: f.id, remaining: unlocked - reach };
  }
  return null;
}
