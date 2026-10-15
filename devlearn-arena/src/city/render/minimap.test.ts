import { describe, expect, it } from 'vitest';
import { domain } from '@/ui/tokens';
import { footprintOf } from '../facilities';
import { minimapFrame, toMinimap } from '../minimap';
import type { Rotation } from '../projection';
import { sampleCity } from '../sample';
import { generateTerrain, MAP_SIZE } from '../terrain';
import { drawMinimapBase, facilityDotColor } from './minimap';

const ROTATIONS: Rotation[] = [0, 1, 2, 3];
const terrain = generateTerrain(20260917);

describe('ミニマップの下絵', () => {
  it('施設ごとに、敷地の中心に分野の色の点を描く（建設中は色を沈める）', () => {
    const city = sampleCity();
    for (const r of ROTATIONS) {
      const f = minimapFrame(terrain.slab, MAP_SIZE, 160, r);
      const calls = recordDots(f, city);
      expect(city.facilities.length).toBeGreaterThanOrEqual(3);
      expect(calls).toHaveLength(city.facilities.length);
      city.facilities.forEach((fac, i) => {
        const { w, d } = footprintOf(fac.type, fac.rotation);
        const m = toMinimap(f, { x: fac.origin.x + w / 2, y: fac.origin.y + d / 2 });
        expect(calls[i]?.x).toBeCloseTo(m.mx, 9);
        expect(calls[i]?.y).toBeCloseTo(m.my, 9);
        expect(calls[i]?.fill).toBe(fac.state === 'active' ? facilityDotColor(fac.type) : expect.any(String));
      });
    }
    // 分野の施設は分野の色、公園などは分野の色と別の緑
    expect(facilityDotColor('server')).toBe(domain.linux);
    expect(Object.values(domain)).not.toContain(facilityDotColor('park'));
  });
});

/** 下絵を描かせ、施設の点（arc）の位置と塗った色を拾う */
function recordDots(f: ReturnType<typeof minimapFrame>, city: ReturnType<typeof sampleCity>): { x: number; y: number; fill: string }[] {
  const dots: { x: number; y: number; fill: string }[] = [];
  let pending: { x: number; y: number } | null = null;
  let roads = true;
  const record: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(record, {
    get(target, prop) {
      if (prop === 'arc') return (x: number, y: number) => { pending = { x, y }; };
      if (prop === 'fill') return () => {
        if (pending && !roads) dots.push({ ...pending, fill: String(target.fillStyle) });
        pending = null;
      };
      if (prop === 'stroke') return () => { pending = null; };
      if (prop === 'save') return () => { roads = false; };
      if (prop in target) return target[prop];
      return () => undefined;
    },
    set(target, prop, value) {
      target[prop] = value;
      // 施設の点は lineWidth = 1 にしてから描く（環状交差点の輪と区別する）
      if (prop === 'lineWidth' && value === 1) roads = false;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  drawMinimapBase(ctx, f, terrain, city);
  return dots;
}
