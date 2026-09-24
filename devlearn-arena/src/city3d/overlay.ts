import type { BuildingKind } from '@/city/model';
import { OVERLAY } from './palette';
import type { CityLayout, LayoutBuilding, Vec2 } from './model';

/**
 * 情報表示（CS2 の情報ビュー）。街の上に色で重ねるものを、配置から導く純粋関数。
 *
 * three には触れない。`CityScene` はここが出した円と線を置くだけ。
 * 同じ配置からは必ず同じ重ね方になる。
 */

export type InfoView = 'residents' | 'bus' | 'traffic' | 'lineage';

export const INFO_VIEWS: readonly InfoView[] = ['residents', 'bus', 'traffic', 'lineage'];

/** 建物の足元に敷く円 */
export interface OverlayDisc {
  id: string;
  at: Vec2;
  radius: number;
  color: string;
}

/** 建物どうしを結ぶ線 */
export interface OverlayLink {
  id: string;
  a: Vec2;
  b: Vec2;
  color: string;
}

export interface Overlay {
  discs: OverlayDisc[];
  links: OverlayLink[];
}

const EMPTY: Overlay = { discs: [], links: [] };

/** バス停・路線の見える表示に出す建物 */
const BUS_KINDS: ReadonlySet<BuildingKind> = new Set<BuildingKind>(['stop', 'tower', 'office']);

/** 交通（パケット）の表示に出す建物 */
const NET_KINDS: ReadonlySet<BuildingKind> = new Set<BuildingKind>(['relay', 'gate', 'house']);

/** 系譜（Git）の表示に出す建物 */
const GIT_KINDS: ReadonlySet<BuildingKind> = new Set<BuildingKind>(['monument', 'flag', 'depot']);

/** 円の大きさ。建物の底面より一回り大きくして、上から見て分かるようにする */
function radiusOf(building: LayoutBuilding): number {
  return Math.max(building.params.footprint.w, building.params.footprint.d) * 0.8;
}

/** 住人の様子から色を決める。不調が 1 人でもいれば赤、引っ越し中がいれば青 */
export function residentColor(building: LayoutBuilding): string {
  const living = building.occupants.filter((o) => o.state !== 'gone');
  if (living.length === 0) return OVERLAY.empty;
  if (living.some((o) => o.state === 'sick')) return OVERLAY.bad;
  if (living.some((o) => o.state === 'moving')) return OVERLAY.moving;
  return OVERLAY.good;
}

function discsOf(buildings: readonly LayoutBuilding[], color: (b: LayoutBuilding) => string): OverlayDisc[] {
  return buildings.map((building) => ({
    id: building.id,
    at: building.at,
    radius: radiusOf(building),
    color: color(building),
  }));
}

/**
 * いま選んでいる情報表示で、街の上に重ねるもの。
 * 何も選んでいなければ空。街の絵はそのまま見える。
 */
export function overlayFor(view: InfoView | null, layout: CityLayout): Overlay {
  if (view === null) return EMPTY;
  const kinds = view === 'bus' ? BUS_KINDS : view === 'traffic' ? NET_KINDS : view === 'lineage' ? GIT_KINDS : null;
  const shown = kinds === null ? layout.buildings : layout.buildings.filter((b) => kinds.has(b.kind));
  const inView = new Set(shown.map((b) => b.id));

  if (view === 'residents') {
    return { discs: discsOf(shown, residentColor), links: [] };
  }

  const tone = view === 'bus' ? OVERLAY.bus : view === 'lineage' ? OVERLAY.lineage : OVERLAY.moving;
  return {
    discs: discsOf(shown, () => tone),
    links: layout.links
      .filter((link) => inView.has(link.from) && inView.has(link.to))
      .map((link) => ({
        id: link.id,
        a: link.a,
        b: link.b,
        // 交通は、いま通っている道だけを明るくする
        color: view === 'traffic' && !link.active ? OVERLAY.empty : tone,
      })),
  };
}
