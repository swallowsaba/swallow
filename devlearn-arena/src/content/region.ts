import type { MissionTrack } from '@/engines/lesson/types';
import { CITIES } from './city';

/**
 * 地域の地図（REWORK 5-2）。5 つの街と、それを結ぶ道。
 *
 * 道は、手前の街で任務をいくつか終えると開通する。学ぶ順の目安を地図の上で見せるためのもので、
 * 開いていない街にも入れる（遊べなくはしない。registry の requires と同じ考え）。
 */

export interface RegionRoad {
  from: MissionTrack;
  to: MissionTrack;
  /** 開通に要る、手前の街（from）で終えた本編の任務の数 */
  need: number;
}

/** 最初から入れる街。シェルで住所（パス）と道具の使い方を覚えてから、先へ進む */
export const START_CITY: MissionTrack = 'kernel';

/** 学ぶ順の道。シェル → Git → GitHub、シェル → ネットワーク → Kubernetes */
export const ROADS: readonly RegionRoad[] = [
  { from: 'kernel', to: 'git', need: 3 },
  { from: 'kernel', to: 'net', need: 3 },
  { from: 'git', to: 'github', need: 3 },
  { from: 'net', to: 'k8s', need: 3 },
];

export interface RoadState extends RegionRoad {
  /** 手前の街で終えた数（need を超えても need で止める） */
  done: number;
  open: boolean;
  /** 道の上に出す札（「シェルの街の任務を 3 つクリアで開通」「開通」） */
  label: string;
}

/** 街ごとの、終えた本編の任務の数 */
export type ClearedByCity = Readonly<Partial<Record<MissionTrack, number>>>;

export function roadStates(cleared: ClearedByCity): RoadState[] {
  return ROADS.map((road) => {
    const count = cleared[road.from] ?? 0;
    const open = count >= road.need;
    return {
      ...road,
      done: Math.min(road.need, count),
      open,
      label: open ? '開通' : `${CITIES[road.from].name}の任務を ${String(road.need)} つクリアで開通`,
    };
  });
}

/** 道がつながっている街か。最初の街は初めからつながっている */
export function connected(track: MissionTrack, cleared: ClearedByCity): boolean {
  if (track === START_CITY) return true;
  return roadStates(cleared).some((road) => road.to === track && road.open);
}

/** 前と後の間に新しく開通した道。開いたら学習画面で知らせる（REWORK 5-3） */
export function newlyOpened(before: ClearedByCity, after: ClearedByCity): RoadState[] {
  const was = new Set(roadStates(before).filter((r) => r.open).map((r) => `${r.from}>${r.to}`));
  return roadStates(after).filter((r) => r.open && !was.has(`${r.from}>${r.to}`));
}

/** 終えた任務の id の並びから、街ごとの数を数える。反復演習は数えない */
export function clearedByCity(
  cleared: Iterable<string>,
  missions: readonly { id: string; track: MissionTrack; repeatOf: string | null }[],
): ClearedByCity {
  const done = new Set(cleared);
  const out: Partial<Record<MissionTrack, number>> = {};
  for (const mission of missions) {
    if (mission.repeatOf !== null || !done.has(mission.id)) continue;
    out[mission.track] = (out[mission.track] ?? 0) + 1;
  }
  return out;
}
