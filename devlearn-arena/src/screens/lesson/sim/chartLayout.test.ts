import { describe, expect, it } from 'vitest';
import { chartLayout } from './chartLayout';

const HOURS = ['0:00', '1:00', '2:00', '3:00', '4:00', '5:00', '6:00'];

describe('折れ線のグラフの寸法', () => {
  it('描く幅は置かれた枠の幅（px）そのもの。細い列でも、目盛りの字が縮まずに 13px のまま出る', () => {
    expect(chartLayout(220, HOURS).width).toBe(220);
    expect(chartLayout(640, HOURS).width).toBe(640);
  });

  it('枠の幅がまだ分からない時（測る前）は 520', () => {
    expect(chartLayout(0, HOURS).width).toBe(520);
  });

  it('横軸の目盛りは、字が重ならない間（44px 以上）を空けて間引く', () => {
    const narrow = chartLayout(220, HOURS);
    const shown = narrow.labels.filter((l) => l.text !== null);
    expect(shown.length).toBeLessThan(HOURS.length);
    for (let i = 1; i < shown.length; i += 1) expect((shown[i]?.x ?? 0) - (shown[i - 1]?.x ?? 0)).toBeGreaterThanOrEqual(44);
    // 広ければ全て出す
    expect(chartLayout(640, HOURS).labels.every((l) => l.text !== null)).toBe(true);
  });
});
