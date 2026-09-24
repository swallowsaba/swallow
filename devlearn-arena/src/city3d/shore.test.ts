import { describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { createSession } from '@/engines/kernel/session';
import { layoutCity } from './model';
import { hashString } from './seed';
import { BEACH_WIDTH, buildTerrain, inside, insetOutline, shoreOutline } from './terrain';
import type { Vec2 } from './model';

/**
 * 海岸線は曲線でなければならない（REWORK 2-3, 2-6）。
 * 階段状（タイルの角が見える形）を禁止する。
 */

/** 隣り合う 3 点 a-b-c が b でなす角（度）。まっすぐなら 180 */
export function cornerAngle(a: Vec2, b: Vec2, c: Vec2): number {
  const ux = a.x - b.x;
  const uz = a.z - b.z;
  const vx = c.x - b.x;
  const vz = c.z - b.z;
  const lu = Math.hypot(ux, uz);
  const lv = Math.hypot(vx, vz);
  if (lu === 0 || lv === 0) return 180;
  const cos = Math.min(1, Math.max(-1, (ux * vx + uz * vz) / (lu * lv)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** 輪郭の全ての角のうち、いちばん鋭いもの */
function sharpest(outline: readonly Vec2[]): number {
  let worst = 180;
  for (let i = 0; i < outline.length; i += 1) {
    const a = outline[(i + outline.length - 1) % outline.length];
    const b = outline[i];
    const c = outline[(i + 1) % outline.length];
    if (a === undefined || b === undefined || c === undefined) continue;
    worst = Math.min(worst, cornerAngle(a, b, c));
  }
  return worst;
}

const SIZES = [
  { w: 384, d: 272 },
  { w: 600, d: 420 },
  { w: 200, d: 200 },
];

const SEEDS = [hashString('devlearn-city'), hashString('a'), hashString('zzz'), 12345];

describe('角の測り方', () => {
  it('まっすぐな 3 点は 180 度', () => {
    expect(cornerAngle({ x: -1, z: 0 }, { x: 0, z: 0 }, { x: 1, z: 0 })).toBeCloseTo(180);
  });

  it('直角に折れた 3 点は 90 度。タイルの角はこれになる', () => {
    expect(cornerAngle({ x: -1, z: 0 }, { x: 0, z: 0 }, { x: 0, z: 1 })).toBeCloseTo(90);
  });
});

describe('海岸線は曲線', () => {
  it.each(SEEDS.map((seed) => [String(seed), seed]))(
    'seed %s のどの広さでも、隣り合う 3 点のなす角が 150 度以上',
    (_name, seed) => {
      for (const size of SIZES) {
        expect(sharpest(shoreOutline(size, seed)), JSON.stringify(size)).toBeGreaterThanOrEqual(150);
      }
    },
  );

  it('地面を組んだあとの海岸線も曲線のまま', () => {
    for (const seed of SEEDS) {
      const terrain = buildTerrain({ w: 384, d: 272 }, seed);
      expect(sharpest(terrain.shore)).toBeGreaterThanOrEqual(150);
      expect(sharpest(terrain.land)).toBeGreaterThanOrEqual(150);
    }
  });

  it('街から組んだ配置でも曲線のまま', () => {
    const session = createSession({ files: { '/home/learner': null, '/home/learner/a.txt': 'a' } });
    const layout = layoutCity(buildCity({ vfs: session.state.vfs, unlocked: ['center', 'kernel'] }));
    expect(sharpest(layout.terrain.shore)).toBeGreaterThanOrEqual(150);
  });

  it('輪郭は閉じている。始点と終点が離れすぎていない', () => {
    const outline = shoreOutline({ w: 384, d: 272 }, 7);
    const first = outline[0];
    const last = outline[outline.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();
    if (first === undefined || last === undefined) return;
    // 閉じた曲線なので、端どうしの隔たりも他の刻みと同じくらい
    const step = Math.hypot((outline[1]?.x ?? 0) - first.x, (outline[1]?.z ?? 0) - first.z);
    expect(Math.hypot(last.x - first.x, last.z - first.z)).toBeLessThan(step * 2);
  });
});

describe('草地は海岸線より内側に収まる', () => {
  it('砂浜の幅だけ内側へ寄せた線になる', () => {
    const outline = shoreOutline({ w: 384, d: 272 }, 3);
    const land = insetOutline(outline, BEACH_WIDTH);
    for (let i = 0; i < outline.length; i += 1) {
      const a = outline[i];
      const b = land[i];
      if (a === undefined || b === undefined) continue;
      expect(Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z)).toBeCloseTo(BEACH_WIDTH);
      expect(inside(outline, b)).toBe(true);
    }
  });

  it('草地のタイルは、どれも海岸線の内側にある', () => {
    const terrain = buildTerrain({ w: 384, d: 272 }, hashString('devlearn-city'));
    const land = terrain.tiles.filter((tile) => tile.kind !== 'water');
    expect(land.length).toBeGreaterThan(100);
    for (const tile of land) {
      expect(inside(terrain.shore, { x: tile.x, z: tile.z }), `${String(tile.x)},${String(tile.z)}`).toBe(true);
    }
  });

  it('同じ広さと同じ seed からは、必ず同じ海岸線になる', () => {
    expect(shoreOutline({ w: 384, d: 272 }, 9)).toEqual(shoreOutline({ w: 384, d: 272 }, 9));
  });
});
