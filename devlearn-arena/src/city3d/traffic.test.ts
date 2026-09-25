import { describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { DISTRICT_IDS } from '@/city/growth';
import { emptyCluster, node } from '@/engines/k8s/factory';
import { layoutCity, type Vec2 } from './model';
import type { RoadNetwork, RoadPath } from './roads';
import { moveAlong } from './sky';
import { paceAfter, routeFrom, RUSH_SECONDS, trafficGraph } from './traffic';

/**
 * 車の道すじ（REWORK 7-2）。車は道の中心線に沿って走り、交差点で曲がり、止めると止まる。
 */

function road(id: string, points: Vec2[], extra: Partial<RoadPath> = {}): RoadPath {
  return { id, kind: 'street', points, width: 11, closed: false, active: true, blocked: false, ...extra };
}

/** 十字路。横の道と縦の道が真ん中で交わる */
const CROSS: RoadNetwork = {
  roads: [
    road('ew', [{ x: -100, z: 0 }, { x: 100, z: 0 }]),
    road('ns', [{ x: 0, z: -100 }, { x: 0, z: 100 }]),
  ],
  roundabouts: [],
  crosswalks: [],
  bridges: [],
  junctions: [{ x: 0, z: 0 }],
};

/** 点から道の中心線までの距離 */
function offRoad(network: RoadNetwork, at: Vec2): number {
  let best = Infinity;
  for (const r of network.roads) {
    for (let i = 1; i < r.points.length; i += 1) {
      const a = r.points[i - 1];
      const b = r.points[i];
      if (a === undefined || b === undefined) continue;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((at.x - a.x) * dx + (at.z - a.z) * dz) / (dx * dx + dz * dz)));
      best = Math.min(best, Math.hypot(at.x - (a.x + dx * t), at.z - (a.z + dz * t)));
    }
  }
  return best;
}

describe('道の網', () => {
  it('十字路は、真ん中の交差点で 4 本の区間に分かれる', () => {
    const graph = trafficGraph(CROSS);
    expect(graph.edges).toHaveLength(4);
    const center = [...graph.out.entries()].find(([name]) => name.startsWith('j:'));
    expect(center?.[1]).toHaveLength(4);
  });

  it('塞がれた道と、何も通っていない道には車を走らせない', () => {
    const graph = trafficGraph({
      ...CROSS,
      roads: [road('ew', [{ x: -100, z: 0 }, { x: 100, z: 0 }]), road('ns', [{ x: 0, z: -100 }, { x: 0, z: 100 }], { blocked: true })],
    });
    expect(graph.edges).toHaveLength(1);
  });
});

describe('車の道すじ', () => {
  const graph = trafficGraph(CROSS);
  const routes = [0, 1, 2, 3].flatMap((edge) => [11, 22, 33].map((seed) => routeFrom(graph, edge, seed)));

  it('道すじは閉じた輪になる（端で消えて反対から湧き出さない）', () => {
    for (const points of routes) {
      const first = points[0];
      const last = points[points.length - 1];
      expect(first !== undefined && last !== undefined && Math.hypot(first.x - last.x, first.z - last.z)).toBeLessThan(0.01);
    }
  });

  it('道すじの点はどれも道の中心線の上にある', () => {
    for (const points of routes) for (const at of points) expect(offRoad(CROSS, at)).toBeLessThan(0.01);
  });

  it('交差点で曲がる道すじがある（横の道から縦の道へ移る）', () => {
    const turns = routes.filter(
      (points) => points.some((p) => Math.abs(p.z) > 50) && points.some((p) => Math.abs(p.x) > 50),
    );
    expect(turns.length).toBeGreaterThan(0);
  });
});

describe('車を動かす', () => {
  const path = { points: routeFrom(trafficGraph(CROSS), 0, 7), offset: 2.75, speed: 8, start: 0.1 };

  it('1 tick で車の位置が変わる', () => {
    const a = moveAlong(path, 0).at;
    const b = moveAlong(path, 1).at;
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(8, 0);
  });

  it('時間が進まなければ（止めている間は）同じ所にいる', () => {
    expect(moveAlong(path, 5)).toEqual(moveAlong(path, 5));
  });

  it('車は中心線から車線の幅だけずれた所を走る', () => {
    for (let t = 0; t < 60; t += 1.7) {
      const off = offRoad(CROSS, moveAlong(path, t).at);
      expect(off).toBeLessThan(2.75 + 0.01);
    }
  });

  it('本物の街でも、車はどれも輪の道すじを持ち、走っている', () => {
    const layout = layoutCity(
      buildCity({ cluster: { ...emptyCluster([node('n1', 4000, 8192)]), tick: 9 }, unlocked: DISTRICT_IDS }),
    );
    const cars = layout.props.filter((p) => p.kind === 'car' && p.path !== undefined && p.path.speed !== 0);
    expect(cars.length).toBeGreaterThan(5);
    for (const car of cars) {
      const points = car.path?.points ?? [];
      const first = points[0];
      const last = points[points.length - 1];
      expect(first !== undefined && last !== undefined && Math.hypot(first.x - last.x, first.z - last.z)).toBeLessThan(0.01);
    }
    expect(new Set(cars.map((c) => c.tint)).size).toBeGreaterThan(2);
  });
});

describe('時間を進めた直後の速さ（REWORK 7-3）', () => {
  it('進めた直後は速く、だんだん元の速さに戻る', () => {
    expect(paceAfter(null)).toBe(1);
    expect(paceAfter(0)).toBeGreaterThan(3);
    expect(paceAfter(RUSH_SECONDS / 2)).toBeGreaterThan(1);
    expect(paceAfter(RUSH_SECONDS / 2)).toBeLessThan(paceAfter(0));
    expect(paceAfter(RUSH_SECONDS)).toBe(1);
  });
});
