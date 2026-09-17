import { describe, expect, it } from 'vitest';
import { nextComplaint, voicesOf, type CivicFacility } from './civic';

const list = (states: [string, number][]): CivicFacility[] => states.map(([state, missionsCleared], i) => ({ id: `f${String(i)}`, state, missionsCleared }));

describe('住民の声', () => {
  it('就任直後は最初の施設の苦情だけが届く', () => {
    const facilities = list([['available', 0], ['available', 0], ['locked', 0]]);
    expect(voicesOf(facilities)).toEqual([{ kind: 'complaint', facilityId: 'f0' }]);
    expect(nextComplaint(facilities)).toEqual({ facilityId: 'f1', remaining: 1 });
  });

  it('建設を決めると対応待ちになり、要望を 1 つ解決すると次の苦情が届く', () => {
    expect(voicesOf(list([['built', 0], ['available', 0]]))).toEqual([{ kind: 'waiting', facilityId: 'f0' }]);
    expect(voicesOf(list([['operating', 1], ['available', 0]]))).toEqual([
      { kind: 'complaint', facilityId: 'f1' },
      { kind: 'waiting', facilityId: 'f0' },
    ]);
  });

  it('全部こなした施設には評価が届く', () => {
    expect(voicesOf(list([['complete', 3]]))).toEqual([{ kind: 'praise', facilityId: 'f0' }]);
    expect(nextComplaint(list([['complete', 3]]))).toBeNull();
  });
});
