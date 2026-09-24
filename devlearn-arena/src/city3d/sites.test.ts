import { describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { createSession } from '@/engines/kernel/session';
import { layoutCity } from './model';
import { isBuildable } from './terrain';

/**
 * 建てられる区画（REWORK 2-5）。
 * 開始直後の更地でも、ここが光るので、何も無い島を見せるだけにならない。
 */

/** まだ何も学んでいない、始めたばかりの街 */
function fresh() {
  const session = createSession({ files: { '/home/learner': null } });
  return buildCity({ vfs: session.state.vfs, unlocked: ['center'] });
}

describe('更地でも建てられる区画がある', () => {
  it('始めたばかりの街にも区画が立つ', () => {
    const layout = layoutCity(fresh());
    expect(layout.sites.length).toBeGreaterThan(0);
  });

  it('建てられる区画が 1 つ以上ある。光らせるものが無い状態にしない', () => {
    const layout = layoutCity(fresh());
    expect(layout.sites.filter((site) => site.buildable).length).toBeGreaterThan(0);
  });

  it('区画は陸の上にあり、水の上のものは建てられない印が付く', () => {
    const layout = layoutCity(fresh());
    for (const site of layout.sites) {
      if (site.buildable) expect(isBuildable(layout.terrain, site.at), site.id).toBe(true);
    }
  });

  it('区画は開いている区域の中にある', () => {
    const layout = layoutCity(fresh());
    const open = new Set(layout.districts.filter((d) => d.unlocked).map((d) => d.id));
    for (const site of layout.sites) expect(open.has(site.district), site.id).toBe(true);
  });

  it('区域が開くほど、建てられる区画が増える', () => {
    const session = createSession({ files: { '/home/learner': null } });
    const few = layoutCity(buildCity({ vfs: session.state.vfs, unlocked: ['center'] }));
    const many = layoutCity(
      buildCity({ vfs: session.state.vfs, unlocked: ['center', 'kernel', 'git', 'k8s', 'net', 'github'] }),
    );
    expect(many.sites.length).toBeGreaterThan(few.sites.length);
  });

  it('大きさはメートルで持つ。タイルの数ではない', () => {
    const layout = layoutCity(fresh());
    for (const site of layout.sites) {
      expect(site.w).toBeGreaterThan(8);
      expect(site.d).toBeGreaterThan(8);
    }
  });

  it('建物が建った所は区画から消える', () => {
    const session = createSession({
      files: { '/home/learner': null, '/home/learner/a.txt': 'a', '/home/learner/b.txt': 'b' },
    });
    const empty = layoutCity(buildCity({ vfs: createSession({ files: { '/home/learner': null } }).state.vfs, unlocked: ['center', 'kernel'] }));
    const built = layoutCity(buildCity({ vfs: session.state.vfs, unlocked: ['center', 'kernel'] }));
    expect(built.buildings.length).toBeGreaterThan(empty.buildings.length);
    expect(built.sites.length).toBeLessThanOrEqual(empty.sites.length);
  });

  it('同じ街からは必ず同じ区画になる', () => {
    expect(layoutCity(fresh()).sites).toEqual(layoutCity(fresh()).sites);
  });
});
