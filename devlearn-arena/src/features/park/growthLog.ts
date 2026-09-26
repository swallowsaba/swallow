import type { City, CityGrowth } from '@/city/model';
import type { GrowthTrigger } from './growth';

/**
 * 街が育った記録（REWORK 2-1・2-2）。
 *
 * 育つたびに「何をしたら・どこに・何が増えた」を 1 件残す。
 * カメラはその場所へ寄り、光の輪と「＋家 1」のような札を出す。右上の「成長の記録」に並ぶ。
 * ここは React にも描画にも触れない。育つ前と後の数と、いまの街だけから導く。
 */

export interface GrowthMark {
  /** 記録ごとに変わる識別子 */
  key: number;
  /** 何をしたら（「kubectl get nodes を打った」） */
  cause: string;
  /** 何が増えた（「＋家 1」「＋1 階」） */
  gain: string;
  /** 増えた建物の id。カメラはここへ寄る */
  building: string;
  /** 増えた建物の名前（「住民の家 2」） */
  label: string;
}

/** 記録に残す件数。古いものから消える */
export const GROWTH_LOG_SIZE = 6;

/** 育ったきっかけを、学習者のしたことの言葉にする */
export function causeOf(trigger: GrowthTrigger, line?: string): string {
  switch (trigger) {
    case 'command':
      return `${line?.trim() ?? 'コマンド'} を打った`;
    case 'step':
      return '手順を 1 つ越えた';
    case 'quiz':
      return '確かめの問いに正解した';
    case 'clear':
      return '任務をクリアした';
  }
}

/**
 * 育つ前と後の数から、街のどこに何が増えたかを求める。
 *
 * 家が増えたら、いちばん新しい家（`home:<数>`）。階だけが増えたら、最後の 1 階が載った建物。
 * 増えていない、または増えた建物がまだ街に無いときは null。
 */
export function growthSpot(
  city: City,
  before: CityGrowth,
  after: CityGrowth,
): { building: string; label: string; gain: string } | null {
  const houses = after.houses - before.houses;
  const floors = after.floors - before.floors;
  const parts = [
    ...(houses > 0 ? [`＋家 ${String(houses)}`] : []),
    ...(floors > 0 ? [`＋${String(floors)} 階`] : []),
  ];
  if (parts.length === 0) return null;
  const id = houses > 0 ? `home:${String(after.houses)}` : city.lastRaised;
  const building = city.buildings.find((b) => b.id === id);
  if (building === undefined) return null;
  return { building: building.id, label: building.label, gain: parts.join(' ・ ') };
}

/** 記録を 1 件足す。新しいものが先頭 */
export function logGrowth(log: readonly GrowthMark[], mark: GrowthMark): GrowthMark[] {
  return [mark, ...log].slice(0, GROWTH_LOG_SIZE);
}
