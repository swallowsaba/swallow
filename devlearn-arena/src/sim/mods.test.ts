import { describe, expect, it } from 'vitest';
import { statsOf } from '@/city/growth';
import { mergeMods, zoneCapacity, zoneLevelCap } from '@/city/rules';
import type { Facility } from '@/city/types';
import { landFieldOf, parkAt } from './land';
import { spaceOf } from './space';
import { previewOf, unitsOf } from './week';
import type { World } from './types';
import { grownVillage } from './__fixtures__/cities';

/**
 * 譲歩の性質（docs/game-design.md 17.1・docs/content-spec.md 7.1.1）が、完成した建物に残り、模擬の値に実際に効く。
 * 見かけの数字だけを動かさない
 */

const GROWN = grownVillage();

/** 育った村の、住宅のそば（北の細い道の端）に完成したデータセンターを足す */
function withDc(mods?: Record<string, number>): { world: World; terrain: typeof GROWN.terrain; dc: Facility } {
  const dc: Facility = { id: 'fdc', type: 'datacenter', domain: 'db', origin: { x: 46, y: 36 }, rotation: 0, level: 1, state: 'active', builtDay: 0, ...(mods ? { mods } : {}) };
  return { world: { ...GROWN.world, city: { ...GROWN.world.city, facilities: [...GROWN.world.city.facilities, dc] } }, terrain: GROWN.terrain, dc };
}

describe('譲歩の性質が模擬に効く（17.1）', () => {
  it('夜の騒音 0（稼働の時間を制限する）: 施設の周りの騒音が、譲歩の無い時より下がる', () => {
    const plain = withDc();
    const quiet = withDc({ nightNoise: 0 });
    const at = { x: plain.dc.origin.x + 1, y: plain.dc.origin.y + 2 };
    const noise = (w: World, t: typeof plain.terrain): number => {
      const v = previewOf(w, t);
      return v.field.noise[at.y * 96 + at.x] as number;
    };
    expect(noise(plain.world, plain.terrain)).toBeGreaterThan(0);
    expect(noise(quiet.world, quiet.terrain)).toBeLessThan(noise(plain.world, plain.terrain));
    // 防音の壁（騒音 0.5）は半分
    const wall = withDc({ noise: 0.5 });
    const base = noise(plain.world, plain.terrain) - noise(quiet.world, quiet.terrain);
    expect(noise(plain.world, plain.terrain) - noise(wall.world, wall.terrain)).toBeCloseTo(base / 2, 4);
  });

  it('技術力と雇う人数の倍率: 都市の技術力と雇用に、倍率を掛けた値で数える', () => {
    const plain = withDc();
    const low = withDc({ tech: 0.8, jobs: 0.5 });
    const a = statsOf(plain.world.city);
    const b = statsOf(low.world.city);
    expect(a.techPower - b.techPower).toBeCloseTo(0.2, 9);
    expect(a.jobs - b.jobs).toBeCloseTo(7.5, 9);
  });

  it('敷地の中の緑地（green）: 施設の前の道路に、公園の行き届きが足される', () => {
    const plain = withDc();
    const green = withDc({ green: 1 });
    const front = { x: plain.dc.origin.x + 1, y: plain.dc.origin.y + 2 };
    const cover = (w: World, t: typeof plain.terrain): number => {
      const space = spaceOf(w.city, t);
      const field = landFieldOf(space, new Float32Array(144));
      let best = 0;
      for (let dy = -3; dy <= 4; dy += 1) for (let dx = -3; dx <= 4; dx += 1) best = Math.max(best, parkAt(field, front.x + dx, front.y + dy).value);
      return best;
    };
    expect(cover(green.world, green.terrain)).toBeGreaterThan(cover(plain.world, plain.terrain));
  });

  it('用途地域の変更の高さ・戸数・雇う人数: 区画の高さの上限が下がり、住める戸数と雇う人数が減る', () => {
    expect(zoneLevelCap(4, { height: -1 })).toBe(3);
    expect(zoneLevelCap(1, { height: -1 })).toBe(1);
    expect(zoneCapacity('residential', 3, { units: 0.8 })).toBeCloseTo(150 * 0.8, 9);
    expect(zoneCapacity('office', 2, { jobs: 0.8, units: 0.5 })).toBeCloseTo(40 * 0.8, 9);
    expect(unitsOf({ level: 2 }, { units: 0.5 })).toBeCloseTo(unitsOf({ level: 2 }) / 2, 9);
  });

  it('アップグレードの譲歩は、前から持つ性質に重ねる（倍率は掛け合わせ、高さは足す）', () => {
    expect(mergeMods({ nightNoise: 0.5, height: -1 }, { nightNoise: 0.5, height: -1, tech: 0.9 })).toEqual({ nightNoise: 0.25, height: -2, tech: 0.9 });
    expect(mergeMods(undefined, { green: 0.6 })).toEqual({ green: 0.6 });
    expect(mergeMods({ green: 0.6 }, { green: 0.6 })).toEqual({ green: 1 });
  });
});
