/**
 * 街の育ち。
 *
 * 街は飾りではなく、学習の写像である。
 * どの区域が解放されているかは、クリアした任務の「種類」から毎回導く。
 * 同じ任務の集合からは必ず同じ結果になる（決定論）。
 */

/** 区域の名前。中央（center）は最初から開いている */
export type DistrictId = 'center' | 'kernel' | 'git' | 'k8s' | 'net' | 'github';

export const DISTRICT_IDS: readonly DistrictId[] = ['center', 'kernel', 'git', 'k8s', 'net', 'github'];

/** 区域の区画割り。タイル座標で、街の中に固定して置く */
export interface DistrictArea {
  id: DistrictId;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 街の広さ（タイル） */
export const CITY_WIDTH = 48;
export const CITY_HEIGHT = 34;

/**
 * 区域の位置。
 * 中央に小さな広場があり、その周りに、学ぶ対象ごとの区域が開いていく。
 * 歴史通り（git）だけは横に長い。コミットが一列に並ぶため。
 */
export const DISTRICTS: readonly DistrictArea[] = [
  { id: 'center', x: 19, y: 13, w: 10, h: 8 },
  { id: 'git', x: 4, y: 2, w: 40, h: 9 },
  { id: 'kernel', x: 2, y: 13, w: 15, h: 8 },
  // 港（k8s）は縦に長い。北から順に、管制の 4 施設・ビル・事務所・バス停が帯で並ぶため
  { id: 'k8s', x: 29, y: 13, w: 12, h: 10 },
  { id: 'net', x: 2, y: 23, w: 21, h: 9 },
  { id: 'github', x: 25, y: 23, w: 21, h: 9 },
];

export function districtArea(id: DistrictId): DistrictArea {
  const found = DISTRICTS.find((d) => d.id === id);
  // DISTRICTS は DistrictId を漏れなく持つので、ここは通らない
  return found ?? { id, x: 0, y: 0, w: 1, h: 1 };
}

/** 任務の id は `git/01/objects` の形。先頭がカテゴリ */
function trackOf(missionId: string): string {
  return missionId.split('/')[0] ?? '';
}

/**
 * クリアした任務から、開いている区域を出す。
 * 中央は最初から開いている。そのカテゴリの任務を 1 本でも終えると、対応する区域が開く。
 *
 * - kernel を終える → 住宅街
 * - git    を終える → 歴史通り
 * - k8s    を終える → 工業区（高層ビルが建てられる）
 * - net    を終える → 道路網
 * - github を終える → 市役所
 */
export function unlockedDistricts(cleared: Iterable<string>): DistrictId[] {
  const tracks = new Set<string>();
  for (const id of cleared) tracks.add(trackOf(id));
  return DISTRICT_IDS.filter((id) => id === 'center' || tracks.has(id));
}
