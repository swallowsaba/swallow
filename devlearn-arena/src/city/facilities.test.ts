import { describe, expect, it } from 'vitest';
import data from '../../content/facilities.json';
import { FACILITY_DEFS, parseFacilities, SHELF_NAMES, type FacilityShelf } from './facilities';

describe('施設の定義（content/facilities.json）', () => {
  it('docs/city-design.md 4 章の 15 施設が、対応する分野と大きさを持つ', () => {
    const facilities = Object.values(FACILITY_DEFS).filter((d) => d.group === 'facility');
    expect(facilities).toHaveLength(15);
    expect(FACILITY_DEFS.server).toMatchObject({ domain: 'linux', w: 2, d: 2 });
    expect(FACILITY_DEFS.deploy).toMatchObject({ domain: 'cicd', w: 3, d: 2 });
    expect(FACILITY_DEFS.container).toMatchObject({ domain: 'ctr', w: 3, d: 3 });
    for (const f of facilities) expect(f.domain, f.type).toBeDefined();
  });

  it('どの施設も村から建てられる（大きさの例外は Lv3 から。docs/game-design.md 5 章）', () => {
    for (const f of Object.values(FACILITY_DEFS).filter((d) => d.group === 'facility')) expect(f.minStage, f.type).toBe(1);
  });

  it('建設メニューの棚は、1 つに 5 つまで（同じ形の札を 6 枚以上並べない。docs/visual-design.md V7）', () => {
    const count = new Map<FacilityShelf, number>();
    for (const f of Object.values(FACILITY_DEFS)) if (f.shelf) count.set(f.shelf, (count.get(f.shelf) ?? 0) + 1);
    expect([...count.keys()].sort()).toEqual((Object.keys(SHELF_NAMES) as FacilityShelf[]).sort());
    for (const n of count.values()) expect(n).toBeLessThanOrEqual(5);
    expect(Object.values(FACILITY_DEFS).filter((d) => d.group === 'park').length).toBeLessThanOrEqual(5);
  });

  it('壊れたデータは読み込みで落とす（重複・欠け・形の誤り）', () => {
    const list = data.facilities;
    expect(() => parseFacilities({ facilities: [...list, list[0]] })).toThrow(/重複/);
    expect(() => parseFacilities({ facilities: list.slice(1) })).toThrow(/無い/);
    expect(() => parseFacilities({ facilities: list.map((f, i) => (i === 0 ? { ...f, w: 0 } : f)) })).toThrow();
  });
});
