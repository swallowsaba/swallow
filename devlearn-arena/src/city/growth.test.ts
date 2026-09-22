import { describe, expect, it } from 'vitest';
import { buildCity } from './model';
import { DISTRICTS, DISTRICT_IDS, districtArea, unlockedDistricts } from './growth';

describe('街は学習とともに育つ', () => {
  it('任務を 1 本も終えていなければ、開いているのは中央だけ', () => {
    expect(unlockedDistricts([])).toEqual(['center']);
  });

  it('任務を 5 本クリアすると、開く区域が 2 つ以上になる', () => {
    const cleared = ['git/01/objects', 'git/01/add', 'git/02/log', 'git/02/diff', 'git/03/branch'];
    expect(unlockedDistricts(cleared).length).toBeGreaterThanOrEqual(2);
  });

  it('カテゴリごとに区域が開く。kernel は住宅街、git は歴史通り、k8s は工業区、net は道路網、github は市役所', () => {
    expect(unlockedDistricts(['kernel/01/ls'])).toEqual(['center', 'kernel']);
    expect(unlockedDistricts(['git/01/objects'])).toEqual(['center', 'git']);
    expect(unlockedDistricts(['k8s/01/pods'])).toEqual(['center', 'k8s']);
    expect(unlockedDistricts(['net/01/ping'])).toEqual(['center', 'net']);
    expect(unlockedDistricts(['github/01/pr'])).toEqual(['center', 'github']);
  });

  it('全部のカテゴリを終えると、街の区域が全て開く', () => {
    const all = ['kernel/01/a', 'git/01/a', 'k8s/01/a', 'net/01/a', 'github/01/a'];
    expect(unlockedDistricts(all)).toEqual([...DISTRICT_IDS]);
  });

  it('同じ任務を何度数えても結果は変わらない', () => {
    expect(unlockedDistricts(['git/01/a', 'git/01/a', 'git/02/b'])).toEqual(['center', 'git']);
  });
});

describe('区域の割り付け', () => {
  it('区域どうしは重ならない', () => {
    for (const a of DISTRICTS) {
      for (const b of DISTRICTS) {
        if (a.id === b.id) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(apart, `${a.id} と ${b.id}`).toBe(true);
      }
    }
  });

  it('区域は街の中に収まる', () => {
    const city = buildCity({ unlocked: DISTRICT_IDS });
    for (const d of city.districts) {
      expect(d.x).toBeGreaterThanOrEqual(0);
      expect(d.y).toBeGreaterThanOrEqual(0);
      expect(d.x + d.w).toBeLessThanOrEqual(city.width);
      expect(d.y + d.h).toBeLessThanOrEqual(city.height);
      const area = districtArea(d.track);
      expect(d).toMatchObject({ x: area.x, y: area.y, w: area.w, h: area.h });
    }
  });

  it('開いていない区域には道が通らない', () => {
    const closed = buildCity({ unlocked: ['center'] });
    const area = districtArea('k8s');
    const roads = closed.tiles.filter(
      (t) => t.kind === 'road' && t.x > area.x && t.x < area.x + area.w && t.y > area.y && t.y < area.y + area.h,
    );
    expect(roads).toEqual([]);
  });
});
