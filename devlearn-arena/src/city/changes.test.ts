import { describe, expect, it } from 'vitest';
import { changesBetween, focusOf, type Snapshot } from './changes';
import type { City, Facility } from './types';
import { newCity } from './newCity';

const academy: Facility = { id: 'f1', type: 'academy', domain: 'found', origin: { x: 45, y: 44 }, rotation: 0, level: 1, state: 'active', builtDay: 0 };
const container: Facility = { id: 'f2', type: 'container', domain: 'ctr', origin: { x: 50, y: 44 }, rotation: 0, level: 1, state: 'active', builtDay: 0 };
const city = (over: Partial<City> = {}): City => ({ ...newCity(), facilities: [academy], ...over });
const snap = (c: City, skills: Snapshot['skills']): Snapshot => ({ city: c, skills });

describe('学習から都市へ戻った時の変化（docs/game-design.md 7 章）', () => {
  it('分野のスキルの段階が上がり、その施設を次の Lv に上げられるようになったら、その場所を示す', () => {
    const changes = changesBetween(snap(city(), { found: 0 }), snap(city(), { found: 37 }));
    expect(changes[0]).toMatchObject({ kind: 'upgradable', facilityId: 'f1', level: 2, at: { x: 46.5, y: 45.5 } });
    expect(changes[0]?.text).toBe('市立 IT 学院を Lv2 に上げられるようになった（IT 基礎 初級）');
    expect(focusOf(changes)).toEqual({ at: { x: 46.5, y: 45.5 }, size: { x: 3, y: 3 }, facilityId: 'f1' });
  });

  it('段階が上がっても次の Lv に届かない時・既に上げられた時は、上げられるとは言わない', () => {
    expect(changesBetween(snap(city(), { found: 0 }), snap(city(), { found: 12 }))).toEqual([]);
    expect(changesBetween(snap(city(), { found: 31 }), snap(city(), { found: 55 }))).toEqual([]);
  });

  it('2 つの分野の施設（コンテナ施設）は、どちらの分野の段階でも上げられる', () => {
    const c = city({ facilities: [container] });
    expect(changesBetween(snap(c, { ctr: 0, docker: 0 }), snap(c, { ctr: 0, docker: 30 }))[0]).toMatchObject({ kind: 'upgradable', facilityId: 'f2', level: 2 });
  });

  it('学んだ分野の施設が無ければ、建てると成果が形になると知らせる（場所は無い）', () => {
    const c = city({ facilities: [] });
    const changes = changesBetween(snap(c, { linux: 0 }), snap(c, { linux: 35 }));
    expect(changes).toEqual([{ kind: 'no-facility', domain: 'linux', text: 'Linux / CLI の施設（サーバ施設）を建てると、学んだ成果がそこに形になる' }]);
    expect(focusOf(changes)).toBeNull();
  });

  it('学んでいる間に区画に建った・育った建物と、発展段階の上がりも示す', () => {
    const b = (id: string, x: number, level: number) => ({ id, zoneId: 'z1', cell: { x, y: 50 }, variant: 'a', level, builtDay: 0 });
    const before = city({ buildings: [b('b1', 40, 1)] });
    const after = city({ stage: 2, buildings: [b('b1', 40, 2), b('b2', 41, 1), b('b3', 43, 1)] });
    const changes = changesBetween(snap(before, {}), snap(after, {}));
    expect(changes.map((c) => c.kind)).toEqual(['stage', 'built', 'grown']);
    expect(changes[1]).toMatchObject({ count: 2, at: { x: 42.5, y: 50.5 }, text: '区画に新しい建物が 2 軒建った' });
    expect(focusOf(changes)?.at).toEqual({ x: 42.5, y: 50.5 });
  });
});
