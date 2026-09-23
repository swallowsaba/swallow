import { describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { DISTRICT_IDS } from '@/city/growth';
import { host, iface, link, topology } from '@/engines/net/factory';
import { layoutCity, type Vec2 } from './model';
import { TILE_METERS } from './palette';
import { buildTerrain, distanceToRiver, inside } from './terrain';
import { arcBoulevard, buildRoads, clipCircle, deadEnds, distanceToRoad, junctionsOf, ROAD_WIDTH } from './roads';

const CITY = { w: 48 * TILE_METERS, d: 34 * TILE_METERS };
const terrain = buildTerrain(CITY, 1234);
const districts = layoutCity(buildCity({ unlocked: DISTRICT_IDS })).districts;
const network = buildRoads({ size: CITY, districts, terrain, seed: 1234 });

/** 曲がっているか。点列の向きが変わるほど大きくなる */
function bend(points: readonly Vec2[]): number {
  let total = 0;
  for (let i = 2; i < points.length; i += 1) {
    const a = points[i - 2];
    const b = points[i - 1];
    const c = points[i];
    if (a === undefined || b === undefined || c === undefined) continue;
    const a1 = Math.atan2(b.z - a.z, b.x - a.x);
    const a2 = Math.atan2(c.z - b.z, c.x - b.x);
    total += Math.abs(Math.atan2(Math.sin(a2 - a1), Math.cos(a2 - a1)));
  }
  return total;
}

describe('道路', () => {
  it('大通り・街路・引き込みの太さが決まっている', () => {
    expect(ROAD_WIDTH.boulevard).toBeGreaterThan(ROAD_WIDTH.street);
    expect(ROAD_WIDTH.street).toBeGreaterThan(ROAD_WIDTH.lane);
    for (const road of network.roads) expect(road.width).toBe(ROAD_WIDTH[road.kind]);
  });

  it('海沿いの環状路は輪になっていて、端が無い', () => {
    const coast = network.roads.find((r) => r.id === 'road:coast');
    expect(coast?.closed).toBe(true);
    expect(coast?.points.length).toBeGreaterThan(64);
  });

  it('弧を描く大通りが 1 本ある（格子だけにしない）', () => {
    const arc = network.roads.filter((r) => r.id.startsWith('road:arc'));
    expect(arc.length).toBeGreaterThan(0);
    const curved = arc.reduce((sum, r) => sum + bend(r.points), 0);
    expect(curved).toBeGreaterThan(0.2);
    // 直線の大通りは曲がらない。弧とは別物であることを確かめる
    const straight = network.roads.find((r) => r.id.startsWith('road:ew-center'));
    expect(bend(straight?.points ?? [])).toBeLessThan(0.01);
  });

  it('弧は街の中に収まる', () => {
    const arc = arcBoulevard(CITY, terrain.shore, 1234);
    expect(arc.length).toBeGreaterThan(10);
    for (const point of arc) expect(inside(terrain.shore, point)).toBe(true);
  });

  it('主要な交差点はロータリーになっている', () => {
    expect(network.roundabouts).toHaveLength(1);
    const circle = network.roundabouts[0];
    expect(circle?.gardenRadius).toBeGreaterThan(0);
    expect(circle?.gardenRadius).toBeLessThan(circle?.radius ?? 0);
  });

  it('ロータリーの中に道を突っ込ませない', () => {
    const circle = network.roundabouts[0];
    if (circle === undefined) throw new Error('ロータリーが無い');
    for (const road of network.roads) {
      if (road.kind === 'lane') continue;
      for (const point of road.points) {
        const d = Math.hypot(point.x - circle.at.x, point.z - circle.at.z);
        expect({ id: road.id, inside: d < circle.radius - 0.5 }).toEqual({ id: road.id, inside: false });
      }
    }
  });

  it('円の中を抜くと、手前で切れた道が残る', () => {
    const line: Vec2[] = Array.from({ length: 41 }, (_, i) => ({ x: -100 + i * 5, z: 0 }));
    const runs = clipCircle(line, { x: 0, z: 0 }, 20);
    expect(runs).toHaveLength(2);
    for (const run of runs) for (const point of run) expect(Math.abs(point.x)).toBeGreaterThanOrEqual(19.9);
  });

  it('交差点で道が繋がる', () => {
    expect(network.junctions.length).toBeGreaterThan(4);
    for (const junction of network.junctions) {
      const touching = network.roads.filter((r) => r.kind !== 'lane' && distanceToRoad(r, junction) < r.width);
      expect(touching.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('行き止まりを作らない', () => {
    expect(deadEnds(network)).toEqual([]);
  });

  it('横断歩道は交差点の手前に、道を横切る向きで置かれる', () => {
    expect(network.crosswalks.length).toBeGreaterThan(4);
    for (const walk of network.crosswalks) {
      expect(walk.length).toBeGreaterThanOrEqual(ROAD_WIDTH.street);
      expect(walk.width).toBeGreaterThan(0);
      const near = network.junctions.some((j) => Math.hypot(j.x - walk.at.x, j.z - walk.at.z) < walk.length * 2.5);
      expect(near).toBe(true);
    }
  });

  it('川を渡る所には橋が架かる', () => {
    expect(network.bridges.length).toBeGreaterThan(0);
    for (const bridge of network.bridges) {
      expect(distanceToRiver(terrain, bridge.at)).toBeLessThan(terrain.riverWidth);
      expect(bridge.span).toBeGreaterThan(terrain.riverWidth);
      expect(bridge.width).toBeGreaterThanOrEqual(ROAD_WIDTH.boulevard);
    }
  });

  it('解放された区域だけに道が通る', () => {
    const open = buildRoads({ size: CITY, districts, terrain, seed: 1234 });
    const shut = buildRoads({
      size: CITY,
      districts: districts.map((d) => ({ ...d, unlocked: d.id === 'center' })),
      terrain,
      seed: 1234,
    });
    expect(open.roads.length).toBeGreaterThan(shut.roads.length);
  });

  it('同じ入力からは必ず同じ道になる', () => {
    expect(buildRoads({ size: CITY, districts, terrain, seed: 5 })).toEqual(
      buildRoads({ size: CITY, districts, terrain, seed: 5 }),
    );
    expect(junctionsOf(network.roads).length).toBe(network.junctions.length);
  });
});

describe('街の配置に道が入る', () => {
  it('建物どうしを結ぶ道は、切れていれば通れない印が付く', () => {
    const net = topology(
      [host('pc1', [iface('eth0', '10.0.0.1', 24)]), host('pc2', [iface('eth0', '10.0.0.2', 24)])],
      [link('pc1:eth0', 'pc2:eth0')],
    );
    const layout = layoutCity(buildCity({ net, unlocked: DISTRICT_IDS }));
    expect(layout.roads.roads.filter((r) => r.kind === 'lane')).toHaveLength(1);

    const cut = { ...net, links: net.links.map((l) => ({ ...l, up: false })) };
    const broken = layoutCity(buildCity({ net: cut, unlocked: DISTRICT_IDS }));
    expect(broken.roads.roads.filter((r) => r.kind === 'lane' && !r.active)).toHaveLength(1);
  });

  it('更地でも道は通っている（街に骨格がある）', () => {
    const layout = layoutCity(buildCity({ unlocked: ['center'] }));
    expect(layout.roads.roads.length).toBeGreaterThan(2);
    expect(deadEnds(layout.roads)).toEqual([]);
  });
});
