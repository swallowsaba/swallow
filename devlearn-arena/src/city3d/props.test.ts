import { describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { DISTRICT_IDS } from '@/city/growth';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { emptyCluster, node } from '@/engines/k8s/factory';
import { layoutCity } from './model';
import { isLand } from './terrain';
import { alongPath, bareSpots, buildProps, countProps, pointAt, type PropInput } from './props';

function city() {
  let session: Session = createSession({ files: { '/home/learner': null } });
  for (const line of ['mkdir work', 'echo hi > work/a.txt', 'git init', 'git add work/a.txt']) {
    session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
  }
  return buildCity({
    vfs: session.state.vfs,
    git: session.state.git,
    cluster: { ...emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192)]), tick: 9 },
    unlocked: DISTRICT_IDS,
  });
}

const layout = layoutCity(city());
const input: PropInput = {
  seed: layout.seed,
  terrain: layout.terrain,
  roads: layout.roads,
  buildings: layout.buildings,
};
const props = layout.props;
const counts = countProps(props);

describe('街に置くもの', () => {
  it('木は数百本ある', () => {
    expect(counts.tree).toBeGreaterThan(300);
  });

  it('街灯・生垣・ベンチ・柵・看板がそろっている', () => {
    expect(counts.lamp).toBeGreaterThan(5);
    expect(counts.hedge).toBeGreaterThan(5);
    expect(counts.bench + counts.sign).toBeGreaterThan(3);
    expect(counts.fence).toBeGreaterThan(0);
  });

  it('車と人が道に沿って動く', () => {
    expect(counts.car).toBeGreaterThan(5);
    expect(counts.person).toBeGreaterThan(5);
    for (const item of props.filter((p) => p.kind === 'car' || p.kind === 'person')) {
      expect(item.path?.points.length ?? 0).toBeGreaterThanOrEqual(2);
      expect(Math.abs(item.path?.speed ?? 0)).toBeGreaterThan(0);
      expect(item.path?.start).toBeGreaterThanOrEqual(0);
      expect(item.path?.start).toBeLessThanOrEqual(1);
    }
  });

  it('動かないものは水の上に置かない', () => {
    for (const item of props) {
      if (item.path !== undefined) continue;
      expect({ kind: item.kind, land: isLand(layout.terrain, item.at) }).toEqual({ kind: item.kind, land: true });
    }
  });

  it('建物の足元に置かない（建物にめり込ませない）', () => {
    for (const item of props) {
      if (item.path !== undefined) continue;
      for (const building of layout.buildings) {
        const half = Math.max(building.params.footprint.w, building.params.footprint.d) / 2;
        const inside = Math.abs(item.at.x - building.at.x) < half && Math.abs(item.at.z - building.at.z) < half;
        expect({ kind: item.kind, inside }).toEqual({ kind: item.kind, inside: false });
      }
    }
  });

  it('建物の周りには必ず囲いと木がある', () => {
    for (const building of layout.buildings) {
      const near = props.filter(
        (p) =>
          (p.kind === 'hedge' || p.kind === 'fence' || p.kind === 'tree') &&
          Math.hypot(p.at.x - building.at.x, p.at.z - building.at.z) <
            Math.max(building.params.footprint.w, building.params.footprint.d) / 2 + 10,
      );
      expect({ id: building.id, near: near.length > 0 }).toEqual({ id: building.id, near: true });
    }
  });

  it('地面がむき出しのまま残らない', () => {
    expect(bareSpots(input, props)).toEqual([]);
  });

  it('同じ入力からは必ず同じ並びになる', () => {
    expect(buildProps(input)).toEqual(buildProps(input));
    expect(buildProps({ ...input, seed: 1 })).not.toEqual(buildProps({ ...input, seed: 2 }));
  });

  it('重ねて置かない', () => {
    const seen = new Set<string>();
    for (const item of props) {
      if (item.path !== undefined) continue;
      const key = `${String(Math.round(item.at.x / 4))},${String(Math.round(item.at.z / 4))}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});

describe('道に沿って並べる道具', () => {
  it('等間隔に置ける', () => {
    const line = [
      { x: 0, z: 0 },
      { x: 100, z: 0 },
    ];
    const spots = alongPath(line, 10);
    expect(spots).toHaveLength(10);
    expect(spots[0]?.at.x).toBeCloseTo(5);
    expect(spots[1]?.at.x).toBeCloseTo(15);
  });

  it('経路上の位置から点と向きを取れる', () => {
    const line = [
      { x: 0, z: 0 },
      { x: 0, z: 100 },
    ];
    expect(pointAt(line, 0.5).at.z).toBeCloseTo(50);
    expect(pointAt(line, 0.5).angle).toBeCloseTo(0);
    expect(pointAt(line, 0).at.z).toBeCloseTo(0);
  });
});
