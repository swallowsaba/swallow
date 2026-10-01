import { START_AREA } from './terrain';
import type { Building, City, Facility, Point, Road, Zone, ZoneKind } from './types';

/**
 * 見本の街（docs/development-plan.md Phase 1）。
 * 手で置いた道路・区画の建物・施設 3 種（Lv1）。配置の操作は Phase 2 で作る。
 */

const c = (x: number, y: number): Point => ({ x: x + 0.5, y: y + 0.5 });

/** マス (x0,y0) から (x1,y1) までの真っすぐな道 */
function straight(id: string, kind: Road['kind'], x0: number, y0: number, x1: number, y1: number): Road {
  return { id, kind, path: [c(x0, y0), c(x1, y1)] };
}

/** 2 次ベジェ曲線の道（始点・制御点・終点。docs/city-design.md 2 章） */
export function curve(id: string, kind: Road['kind'], p0: Point, ctrl: Point, p1: Point, steps = 16): Road {
  const path: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    path.push({ x: u * u * p0.x + 2 * u * t * ctrl.x + t * t * p1.x, y: u * u * p0.y + 2 * u * t * ctrl.y + t * t * p1.y });
  }
  return { id, kind, path };
}

function row(kind: ZoneKind, id: string, cells: [number, number][]): Zone {
  return { id, kind, cells: cells.map(([x, y]) => ({ x, y })) };
}

function span(axis: 'x' | 'y', fixed: number, from: number, to: number): [number, number][] {
  const out: [number, number][] = [];
  for (let v = from; v <= to; v += 1) out.push(axis === 'x' ? [v, fixed] : [fixed, v]);
  return out;
}

export function sampleCity(seed = 20261002): City {
  const roads: Road[] = [
    straight('r-main', 'street', 36, 47, 59, 47),
    straight('r-cross', 'street', 47, 37, 47, 59),
    straight('r-north', 'lane', 40, 41, 46, 41),
    straight('r-south', 'lane', 40, 53, 46, 53),
    straight('r-east', 'lane', 53, 48, 53, 57),
    curve('r-bend', 'lane', c(55, 47), c(59, 47), c(59, 41)),
  ];

  const zones: Zone[] = [
    row('residential', 'z-north-a', span('x', 40, 40, 46)),
    row('residential', 'z-north-b', span('x', 42, 41, 46)),
    row('residential', 'z-west', [...span('y', 46, 37, 39), ...span('y', 48, 37, 42)]),
    row('commercial', 'z-main-n', span('x', 46, 37, 46)),
    row('commercial', 'z-main-s', [...span('x', 48, 37, 46)]),
    row('office', 'z-office', span('x', 48, 48, 52)),
    row('residential', 'z-south-a', span('x', 52, 41, 46)),
    row('residential', 'z-south-b', span('x', 54, 41, 46)),
    row('residential', 'z-east', [...span('y', 52, 49, 57), ...span('y', 54, 50, 57)]),
    row('commercial', 'z-cross-s', [...span('y', 46, 49, 51), ...span('y', 48, 49, 51)]),
  ];

  const buildings: Building[] = [];
  for (const zone of zones) {
    zone.cells.forEach((cell, i) => {
      // 村の段階: 住宅は戸建て、ところどころ低層の集合住宅
      const level = zone.kind === 'residential' && (cell.x * 7 + cell.y * 3) % 11 === 0 ? 2 : 1;
      buildings.push({ id: `b-${zone.id}-${String(i)}`, zoneId: zone.id, cell, variant: `${zone.kind}:${String(i)}`, level, builtDay: 0 });
    });
  }

  const facilities: Facility[] = [
    { id: 'f-academy', type: 'academy', domain: 'found', origin: { x: 48, y: 44 }, rotation: 0, level: 1, state: 'active', builtDay: 0 },
    { id: 'f-server', type: 'server', domain: 'linux', origin: { x: 54, y: 48 }, rotation: 180, level: 1, state: 'active', builtDay: 0 },
    { id: 'f-network', type: 'network', domain: 'net', origin: { x: 54, y: 45 }, rotation: 0, level: 1, state: 'active', builtDay: 0 },
  ];

  return {
    seed,
    name: 'みなと市',
    day: 0,
    funds: 0,
    stage: 1,
    population: 0,
    techPower: 3,
    revealed: [{ ...START_AREA }],
    roads,
    zones,
    buildings,
    facilities,
  };
}
