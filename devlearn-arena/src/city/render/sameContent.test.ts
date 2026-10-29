import { describe, expect, it } from 'vitest';
import type { Road, Zone } from '../types';
import { sameRoads, sameZones } from './sameContent';

/**
 * 模擬（Worker）から毎日届く都市は、中身が同じでも新しい配列（構造化複製の写し）。
 * 描き方は、道路の網・地面の塗り直しを、中身が変わった時だけにする（3 倍の速さで毎日作り直すと、重い都市で fps が落ちる）
 */
describe('道路と区画が変わったかの見分け', () => {
  const roads: Road[] = [{ id: 'r1', kind: 'street', path: [{ x: 1.5, y: 2.5 }, { x: 9.5, y: 2.5 }] }];
  const zones: Zone[] = [{ id: 'z1', kind: 'residential', cells: [{ x: 1, y: 3 }, { x: 2, y: 3 }] }];

  it('Worker から届いた写し（同じ中身の新しい配列）は、変わっていないと見る', () => {
    expect(sameRoads(roads, structuredClone(roads))).toBe(true);
    expect(sameZones(zones, structuredClone(zones))).toBe(true);
  });

  it('道路を足す・道筋が動く・種類が変わると、変わったと見る', () => {
    expect(sameRoads(roads, [...roads, { id: 'r2', kind: 'lane', path: [{ x: 1.5, y: 2.5 }, { x: 1.5, y: 9.5 }] }])).toBe(false);
    expect(sameRoads(roads, [{ ...roads[0] as Road, path: [{ x: 1.5, y: 2.5 }, { x: 10.5, y: 2.5 }] }])).toBe(false);
    expect(sameRoads(roads, [{ ...roads[0] as Road, kind: 'avenue' }])).toBe(false);
  });

  it('区画を塗り足す・譲歩の性質が付くと、変わったと見る', () => {
    expect(sameZones(zones, [{ ...zones[0] as Zone, cells: [...(zones[0] as Zone).cells, { x: 3, y: 3 }] }])).toBe(false);
    expect(sameZones(zones, [{ ...zones[0] as Zone, mods: { height: 0.8 } }])).toBe(false);
  });
});
