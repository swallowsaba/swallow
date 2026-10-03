import { describe, expect, it } from 'vitest';
import { allFacilitySvgs, facilityAsset } from './sprites';

describe('施設の絵の選び方', () => {
  it('そのレベルの SVG が無ければ下のレベルの絵を使い、読み込み済みの絵と同じ名前で引く（上げた施設が消えない）', () => {
    const loaded = new Set(allFacilitySvgs().map((s) => s.key));
    for (const level of [1, 2, 3, 4, 5]) {
      const asset = facilityAsset('academy', level);
      expect(asset, `Lv${String(level)}`).not.toBeNull();
      expect(loaded.has(asset?.key ?? ''), `Lv${String(level)} の ${asset?.key ?? ''}`).toBe(true);
    }
  });
});
