import type { OverlayKind } from '@/city/overlay';
import { HEAT_KINDS, type HeatKind } from '@/sim/heat';
import type { FactorId } from '@/sim/layers';
import type { ViewKind } from './cityStore';
import { HEAT_INFO } from './heatScale';

/** 表示切替で重ねる物の名前と、説明を押した時に切り替えるヒートマップ（docs/ui-design.md 11 章） */

/** 要因 → その要因を見るヒートマップ */
export const FACTOR_VIEW: Record<FactorId, ViewKind> = {
  afford: 'rent', jobs: 'jobs', commute: 'traffic', noise: 'noise', green: 'park',
  police: 'police', school: 'school', clinic: 'clinic', fire: 'fire', power: 'power',
  tax: 'approval', trust: 'approval',
};

export const CITY_KINDS: { id: OverlayKind; label: string }[] = [
  { id: 'learning', label: '学習の進み' },
  { id: 'population', label: '人口' },
  { id: 'traffic', label: '交通' },
  { id: 'stage', label: '発展段階' },
];

export const VIEW_LABELS: Record<ViewKind, string> = {
  ...Object.fromEntries(HEAT_KINDS.map((k) => [k, HEAT_INFO[k].label])) as Record<HeatKind, string>,
  ...Object.fromEntries(CITY_KINDS.map((k) => [k.id, k.label])) as Record<OverlayKind, string>,
};

