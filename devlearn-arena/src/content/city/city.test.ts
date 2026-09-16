import { describe, expect, it } from 'vitest';
import { TRACKS } from '@/content/catalog';
import { allMissions } from '@/engines/lesson/registry';
import { CITIES, CITY_TRACKS, cityOf, facilityById, rankOf, RESIDENTS } from './index';

describe('街の設計図', () => {
  it('どの街も、その世界の章と施設が 1 対 1 で対応する', () => {
    for (const track of CITY_TRACKS) {
      const chapters = TRACKS.find((t) => t.id === track)?.chapters.map((c) => c.id) ?? [];
      const facilities = CITIES[track].facilities.map((f) => f.id);
      expect(facilities, track).toEqual(chapters);
    }
  });

  it('全任務が、どこかの街の施設に属する', () => {
    for (const m of allMissions()) expect(facilityById(m.chapterId), m.id).toBeDefined();
  });

  it('先に必要な施設は、同じ街の、学ぶ順で前にある施設だけ', () => {
    for (const plan of Object.values(CITIES)) {
      const order = plan.facilities.map((f) => f.id);
      for (const f of plan.facilities) {
        for (const need of f.needs) {
          expect(order.indexOf(need), `${f.id} → ${need}`).toBeGreaterThanOrEqual(0);
          expect(order.indexOf(need), `${f.id} → ${need}`).toBeLessThan(order.indexOf(f.id));
        }
      }
      expect(plan.facilities[0]?.needs, plan.track).toEqual([]);
    }
  });

  it('どの施設にも、困りごと・何か・例え・なぜ・仕組み・落とし穴・心得・判断問題がそろっている', () => {
    for (const plan of Object.values(CITIES)) {
      for (const f of plan.facilities) {
        expect(f.trouble.text.length, f.id).toBeGreaterThan(20);
        expect(f.what.length, f.id).toBeGreaterThan(30);
        expect(f.analogy.length, f.id).toBeGreaterThan(30);
        expect(f.why.length, f.id).toBeGreaterThan(30);
        expect(f.how.length, f.id).toBeGreaterThanOrEqual(3);
        expect(f.pitfalls.length, f.id).toBeGreaterThanOrEqual(2);
        expect(f.pro.length, f.id).toBeGreaterThan(20);
        expect(f.quiz.length, f.id).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('判断問題は、正解が選択肢の中にあり、選択肢が重ならず、理由が書いてある', () => {
    for (const plan of Object.values(CITIES)) {
      for (const f of plan.facilities) {
        for (const q of f.quiz) {
          expect(q.choices.length, f.id).toBeGreaterThanOrEqual(3);
          expect(q.answer, f.id).toBeGreaterThanOrEqual(0);
          expect(q.answer, f.id).toBeLessThan(q.choices.length);
          expect(new Set(q.choices).size, f.id).toBe(q.choices.length);
          expect(q.explain.length, f.id).toBeGreaterThan(15);
        }
      }
    }
  });

  it('正解の位置が偏っていない（いつも同じ番号を選べば通る、にならない）', () => {
    const positions = new Set(Object.values(CITIES).flatMap((p) => p.facilities.flatMap((f) => f.quiz.map((q) => q.answer))));
    expect(positions.size).toBeGreaterThanOrEqual(3);
  });

  it('街の言葉は「町」ではなく「街」を使う', () => {
    const text = JSON.stringify(CITIES);
    expect(text).not.toContain('町');
  });
});

describe('街の状態', () => {
  const plan = CITIES.git;
  const missions = [
    { id: 'git/01/a', chapterId: 'git/01' },
    { id: 'git/01/b', chapterId: 'git/01' },
    { id: 'git/02/a', chapterId: 'git/02' },
  ];

  it('何も建てていなければ、最初の施設だけが建設可能で、ほかは未開拓', () => {
    const city = cityOf(plan, new Set(), missions, new Set());
    expect(city.facilities[0]?.state).toBe('available');
    expect(city.facilities[1]?.state).toBe('locked');
    expect(city.residents).toBe(0);
    expect(city.rank).toBe('wilderness');
    expect(city.nextFacilityId).toBe('git/01');
  });

  it('施設を学んで建てると住民が住み、次の施設が建設可能になる', () => {
    const city = cityOf(plan, new Set(['git/01']), missions, new Set());
    expect(city.facilities[0]?.state).toBe('built');
    expect(city.facilities[1]?.state).toBe('available');
    expect(city.residents).toBe(RESIDENTS.perBuilt);
    expect(city.nextFacilityId).toBe('git/02');
  });

  it('建てた施設の任務をこなすと稼働し、全部こなすとフル稼働になる', () => {
    const half = cityOf(plan, new Set(['git/01']), missions, new Set(['git/01/a']));
    expect(half.facilities[0]?.state).toBe('operating');
    expect(half.facilities[0]?.ratio).toBe(0.5);
    const full = cityOf(plan, new Set(['git/01']), missions, new Set(['git/01/a', 'git/01/b']));
    expect(full.facilities[0]?.state).toBe('complete');
    expect(full.residents).toBe(RESIDENTS.perBuilt + RESIDENTS.perOperation + RESIDENTS.perComplete);
    expect(full.complete).toBe(1);
  });

  it('任務をこなしても、施設を学んで建てていなければ稼働にはならない（学ぶのが先）', () => {
    const city = cityOf(plan, new Set(), missions, new Set(['git/01/a', 'git/01/b']));
    expect(city.facilities[0]?.state).toBe('available');
    expect(city.built).toBe(0);
  });

  it('街の格は、建てた施設の割合で上がる', () => {
    expect(rankOf(0, 0, 10)).toBe('wilderness');
    expect(rankOf(1, 0, 10)).toBe('settlement');
    expect(rankOf(3, 0, 10)).toBe('town');
    expect(rankOf(5, 0, 10)).toBe('city');
    expect(rankOf(8, 0, 10)).toBe('bigCity');
    expect(rankOf(10, 10, 10)).toBe('metropolis');
  });
});
