import { city, domain, mix, shade, state } from '@/ui/tokens';
import { fencedLot } from '../buildings';
import { band, bench, dish, lowWall, mullions, NAVY, noiseOf, shutter } from '../facilityKit';
import type { Model, Part, Poly } from '../mesh';
import {
  box, broadleafTree, conifer, door, groundPoly, hedge, pad, parapet, part, prism, rod, rooftopUnit, signBoard, streetLamp, windows,
} from '../shapes';

/**
 * 2×2 の施設の模型（docs/city-design.md 4 章の Lv1 の「見た目の特徴」）。正面（入口）は +y。
 * Web 施設・セキュリティセンター・開発オフィス・監視・運用センター・DevOps 推進本部・インシデント対応本部。
 */

/* ---------- Web 施設: ガラス張りの低層ビル ---------- */

export function web(): Model {
  const glass = mix(city.wallGlass, domain.web, 0.12);
  const frame = mix(city.lineWhite, city.wallGlass, 0.35);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.lineWhite, 0.3)),
    pad(0.08, 1.45, 1.92, 1.98, mix(city.paving, city.sand, 0.35)),
    groundPoly([[0.08, 0.1], [0.3, 0.1], [0.3, 1.4], [0.08, 1.4]], city.grass),
  ];
  // 低い石の別棟（奥）
  const annex = { x0: 0.35, y0: 0.12, x1: 1.85, y1: 0.5 };
  parts.push(box({ ...annex, z0: 0, z1: 0.28, wall: mix(city.wallStone, city.lineWhite, 0.35) }, windows(annex, {
    floor: 0.24, floors: 1, base: 0.03, width: 0.1, pitch: 0.26, height: 0.5, litRatio: 0.35, noise: noiseOf(31), frame: shade(city.wallStone, 0.6),
  })));
  parts.push(...parapet(annex.x0, annex.y0, annex.x1, annex.y1, 0.28, 0.03, shade(city.wallStone, 0.95)));
  // ガラスの本館（2 階）
  const main = { x0: 0.45, y0: 0.5, x1: 1.75, y1: 1.3 };
  const fh = 0.28;
  const h = fh * 2 + 0.06;
  parts.push(box({ ...main, z0: 0, z1: h, wall: glass, top: mix(city.paving, city.lineWhite, 0.4) }, [
    ...windows(main, { floor: fh, floors: 2, base: 0.04, width: 0.16, pitch: 0.2, height: 0.78, litRatio: 0.45, noise: noiseOf(32), glass: mix(glass, city.lineWhite, 0.15), skip: [{ side: '+y', u0: 0.5, u1: 0.8, floor: 0 }] }),
    ...mullions(main, '+x', 0, h, 0.2, frame),
    ...mullions(main, '+y', 0, h, 0.2, frame),
    ...band(main, fh + 0.03, fh + 0.06, frame, 4),
  ]));
  // 屋上のテラスの手すりと植え込み
  parts.push(...parapet(main.x0, main.y0, main.x1, main.y1, h, 0.02, frame, 0.02));
  parts.push(rooftopUnit(main.x0 + 0.1, main.y0 + 0.1, h, 1));
  parts.push(hedge(main.x0 + 0.5, main.y0 + 0.12, main.x1 - 0.1, main.y0 + 0.2));
  // 入口の張り出した庇と扉
  parts.push(...door(main, '+y', 0.55, 0.2, 0.24, mix(NAVY, glass, 0.4), frame));
  parts.push(box({ x0: 0.9, y0: main.y1, z0: 0.3, x1: 1.35, y1: main.y1 + 0.25, z1: 0.33, wall: frame }));
  parts.push(rod([0.95, main.y1 + 0.22, 0], [0.95, main.y1 + 0.22, 0.3], 0.02, city.curb));
  parts.push(rod([1.3, main.y1 + 0.22, 0], [1.3, main.y1 + 0.22, 0.3], 0.02, city.curb));
  // 正面の低い名板（分野の色）
  parts.push(box({ x0: 1.5, y0: 1.75, z0: 0, x1: 1.85, y1: 1.8, z1: 0.12, wall: shade(city.curb, 0.9) }, [
    { kind: 'poly', pts: [[1.83, 1.806, 0.04], [1.52, 1.806, 0.04], [1.52, 1.806, 0.1], [1.83, 1.806, 0.1]], color: mix(domain.web, city.lineWhite, 0.2), lit: true, layer: 1 },
  ]));
  // 自転車置き場とベンチと木
  for (let i = 0; i < 4; i += 1) parts.push(rod([0.15 + i * 0.07, 1.62, 0], [0.15 + i * 0.07, 1.62, 0.07], 0.01, shade(city.curb, 0.7)));
  parts.push(...bench(0.18, 1.82, 'x'));
  parts.push(broadleafTree(0.18, 0.55, 0.85, 0));
  parts.push(broadleafTree(0.18, 1.15, 0.75, 2));
  parts.push(...streetLamp(1.9, 1.55, '-x'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 0.7 };
}

/* ---------- セキュリティセンター: 堅牢な建物と門 ---------- */

export function security(): Model {
  const wall = mix(city.wallStone, city.curb, 0.4);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.curb, 0.25)),
    pad(0.75, 1.3, 1.25, 2, mix(city.paving, city.lineWhite, 0.15)),
  ];
  // 本館（窓は細く少ない、厚い壁）
  const main = { x0: 0.25, y0: 0.2, x1: 1.75, y1: 1.15 };
  const fh = 0.27;
  const h = fh * 2 + 0.08;
  parts.push(box({ ...main, z0: 0, z1: h, wall, top: mix(city.paving, city.curb, 0.3) }, [
    ...windows(main, { floor: fh, floors: 2, base: 0.06, width: 0.05, pitch: 0.28, height: 0.5, litRatio: 0.4, noise: noiseOf(41), frame: shade(wall, 0.55), skip: [{ side: '+y', u0: 0.55, u1: 0.95, floor: 0 }] }),
    // 足元の石の帯と、差し色の帯
    ...band(main, 0, 0.06, shade(wall, 0.8)),
    ...band(main, h - 0.05, h - 0.03, mix(domain.sec, wall, 0.2)),
  ]));
  // 胸壁（凹凸のある屋上の縁）
  parts.push(...parapet(main.x0, main.y0, main.x1, main.y1, h, 0.05, shade(wall, 0.9), 0.06));
  for (let x = main.x0 + 0.06; x < main.x1 - 0.1; x += 0.2) {
    parts.push(box({ x0: x, y0: main.y1 - 0.06, z0: h + 0.05, x1: x + 0.1, y1: main.y1, z1: h + 0.1, wall: shade(wall, 0.9) }));
  }
  // 重い扉と、両脇の柱
  parts.push(...door(main, '+y', 0.62, 0.26, 0.26, shade(NAVY, 1.4), shade(wall, 0.7)));
  parts.push(box({ x0: 0.8, y0: main.y1, z0: 0, x1: 0.86, y1: main.y1 + 0.06, z1: 0.32, wall: shade(wall, 0.85) }));
  parts.push(box({ x0: 1.18, y0: main.y1, z0: 0, x1: 1.24, y1: main.y1 + 0.06, z1: 0.32, wall: shade(wall, 0.85) }));
  parts.push(rooftopUnit(0.4, 0.35, h, 1));
  parts.push(rooftopUnit(1.3, 0.35, h, 1));
  // 塀と門（守衛所と遮断機）
  const wallColor = mix(city.wallStone, city.curb, 0.2);
  parts.push(lowWall([0.06, 0.06], [1.94, 0.06], 0.16, wallColor));
  parts.push(lowWall([0.06, 0.06], [0.06, 1.94], 0.16, wallColor));
  parts.push(lowWall([1.94, 0.06], [1.94, 1.94], 0.16, wallColor));
  parts.push(lowWall([0.06, 1.94], [0.7, 1.94], 0.16, wallColor));
  parts.push(lowWall([1.3, 1.94], [1.94, 1.94], 0.16, wallColor));
  const gate = { x0: 1.36, y0: 1.5, x1: 1.6, y1: 1.72 };
  parts.push(box({ ...gate, z0: 0, z1: 0.24, wall: mix(city.lineWhite, wall, 0.3) }, windows(gate, { floor: 0.2, floors: 1, base: 0.04, width: 0.1, pitch: 0.12, height: 0.55, litRatio: 0.9, noise: noiseOf(42) })));
  parts.push(box({ x0: gate.x0 - 0.02, y0: gate.y0 - 0.02, z0: 0.24, x1: gate.x1 + 0.02, y1: gate.y1 + 0.02, z1: 0.27, wall: shade(wall, 0.8) }));
  parts.push(rod([1.3, 1.86, 0], [1.3, 1.86, 0.12], 0.03, shade(city.curb, 0.8)));
  parts.push(rod([1.3, 1.86, 0.11], [0.78, 1.86, 0.11], 0.02, domain.sec));
  // 車止めと木
  for (const x of [0.8, 0.92, 1.08, 1.2]) parts.push(prism(x, 1.36, 0.025, 0, 0.07, shade(city.curb, 0.85), undefined, 6));
  parts.push(conifer(0.3, 1.55, 0.7));
  parts.push(conifer(0.55, 1.7, 0.55));
  return { w: 2, d: 2, ground, parts, shadowHeight: 0.75 };
}

/* ---------- 開発オフィス: 中層のオフィス ---------- */

export function devoffice(): Model {
  const wall = mix(city.wallStone, city.lineWhite, 0.35);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.sand, 0.3)),
    pad(0.7, 1.35, 1.3, 2, mix(city.paving, city.lineWhite, 0.25)),
    groundPoly([[1.4, 1.4], [1.92, 1.4], [1.92, 1.92], [1.4, 1.92]], city.grass),
  ];
  const tower = { x0: 0.35, y0: 0.25, x1: 1.55, y1: 1.15 };
  const fh = 0.25;
  const floors = 5;
  const h = floors * fh + 0.06;
  parts.push(box({ ...tower, z0: 0, z1: h, wall, top: mix(city.paving, city.lineWhite, 0.3) }, [
    ...windows(tower, { floor: fh, floors, base: 0.05, width: 0.14, pitch: 0.2, height: 0.6, litRatio: 0.42, noise: noiseOf(51), glass: mix(city.wallGlass, domain.git, 0.08), frame: shade(wall, 0.6), skip: [{ side: '+y', u0: 0.45, u1: 0.75, floor: 0 }] }),
    ...band(tower, fh + 0.04, fh + 0.06, mix(domain.git, wall, 0.25)),
  ]));
  // 1 階のガラスのロビー（少し張り出す）
  const lobby = { x0: 0.75, y0: 1.15, x1: 1.35, y1: 1.3 };
  parts.push(box({ ...lobby, z0: 0, z1: 0.26, wall: mix(city.wallGlass, city.windowLit, 0.3), top: shade(wall, 0.9) }, mullions(lobby, '+y', 0, 0.26, 0.15, shade(wall, 0.7))));
  parts.push(...door(lobby, '+y', 0.2, 0.2, 0.2, mix(NAVY, city.wallGlass, 0.4), shade(wall, 0.8)));
  parts.push(...parapet(tower.x0, tower.y0, tower.x1, tower.y1, h, 0.05, shade(wall, 0.9)));
  // 屋上の階段室・空調・アンテナ
  parts.push(box({ x0: 0.5, y0: 0.35, z0: h, x1: 0.75, y1: 0.6, z1: h + 0.14, wall: shade(wall, 0.92) }));
  parts.push(rooftopUnit(0.95, 0.4, h, 1.1));
  parts.push(rooftopUnit(1.2, 0.4, h, 1.1));
  parts.push(rod([0.62, 0.48, h + 0.14], [0.62, 0.48, h + 0.45], 0.012, city.curb));
  // 壁の縦の看板（分野の色）
  parts.push(signBoard(tower, '+x', 0.1, 0.3, h - 0.55, h - 0.1, domain.git));
  // 自転車置き場・植え込み・木
  for (let i = 0; i < 5; i += 1) parts.push(rod([0.12 + i * 0.07, 1.6, 0], [0.12 + i * 0.07, 1.6, 0.07], 0.01, shade(city.curb, 0.7)));
  parts.push(rod([0.1, 1.6, 0.07], [0.42, 1.6, 0.07], 0.01, shade(city.curb, 0.7)));
  parts.push(hedge(0.1, 1.85, 0.6, 1.92));
  parts.push(broadleafTree(1.7, 1.65, 0.85, 1));
  parts.push(broadleafTree(1.8, 0.5, 0.7, 0));
  parts.push(...streetLamp(0.6, 1.8, '+x'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 1.3 };
}

/* ---------- 監視・運用センター: 大きな窓の管制室とアンテナ ---------- */

export function monitor(): Model {
  const wall = mix(city.wallStone, city.wallGlass, 0.2);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.sand, 0.2)),
    pad(0.3, 1.3, 0.8, 2, mix(city.paving, city.lineWhite, 0.25)),
  ];
  // 下の階（事務室）
  const base = { x0: 0.2, y0: 0.35, x1: 1.4, y1: 1.25 };
  const fh = 0.26;
  parts.push(box({ ...base, z0: 0, z1: fh * 2 + 0.04, wall }, windows(base, {
    floor: fh, floors: 2, base: 0.04, width: 0.12, pitch: 0.22, height: 0.55, litRatio: 0.4, noise: noiseOf(61), frame: shade(wall, 0.55), skip: [{ side: '+y', u0: 0.75, u1: 1.0, floor: 0 }],
  })));
  parts.push(...door(base, '+y', 0.78, 0.18, 0.22, NAVY, shade(wall, 0.75)));
  // 上の管制室（張り出した大きな窓の帯。灯りがともる）
  const z0 = fh * 2 + 0.04;
  const room = { x0: 0.12, y0: 0.27, x1: 1.48, y1: 1.33 };
  const zt = z0 + 0.3;
  const glassBand: Poly[] = [
    { kind: 'poly', pts: [[room.x1 + 0.006, room.y0 + 0.04, z0 + 0.06], [room.x1 + 0.006, room.y1 - 0.04, z0 + 0.06], [room.x1 + 0.006, room.y1 - 0.04, zt - 0.05], [room.x1 + 0.006, room.y0 + 0.04, zt - 0.05]], color: mix(city.wallGlass, city.windowLit, 0.55), lit: true, layer: 1 },
    { kind: 'poly', pts: [[room.x1 - 0.04, room.y1 + 0.006, z0 + 0.06], [room.x0 + 0.04, room.y1 + 0.006, z0 + 0.06], [room.x0 + 0.04, room.y1 + 0.006, zt - 0.05], [room.x1 - 0.04, room.y1 + 0.006, zt - 0.05]], color: mix(city.wallGlass, city.windowLit, 0.45), lit: true, layer: 1 },
    { kind: 'poly', pts: [[room.x0 - 0.006, room.y1 - 0.04, z0 + 0.06], [room.x0 - 0.006, room.y0 + 0.04, z0 + 0.06], [room.x0 - 0.006, room.y0 + 0.04, zt - 0.05], [room.x0 - 0.006, room.y1 - 0.04, zt - 0.05]], color: mix(city.wallGlass, city.windowLit, 0.4), lit: true, layer: 1 },
    { kind: 'poly', pts: [[room.x0 + 0.04, room.y0 - 0.006, z0 + 0.06], [room.x1 - 0.04, room.y0 - 0.006, z0 + 0.06], [room.x1 - 0.04, room.y0 - 0.006, zt - 0.05], [room.x0 + 0.04, room.y0 - 0.006, zt - 0.05]], color: mix(city.wallGlass, city.windowLit, 0.5), lit: true, layer: 1 },
    ...mullions(room, '+x', z0 + 0.06, zt - 0.05, 0.18, shade(wall, 0.5)),
    ...mullions(room, '+y', z0 + 0.06, zt - 0.05, 0.18, shade(wall, 0.5)),
  ];
  parts.push(box({ ...room, z0, z1: zt, wall: shade(wall, 0.95), top: mix(city.paving, city.lineWhite, 0.3) }, glassBand));
  // 屋上の縁（分野の色の帯）
  parts.push(...parapet(room.x0 - 0.03, room.y0 - 0.03, room.x1 + 0.03, room.y1 + 0.03, zt, 0.05, mix(domain.mon, wall, 0.3), 0.05));
  // アンテナの柱と皿
  parts.push(rod([1.7, 0.5, 0], [1.7, 0.5, 1.7], 0.035, mix(city.lineWhite, city.curb, 0.3)));
  for (const z of [0.5, 0.95, 1.4]) parts.push(rod([1.6, 0.5, z], [1.8, 0.5, z], 0.014, mix(city.lineWhite, city.curb, 0.3)));
  parts.push(rod([1.7, 0.5, 1.7], [1.7, 0.5, 1.9], 0.012, state.bad));
  parts.push(...dish(0.5, 0.55, zt + 0.04, 0.12));
  parts.push(...dish(1.1, 0.55, zt + 0.04, 0.09));
  parts.push(rooftopUnit(0.75, 0.9, zt + 0.04, 0.9));
  // 柵・木・街灯
  parts.push(...fencedLot(2, 2, shade(city.curb, 0.85), { from: 0.25, to: 0.85 }));
  parts.push(broadleafTree(1.65, 1.5, 0.85, 2));
  parts.push(hedge(1.0, 1.75, 1.85, 1.82));
  parts.push(...streetLamp(0.95, 1.6, '-x'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 1.0 };
}

/* ---------- DevOps 推進本部: 中層ビルと広場 ---------- */

export function devops(): Model {
  const wall = mix(city.wallStone, city.sand, 0.3);
  const parts: Part[] = [];
  // 広場の石畳（市松の板）
  const ground: Poly[] = [pad(0, 0, 2, 2, mix(city.paving, city.sand, 0.35))];
  for (let i = 0; i < 6; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      if ((i + j) % 2) continue;
      ground.push(pad(0.1 + i * 0.3, 1.05 + j * 0.3, 0.4 + i * 0.3, 1.35 + j * 0.3, mix(city.paving, city.lineWhite, 0.3)));
    }
  }
  const b = { x0: 0.2, y0: 0.15, x1: 1.8, y1: 0.85 };
  const fh = 0.26;
  const floors = 4;
  const h = floors * fh + 0.05;
  parts.push(box({ ...b, z0: 0, z1: h, wall, top: mix(city.paving, city.lineWhite, 0.3) }, [
    ...windows(b, { floor: fh, floors, base: 0.04, width: 0.12, pitch: 0.2, height: 0.62, litRatio: 0.4, noise: noiseOf(71), frame: shade(wall, 0.55), skip: [{ side: '+y', u0: 0.65, u1: 0.95, floor: 0 }] }),
    ...band(b, 0.3, 0.33, mix(domain.devops, wall, 0.2)),
  ]));
  parts.push(...parapet(b.x0, b.y0, b.x1, b.y1, h, 0.05, shade(wall, 0.9)));
  parts.push(...door(b, '+y', 0.68, 0.24, 0.24, NAVY, mix(domain.devops, wall, 0.3)));
  parts.push(rooftopUnit(0.35, 0.3, h, 1));
  parts.push(rooftopUnit(0.6, 0.3, h, 1));
  parts.push(box({ x0: 1.4, y0: 0.25, z0: h, x1: 1.65, y1: 0.5, z1: h + 0.12, wall: shade(wall, 0.92) }));
  // 屋上の緑
  parts.push(hedge(0.9, 0.6, 1.6, 0.68));
  // 広場: 輪の形の記念の像（2 つの輪）・ベンチ・木・植え込み
  const cx = 1.0;
  const cy = 1.5;
  parts.push(prism(cx, cy, 0.12, 0, 0.05, shade(city.curb, 0.9), mix(city.paving, city.lineWhite, 0.3), 12));
  parts.push(part([
    { kind: 'poly', pts: ring(cx - 0.07, cy, 0.07, 0.12), color: domain.devops, double: true },
    { kind: 'poly', pts: ring(cx + 0.07, cy, 0.07, 0.12), color: mix(domain.devops, city.lineWhite, 0.3), double: true },
  ], [cx - 0.15, cy, 0.05], [cx + 0.15, cy + 0.01, 0.2]));
  parts.push(...bench(0.25, 1.25, 'y'));
  parts.push(...bench(1.7, 1.25, 'y'));
  for (const [x, y, v] of [[0.25, 1.75, 0], [1.75, 1.75, 1], [0.15, 1.0, 2], [1.85, 1.0, 0]] as [number, number, number][]) parts.push(broadleafTree(x, y, 0.75, v));
  parts.push(...streetLamp(0.6, 1.85, '+y'));
  parts.push(...streetLamp(1.4, 1.85, '+y'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 1.1 };
}

/** 縦に立てた輪（+y を向く面の上の円） */
function ring(cx: number, cy: number, r: number, zc: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (i / 12) * Math.PI * 2;
    out.push([cx - Math.cos(a) * r, cy, zc + Math.sin(a) * r]);
  }
  return out;
}

/* ---------- インシデント対応本部: 消防署に似た建物と車庫 ---------- */

export function incident(): Model {
  const wall = mix(city.wallStone, city.roofTile, 0.25);
  const trim = mix(city.lineWhite, city.wallStone, 0.3);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.sand, 0.25)),
    // 車庫の前の出動用の舗装と、黄の線
    pad(0.15, 1.1, 1.45, 2, mix(city.paving, city.curb, 0.2)),
    groundPoly([[0.15, 1.95], [1.45, 1.95], [1.45, 1.98], [0.15, 1.98]], state.warn),
  ];
  const b = { x0: 0.15, y0: 0.2, x1: 1.45, y1: 1.1 };
  const fh = 0.3;
  const h = fh * 2 + 0.04;
  parts.push(box({ ...b, z0: 0, z1: h, wall, top: mix(city.paving, city.curb, 0.2) }, [
    // 2 階だけ窓（1 階は車庫の扉）
    ...windows(b, { floor: fh, floors: 2, base: 0.02, width: 0.12, pitch: 0.22, height: 0.5, litRatio: 0.45, noise: noiseOf(81), frame: shade(wall, 0.55), skip: [{ side: '+y', u0: 0, u1: 2, floor: 0 }] }),
    ...band(b, fh, fh + 0.04, trim),
  ]));
  parts.push(...parapet(b.x0, b.y0, b.x1, b.y1, h, 0.05, trim));
  // 車庫の 3 枚の大きな扉
  for (const [u0, u1] of [[0.08, 0.42], [0.48, 0.82], [0.88, 1.22]] as [number, number][]) {
    parts.push(shutter(b, u0, u1, 0.24, mix(domain.trouble, city.lineWhite, 0.25)));
  }
  // 名板（分野の色）
  parts.push(signBoard(b, '+y', 0.2, 1.1, h - 0.16, h - 0.06, shade(domain.trouble, 0.8)));
  // 横の訓練塔（細く高い塔と窓）
  const tower = { x0: 1.55, y0: 0.3, x1: 1.85, y1: 0.6 };
  parts.push(box({ ...tower, z0: 0, z1: 1.25, wall: shade(wall, 0.95) }, windows(tower, { floor: 0.3, floors: 4, base: 0.05, width: 0.1, pitch: 0.3, height: 0.45, litRatio: 0.3, noise: noiseOf(82), frame: shade(wall, 0.5) })));
  parts.push(box({ x0: tower.x0 - 0.03, y0: tower.y0 - 0.03, z0: 1.25, x1: tower.x1 + 0.03, y1: tower.y1 + 0.03, z1: 1.3, wall: trim }));
  parts.push(rod([1.7, 0.45, 1.3], [1.7, 0.45, 1.5], 0.012, city.curb));
  // 横の扉・ホースの棚・屋上の空調
  parts.push(...door(tower, '+y', 0.08, 0.14, 0.2, NAVY, trim));
  parts.push(rooftopUnit(0.3, 0.35, h, 1));
  parts.push(rooftopUnit(0.6, 0.35, h, 1));
  parts.push(box({ x0: 1.55, y0: 0.9, z0: 0, x1: 1.85, y1: 0.98, z1: 0.18, wall: mix(domain.trouble, city.curb, 0.4) }));
  // 消火栓・木・街灯
  parts.push(prism(1.62, 1.5, 0.03, 0, 0.08, state.bad, undefined, 8));
  parts.push(broadleafTree(1.75, 1.75, 0.8, 1));
  parts.push(...streetLamp(1.55, 1.85, '-x'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 0.9 };
}
