import { describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { DISTRICT_IDS } from '@/city/growth';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { emptyCluster, node } from '@/engines/k8s/factory';
import { layoutCity, type Vec2 } from './model';
import { TILE_METERS } from './palette';
import {
  bridgesFor,
  buildTerrain,
  distanceToRiver,
  inside,
  isBuildable,
  isLand,
  riverBanks,
  shoreOutline,
  type Terrain,
} from './terrain';

const CITY = { w: 48 * TILE_METERS, d: 34 * TILE_METERS };
const terrain = buildTerrain(CITY, 1234);

/** 輪郭が四角や菱形でないこと（中心からの距離の振れ幅で見る） */
function radii(points: readonly Vec2[]): number[] {
  return points.map((p) => Math.hypot(p.x, p.z));
}

describe('地面', () => {
  it('8m のタイルで敷き詰める', () => {
    const xs = [...new Set(terrain.tiles.map((t) => t.x))].sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i += 1) expect((xs[i] ?? 0) - (xs[i - 1] ?? 0)).toBeCloseTo(TILE_METERS);
    expect(terrain.tiles.length).toBeGreaterThan(1000);
  });

  it('草地・土・舗装・水を塗り分ける', () => {
    const kinds = new Set(terrain.tiles.map((t) => t.kind));
    expect(kinds).toEqual(new Set(['grass', 'dirt', 'pavement', 'water']));
  });

  it('草地には低い起伏がある（平らな板 1 枚ではない）', () => {
    const heights = terrain.tiles.filter((t) => t.kind === 'grass').map((t) => t.height);
    expect(new Set(heights).size).toBeGreaterThan(50);
    expect(Math.max(...heights) - Math.min(...heights)).toBeGreaterThan(0.5);
    expect(Math.max(...heights)).toBeLessThan(4);
  });

  it('島は街より広い。街の四隅まで陸が届く', () => {
    expect(terrain.size.w).toBeGreaterThan(terrain.city.w);
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const corner = { x: (sx * CITY.w) / 2 - sx * 4, z: (sz * CITY.d) / 2 - sz * 4 };
        expect({ corner, land: inside(terrain.shore, corner) }).toEqual({ corner, land: true });
      }
    }
  });
});

describe('海岸線', () => {
  it('波打つ曲線。四角でも菱形でもない', () => {
    const r = radii(terrain.shore);
    const spread = (Math.max(...r) - Math.min(...r)) / Math.max(...r);
    // 真円なら 0、四角なら角で 1.41 倍に跳ねる。うねりはその間
    expect(spread).toBeGreaterThan(0.05);
    expect(terrain.shore.length).toBeGreaterThanOrEqual(64);
  });

  it('輪郭は滑らかに繋がる（隣り合う点が飛ばない）', () => {
    const points = terrain.shore;
    const steps = points.map((p, i) => {
      const next = points[(i + 1) % points.length] ?? p;
      return Math.hypot(next.x - p.x, next.z - p.z);
    });
    expect(Math.max(...steps)).toBeLessThan(terrain.size.w * 0.08);
  });

  it('seed が変われば海岸線の形も変わる', () => {
    expect(shoreOutline(CITY, 1)).not.toEqual(shoreOutline(CITY, 2));
    expect(shoreOutline(CITY, 1)).toEqual(shoreOutline(CITY, 1));
  });
});

describe('川', () => {
  it('蛇行する。直線ではない', () => {
    const first = terrain.river[0];
    const last = terrain.river[terrain.river.length - 1];
    if (first === undefined || last === undefined) throw new Error('川が無い');
    let worst = 0;
    for (const point of terrain.river) {
      const t = (point.z - first.z) / (last.z - first.z);
      worst = Math.max(worst, Math.abs(point.x - (first.x + (last.x - first.x) * t)));
    }
    expect(worst).toBeGreaterThan(terrain.riverWidth);
  });

  it('北の端から南の端まで流れ、街を横切る', () => {
    const first = terrain.river[0];
    const last = terrain.river[terrain.river.length - 1];
    expect(first?.z).toBeLessThanOrEqual(-terrain.size.d / 2);
    expect(last?.z).toBeGreaterThanOrEqual(terrain.size.d / 2);
  });

  it('両岸を持つリボンとして描ける', () => {
    const { left, right } = riverBanks(terrain, terrain.riverWidth);
    expect(left).toHaveLength(terrain.river.length);
    for (let i = 0; i < left.length; i += 1) {
      const a = left[i];
      const b = right[i];
      if (a === undefined || b === undefined) throw new Error('岸が無い');
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(terrain.riverWidth, 3);
    }
  });

  it('川の中は陸ではない。岸には砂の帯がある', () => {
    const middle = terrain.river[24];
    if (middle === undefined) throw new Error('川が無い');
    expect(isLand(terrain, middle)).toBe(false);
    const sand = { x: middle.x + terrain.riverWidth / 2 + 2, z: middle.z };
    expect(isLand(terrain, sand)).toBe(true);
    expect(isBuildable(terrain, sand)).toBe(false);
  });

  it('街の真ん中の広場は水没しない', () => {
    expect(isBuildable(terrain, { x: 0, z: 0 })).toBe(true);
  });
});

describe('橋', () => {
  it('道が川を渡る所に架かる', () => {
    const middle = terrain.river[24];
    if (middle === undefined) throw new Error('川が無い');
    const road: [Vec2, Vec2] = [
      { x: middle.x - 80, z: middle.z },
      { x: middle.x + 80, z: middle.z },
    ];
    const bridges = bridgesFor(terrain, [road]);
    expect(bridges).toHaveLength(1);
    const bridge = bridges[0];
    expect(bridge?.span).toBeGreaterThan(terrain.riverWidth);
    expect(Math.hypot((bridge?.at.x ?? 0) - middle.x, (bridge?.at.z ?? 0) - middle.z)).toBeLessThan(terrain.riverWidth);
  });

  it('川を渡らない道には架けない', () => {
    const away: [Vec2, Vec2] = [
      { x: -terrain.size.w / 2, z: 0 },
      { x: -terrain.size.w / 4, z: 0 },
    ];
    expect(bridgesFor(terrain, [away])).toEqual([]);
  });

  it('同じ所に何本も架けない', () => {
    const middle = terrain.river[24];
    if (middle === undefined) throw new Error('川が無い');
    const road: [Vec2, Vec2] = [
      { x: middle.x - 80, z: middle.z },
      { x: middle.x + 80, z: middle.z },
    ];
    expect(bridgesFor(terrain, [road, road])).toHaveLength(1);
  });
});

describe('街と地面', () => {
  it('同じ seed からは必ず同じ地面になる', () => {
    expect(buildTerrain(CITY, 7)).toEqual(buildTerrain(CITY, 7));
    expect(buildTerrain(CITY, 7).river).not.toEqual(buildTerrain(CITY, 8).river);
  });

  it('建物は水の上に建たない', () => {
    let session: Session = createSession({ files: { '/home/learner': null } });
    for (const line of ['mkdir work', 'echo hi > work/a.txt', 'git init', 'git add work/a.txt']) {
      session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
    }
    const city = buildCity({
      vfs: session.state.vfs,
      git: session.state.git,
      cluster: { ...emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192)]), tick: 9 },
      unlocked: DISTRICT_IDS,
    });
    const layout = layoutCity(city);
    expect(layout.buildings.length).toBeGreaterThan(3);
    for (const building of layout.buildings) {
      const half = Math.max(building.params.footprint.w, building.params.footprint.d) / 2;
      expect({ id: building.id, dry: isBuildable(layout.terrain, building.at) }).toEqual({ id: building.id, dry: true });
      expect(distanceToRiver(layout.terrain, building.at)).toBeGreaterThan(layout.terrain.riverWidth / 2 + half);
    }
  });

  it('地面は街の配置にも付いてくる', () => {
    const layout = layoutCity(buildCity({ unlocked: DISTRICT_IDS }));
    expect(layout.terrain.tiles.length).toBeGreaterThan(0);
    expect(layout.terrain.city).toEqual(layout.size);
  });
});

/** 型だけ使う（地面の形が変わっても参照が残るように） */
export type TerrainForTest = Terrain;
