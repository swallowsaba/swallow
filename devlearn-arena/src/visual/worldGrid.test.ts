import { describe, expect, it } from 'vitest';
import { createVfs, mkdir, writeFile } from '@/engines/kernel/vfs';
import { buildWorld, leftDoor, rightDoor, roomCenter, roomRoute, walkPath } from './worldGrid';

const vfs = createVfs({
  '/home/learner': null,
  '/home/learner/a.txt': 'A',
  '/home/learner/work': null,
  '/etc/hosts': 'x',
});

describe('タイル世界の組み立て', () => {
  it('全ディレクトリが部屋になる', () => {
    const world = buildWorld(vfs);
    expect([...world.byPath.keys()].sort()).toEqual(
      ['/', '/etc', '/home', '/home/learner', '/home/learner/work'].sort(),
    );
  });

  it('深さが横方向に並ぶ', () => {
    const world = buildWorld(vfs);
    const root = world.byPath.get('/');
    const home = world.byPath.get('/home');
    const learner = world.byPath.get('/home/learner');
    expect(root && home && learner).toBeTruthy();
    if (!root || !home || !learner) return;
    expect(home.x).toBeGreaterThan(root.x);
    expect(learner.x).toBeGreaterThan(home.x);
  });

  it('部屋どうしが重ならない', () => {
    const world = buildWorld(vfs);
    for (const a of world.rooms) {
      for (const b of world.rooms) {
        if (a.path === b.path) continue;
        const overlap =
          a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap).toBe(false);
      }
    }
  });

  it('ファイルは部屋の中に置かれる', () => {
    const world = buildWorld(vfs);
    const room = world.byPath.get('/home/learner');
    expect(room).toBeDefined();
    if (!room) return;
    for (const item of room.items) {
      expect(item.x).toBeGreaterThanOrEqual(room.x);
      expect(item.x).toBeLessThan(room.x + room.w);
      expect(item.y).toBeGreaterThanOrEqual(room.y);
      expect(item.y).toBeLessThan(room.y + room.h);
    }
  });

  it('ファイルが増えると部屋が広くなる', () => {
    let many = vfs;
    for (let i = 0; i < 7; i += 1) many = writeFile(many, `/etc/f${String(i)}`, 'x');
    const small = buildWorld(vfs).byPath.get('/etc')?.h ?? 0;
    const big = buildWorld(many).byPath.get('/etc')?.h ?? 0;
    expect(big).toBeGreaterThan(small);
  });

  it('親子は通路でつながる', () => {
    const world = buildWorld(vfs);
    const hall = world.halls.get('/home');
    expect(hall).toBeDefined();
    if (!hall) return;
    const root = world.byPath.get('/');
    const home = world.byPath.get('/home');
    if (!root || !home) return;
    expect(hall[0]).toEqual(rightDoor(root));
    expect(hall[hall.length - 1]).toEqual(leftDoor(home));
  });

  it('通路のマスは隣どうしが連続している', () => {
    const world = buildWorld(vfs);
    for (const cells of world.halls.values()) {
      for (let i = 1; i < cells.length; i += 1) {
        const a = cells[i - 1];
        const b = cells[i];
        if (!a || !b) continue;
        expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1);
      }
    }
  });
});

describe('移動の経路', () => {
  it('子へ下る経路', () => {
    const world = buildWorld(vfs);
    expect(roomRoute(world, '/', '/home/learner')).toEqual(['/', '/home', '/home/learner']);
  });

  it('親へ戻る経路', () => {
    const world = buildWorld(vfs);
    expect(roomRoute(world, '/home/learner', '/home')).toEqual(['/home/learner', '/home']);
  });

  it('別の枝へは共通の親を経由する', () => {
    const world = buildWorld(vfs);
    expect(roomRoute(world, '/etc', '/home/learner')).toEqual(['/etc', '/', '/home', '/home/learner']);
  });

  it('同じ部屋なら移動しない', () => {
    const world = buildWorld(vfs);
    expect(roomRoute(world, '/etc', '/etc')).toEqual(['/etc']);
  });

  it('歩くマスは部屋の中心から始まり中心で終わる', () => {
    const world = buildWorld(vfs);
    const cells = walkPath(world, '/', '/home');
    const start = world.byPath.get('/');
    const goal = world.byPath.get('/home');
    if (!start || !goal) return;
    expect(cells[0]).toEqual(roomCenter(start));
    expect(cells[cells.length - 1]).toEqual(roomCenter(goal));
  });

  it('新しく作った部屋にも経路がある', () => {
    const world = buildWorld(mkdir(vfs, '/home/learner/work/deep'));
    expect(walkPath(world, '/', '/home/learner/work/deep').length).toBeGreaterThan(4);
  });
});
