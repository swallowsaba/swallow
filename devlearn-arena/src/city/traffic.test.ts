import { describe, expect, it } from 'vitest';
import { newCity } from './newCity';
import { agentCounts, agentPose, agentsOf, roadNetwork, routeOf } from './traffic';
import { distanceToPolyline } from './terrain';
import type { City, Road } from './types';

const roads: Road[] = [
  { id: 'r1', kind: 'street', path: [{ x: 37.5, y: 47.5 }, { x: 58.5, y: 47.5 }] },
  { id: 'r2', kind: 'street', path: [{ x: 47.5, y: 37.5 }, { x: 47.5, y: 58.5 }] },
  { id: 'r3', kind: 'lane', path: [{ x: 40.5, y: 41.5 }, { x: 40.5, y: 46.5 }] },
];
const city: City = { ...newCity(), roads, population: 400, facilities: [] };
const net = roadNetwork(roads);

describe('車と人の動き', () => {
  it('交わる所と丁字路を、道路の網として見つける', () => {
    const [a, b, c] = net.lanes;
    expect(a?.joints.some((j) => j.to === 1 && Math.abs(j.s - 10) < 0.3)).toBe(true);
    expect(b?.joints.some((j) => j.to === 0)).toBe(true);
    // 細い道の端（y=46.5）は一般道（y=47.5）に丁字でつながる
    expect(c?.joints.some((j) => j.to === 0 && j.s > 4)).toBe(true);
  });

  it('道のりは、交わる所で別の道路へ曲がることがある', () => {
    const used = new Set<number>();
    for (let seed = 1; seed < 20; seed += 1) for (const leg of routeOf(net, seed)?.legs ?? []) used.add(leg.lane);
    expect(used.size).toBe(3);
  });

  it('車はいつも道路の上（左の車線）にいる', () => {
    for (const agent of agentsOf(city, net).filter((a) => a.kind === 'car')) {
      for (let t = 0; t < 120; t += 7.3) {
        const p = agentPose(net, agent, t);
        const d = Math.min(...roads.map((r) => distanceToPolyline(p, r.path).dist));
        expect(d).toBeLessThan(0.5);
      }
    }
  });

  it('同じ時刻なら同じ位置。時刻が進むと動く', () => {
    const [agent] = agentsOf(city, net);
    if (!agent) throw new Error('車が無い');
    expect(agentPose(net, agent, 12)).toEqual(agentPose(net, agent, 12));
    const a = agentPose(net, agent, 12);
    const b = agentPose(net, agent, 14);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(0.5);
  });

  it('左側を走る（右へ進む車は、道路の中心線より上（-y）にいる）', () => {
    const one = roadNetwork([roads[0] as Road]);
    const route = { legs: [{ lane: 0, s0: 0, s1: 21 }], ends: [21], length: 21 };
    const pose = agentPose(one, { kind: 'car', variant: 0, route, speed: 1, offset: 0, side: 0.4 }, 5);
    expect(pose.dx).toBeCloseTo(1);
    expect(pose.y).toBeLessThan(47.5);
  });

  it('数は都市規模に応じて増える', () => {
    const small = agentCounts({ ...city, population: 50 });
    const big = agentCounts({ ...city, population: 2000 });
    expect(big.cars).toBeGreaterThan(small.cars);
    expect(big.people).toBeGreaterThan(small.people);
    expect(agentCounts({ ...city, roads: [] })).toEqual({ cars: 0, people: 0 });
  });
});
