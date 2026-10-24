import { describe, expect, it } from 'vitest';
import { parseColor, state } from '@/ui/tokens';
import { heatImage, heatLegend, HEAT_INFO, rangeOf, stepColors, stepOf } from './heatScale';

describe('ヒートマップの色と凡例（docs/ui-design.md 11.1）', () => {
  it('値の幅を 5 段に分ける。良い向きは ok、悪い向きは bad の色', () => {
    expect(stepOf(0, [0, 100])).toBe(0);
    expect(stepOf(19.9, [0, 100])).toBe(0);
    expect(stepOf(20, [0, 100])).toBe(1);
    expect(stepOf(100, [0, 100])).toBe(4);
    // 家賃は高いほど悪い（低い値の段が ok）。地価は高いほど良い
    expect(stepColors('rent')[0]).toBe(state.ok);
    expect(stepColors('rent')[4]).toBe(state.bad);
    expect(stepColors('land')[4]).toBe(state.ok);
  });

  it('値の無いマスは透明。値のあるマスは段の色', () => {
    const v = new Float32Array([NaN, 10, 90]);
    const img = heatImage('noise', v);
    expect(img[3]).toBe(0);
    const ok = parseColor(state.ok);
    const bad = parseColor(state.bad);
    expect([img[4], img[5], img[6], img[7]]).toEqual([ok.r, ok.g, ok.b, 255]);
    expect([img[8], img[9], img[10], img[11]]).toEqual([bad.r, bad.g, bad.b, 255]);
  });

  it('凡例に値の幅と単位を出す。マスを指した時の文にも単位がある', () => {
    const rents = new Float32Array([NaN, 42000, 110000]);
    expect(rangeOf('rent', rents)).toEqual([42000, 110000]);
    expect(heatLegend('rent', rents).span).toBe('4.2〜11.0 万円／月');
    expect(HEAT_INFO.rent.format(61234)).toBe('家賃 6.1 万円／月');
    expect(HEAT_INFO.approval.format(54.4)).toBe('支持 54%');
    expect(heatLegend('land', new Float32Array([NaN])).span).toBe('まだ値が無い');
  });
});
