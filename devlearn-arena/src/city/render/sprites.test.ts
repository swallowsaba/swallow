import { describe, expect, it } from 'vitest';
import { LANDMARKS } from '../facilities';
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

describe('記念碑の絵の選び方（ミッションの報酬）', () => {
  it('どの記念碑かで絵が決まり、読み込み済みの絵と同じ名前で引く。どの記念碑か分からなければ描かない', () => {
    const loaded = new Set(allFacilitySvgs().map((s) => s.key));
    for (const id of LANDMARKS.map((l) => l.id)) {
      const asset = facilityAsset('monument', 1, id);
      expect(asset?.key).toBe(`monument:${id}`);
      expect(loaded.has(asset?.key ?? '')).toBe(true);
    }
    expect(facilityAsset('monument', 1)).toBeNull();
  });
});
