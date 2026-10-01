import { city, domain, hud, mix, rgbaOf, shade } from '@/ui/tokens';
import { hash01 } from '../random';
import type { ZoneKind } from '../types';
import type { Model, Part, Poly } from './mesh';
import {
  box, boxShapes, broadleafTree, door, fence, gableRoof, hedge, hipRoof, pad, parapet, part, rod, rooftopUnit, signBoard, windows,
} from './shapes';

/**
 * 区画の建物の手続き的な生成（docs/city-design.md 3 章・7 章、docs/visual-design.md 5 章）。
 * 1 区画 = 1 マス。正面（入口）は +y を向くように作る。置く時に道路の向きへ回す。
 * 同じ seed からは同じ建物になる。
 */

const NAVY = rgbaOf(hud.bg, 1);
const WALLS = [city.wallStone, mix(city.wallStone, city.sand, 0.55), mix(city.wallStone, city.lineWhite, 0.6), mix(city.wallStone, city.roofTile, 0.18)];
const ROOFS = [city.roofTile, mix(city.curb, NAVY, 0.35), mix(city.roofTile, city.sand, 0.3), mix(city.tree1, city.curb, 0.5)];
const AWNINGS = [domain.sec, domain.ctr, domain.cicd, domain.git, domain.devops];

const pick = <T,>(items: readonly T[], r: number): T => items[Math.floor(r * items.length) % items.length] as T;

export function zoneBuildingModel(kind: ZoneKind, level: number, seed: number): Model {
  const r = (k: number, a = 0, b = 0): number => hash01(seed, k, a, b);
  if (kind === 'residential') return level >= 2 ? apartment(r) : house(r);
  if (kind === 'commercial') return shop(r, level);
  return office(r, level);
}

type Rand = (k: number, a?: number, b?: number) => number;

/** 敷地の芝と、前の歩道へつながる舗装 */
function lotGround(r: Rand, path: { x0: number; x1: number }, paving: string): Poly[] {
  const grass = mix(city.grass, city.tree3, 0.25 + r(90) * 0.2);
  return [
    pad(0.02, 0.02, 0.98, 0.98, grass),
    pad(path.x0, 0.55, path.x1, 0.98, paving),
  ];
}

/* ---------- 戸建て ---------- */

function house(r: Rand): Model {
  const wall = pick(WALLS, r(1));
  const roof = pick(ROOFS, r(2));
  const floors = r(3) < 0.55 ? 2 : 1;
  const fh = 0.27;
  const b = { x0: 0.2 + r(4) * 0.06, y0: 0.14, x1: 0.76 + r(5) * 0.06, y1: 0.56 + r(6) * 0.04 };
  const h = floors * fh + 0.04;
  const parts: Part[] = [];
  const noise = (a: number, c: number, d: number): number => r(10 + a, c, d);
  const frame = shade(wall, 0.55);

  // 土台と壁
  parts.push(box({ ...b, z0: 0, z1: 0.04, wall: shade(wall, 0.7) }));
  parts.push(box({ ...b, z0: 0.04, z1: h, wall }, windows(b, {
    floor: fh, floors, base: 0.04, width: 0.1, pitch: 0.2, height: 0.5, litRatio: 0.4, noise, frame,
    skip: [{ side: '+y', u0: 0.06, u1: 0.22, floor: 0 }],
  })));
  // 屋根: 切妻か寄棟
  if (r(7) < 0.6) {
    parts.push(gableRoof({ ...b, z: h, rise: 0.17, ridge: b.x1 - b.x0 >= b.y1 - b.y0 ? 'x' : 'y', roof, wall, eave: 0.06 }));
  } else {
    parts.push(hipRoof(b.x0, b.y0, b.x1, b.y1, h, 0.16, roof, 0.06));
  }
  // 入口（扉と庇）
  parts.push(...door(b, '+y', 0.08, 0.1, 0.2, shade(city.roofTile, 0.55), shade(roof, 0.9)));
  // 煙突
  const cx = b.x0 + 0.08 + r(8) * 0.15;
  parts.push(box({ x0: cx, y0: b.y0 + 0.08, z0: h + 0.04, x1: cx + 0.06, y1: b.y0 + 0.14, z1: h + 0.24, wall: shade(wall, 0.85), top: shade(city.curb, 0.6) }));
  // 室外機（横の壁際）
  parts.push(rooftopUnit(b.x1 + 0.01, b.y0 + 0.12, 0, 0.7));
  // 生け垣と門柱
  parts.push(hedge(0.06, 0.88, 0.36, 0.95));
  parts.push(hedge(0.62, 0.88, 0.94, 0.95));
  parts.push(box({ x0: 0.36, y0: 0.88, z0: 0, x1: 0.4, y1: 0.95, z1: 0.12, wall: shade(wall, 0.8) }));
  // 庭の木
  if (r(9) < 0.75) parts.push(broadleafTree(0.84, 0.3 + r(11) * 0.4, 0.7, Math.floor(r(12) * 3)));

  return {
    w: 1,
    d: 1,
    ground: [...lotGround(r, { x0: 0.38, x1: 0.62 }, mix(city.paving, city.sand, 0.4))],
    parts,
    shadowHeight: h + 0.1,
  };
}

/* ---------- 低層の集合住宅 ---------- */

function apartment(r: Rand): Model {
  const wall = pick(WALLS, r(1));
  const floors = 3;
  const fh = 0.25;
  const b = { x0: 0.14, y0: 0.12, x1: 0.86, y1: 0.6 };
  const h = floors * fh + 0.05;
  const noise = (a: number, c: number, d: number): number => r(20 + a, c, d);
  const parts: Part[] = [];
  parts.push(box({ ...b, z0: 0, z1: h, wall, top: mix(city.paving, city.lineWhite, 0.2) }, windows(b, {
    floor: fh, floors, base: 0.04, width: 0.1, pitch: 0.18, height: 0.55, litRatio: 0.4, noise, frame: shade(wall, 0.55),
    skip: [{ side: '+y', u0: 0.28, u1: 0.44, floor: 0 }],
  })));
  parts.push(...parapet(b.x0, b.y0, b.x1, b.y1, h, 0.05, shade(wall, 0.9)));
  // 正面のバルコニー（各階の板と手すり）
  for (let f = 1; f < floors; f += 1) {
    const z = 0.04 + f * fh;
    parts.push(box({ x0: b.x0 + 0.04, y0: b.y1, z0: z - 0.02, x1: b.x1 - 0.04, y1: b.y1 + 0.08, z1: z, wall: mix(wall, city.lineWhite, 0.3) }));
    parts.push(rod([b.x1 - 0.05, b.y1 + 0.075, z + 0.08], [b.x0 + 0.05, b.y1 + 0.075, z + 0.08], 0.012, shade(city.curb, 0.8)));
  }
  parts.push(...door(b, '+y', 0.3, 0.12, 0.2, shade(city.roofTile, 0.5), shade(wall, 0.7)));
  parts.push(rooftopUnit(b.x0 + 0.1, b.y0 + 0.08, h, 0.9));
  parts.push(rooftopUnit(b.x0 + 0.35, b.y0 + 0.1, h, 0.9));
  parts.push(hedge(0.06, 0.9, 0.34, 0.96));
  parts.push(hedge(0.66, 0.9, 0.94, 0.96));
  parts.push(broadleafTree(0.88, 0.8, 0.6, Math.floor(r(5) * 3)));
  return {
    w: 1,
    d: 1,
    ground: lotGround(r, { x0: 0.36, x1: 0.64 }, mix(city.paving, city.lineWhite, 0.2)),
    parts,
    shadowHeight: h + 0.05,
  };
}

/* ---------- 店 ---------- */

function shop(r: Rand, level: number): Model {
  const wall = pick(WALLS, r(1));
  const floors = level >= 2 || r(3) < 0.4 ? 2 : 1;
  const fh = 0.28;
  const b = { x0: 0.1, y0: 0.1, x1: 0.9, y1: 0.66 };
  const h = floors * fh + 0.04;
  const noise = (a: number, c: number, d: number): number => r(30 + a, c, d);
  const awning = pick(AWNINGS, r(4));
  const parts: Part[] = [];
  // 1 階は大きなガラスの店先
  const glass: Poly = { kind: 'poly', pts: [[b.x1 - 0.06, b.y1 + 0.006, 0.03], [b.x0 + 0.22, b.y1 + 0.006, 0.03], [b.x0 + 0.22, b.y1 + 0.006, 0.22], [b.x1 - 0.06, b.y1 + 0.006, 0.22]], color: mix(city.wallGlass, city.windowLit, 0.25 + r(5) * 0.4), lit: r(6) < 0.5, layer: 2 };
  parts.push(box({ ...b, z0: 0, z1: h, wall, top: mix(city.paving, city.lineWhite, 0.15) }, [
    glass,
    // 1 階の店先（正面）以外の面と、2 階の全ての面に窓。裏口の側も窓で単調にしない
    ...windows(b, {
      floor: fh, floors, base: 0.04, width: 0.12, pitch: 0.24, height: 0.48, litRatio: 0.45, noise, frame: shade(wall, 0.55),
      skip: [{ side: '+y', u0: 0, u1: 1, floor: 0 }, { side: '-y', u0: 0.5, u1: 0.72, floor: 0 }],
    }),
  ]));
  parts.push(...door(b, '+y', 0.06, 0.12, 0.21, shade(city.roofTile, 0.45), shade(wall, 0.75)));
  parts.push(...door(b, '-y', 0.52, 0.12, 0.2, shade(city.curb, 0.7), shade(wall, 0.75)));
  parts.push(...parapet(b.x0, b.y0, b.x1, b.y1, h, 0.04, shade(wall, 0.85)));
  // 裏の室外機とごみ置き場
  parts.push(rooftopUnit(b.x0 + 0.1, b.y0 - 0.12, 0, 0.8));
  parts.push(box({ x0: b.x1 - 0.22, y0: b.y0 - 0.1, z0: 0, x1: b.x1 - 0.06, y1: b.y0 - 0.02, z1: 0.08, wall: mix(domain.devops, city.curb, 0.5) }));
  // 日よけ（縞の傾いた板）
  const stripes = 6;
  for (let i = 0; i < stripes; i += 1) {
    const xa = b.x0 + 0.2 + ((b.x1 - b.x0 - 0.22) / stripes) * i;
    const xb = xa + (b.x1 - b.x0 - 0.22) / stripes;
    parts.push(part([{ kind: 'poly', pts: [[xb, b.y1, 0.27], [xa, b.y1, 0.27], [xa, b.y1 + 0.13, 0.21], [xb, b.y1 + 0.13, 0.21]], color: i % 2 ? awning : city.lineWhite, double: true }], [xa, b.y1, 0.2], [xb, b.y1 + 0.13, 0.27]));
  }
  // 看板
  parts.push(signBoard(b, '+y', 0.08, 0.7, h - 0.13, h - 0.03, shade(awning, 0.75)));
  parts.push(rooftopUnit(b.x0 + 0.1, b.y0 + 0.1, h, 1));
  // 店先のベンチと鉢植え
  parts.push(box({ x0: 0.66, y0: 0.82, z0: 0.05, x1: 0.88, y1: 0.88, z1: 0.07, wall: mix(city.roofTile, city.sand, 0.4) }));
  parts.push(box({ x0: 0.68, y0: 0.83, z0: 0, x1: 0.7, y1: 0.87, z1: 0.05, wall: city.curb }));
  parts.push(box({ x0: 0.84, y0: 0.83, z0: 0, x1: 0.86, y1: 0.87, z1: 0.05, wall: city.curb }));
  parts.push(hedge(0.12, 0.84, 0.24, 0.9));
  return {
    w: 1,
    d: 1,
    ground: [pad(0.02, 0.02, 0.98, 0.98, mix(city.paving, city.sand, 0.45)), pad(0.06, 0.7, 0.94, 0.94, mix(city.paving, city.lineWhite, 0.3))],
    parts,
    shadowHeight: h + 0.05,
  };
}

/* ---------- 事務所 ---------- */

function office(r: Rand, level: number): Model {
  const floors = 3 + Math.min(2, level - 1);
  const fh = 0.26;
  const wall = r(1) < 0.5 ? mix(city.wallStone, city.wallGlass, 0.35) : mix(city.wallStone, city.lineWhite, 0.4);
  const b = { x0: 0.16, y0: 0.12, x1: 0.84, y1: 0.66 };
  const h = floors * fh + 0.06;
  const noise = (a: number, c: number, d: number): number => r(40 + a, c, d);
  const parts: Part[] = [];
  parts.push(box({ ...b, z0: 0, z1: h, wall, top: mix(city.paving, city.lineWhite, 0.25) }, windows(b, {
    floor: fh, floors, base: 0.05, width: 0.14, pitch: 0.17, height: 0.62, litRatio: 0.38, noise, glass: mix(city.wallGlass, hud.textSub, 0.3), frame: shade(wall, 0.6),
    skip: [{ side: '+y', u0: 0.22, u1: 0.46, floor: 0 }],
  })));
  // 階の境の帯
  for (let f = 1; f < floors; f += 1) {
    const z = 0.05 + f * fh;
    parts.push(part([
      { kind: 'poly', pts: [[b.x1 + 0.007, b.y0, z - 0.012], [b.x1 + 0.007, b.y1, z - 0.012], [b.x1 + 0.007, b.y1, z + 0.004], [b.x1 + 0.007, b.y0, z + 0.004]], color: shade(wall, 0.85) },
      { kind: 'poly', pts: [[b.x1, b.y1 + 0.007, z - 0.012], [b.x0, b.y1 + 0.007, z - 0.012], [b.x0, b.y1 + 0.007, z + 0.004], [b.x1, b.y1 + 0.007, z + 0.004]], color: shade(wall, 0.85) },
    ], [b.x0, b.y0, z - 0.012], [b.x1 + 0.007, b.y1 + 0.007, z + 0.004]));
  }
  parts.push(...door(b, '+y', 0.24, 0.2, 0.22, shade(NAVY, 1), mix(city.wallStone, city.curb, 0.5)));
  parts.push(...parapet(b.x0, b.y0, b.x1, b.y1, h, 0.05, shade(wall, 0.85)));
  parts.push(rooftopUnit(b.x0 + 0.08, b.y0 + 0.08, h, 1.1));
  parts.push(rooftopUnit(b.x0 + 0.32, b.y0 + 0.08, h, 1.1));
  // 屋上の階段室とアンテナ
  parts.push(box({ x0: b.x1 - 0.22, y0: b.y0 + 0.08, z0: h, x1: b.x1 - 0.08, y1: b.y0 + 0.24, z1: h + 0.12, wall: shade(wall, 0.92) }));
  parts.push(rod([b.x1 - 0.15, b.y0 + 0.16, h + 0.12], [b.x1 - 0.15, b.y0 + 0.16, h + 0.42], 0.012, city.curb));
  // 前庭の植え込みと社名の看板
  parts.push(hedge(0.08, 0.76, 0.34, 0.82));
  parts.push(hedge(0.66, 0.76, 0.92, 0.82));
  parts.push(box({ x0: 0.08, y0: 0.86, z0: 0, x1: 0.3, y1: 0.9, z1: 0.1, wall: shade(city.curb, 0.9), top: mix(domain.net, city.lineWhite, 0.3) }));
  parts.push(broadleafTree(0.9, 0.25, 0.6, Math.floor(r(5) * 3)));
  return {
    w: 1,
    d: 1,
    ground: [pad(0.02, 0.02, 0.98, 0.98, mix(city.paving, city.lineWhite, 0.25)), pad(0.36, 0.66, 0.64, 0.98, mix(city.paving, city.sand, 0.3))],
    parts,
    shadowHeight: h,
  };
}

/** 柵で囲った敷地（施設で使う） */
export function fencedLot(w: number, d: number, color: string, gate: { from: number; to: number }): Part[] {
  const out: Part[] = [];
  out.push(...fence([0.05, 0.05], [w - 0.05, 0.05], 0.12, color));
  out.push(...fence([w - 0.05, 0.05], [w - 0.05, d - 0.05], 0.12, color));
  out.push(...fence([0.05, 0.05], [0.05, d - 0.05], 0.12, color));
  out.push(...fence([0.05, d - 0.05], [gate.from, d - 0.05], 0.12, color));
  out.push(...fence([gate.to, d - 0.05], [w - 0.05, d - 0.05], 0.12, color));
  return out;
}

export { boxShapes };
