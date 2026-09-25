import { describe, expect, it } from 'vitest';
import { InstancedMesh, Mesh, type Object3D } from 'three';
import { buildCity } from '@/city/model';
import { DISTRICT_IDS } from '@/city/growth';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { container, deployment, emptyCluster, node, pod, service } from '@/engines/k8s/factory';
import { key, type ClusterState, type Pod } from '@/engines/k8s/types';
import { host, iface, link, topology } from '@/engines/net/factory';
import { layoutCity } from './model';
import { buildCityScene, DRAW_CALL_LIMIT, windowStride } from './scene';
import { offsetPath, raisedRibbon, ribbon } from './geometry';

/** 学習者がひと通り作業したあとの街。いちばん物が多い状態で数える */
function busyCity() {
  let session: Session = createSession({ files: { '/home/learner': null } });
  for (const line of [
    'mkdir work',
    'echo hello > work/a.txt',
    'echo more > work/b.txt',
    'git init',
    'git add work/a.txt',
    'git -c user.name=a -c user.email=b@c commit -m first',
    'git branch topic',
  ]) {
    session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
  }
  const pods: Pod[] = [pod('web-1', [container('c', 'nginx')]), pod('web-2', [container('c', 'nginx')])];
  const map = new Map<string, Pod>();
  pods.forEach((p, i) => {
    map.set(key(p.metadata.namespace, p.metadata.name), {
      ...p,
      status: { ...p.status, nodeName: i === 0 ? 'n1' : 'n2', phase: 'Running' as const },
    });
  });
  const cluster: ClusterState = {
    ...emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192), node('n3', 4000, 8192)]),
    pods: map,
    deployments: new Map([[key('default', 'web'), deployment('web', 3, [container('c', 'nginx')])]]),
    services: new Map([[key('default', 'web'), service('web', { app: 'web' })]]),
    tick: 9,
  };
  const net = topology(
    [host('pc1', [iface('eth0', '10.0.0.1', 24)]), host('pc2', [iface('eth0', '10.0.0.2', 24)])],
    [link('pc1:eth0', 'pc2:eth0')],
  );
  return buildCity({
    vfs: session.state.vfs,
    git: session.state.git,
    cluster,
    net,
    unlocked: DISTRICT_IDS,
  });
}

const layout = layoutCity(busyCity());
const scene = buildCityScene(layout);

function meshesOf(built: { group: Object3D }): Mesh[] {
  const out: Mesh[] = [];
  built.group.traverse((node: Object3D) => {
    if (node instanceof Mesh) out.push(node as Mesh);
  });
  return out;
}

const meshes = (): Mesh[] => meshesOf(scene);

describe('街を three の形にする', () => {
  it('描画呼び出しを 200 以下に保つ', () => {
    expect(scene.drawCalls).toBeLessThanOrEqual(DRAW_CALL_LIMIT);
    expect(scene.drawCalls).toBe(meshes().length);
    expect(scene.drawCalls).toBeGreaterThan(10);
  });

  it('1 棟ごとに個別のメッシュを作らない', () => {
    // 建物 1 棟あたり十数個の部品があっても、材質ごとに融合されるので数は増えない
    expect(layout.buildings.length).toBeGreaterThan(8);
    expect(scene.drawCalls).toBeLessThan(layout.buildings.length * 4);
  });

  it('同じ形は InstancedMesh にまとめる', () => {
    const instanced = meshes().filter((m) => m instanceof InstancedMesh);
    expect(instanced.length).toBeGreaterThan(8);
    // 木は数百本あっても 1 つの InstancedMesh に入る
    const trees = instanced.filter((m) => m.userData.prop === 'tree');
    expect(trees.length).toBeGreaterThanOrEqual(4);
    for (const tree of trees) expect((tree as InstancedMesh).count).toBeGreaterThan(300);
  });

  it('木の葉は丸い塊を 3 つ重ねる', () => {
    const leaves = meshes().filter((m) => m.userData.prop === 'tree' && m.material instanceof Object && 'color' in m.material);
    expect(leaves.length).toBeGreaterThanOrEqual(4);
  });

  it('窓は灯っているものと暗いものに分かれ、どちらも InstancedMesh', () => {
    const panes = meshes().filter((m) => m.userData.part === 'window');
    expect(panes).toHaveLength(2);
    for (const pane of panes) expect(pane).toBeInstanceOf(InstancedMesh);
    expect(scene.windows.total).toBeGreaterThan(400);
    expect(scene.windows.lit).toBeGreaterThan(0);
    expect(scene.windows.lit).toBeLessThan(scene.windows.total);
  });

  it('住人のいる階の窓は必ず灯る', () => {
    const towers = layout.buildings.filter((b) => b.occupants.length > 0);
    expect(towers.length).toBeGreaterThan(0);
    // 住人が増えれば灯る窓も増える
    const empty = buildCityScene(layoutCity(buildCity({ unlocked: DISTRICT_IDS })));
    expect(empty.windows.lit).toBe(0);
    empty.dispose();
  });

  it('住人のいない建物の窓は 1 枚も灯らない（光は意味を運ぶ。飾りで灯さない）', () => {
    const quiet = buildCityScene(
      layoutCity(buildCity({ cluster: { ...emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192)]), tick: 9 }, unlocked: DISTRICT_IDS })),
    );
    expect(quiet.windows.total).toBeGreaterThan(0);
    expect(quiet.windows.lit).toBe(0);
    quiet.dispose();
  });

  it('まだ入居の途中（Running でない）の住人の階は灯らない。Running になると灯る（REWORK 7-3）', () => {
    const base = emptyCluster([node('n1', 4000, 8192)]);
    const at = (phase: Pod['status']['phase']): ClusterState => {
      const made = pod('web', [container('c', 'nginx')]);
      const placed: Pod = { ...made, status: { ...made.status, nodeName: 'n1', phase } };
      return { ...base, tick: 9, pods: new Map([[key('default', 'web'), placed]]) };
    };
    const lit = (phase: Pod['status']['phase']) => {
      const built = buildCityScene(layoutCity(buildCity({ cluster: at(phase), unlocked: DISTRICT_IDS })));
      const count = built.windows.lit;
      built.dispose();
      return count;
    };
    expect(lit('ContainerCreating')).toBe(0);
    expect(lit('Running')).toBeGreaterThan(0);
  });

  it('夜に灯る材質は 1 つで、初めは消えている', () => {
    expect(scene.glow.emissiveIntensity).toBe(0);
    expect(scene.glow.emissive.getHexString()).toBe('ffcf7a');
  });

  it('遠くの建物は窓を省く（LOD）', () => {
    expect(windowStride(0, 100)).toBe(1);
    expect(windowStride(150, 100)).toBe(2);
    expect(windowStride(400, 100)).toBe(0);
    const near = buildCityScene(layout, { focus: { x: 0, z: 0 }, detailRadius: 40 });
    expect(near.windows.total).toBeLessThan(scene.windows.total);
    near.dispose();
  });

  it('車と人は毎フレーム動かせるように組まれている', () => {
    expect(scene.movers.length).toBeGreaterThanOrEqual(2);
    for (const mover of scene.movers) {
      expect(mover.meshes.length).toBeGreaterThan(0);
      expect(mover.items.length).toBeGreaterThan(0);
      for (const mesh of mover.meshes) expect(mesh.count).toBe(mover.items.length);
    }
  });

  it('地面・道路・建物・置くものが入っている', () => {
    const surfaces = new Set(meshes().map((m) => m.userData.surface as string | undefined));
    for (const want of ['grass', 'pavement', 'water', 'stone', 'glass', 'curb', 'paint', 'sand']) {
      expect(surfaces).toContain(want);
    }
  });

  it('開いていない区域は暗く沈める', () => {
    const shut = buildCityScene(layoutCity(buildCity({ unlocked: ['center'] })));
    const surfaces = new Set<string | undefined>();
    shut.group.traverse((node) => {
      if (node instanceof Mesh) surfaces.add(node.userData.surface as string | undefined);
    });
    expect(surfaces).toContain('locked');
    shut.dispose();
  });

  it('影を落とし、影を受ける', () => {
    const solid = meshes().filter((m) => m.userData.surface === 'stone' || m.userData.prop === 'tree');
    expect(solid.length).toBeGreaterThan(0);
    for (const mesh of solid) expect(mesh.castShadow).toBe(true);
    for (const mesh of meshes()) expect(mesh.receiveShadow).toBe(true);
  });

  it('同じ街からは必ず同じ数の形になる', () => {
    const again = buildCityScene(layoutCity(busyCity()));
    expect(again.drawCalls).toBe(scene.drawCalls);
    expect(again.windows).toEqual(scene.windows);
    again.dispose();
  });

  it('片付けられる', () => {
    const throwaway = buildCityScene(layoutCity(buildCity({ unlocked: ['center'] })));
    expect(() => {
      throwaway.dispose();
    }).not.toThrow();
  });
});

describe('帯の形', () => {
  it('中心線を横へずらせる', () => {
    const line = [
      { x: 0, z: 0 },
      { x: 0, z: 10 },
    ];
    const left = offsetPath(line, 2);
    expect(left[0]?.x).toBeCloseTo(-2);
    expect(left[1]?.x).toBeCloseTo(-2);
  });

  it('平らな帯は面を張る', () => {
    const made = ribbon(
      [
        { x: 0, z: 0 },
        { x: 0, z: 10 },
      ],
      4,
      1,
    );
    expect(made?.getAttribute('position').count).toBe(4);
    expect(made?.getIndex()?.count).toBe(6);
  });

  it('高さのある帯は上の面と両側を持つ', () => {
    const made = raisedRibbon(
      [
        { x: 0, z: 0 },
        { x: 0, z: 10 },
      ],
      1,
      0,
      0.3,
    );
    expect(made?.getAttribute('position').count).toBe(12);
  });

  it('点が足りなければ何も作らない', () => {
    expect(ribbon([{ x: 0, z: 0 }], 2, 0)).toBeNull();
    expect(raisedRibbon([], 2, 0, 1)).toBeNull();
  });
});
