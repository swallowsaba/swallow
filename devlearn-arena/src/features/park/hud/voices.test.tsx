import { beforeAll, describe, expect, it } from 'vitest';
import type { Building, City, Occupant } from '@/city/model';
import { container, emptyCluster, node, pod } from '@/engines/k8s/factory';
import type { ClusterState } from '@/engines/k8s/types';
import { mount } from '@/visual/mountForTest';
import { Voices } from './Voices';
import { voicesOf, VOICE_LIMIT } from './voiceFeed';

/**
 * 住人の声。街の状態から導く。感嘆符も芝居がかった言い回しも使わない。
 */

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function town(buildings: readonly Partial<Building>[]): City {
  return {
    width: 10, height: 10, tiles: [], roads: [], districts: [], plots: [], carts: [], sites: [],
    buildings: buildings.map((b, i) => ({
      id: b.id ?? `b${String(i)}`,
      kind: 'tower',
      x: 0, y: 0, w: 2, h: 2,
      level: 1,
      label: b.label ?? `b${String(i)}`,
      occupants: b.occupants ?? [],
      state: 'normal',
      phase: 'done',
      district: 'center',
    })),
  };
}

const who = (state: Occupant['state'], id: string): Occupant => ({ id, label: id, state });

describe('声を街から拾う', () => {
  it('誰も住んでいなければ、声は無い', () => {
    expect(voicesOf(town([{}]), null)).toEqual([]);
  });

  it('出て行った人の声は流さない', () => {
    expect(voicesOf(town([{ occupants: [who('gone', 'x')] }]), null)).toEqual([]);
  });

  it('困っている声を先に、次に動いている人を出す', () => {
    const city = town([{
      label: 'node-1',
      occupants: [who('settled', 'c'), who('sick', 'a'), who('moving', 'b')],
    }]);
    expect(voicesOf(city, null).map((v) => v.event)).toEqual(['ailing', 'moving', 'running']);
  });

  it('同じ街からは必ず同じ順になる', () => {
    const city = town([
      { label: 'x', occupants: [who('settled', 'b'), who('settled', 'a')] },
      { label: 'y', occupants: [who('settled', 'c')] },
    ]);
    expect(voicesOf(city, null)).toEqual(voicesOf(city, null));
    expect(voicesOf(city, null).map((v) => v.id)).toEqual(['a', 'b', 'c']);
  });

  it('一度に流す数は限る', () => {
    const many = Array.from({ length: 12 }, (_, i) => who('settled', `p${String(i)}`));
    expect(voicesOf(town([{ occupants: many }]), null)).toHaveLength(VOICE_LIMIT);
    expect(voicesOf(town([{ occupants: many }]), null, 2)).toHaveLength(2);
  });

  it('声には住人の名前と建物の名前が入る', () => {
    const city = town([{ label: 'node-2', occupants: [who('settled', 'web-1')] }]);
    expect(voicesOf(city, null)[0]).toMatchObject({ id: 'web-1', who: 'web-1', place: 'node-2' });
  });

  it('起動できない理由がクラスタにあれば添える', () => {
    const one = pod('api-1', [container('app', 'nope:1')]);
    const cluster: ClusterState = {
      ...emptyCluster([node('node-1', 4000, 8192)]),
      pods: new Map([['api-1', { ...one, status: { ...one.status, message: 'ErrImagePull' } }]]),
    };
    const city = town([{ label: 'node-1', occupants: [who('sick', 'api-1')] }]);
    expect(voicesOf(city, cluster)[0]?.reason).toBe('ErrImagePull');
  });

  it('落ち着いている人の声には理由を付けない', () => {
    const city = town([{ occupants: [who('settled', 'x')] }]);
    expect(voicesOf(city, null)[0]?.reason).toBeUndefined();
  });
});

describe('声の並び', () => {
  it('声が無いときは、その旨を出す', () => {
    expect(mount(<Voices voices={[]} />).querySelector('[data-testid="voices"]')?.textContent).toContain(
      'まだ声は届いていません',
    );
  });

  it('住人の名前と、落ち着いた文体のつぶやきを出す', () => {
    const view = mount(
      <Voices voices={[{ id: 'web-1', who: 'web-1', event: 'movedIn', place: 'node-2' }]} />,
    );
    const line = view.querySelector('[data-voice="web-1"]');
    expect(line?.textContent).toContain('web-1');
    expect(line?.textContent).toContain('node-2 に入居しました。');
  });

  it('つぶやきに感嘆符を使わない', () => {
    const view = mount(
      <Voices
        voices={[
          { id: 'a', who: 'a', event: 'ailing', place: 'node-1', reason: 'ErrImagePull' },
          { id: 'b', who: 'b', event: 'moving', place: 'node-2' },
          { id: 'c', who: 'c', event: 'running', place: 'node-2' },
        ]}
      />,
    );
    const text = view.querySelector('[data-testid="voices"]')?.textContent ?? '';
    expect(text).not.toContain(String.fromCodePoint(0xff01));
    expect(text).not.toContain('!');
    expect(text).toContain('ErrImagePull');
  });
});
