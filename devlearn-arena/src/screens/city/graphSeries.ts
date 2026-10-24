import { dateOf, DAYS_PER_WEEK } from '@/sim/rules';
import type { WeeklySample } from '@/sim/types';

/** グラフの値と、折れ線の点の計算（docs/ui-design.md 11.2） */

export const SERIES = ['population', 'funds', 'treasury', 'approval', 'jobs'] as const;
export type SeriesId = (typeof SERIES)[number];

export const SERIES_INFO: Record<SeriesId, { label: string; unit: string; value: (s: WeeklySample) => number }> = {
  population: { label: '人口', unit: '人', value: (s) => s.population },
  funds: { label: '開発資金', unit: '資金', value: (s) => s.funds },
  treasury: { label: '財政', unit: '財政', value: (s) => s.treasury },
  approval: { label: '支持率', unit: '%', value: (s) => s.approval },
  jobs: { label: '雇用', unit: '人分の仕事', value: (s) => s.jobs },
};

/** グラフの大きさ（窓の中身の幅に収める） */
export const W = 368;
export const H = 132;
export const PAD = { left: 46, right: 8, top: 8, bottom: 20 };

export const weekLabel = (week: number): string => {
  const d = dateOf(week * DAYS_PER_WEEK);
  return `${String(d.year)}年目 ${String(d.week)}週`;
};
export const num = (v: number): string => Math.round(v).toLocaleString('ja-JP');

/** 折れ線の点（画面の座標） */
export function linePoints(samples: readonly WeeklySample[], value: (s: WeeklySample) => number, fixed?: [number, number]): { x: number; y: number }[] {
  if (samples.length === 0) return [];
  const w0 = (samples[0] as WeeklySample).week;
  const w1 = (samples[samples.length - 1] as WeeklySample).week;
  const vs = samples.map(value);
  const lo = fixed ? fixed[0] : Math.min(...vs);
  const hi = fixed ? fixed[1] : Math.max(...vs);
  const sx = (w: number): number => PAD.left + (w1 > w0 ? ((w - w0) / (w1 - w0)) * (W - PAD.left - PAD.right) : (W - PAD.left - PAD.right) / 2);
  const sy = (v: number): number => PAD.top + (hi > lo ? (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom) : (H - PAD.top - PAD.bottom) / 2);
  return samples.map((s, i) => ({ x: sx(s.week), y: sy(vs[i] as number) }));
}

