import type { HeatKind } from '@/sim/heat';
import { accent, mix, parseColor, state } from '@/ui/tokens';

/**
 * ヒートマップの色と凡例（docs/ui-design.md 11.1）。
 * 色は tokens の値だけ。良い向きを state.ok、悪い向きを state.bad に寄せた 5 段の色で塗る（人口の密度は良し悪しが無いので info → gold）。
 * 凡例は値の幅と単位を出し、マスを指すと値と単位を出す（色だけに頼らない）。
 */

export interface HeatInfo {
  label: string;
  /** 値の大きい方が良いか（null は良し悪しが無い） */
  good: 'high' | 'low' | null;
  /** 決まった幅（無ければ、塗るマスの値の幅） */
  range?: [number, number];
  /** 値を単位付きの文にする */
  format: (v: number) => string;
  /** 凡例の幅の文（「4〜11 万円／月」） */
  span: (lo: number, hi: number) => string;
  note: string;
}

const int = (v: number): string => Math.round(v).toLocaleString('ja-JP');
const man = (yen: number): string => (yen / 10000).toFixed(1);

export const HEAT_INFO: Record<HeatKind, HeatInfo> = {
  land: {
    label: '地価', good: 'high',
    format: (v) => `地価 ${int(v)}（基準 100）`,
    span: (lo, hi) => `${int(lo)}〜${int(hi)}（基準 100）`,
    note: '道路・公園・仕事への近さ・水辺・施設で上がり、騒音で下がる',
  },
  rent: {
    label: '家賃', good: 'low',
    format: (v) => `家賃 ${man(v)} 万円／月`,
    span: (lo, hi) => `${man(lo)}〜${man(hi)} 万円／月`,
    note: '住宅 1 戸の家賃。地価 × 建物の型 × 需給の倍率',
  },
  density: {
    label: '人口の密度', good: null,
    format: (v) => `${int(v)} 人が住む`,
    span: (lo, hi) => `${int(lo)}〜${int(hi)} 人／建物`,
    note: '住宅の建物 1 つに住む人の数',
  },
  noise: {
    label: '騒音', good: 'low', range: [0, 100],
    format: (v) => `騒音 ${int(v)}（0〜100）`,
    span: () => '0〜100（20 を超えると住民の満足が下がる）',
    note: '工場・大通り・夜も動く施設・店から。離れるほど小さい',
  },
  jobs: {
    label: '雇用', good: 'high',
    format: (v) => `仕事 ${int(v)} 人分`,
    span: (lo, hi) => `${int(lo)}〜${int(hi)} 人分の仕事`,
    note: '働き口の数。住宅を指すと、その地区の失業率も出す',
  },
  approval: {
    label: '支持率', good: 'high', range: [0, 100],
    format: (v) => `支持 ${int(v)}%`,
    span: () => '0〜100%',
    note: '住宅の建物ごとの、住民の市長への支持',
  },
};

/** 段の数 */
export const STEPS = 5;

/** 悪い向き → 良い向きの 5 段の色（良し悪しが無ければ info → gold） */
export function stepColors(kind: HeatKind): string[] {
  const info = HEAT_INFO[kind];
  if (info.good === null) return Array.from({ length: STEPS }, (_, i) => mix(state.info, accent.gold, i / (STEPS - 1)));
  const badToGood = [state.bad, mix(state.bad, state.warn, 0.5), state.warn, mix(state.warn, state.ok, 0.5), state.ok];
  // 低い値から順の色にする
  return info.good === 'high' ? badToGood : [...badToGood].reverse();
}

/** 塗る値の幅（決まった幅か、値のあるマスの最小と最大）。値が 1 つも無ければ null */
export function rangeOf(kind: HeatKind, values: Float32Array): [number, number] | null {
  const fixed = HEAT_INFO[kind].range;
  if (fixed) return fixed;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (Number.isNaN(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo === Infinity ? null : [lo, hi];
}

/** 値の段（0〜4）。幅を 5 つに等しく分ける */
export function stepOf(v: number, range: [number, number]): number {
  const [lo, hi] = range;
  if (hi <= lo) return STEPS - 1;
  return Math.max(0, Math.min(STEPS - 1, Math.floor(((v - lo) / (hi - lo)) * STEPS)));
}

const rgb = (color: string): [number, number, number] => {
  const c = parseColor(color);
  return [c.r, c.g, c.b];
};

/** マスごとの色（96×96 の RGBA。値の無いマスは透明）。画面の外の Canvas に 1 回だけ置く */
export function heatImage(kind: HeatKind, values: Float32Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(values.length * 4);
  const range = rangeOf(kind, values);
  if (!range) return out;
  const colors = stepColors(kind).map(rgb);
  values.forEach((v, i) => {
    if (Number.isNaN(v)) return;
    const [r, g, b] = colors[stepOf(v, range)] as [number, number, number];
    out[i * 4] = r;
    out[i * 4 + 1] = g;
    out[i * 4 + 2] = b;
    out[i * 4 + 3] = 255;
  });
  return out;
}

/** 凡例（「家賃 4.0〜11.0 万円／月」と、段の色） */
export function heatLegend(kind: HeatKind, values: Float32Array): { title: string; span: string; colors: string[]; note: string } {
  const info = HEAT_INFO[kind];
  const range = rangeOf(kind, values);
  return { title: info.label, span: range ? info.span(range[0], range[1]) : 'まだ値が無い', colors: stepColors(kind), note: info.note };
}
