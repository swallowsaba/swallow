import { describe, expect, it } from 'vitest';
import { advanceCluster } from '@/engines/k8s/controllers';
import { container, deployment, emptyCluster, node, pod, service } from '@/engines/k8s/factory';
import { tickPods } from '@/engines/k8s/kubelet';
import type { ClusterState } from '@/engines/k8s/types';
import { createRepo, openPull, setChecks } from '@/engines/github/pr';
import { createVfs } from '@/engines/kernel/vfs';
import type { FileSpot, PlacedCommit } from '../gitModel';
import { layoutTown, nearestHouse, pathToHere, walkRoute } from './fsTown';
import { layoutGuild } from './ghGuild';
import { BUILDING_W, layoutRailway, trackPath } from './gitRailway';
import { layoutRanch, waitingPods } from './k8sRanch';
import * as sprites from './sprites';
import { pixelRuns, type PixelMap } from './sprites';
import { cellNoise, decorations } from './terrain';

const inside = (p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }) =>
  p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h;

describe('ドット絵', () => {
  it('同じ色が横に続くところは1枚にまとめる。透明は描かない', () => {
    expect(pixelRuns(['aab.', '.bbb'], { a: '#a', b: '#b' })).toEqual([
      { x: 0, y: 0, w: 2, color: '#a' },
      { x: 2, y: 0, w: 1, color: '#b' },
      { x: 1, y: 1, w: 3, color: '#b' },
    ]);
  });

  it('どの絵も、行の幅がそろっている（崩れた絵を出さない）', () => {
    const maps = Object.entries(sprites).filter(
      (entry): entry is [string, PixelMap] => Array.isArray(entry[1]) && entry[1].every((row) => typeof row === 'string'),
    );
    expect(maps.length).toBeGreaterThan(8);
    for (const [name, map] of maps) {
      const widths = new Set(map.map((row) => row.length));
      expect(widths.size, `${name} の行の幅がそろっていません`).toBe(1);
    }
  });
});

describe('景色の飾り', () => {
  it('同じ場所には、何度描いても同じ飾りが出る', () => {
    expect(cellNoise(3, 7)).toBe(cellNoise(3, 7));
    expect(cellNoise(3, 7)).toBeGreaterThanOrEqual(0);
    expect(cellNoise(3, 7)).toBeLessThan(1);
    expect(decorations(600, 400, [])).toEqual(decorations(600, 400, []));
  });

  it('建物や道の上には飾りを置かない', () => {
    const building = { x: 100, y: 100, w: 300, h: 200 };
    const decos = decorations(800, 600, [building]);
    expect(decos.length).toBeGreaterThan(0);
    for (const d of decos) expect(inside({ x: d.x + 24, y: d.y + 24 }, building)).toBe(false);
  });
});

describe('ファイルの街', () => {
  const vfs = createVfs({
    '/home/learner': null,
    '/home/learner/notes.txt': 'a\n',
    '/home/learner/work': null,
    '/etc/hosts': '127.0.0.1 localhost\n',
  });

  it('子の家は親の家より右の列に建ち、ファイルは家の前に木箱として並ぶ', () => {
    const town = layoutTown(vfs);
    const home = town.byPath.get('/home');
    const learner = town.byPath.get('/home/learner');
    expect(home && learner && learner.box.x > home.box.x).toBe(true);
    expect(learner?.files.map((f) => f.name)).toEqual(['notes.txt']);
    expect(learner?.files[0]?.y).toBeGreaterThan(learner?.roadY ?? Infinity);
  });

  it('親の家から子の家へ道が通る', () => {
    const town = layoutTown(vfs);
    const link = town.roads.find((r) => r.kind === 'link' && r.id === '/home/learner/work');
    const learner = town.byPath.get('/home/learner');
    const work = town.byPath.get('/home/learner/work');
    expect(link?.points[0]).toEqual(learner?.exit);
    expect(link?.points[link.points.length - 1]).toEqual(work?.entrance);
  });

  it('となりの枝へ移るときは、共通の親の家の前を通る', () => {
    const town = layoutTown(vfs);
    const route = walkRoute(town, '/etc', '/home/learner');
    const root = town.byPath.get('/');
    expect(route[0]).toEqual(town.byPath.get('/etc')?.door);
    expect(route).toContainEqual(root?.door);
    expect(route[route.length - 1]).toEqual(town.byPath.get('/home/learner')?.door);
  });

  it('同じ家なら歩かない。消えた家にいたら、残っている祖先の家に立つ', () => {
    const town = layoutTown(vfs);
    expect(walkRoute(town, '/home', '/home')).toHaveLength(1);
    expect(nearestHouse(town, '/home/learner/gone')?.path).toBe('/home/learner');
    expect([...pathToHere(town, '/home/learner')]).toEqual(['/', '/home', '/home/learner']);
  });
});

describe('記録の鉄道', () => {
  const spot = (path: string, lane: FileSpot['lane']): FileSpot => ({ path, lane, note: 'new', alsoChanged: false });
  const commit = (hash: string, row: number, col: number): PlacedCommit => ({ hash, message: hash, parents: [], row, col, ghost: false });

  it('木箱は、いちばん新しい中身がある建物の前に置かれる', () => {
    const rail = layoutRailway([spot('a.txt', 'worktree'), spot('b.txt', 'index')], [], 1, false);
    const building = (lane: string) => rail.buildings.find((b) => b.lane === lane)?.box;
    const crate = (path: string) => rail.crates.find((c) => c.spot.path === path);
    const work = building('worktree');
    const cart = building('index');
    expect(crate('a.txt')?.x).toBeGreaterThanOrEqual(work?.x ?? Infinity);
    expect(crate('a.txt')?.x).toBeLessThan((work?.x ?? 0) + BUILDING_W);
    expect(crate('b.txt')?.x).toBeGreaterThanOrEqual(cart?.x ?? Infinity);
  });

  it('分かれた線路の駅は横にずれ、新しい駅ほど上にある', () => {
    const commits = [commit('c2', 0, 1), commit('c1', 1, 0)];
    const rail = layoutRailway([], commits, 2, false);
    const [top, bottom] = commits.map((c) => rail.station(c));
    expect(top && bottom && top.x > bottom.x).toBe(true);
    expect(top && bottom && top.y < bottom.y).toBe(true);
    expect(rail.station(commits[0] ?? commit('x', 0, 0)).y).toBeGreaterThan(rail.buildings[0]?.box.y ?? Infinity);
    expect(rail.labelX).toBeGreaterThan(top?.x ?? Infinity);
  });

  it('同じ列の線路はまっすぐ、列が変わる線路は曲がる', () => {
    expect(trackPath({ x: 10, y: 0 }, { x: 10, y: 50 })).toContain('L');
    expect(trackPath({ x: 10, y: 0 }, { x: 70, y: 50 })).toContain('C');
  });
});

describe('クラスタ牧場', () => {
  function ranchState(): ClusterState {
    let state: ClusterState = {
      ...emptyCluster([node('node-1', 4000, 8192), node('node-2', 4000, 8192)]),
      deployments: new Map([['default/web', deployment('web', 2, [container('web', 'nginx')])]]),
      services: new Map([['default/web', service('web', { app: 'web' })]]),
    };
    for (let i = 0; i < 10; i += 1) state = advanceCluster(state, tickPods);
    const huge = pod('huge', [container('huge', 'x', { requests: { cpu: 99999, memory: 1 } })]);
    return { ...state, pods: new Map([...state.pods, ['default/huge', huge]]) };
  }

  it('置き場所の決まったスライムは、自分のノードの土地の中にいる', () => {
    const state = ranchState();
    const ranch = layoutRanch(state);
    const placed = [...state.pods.values()].filter((p) => p.status.nodeName !== null);
    expect(placed.length).toBeGreaterThan(0);
    for (const p of placed) {
      const field = ranch.fields.find((f) => f.node === p.status.nodeName)?.box;
      const at = ranch.pods.get(p.metadata.name);
      expect(field && at && inside(at, field)).toBe(true);
    }
  });

  it('置き場所の決まっていないスライムは、城の横の待ち場にいる', () => {
    const state = ranchState();
    const ranch = layoutRanch(state);
    expect(waitingPods(state).map((p) => p.metadata.name)).toEqual(['huge']);
    const at = ranch.pods.get('huge');
    expect(at && inside(at, ranch.pen)).toBe(true);
  });

  it('係は命令が伝わる順に城の中に並び、窓口は土地の右に立つ', () => {
    const ranch = layoutRanch(ranchState());
    expect(ranch.booths.map((b) => b.component)).toEqual(['apiserver', 'etcd', 'controller', 'scheduler']);
    for (const booth of ranch.booths) expect(inside(booth.box, ranch.castle)).toBe(true);
    const rightmost = Math.max(...ranch.fields.map((f) => f.box.x + f.box.w));
    expect(ranch.services[0]?.box.x).toBeGreaterThan(rightmost);
  });
});

describe('チーム本部', () => {
  it('提案の窓口は 作成 → レビュー → チェック → マージ の順に左から並ぶ', () => {
    const repo = openPull(createRepo('acme', 'app'), { title: 'feat', head: 'feature' }).repo;
    const quest = layoutGuild(repo).quests[0];
    expect(quest?.stages.map((s) => s.stage.id)).toEqual(['created', 'review', 'checks', 'merge']);
    const xs = quest?.stages.map((s) => s.box.x) ?? [];
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(quest?.dungeonY).toBeNull();
  });

  it('チェックがあれば、関所の下に検査ラインができる', () => {
    const opened = openPull(createRepo('acme', 'app'), { title: 'feat', head: 'feature' }).repo;
    const repo = setChecks(opened, 1, [
      { name: 'build', status: 'failure', needs: [], logs: [] },
      { name: 'test', status: 'skipped', needs: ['build'], logs: [] },
    ]);
    const quest = layoutGuild(repo).quests[0];
    const stageBottom = Math.max(...(quest?.stages.map((s) => s.box.y + s.box.h) ?? [0]));
    expect(quest?.rooms).toHaveLength(2);
    for (const room of quest?.rooms ?? []) expect(room.box.y).toBeGreaterThan(stageBottom);
    expect(quest?.rooms.find((r) => r.check.name === 'test')?.blocked).toBe(true);
  });
});
