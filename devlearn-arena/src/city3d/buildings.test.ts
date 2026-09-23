import { describe, expect, it } from 'vitest';
import { InstancedMesh, Mesh } from 'three';
import { buildCity } from '@/city/model';
import { DISTRICT_IDS } from '@/city/growth';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { container, deployment, emptyCluster, node, pod, service } from '@/engines/k8s/factory';
import { key, type ClusterState, type Pod } from '@/engines/k8s/types';
import { buildMesh, buildingPieces, tiersOf, MIN_WINDOWS, RADIAL_SEGMENTS } from './buildings';
import { layoutCity, type BuildingParams } from './model';

const ALL = DISTRICT_IDS;

function params(over: Partial<BuildingParams> = {}): BuildingParams {
  return {
    kind: 'midrise',
    shape: 'box',
    footprint: { w: 14, d: 12 },
    floors: 6,
    setbacks: [],
    roof: 'flat',
    seed: 1234,
    ...over,
  };
}

/** 街じゅうの建物（学習者が作った資源から建つもの）を一通り集める */
function everyBuilding(): BuildingParams[] {
  let session: Session = createSession({ files: { '/home/learner': null } });
  for (const line of ['mkdir work', 'echo hello > work/a.txt', 'git init', 'git add work/a.txt', 'git -c user.name=a -c user.email=b commit -m first']) {
    session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
  }
  const pods: Pod[] = [pod('web', [container('c', 'nginx')])];
  const map = new Map<string, Pod>();
  for (const p of pods) map.set(key(p.metadata.namespace, p.metadata.name), { ...p, status: { ...p.status, nodeName: 'n1', phase: 'Running' as const } });
  const cluster: ClusterState = {
    ...emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192)]),
    pods: map,
    deployments: new Map([[key('default', 'web'), deployment('web', 3, [container('c', 'nginx')])]]),
    services: new Map([[key('default', 'web'), service('web', { app: 'web' })]]),
    tick: 9,
  };
  const city = buildCity({ vfs: session.state.vfs, git: session.state.git, cluster, unlocked: ALL });
  return layoutCity(city).buildings.map((b) => b.params);
}

describe('建物をパラメータから組み立てる', () => {
  it('基壇・本体・入口・屋根を持つ', () => {
    const parts = new Set(buildingPieces(params()).pieces.map((p) => p.part));
    expect(parts).toContain('base');
    expect(parts).toContain('body');
    expect(parts).toContain('entrance');
    expect(parts).toContain('roof');
  });

  it('基壇は本体より太い（一段太い足元）', () => {
    const made = buildingPieces(params());
    const base = made.pieces.find((p) => p.part === 'base');
    const body = made.pieces.find((p) => p.part === 'body');
    base?.geometry.computeBoundingBox();
    body?.geometry.computeBoundingBox();
    const baseW = (base?.geometry.boundingBox?.max.x ?? 0) - (base?.geometry.boundingBox?.min.x ?? 0);
    const bodyW = (body?.geometry.boundingBox?.max.x ?? 0) - (body?.geometry.boundingBox?.min.x ?? 0);
    expect(baseW).toBeGreaterThan(bodyW);
  });

  it('入口は扉と庇の 2 つでできている', () => {
    const entrance = buildingPieces(params()).pieces.filter((p) => p.part === 'entrance');
    expect(entrance.length).toBe(2);
  });

  it('低層は石、上層はガラス', () => {
    const surfaces = buildingPieces(params({ floors: 12 })).pieces.filter((p) => p.part === 'body').map((p) => p.surface);
    expect(surfaces).toContain('stone');
    expect(surfaces).toContain('glass');
  });

  it('セットバックで上の段ほど細くなる', () => {
    const tiers = tiersOf(params({ floors: 20, setbacks: [10, 16] }));
    expect(tiers.length).toBe(3);
    for (let i = 1; i < tiers.length; i += 1) {
      expect(tiers[i]?.w ?? 0).toBeLessThan(tiers[i - 1]?.w ?? 0);
      expect(tiers[i]?.y0 ?? 0).toBeGreaterThan(tiers[i - 1]?.y0 ?? 0);
    }
  });

  it('屋上設備が 2 つ以上載る', () => {
    for (const kind of ['tower', 'midrise', 'house', 'monument', 'depot'] as const) {
      const made = buildingPieces(params({ kind, floors: kind === 'monument' ? 1 : 6 }));
      expect({ kind, count: new Set(made.rooftop).size >= 2 }).toEqual({ kind, count: true });
      expect(made.pieces.some((p) => p.part === 'rooftop')).toBe(true);
    }
  });

  it('窓は 1 棟あたり 40 枚以上。どの種類でも', () => {
    for (const kind of ['tower', 'midrise', 'house', 'monument', 'depot'] as const) {
      for (const shape of ['box', 'cylinder'] as const) {
        const made = buildingPieces(params({ kind, shape, floors: kind === 'monument' ? 1 : 3, footprint: { w: 5, d: 5 } }));
        expect({ kind, shape, windows: made.windows.length >= MIN_WINDOWS }).toEqual({ kind, shape, windows: true });
      }
    }
  });

  it('窓は階の番号を持ち、建物の中に収まる', () => {
    const p = params({ floors: 8 });
    const made = buildingPieces(p);
    for (const slot of made.windows) {
      expect(slot.floor).toBeGreaterThanOrEqual(1);
      expect(slot.floor).toBeLessThanOrEqual(p.floors);
      expect(slot.y).toBeGreaterThan(0);
      expect(slot.y).toBeLessThan(made.height);
      expect(slot.width).toBeGreaterThan(0);
      expect(slot.height).toBeGreaterThan(0);
    }
  });

  it('円柱の高層ビルは分割数 24 以上', () => {
    const made = buildingPieces(params({ kind: 'tower', shape: 'cylinder', floors: 14, footprint: { w: 18, d: 18 } }));
    const body = made.pieces.find((p) => p.part === 'body');
    // 分割数 n の円柱の側面は n*6 頂点。24 未満なら角ばって見える
    const count = body?.geometry.getAttribute('position').count ?? 0;
    expect(count).toBeGreaterThanOrEqual(RADIAL_SEGMENTS * 6);
  });

  it('住まいには切妻屋根が載る', () => {
    const made = buildingPieces(params({ kind: 'house', roof: 'gable', floors: 2 }));
    expect(made.pieces.some((p) => p.part === 'roof' && p.surface === 'roof')).toBe(true);
  });

  it('平らな屋根にはパラペットが回る', () => {
    const made = buildingPieces(params({ roof: 'flat' }));
    expect(made.pieces.some((p) => p.part === 'parapet')).toBe(true);
    expect(made.rooftop).toContain('parapet');
  });

  it('同じパラメータからは必ず同じ形になる', () => {
    const shape = (p: BuildingParams) => {
      const made = buildingPieces(p);
      return {
        pieces: made.pieces.map((x) => [x.part, x.surface, x.geometry.getAttribute('position').count] as const),
        windows: made.windows.length,
        height: made.height,
      };
    };
    expect(shape(params())).toEqual(shape(params()));
    expect(shape(params({ seed: 9 }))).not.toEqual(shape(params({ seed: 9, floors: 20 })));
  });

  it('buildMesh は窓を 1 つの InstancedMesh にまとめる', () => {
    const group = buildMesh(params({ kind: 'tower', floors: 16, setbacks: [8, 13] }));
    const instanced = group.children.filter((child) => child instanceof InstancedMesh);
    expect(instanced).toHaveLength(1);
    const windows = buildingPieces(params({ kind: 'tower', floors: 16, setbacks: [8, 13] })).windows;
    expect(instanced[0]?.count).toBe(windows.length);
    // 窓以外は普通のメッシュ。影を落とし、影を受ける
    for (const child of group.children) {
      if (child instanceof InstancedMesh) continue;
      expect(child).toBeInstanceOf(Mesh);
      expect((child as Mesh).castShadow).toBe(true);
      expect((child as Mesh).receiveShadow).toBe(true);
    }
  });
});

describe('街に建つ建物は、どれも決まりを満たす', () => {
  const all = everyBuilding();

  it('学習者が資源を作ったぶんだけ建物がある', () => {
    expect(all.length).toBeGreaterThan(5);
  });

  it.each(all.map((p, i) => [`${p.kind}/${String(i)}`, p] as const))('%s は窓 40 枚以上・屋上設備 2 つ以上', (_name, p) => {
    const made = buildingPieces(p);
    expect(made.windows.length).toBeGreaterThanOrEqual(MIN_WINDOWS);
    expect(new Set(made.rooftop).size).toBeGreaterThanOrEqual(2);
    expect(made.pieces.some((x) => x.part === 'base')).toBe(true);
    expect(made.pieces.some((x) => x.part === 'entrance')).toBe(true);
    expect(made.height).toBeGreaterThan(2);
  });
});
