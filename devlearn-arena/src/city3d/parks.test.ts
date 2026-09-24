import { describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { createSession } from '@/engines/kernel/session';
import { emptyCluster, node } from '@/engines/k8s/factory';
import { layoutCity } from './model';
import { buildParks, parkPath, pondOutline, PATH_WIDTH } from './parks';
import { distanceToRoad } from './roads';
import { hashString } from './seed';
import { distanceToRiver, inside } from './terrain';
import type { Vec2 } from './model';

/**
 * 公園。曲がった小道と池（DESIGN.md §11、REWORK 2-4）。
 * まっすぐな小道と、四角い池を禁止する。
 */

/** 隣り合う 3 点 a-b-c が b でなす角（度） */
function cornerAngle(a: Vec2, b: Vec2, c: Vec2): number {
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

function sharpest(points: readonly Vec2[], closed: boolean): number {
  let worst = 180;
  const end = closed ? points.length : points.length - 1;
  for (let i = closed ? 0 : 1; i < end; i += 1) {
    const a = points[(i + points.length - 1) % points.length];
    const b = points[i];
    const c = points[(i + 1) % points.length];
    if (a === undefined || b === undefined || c === undefined) continue;
    worst = Math.min(worst, cornerAngle(a, b, c));
  }
  return worst;
}

function town() {
  const session = createSession({
    files: {
      '/home/learner': null,
      '/home/learner/a.txt': 'a',
      '/home/learner/src': null,
      '/home/learner/src/main.ts': 'b',
    },
  });
  return buildCity({ vfs: session.state.vfs, unlocked: ['center', 'kernel', 'git', 'k8s', 'net', 'github'] });
}

const layout = layoutCity(town());

describe('池の岸', () => {
  it('丸をゆがませた曲線で、角が立たない', () => {
    for (const seed of [1, 7, hashString('pond')]) {
      const outline = pondOutline({ x: 0, z: 0 }, 20, seed);
      expect(outline.length).toBeGreaterThan(20);
      expect(sharpest(outline, true)).toBeGreaterThanOrEqual(150);
    }
  });

  it('真円ではない。ゆがませてある', () => {
    const outline = pondOutline({ x: 0, z: 0 }, 20, 5);
    const radii = outline.map((p) => Math.hypot(p.x, p.z));
    expect(Math.max(...radii) - Math.min(...radii)).toBeGreaterThan(1);
  });

  it('同じ seed からは必ず同じ池になる', () => {
    expect(pondOutline({ x: 3, z: 4 }, 12, 9)).toEqual(pondOutline({ x: 3, z: 4 }, 12, 9));
  });
});

describe('公園の小道', () => {
  it('曲がっている。まっすぐ引かない', () => {
    for (const seed of [2, 11, hashString('path')]) {
      const path = parkPath({ x: 0, z: 0 }, 30, seed);
      expect(path.length).toBeGreaterThan(10);
      // 端どうしを結んだ直線からの隔たりが、幅より大きい
      const first = path[0];
      const last = path[path.length - 1];
      expect(first).toBeDefined();
      expect(last).toBeDefined();
      if (first === undefined || last === undefined) continue;
      const len = Math.hypot(last.x - first.x, last.z - first.z) || 1;
      const away = Math.max(
        ...path.map((p) => Math.abs((last.x - first.x) * (first.z - p.z) - (first.x - p.x) * (last.z - first.z)) / len),
      );
      expect(away).toBeGreaterThan(PATH_WIDTH);
    }
  });

  it('小道も角が立たない', () => {
    expect(sharpest(parkPath({ x: 0, z: 0 }, 30, 4), false)).toBeGreaterThanOrEqual(150);
  });
});

describe('公園を置く', () => {
  it('街に公園が立つ。どれも小道と池を持つ', () => {
    expect(layout.parks.length).toBeGreaterThan(0);
    for (const park of layout.parks) {
      expect(park.paths.length).toBeGreaterThan(0);
      expect(park.ponds.length).toBeGreaterThan(0);
    }
  });

  it('陸の上に置く。川と道と建物の上には置かない', () => {
    for (const park of layout.parks) {
      expect(inside(layout.terrain.land, park.at), park.id).toBe(true);
      expect(distanceToRiver(layout.terrain, park.at)).toBeGreaterThan(park.radius);
      for (const road of layout.roads.roads) {
        expect(distanceToRoad(road, park.at), `${park.id} / ${road.id}`).toBeGreaterThan(park.radius);
      }
      for (const building of layout.buildings) {
        expect(Math.hypot(park.at.x - building.at.x, park.at.z - building.at.z)).toBeGreaterThan(park.radius);
      }
    }
  });

  it('公園どうしは重ならない', () => {
    for (const a of layout.parks) {
      for (const b of layout.parks) {
        if (a.id === b.id) continue;
        expect(Math.hypot(a.at.x - b.at.x, a.at.z - b.at.z)).toBeGreaterThan(Math.max(a.radius, b.radius));
      }
    }
  });

  it('池は公園の中に収まる', () => {
    for (const park of layout.parks) {
      for (const pond of park.ponds) {
        const away = Math.hypot(pond.at.x - park.at.x, pond.at.z - park.at.z);
        expect(away + pond.radius).toBeLessThan(park.radius);
      }
    }
  });

  it('同じ街からは必ず同じ公園になる', () => {
    expect(layoutCity(town()).parks).toEqual(layout.parks);
  });

  it('置ける所が無くても必ず終わる', () => {
    const packed = buildParks({
      terrain: layout.terrain,
      roads: layout.roads,
      // 街じゅうを建物で埋める
      buildings: layout.buildings.map((b) => ({ ...b, params: { ...b.params, footprint: { w: 4000, d: 4000 } } })),
      seed: 1,
    });
    expect(packed).toEqual([]);
  });
});

describe('DESIGN 第11節が街にそろっている', () => {
  it('川が蛇行している', () => {
    const river = layout.terrain.river;
    const xs = river.map((p) => p.x);
    // まっすぐ流れていない。左右に振れている
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(layout.terrain.size.w * 0.05);
  });

  it('道が川を渡る所に橋が架かる', () => {
    expect(layout.roads.bridges.length).toBeGreaterThan(0);
  });

  it('弧を描く大通りが通っている', () => {
    const arc = layout.roads.roads.find((road) => road.id === 'road:arc');
    expect(arc).toBeDefined();
    expect(arc?.points.length ?? 0).toBeGreaterThan(2);
  });

  it('主要な交差点がロータリーになっている', () => {
    expect(layout.roads.roundabouts.length).toBeGreaterThan(0);
    for (const circle of layout.roads.roundabouts) {
      expect(circle.gardenRadius).toBeGreaterThan(0);
      expect(circle.gardenRadius).toBeLessThan(circle.radius);
    }
  });

  it('公園に曲がった小道と池がある', () => {
    expect(layout.parks.length).toBeGreaterThan(0);
    expect(layout.parks.every((park) => park.paths.length > 0 && park.ponds.length > 0)).toBe(true);
  });

  it('箱型だけでなく円柱の高層ビルも混ざる', () => {
    // 高層ビル（ノード）が建つ街で見る。ファイルだけの街には高層ビルが無い
    const cluster = emptyCluster(
      Array.from({ length: 12 }, (_, i) => node(`node-${String(i + 1)}`, 4000, 8192)),
    );
    const towers = layoutCity(buildCity({ cluster, unlocked: ['center', 'k8s'] }));
    const shapes = new Set(towers.buildings.map((b) => b.params.shape));
    expect(shapes.has('box')).toBe(true);
    expect(shapes.has('cylinder')).toBe(true);
  });

  it('低層の住まいには切妻屋根が載る', () => {
    const houses = layout.buildings.filter((b) => b.params.kind === 'house');
    expect(houses.length).toBeGreaterThan(0);
    expect(houses.some((b) => b.params.roof === 'gable')).toBe(true);
  });
});
