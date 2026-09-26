import { describe, expect, it } from 'vitest';
import { CITY_TRACKS } from './city';
import { clearedByCity, connected, newlyOpened, ROADS, roadStates, START_CITY } from './region';

/** 地域の地図の道（REWORK 5-2・5-3） */

describe('道', () => {
  it('どの街にも、最初の街から道でたどり着ける', () => {
    const reached = new Set([START_CITY]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const road of ROADS) {
        if (reached.has(road.from) && !reached.has(road.to)) {
          reached.add(road.to);
          grew = true;
        }
      }
    }
    expect([...reached].sort()).toEqual([...CITY_TRACKS].sort());
  });

  it('まだ何も終えていなければ、道はどれも開いていない。条件が札に出る', () => {
    const roads = roadStates({});
    expect(roads.every((r) => !r.open)).toBe(true);
    expect(roads.find((r) => r.from === 'kernel' && r.to === 'git')?.label).toBe('シェルの街の任務を 3 つクリアで開通');
  });

  it('手前の街で決まった数を終えると開通する', () => {
    const roads = roadStates({ kernel: 3 });
    expect(roads.filter((r) => r.open).map((r) => r.to).sort()).toEqual(['git', 'net']);
    expect(roads.find((r) => r.to === 'git')?.label).toBe('開通');
  });

  it('途中までの数は、開通に要る数で止めて数える', () => {
    expect(roadStates({ kernel: 2 }).find((r) => r.to === 'git')?.done).toBe(2);
    expect(roadStates({ kernel: 9 }).find((r) => r.to === 'git')?.done).toBe(3);
  });

  it('最初の街は初めからつながっていて、先の街は道が開くとつながる', () => {
    expect(connected('kernel', {})).toBe(true);
    expect(connected('git', {})).toBe(false);
    expect(connected('git', { kernel: 3 })).toBe(true);
    expect(connected('github', { kernel: 3 })).toBe(false);
  });
});

describe('新しく開いた道', () => {
  it('3 つ目を終えたときだけ、シェルの街から出る 2 本が開いたと分かる', () => {
    expect(newlyOpened({ kernel: 2 }, { kernel: 3 }).map((r) => r.to).sort()).toEqual(['git', 'net']);
    expect(newlyOpened({ kernel: 3 }, { kernel: 4 })).toEqual([]);
  });
});

describe('街ごとの数', () => {
  it('本編の任務だけを、その街に数える', () => {
    const missions = [
      { id: 'a', track: 'kernel' as const, repeatOf: null },
      { id: 'b', track: 'kernel' as const, repeatOf: null },
      { id: 'b-again', track: 'kernel' as const, repeatOf: 'b' },
      { id: 'c', track: 'git' as const, repeatOf: null },
    ];
    expect(clearedByCity(['a', 'b', 'b-again', 'c'], missions)).toEqual({ kernel: 2, git: 1 });
  });
});
