import { city, mix, shade } from '@/ui/tokens';
import { band, bench, dome, groundEllipse, lowWall, mullions, NAVY, noiseOf } from '../facilityKit';
import type { Model, Part, Poly, V3 } from '../mesh';
import {
  box, broadleafTree, conifer, door, faceDisc, onFace, gableRoof, groundPoly, groundRing, hedge, pad, parapet, part, prism, pyramidRoof, rod, streetLamp, windows,
} from '../shapes';

/**
 * 褒賞の建物の模型（docs/city-design.md 9.5）。Lv は無い（1 つの見た目）。
 * この模型から src/city/assets/civic/<建物>.svg を作る（tools/build-facility-svgs.mts。docs/city-design.md 9.6）。
 * 正面（入口）は +y。公共の建物と同じく分野の差し色を使わず、石と白と紺で塗る。それぞれの節目の祝いが分かるよう、旗・列柱・照明の塔・ガラスの面・池を目立たせる
 */

const STONE = mix(city.wallStone, city.lineWhite, 0.45);
const STONE_DARK = shade(STONE, 0.78);

/** 旗の柱（白い柱と、紺か金の旗） */
function flag(x: number, y: number, h: number, color: string): Part[] {
  return [
    rod([x, y, 0], [x, y, h], 0.011, city.lineWhite),
    part([{ kind: 'poly', pts: [[x, y, h - 0.02], [x + 0.13, y, h - 0.04], [x + 0.13, y, h - 0.12], [x, y, h - 0.1]], color, double: true }], [x, y, h - 0.12], [x + 0.13, y + 0.01, h]),
  ];
}

/** 正面の階段（下ほど広い段） */
function steps(x0: number, x1: number, y: number, depth: number, count: number, color: string): Part[] {
  const out: Part[] = [];
  const rise = 0.025;
  for (let i = 0; i < count; i += 1) {
    const inset = i * 0.025;
    out.push(box({ x0: x0 + inset, y0: y - depth * (count - i) / count, z0: i * rise, x1: x1 - inset, y1: y, z1: (i + 1) * rise, wall: shade(color, 0.92 - i * 0.03), top: color }));
  }
  return out;
}

/** 駐車場の白線（x0〜x1 の間に、y0〜y1 の枠を pitch ごとに） */
function parkingLines(x0: number, x1: number, y0: number, y1: number, pitch: number): Poly[] {
  const out: Poly[] = [];
  for (let x = x0; x <= x1 + 1e-6; x += pitch) out.push(groundPoly([[x, y0], [x + 0.02, y0], [x + 0.02, y1], [x, y1]], city.lineWhite));
  return out;
}

/** 止まっている車（小さな箱と窓） */
function car(x: number, y: number, color: string): Part {
  const glass = mix(city.wallGlass, NAVY, 0.35);
  const b = { x0: x, y0: y, x1: x + 0.13, y1: y + 0.24 };
  return box({ ...b, z0: 0.02, z1: 0.1, wall: color, top: mix(color, city.lineWhite, 0.15) }, [
    { kind: 'poly', pts: [[x + 0.02, y + 0.06, 0.101], [x + 0.11, y + 0.06, 0.101], [x + 0.11, y + 0.16, 0.101], [x + 0.02, y + 0.16, 0.101]], color: glass, layer: 1 },
  ]);
}
const CAR_COLORS = [mix(city.roofTile, city.lineWhite, 0.2), mix(city.wallGlass, NAVY, 0.2), city.lineWhite, mix(city.sand, city.curb, 0.3)];

/* ---------- 新しい市庁舎（2×2）: 時計のある塔・議場の丸屋根・前庭と旗の柱 ---------- */

export function cityHall(): Model {
  const wall = STONE;
  const roof = mix(city.roofTile, city.curb, 0.25);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.sand, 0.3)),
    // 前庭（石畳と、真ん中の芝の円）
    pad(0.15, 1.2, 1.85, 1.98, mix(city.paving, city.lineWhite, 0.35)),
    groundEllipse(1, 1.6, 0.32, 0.2, mix(city.grass, city.tree3, 0.15)),
    ...groundRing(1, 1.6, 0.34, 0.22, 0.025, mix(city.wallStone, city.curb, 0.2)),
    pad(0.88, 1.2, 1.12, 2, mix(city.paving, city.lineWhite, 0.5)),
  ];
  const fh = 0.27;
  const h = fh * 2 + 0.06;
  // 本庁舎（東西に長い 2 階建て。窓の帯と、1 階の上の石の帯）
  const main = { x0: 0.1, y0: 0.15, x1: 1.9, y1: 0.95 };
  parts.push(box({ ...main, z0: 0, z1: h, wall, top: mix(city.paving, city.curb, 0.15) }, [
    ...windows(main, { floor: fh, floors: 2, base: 0.04, width: 0.1, pitch: 0.19, height: 0.58, litRatio: 0.4, noise: noiseOf(201), frame: STONE_DARK,
      skip: [{ side: '+y', u0: 0.72, u1: 1.08, floor: 0 }, { side: '+y', u0: 0.72, u1: 1.08, floor: 1 }] }),
    ...band(main, fh + 0.02, fh + 0.045, STONE_DARK),
  ]));
  parts.push(...parapet(main.x0, main.y0, main.x1, main.y1, h, 0.05, STONE_DARK));
  // 議場（本庁舎の東の上に乗る、低い円筒と丸屋根。正面から塔に隠れない位置）
  parts.push(prism(1.5, 0.48, 0.27, h, h + 0.14, mix(wall, city.sand, 0.2), undefined, 16));
  parts.push(dome(1.5, 0.48, 0.27, h + 0.14, mix(city.wallGlass, city.tree3, 0.35)));
  parts.push(rod([1.5, 0.48, h + 0.41], [1.5, 0.48, h + 0.52], 0.012, city.lineWhite));
  // 時計の塔（入口の上に立つ。四面の時計と、尖った屋根）
  const tower = { x0: 0.78, y0: 0.62, x1: 1.22, y1: 1.02 };
  const th = h + 0.62;
  parts.push(box({ ...tower, z0: 0, z1: th, wall: mix(wall, city.sand, 0.15) }, [
    ...windows(tower, { floor: 0.27, floors: 2, base: 0.32, width: 0.08, pitch: 0.2, height: 0.5, litRatio: 0.5, noise: noiseOf(202), frame: STONE_DARK,
      skip: [{ side: '+y', u0: 0, u1: 0.5, floor: 0 }] }),
    faceDisc(tower, '+y', 0.22, th - 0.17, 0.12, city.lineWhite, 2),
    faceDisc(tower, '+y', 0.22, th - 0.17, 0.095, mix(city.lineWhite, city.sand, 0.2), 3),
    faceDisc(tower, '+x', 0.2, th - 0.17, 0.12, city.lineWhite, 2),
    // 時計の針（長い針は上、短い針は右）
    { kind: 'poly', pts: onFace(tower, '+y', 0.215, 0.225, th - 0.17, th - 0.09, 0.012), color: NAVY, layer: 4 },
    { kind: 'poly', pts: onFace(tower, '+y', 0.16, 0.22, th - 0.175, th - 0.165, 0.012), color: NAVY, layer: 4 },
  ]));
  parts.push(pyramidRoof(tower.x0, tower.y0, tower.x1, tower.y1, th, 0.3, roof, 0.03));
  parts.push(...door(tower, '+y', 0.12, 0.2, 0.24, NAVY, shade(wall, 0.85)));
  parts.push(...steps(0.8, 1.2, 1.18, 0.16, 3, mix(city.paving, city.lineWhite, 0.4)));
  // 旗の柱 3 本（真ん中は高い）・植え込み・街灯・木
  parts.push(...flag(0.45, 1.3, 0.62, NAVY), ...flag(1.0, 1.95, 0.75, mix(city.windowLit, city.roofTile, 0.25)), ...flag(1.55, 1.3, 0.62, NAVY));
  parts.push(hedge(0.15, 1.05, 0.7, 1.12), hedge(1.3, 1.05, 1.85, 1.12));
  parts.push(broadleafTree(0.22, 1.75, 0.7, 0), broadleafTree(1.78, 1.75, 0.7, 2));
  parts.push(...streetLamp(0.7, 1.85, '+x'), ...streetLamp(1.3, 1.85, '-x'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 1.0 };
}

/* ---------- 市民記念館（2×2）: 列柱の入口・石の壁・前の広場 ---------- */

export function memorial(): Model {
  const wall = mix(city.wallStone, city.sand, 0.35);
  const column = mix(city.lineWhite, city.wallStone, 0.2);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.sand, 0.4)),
    // 前の広場（石畳の同心の四角と、中央の碑の台）
    pad(0.1, 1.15, 1.9, 1.98, mix(city.paving, city.lineWhite, 0.3)),
    groundPoly([[0.55, 1.3], [1.45, 1.3], [1.45, 1.9], [0.55, 1.9]], mix(city.paving, city.sand, 0.2)),
    groundPoly([[0.75, 1.45], [1.25, 1.45], [1.25, 1.78], [0.75, 1.78]], mix(city.paving, city.lineWhite, 0.45)),
  ];
  const h = 0.5;
  // 本館（窓の少ない石の壁。横の面に細い縦の窓だけ）
  const hall = { x0: 0.2, y0: 0.15, x1: 1.8, y1: 0.85 };
  parts.push(box({ ...hall, z0: 0, z1: h, wall, top: mix(wall, city.curb, 0.15) }, [
    ...windows({ x0: hall.x0, y0: hall.y0, x1: hall.x1, y1: hall.y1 }, { floor: 0.44, floors: 1, base: 0.04, width: 0.05, pitch: 0.3, height: 0.7, litRatio: 0.3, noise: noiseOf(211), frame: shade(wall, 0.7),
      skip: [{ side: '+y', u0: 0, u1: 2, floor: 0 }] }),
    ...band(hall, h - 0.07, h - 0.04, shade(wall, 0.8)),
  ]));
  // 列柱の入口（前に張り出した屋根と三角の破風、白い柱 6 本）
  const porch = { x0: 0.35, y0: 0.85, x1: 1.65, y1: 1.12 };
  const ph = h - 0.04;
  for (let i = 0; i < 6; i += 1) {
    const x = porch.x0 + 0.08 + (i * (porch.x1 - porch.x0 - 0.16)) / 5;
    parts.push(prism(x, porch.y1 - 0.06, 0.035, 0.06, ph, column, undefined, 10));
    parts.push(box({ x0: x - 0.05, y0: porch.y1 - 0.11, z0: ph - 0.03, x1: x + 0.05, y1: porch.y1 - 0.01, z1: ph, wall: shade(column, 0.9) }));
  }
  parts.push(box({ ...porch, z0: 0, z1: 0.06, wall: shade(column, 0.85), top: column }));
  parts.push(box({ ...porch, z0: ph, z1: ph + 0.06, wall: shade(column, 0.92), top: column }));
  parts.push(gableRoof({ x0: porch.x0, y0: hall.y0, x1: porch.x1, y1: porch.y1, z: ph + 0.06, rise: 0.2, ridge: 'y', roof: mix(city.wallStone, city.curb, 0.3), wall: column, eave: 0.03 }));
  parts.push(...door(hall, '+y', 0.65, 0.3, 0.32, mix(city.roofTile, NAVY, 0.55), shade(column, 0.8)));
  parts.push(...steps(0.4, 1.6, 1.16, 0.06, 2, mix(city.paving, city.lineWhite, 0.4)));
  // 広場の碑（台座と、低い石の柱）・ベンチ・植え込み・木
  parts.push(box({ x0: 0.9, y0: 1.55, z0: 0, x1: 1.1, y1: 1.68, z1: 0.06, wall: STONE_DARK, top: STONE }));
  parts.push(box({ x0: 0.95, y0: 1.58, z0: 0.06, x1: 1.05, y1: 1.65, z1: 0.3, wall: STONE, top: mix(STONE, city.lineWhite, 0.3) }));
  parts.push(...bench(0.25, 1.4, 'y'), ...bench(1.69, 1.4, 'y'));
  parts.push(hedge(0.05, 0.2, 0.15, 0.85), hedge(1.85, 0.2, 1.95, 0.85));
  for (const [x, y, v] of [[0.2, 1.85, 0], [1.8, 1.85, 1], [0.12, 1.05, 2], [1.88, 1.05, 0]] as [number, number, number][]) parts.push(conifer(x, y, 0.55 + v * 0.05));
  parts.push(...streetLamp(0.5, 1.9, '+x'), ...streetLamp(1.5, 1.9, '-x'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 0.8 };
}

/* ---------- 競技場（3×3）: 楕円の観客席・照明の塔 4 本・駐車場 ---------- */

/** 楕円の上の点 */
const ellipseAt = (cx: number, cy: number, rx: number, ry: number, a: number, z: number): V3 => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z];

export function stadium(): Model {
  const cx = 1.5;
  const cy = 1.15;
  const outer = { rx: 1.38, ry: 1.02 };
  const inner = { rx: 0.92, ry: 0.6 };
  const wallH = 0.42;
  const parts: Part[] = [];
  const pitch = mix(city.grass, city.tree3, 0.25);
  const ground: Poly[] = [
    pad(0, 0, 3, 3, mix(city.paving, city.curb, 0.15)),
    // 前の駐車場（白線と、出入りの通路）
    pad(0.15, 2.3, 2.85, 2.95, mix(city.paving, city.curb, 0.3)),
    ...parkingLines(0.25, 1.15, 2.38, 2.62, 0.18),
    ...parkingLines(1.85, 2.75, 2.38, 2.62, 0.18),
    pad(1.3, 2.2, 1.7, 3, mix(city.paving, city.lineWhite, 0.3)),
  ];
  // 外の壁（楕円を 28 の面に分ける）と、上の縁から内へ下がる観客席
  const n = 28;
  const shapes: Part['shapes'] = [];
  const wall = mix(city.wallStone, city.lineWhite, 0.3);
  const seats = [mix(city.wallGlass, NAVY, 0.45), mix(city.roofTile, city.wallStone, 0.35)];
  for (let i = 0; i < n; i += 1) {
    const a0 = (i / n) * Math.PI * 2;
    const a1 = ((i + 1) / n) * Math.PI * 2;
    shapes.push({ kind: 'poly', pts: [ellipseAt(cx, cy, outer.rx, outer.ry, a0, 0), ellipseAt(cx, cy, outer.rx, outer.ry, a1, 0), ellipseAt(cx, cy, outer.rx, outer.ry, a1, wallH), ellipseAt(cx, cy, outer.rx, outer.ry, a0, wallH)], color: i % 2 === 0 ? wall : shade(wall, 0.95) });
    // 観客席は 2 段（上の段と下の段で色を変える）
    const mid = { rx: (outer.rx + inner.rx) / 2, ry: (outer.ry + inner.ry) / 2 };
    shapes.push({ kind: 'poly', pts: [ellipseAt(cx, cy, outer.rx, outer.ry, a0, wallH), ellipseAt(cx, cy, outer.rx, outer.ry, a1, wallH), ellipseAt(cx, cy, mid.rx, mid.ry, a1, wallH * 0.55), ellipseAt(cx, cy, mid.rx, mid.ry, a0, wallH * 0.55)], color: seats[0] as string });
    shapes.push({ kind: 'poly', pts: [ellipseAt(cx, cy, mid.rx, mid.ry, a0, wallH * 0.55), ellipseAt(cx, cy, mid.rx, mid.ry, a1, wallH * 0.55), ellipseAt(cx, cy, inner.rx, inner.ry, a1, 0.08), ellipseAt(cx, cy, inner.rx, inner.ry, a0, 0.08)], color: seats[1] as string });
    // 外の壁の入口と窓の帯（正面の側だけ明るい窓）
    if (i % 4 === 1) {
      const am = (a0 + a1) / 2;
      const [x, y] = ellipseAt(cx, cy, outer.rx + 0.006, outer.ry + 0.006, am, 0);
      const [x2, y2] = ellipseAt(cx, cy, outer.rx + 0.006, outer.ry + 0.006, am + 0.08, 0);
      shapes.push({ kind: 'poly', pts: [[x, y, 0.02], [x2, y2, 0.02], [x2, y2, 0.2], [x, y, 0.2]], color: NAVY, layer: 1 });
    }
  }
  parts.push(part(shapes, [cx - outer.rx, cy - outer.ry, 0], [cx + outer.rx, cy + outer.ry, wallH]));
  // グラウンド（芝と白線のピッチ）
  const field = groundEllipse(cx, cy, inner.rx - 0.02, inner.ry - 0.02, pitch, 28);
  parts.push(part([{ ...field, pts: field.pts.map(([x, y]) => [x, y, 0.081] as V3) }], [cx - inner.rx, cy - inner.ry, 0.08], [cx + inner.rx, cy + inner.ry, 0.082]));
  const line = (x0: number, y0: number, x1: number, y1: number): Part['shapes'][number] => ({ kind: 'poly', pts: [[x0, y0, 0.083], [x1, y0, 0.083], [x1, y1, 0.083], [x0, y1, 0.083]], color: city.lineWhite, layer: 1 });
  parts.push(part([
    line(cx - 0.6, cy - 0.33, cx + 0.6, cy - 0.31), line(cx - 0.6, cy + 0.31, cx + 0.6, cy + 0.33),
    line(cx - 0.6, cy - 0.33, cx - 0.58, cy + 0.33), line(cx + 0.58, cy - 0.33, cx + 0.6, cy + 0.33),
    line(cx - 0.01, cy - 0.33, cx + 0.01, cy + 0.33),
  ], [cx - 0.6, cy - 0.33, 0.08], [cx + 0.6, cy + 0.33, 0.084]));
  // 正面の屋根（記者席と貴賓席の上の庇）
  parts.push(box({ x0: cx - 0.55, y0: cy + outer.ry - 0.28, z0: wallH + 0.12, x1: cx + 0.55, y1: cy + outer.ry + 0.02, z1: wallH + 0.15, wall: shade(city.lineWhite, 0.9), top: city.lineWhite }));
  for (const x of [cx - 0.5, cx, cx + 0.5]) parts.push(rod([x, cy + outer.ry - 0.02, wallH], [x, cy + outer.ry - 0.02, wallH + 0.12], 0.012, city.curb));
  // 照明の塔 4 本（細い柱と、灯りの枠）。灯りは窓の灯りの色で描き、試合の日でない日は描く時に消す（docs/city-design.md 9.5）
  for (const [x, y] of [[0.22, 0.2], [2.78, 0.2], [0.22, 2.08], [2.78, 2.08]] as [number, number][]) {
    const top = 1.25;
    parts.push(rod([x, y, 0], [x, y, top], 0.022, mix(city.curb, city.lineWhite, 0.3)));
    const toward = x < cx ? 0.03 : -0.03;
    parts.push(box({ x0: x - 0.09, y0: y - 0.03, z0: top, x1: x + 0.09, y1: y + 0.03, z1: top + 0.11, wall: shade(city.curb, 0.85) }, [
      { kind: 'poly', pts: [[x - 0.08 + toward, y + 0.031, top + 0.02], [x + 0.08 + toward, y + 0.031, top + 0.02], [x + 0.08 + toward, y + 0.031, top + 0.1], [x - 0.08 + toward, y + 0.031, top + 0.1]], color: city.windowLit, lit: true, layer: 1 },
    ]));
  }
  // 駐車場の車と、街灯・木
  [0.29, 0.47, 0.83, 1.9, 2.26, 2.44].forEach((x, i) => parts.push(car(x, 2.39, CAR_COLORS[i % CAR_COLORS.length] as string)));
  parts.push(...streetLamp(1.25, 2.85, '+x'), ...streetLamp(1.75, 2.85, '-x'));
  for (const [x, y, v] of [[0.12, 1.15, 0], [2.88, 1.15, 1], [0.15, 2.85, 2], [2.85, 2.85, 0]] as [number, number, number][]) parts.push(broadleafTree(x, y, 0.6, v));
  return { w: 3, d: 3, ground, parts, shadowHeight: 0.6 };
}

/* ---------- 市民ホール（2×2）: 大きなガラスの面と庇・前の階段 ---------- */

export function civicHall(): Model {
  const wall = mix(city.wallStone, city.lineWhite, 0.3);
  const glass = mix(city.wallGlass, NAVY, 0.18);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.sand, 0.3)),
    pad(0.1, 1.25, 1.9, 1.98, mix(city.paving, city.lineWhite, 0.4)),
    // 植え込みの帯
    groundPoly([[0.1, 1.85], [0.75, 1.85], [0.75, 1.95], [0.1, 1.95]], city.grassDark),
    groundPoly([[1.25, 1.85], [1.9, 1.85], [1.9, 1.95], [1.25, 1.95]], city.grassDark),
  ];
  const h = 0.78;
  // 背中の舞台の棟（ホールより高い石の箱。上に細い窓の帯）
  const fly = { x0: 0.45, y0: 0.1, x1: 1.55, y1: 0.5 };
  const fh = h + 0.2;
  parts.push(box({ ...fly, z0: 0, z1: fh, wall: mix(wall, city.sand, 0.25), top: mix(wall, city.curb, 0.2) }, [
    ...windows(fly, { floor: 0.2, floors: 1, base: fh - 0.24, width: 0.06, pitch: 0.16, height: 0.6, litRatio: 0.3, noise: noiseOf(221), frame: shade(wall, 0.7) }),
    ...band(fly, fh - 0.05, fh - 0.03, shade(wall, 0.75)),
  ]));
  parts.push(...parapet(fly.x0, fly.y0, fly.x1, fly.y1, fh, 0.03, shade(wall, 0.85)));
  // ホール（正面と東の面が 2 層分の大きなガラス。縦の桟と、中の灯り・吹き抜けの床の帯）
  const hall = { x0: 0.12, y0: 0.42, x1: 1.88, y1: 1.12 };
  const frontLen = hall.x1 - hall.x0;
  const sideLen = hall.y1 - hall.y0;
  const lights: Part['shapes'] = [];
  for (const [u0, u1, v0, v1] of [[0.25, 0.55, 0.08, 0.34], [0.95, 1.2, 0.42, 0.68], [1.3, 1.55, 0.08, 0.34]] as [number, number, number, number][]) {
    lights.push({ kind: 'poly', pts: onFace(hall, '+y', u0, u1, v0, v1, 0.009), color: city.windowLit, lit: true, layer: 2 });
  }
  parts.push(box({ ...hall, z0: 0, z1: h, wall, top: mix(city.paving, city.curb, 0.15) }, [
    { kind: 'poly', pts: onFace(hall, '+y', 0.06, frontLen - 0.06, 0.05, h - 0.07, 0.006), color: glass, layer: 1 },
    ...lights,
    { kind: 'poly', pts: onFace(hall, '+y', 0.06, frontLen - 0.06, h * 0.47, h * 0.5, 0.012), color: shade(wall, 0.8), layer: 3 },
    ...mullions(hall, '+y', 0.05, h - 0.07, 0.16, shade(wall, 0.65)),
    { kind: 'poly', pts: onFace(hall, '+x', 0.08, sideLen - 0.06, 0.05, h - 0.07, 0.006), color: shade(glass, 0.9), layer: 1 },
    { kind: 'poly', pts: onFace(hall, '+x', 0.2, 0.42, 0.42, 0.68, 0.009), color: city.windowLit, lit: true, layer: 2 },
    ...mullions(hall, '+x', 0.05, h - 0.07, 0.16, shade(wall, 0.65)),
    // 西と裏は石の壁に、細い窓
    ...windows(hall, { floor: 0.36, floors: 2, base: 0.04, width: 0.05, pitch: 0.24, height: 0.7, litRatio: 0.3, noise: noiseOf(222), frame: shade(wall, 0.7),
      skip: [{ side: '+y', u0: 0, u1: 2, floor: 0 }, { side: '+y', u0: 0, u1: 2, floor: 1 }, { side: '+x', u0: 0, u1: 2, floor: 0 }, { side: '+x', u0: 0, u1: 2, floor: 1 }] }),
  ]));
  parts.push(...parapet(hall.x0, hall.y0, hall.x1, hall.y1, h, 0.04, shade(wall, 0.85)));
  // 大きな庇（正面いっぱいに張り出し、細い柱 4 本で支える）
  const canopyZ = h * 0.55;
  parts.push(box({ x0: 0.18, y0: hall.y1, z0: canopyZ, x1: 1.82, y1: hall.y1 + 0.34, z1: canopyZ + 0.035, wall: shade(city.lineWhite, 0.85), top: city.lineWhite }));
  for (const x of [0.25, 0.75, 1.25, 1.75]) parts.push(rod([x, hall.y1 + 0.31, 0], [x, hall.y1 + 0.31, canopyZ], 0.012, city.curb));
  parts.push(...door(hall, '+y', 0.72, 0.32, 0.26, mix(city.wallGlass, NAVY, 0.45), shade(wall, 0.85)));
  // 前の階段（幅の広い 4 段）と、ホールの名の板
  parts.push(...steps(0.3, 1.7, 1.44, 0.3, 4, mix(city.paving, city.lineWhite, 0.45)));
  parts.push(box({ x0: 1.55, y0: 1.55, z0: 0, x1: 1.85, y1: 1.61, z1: 0.16, wall: NAVY, top: shade(NAVY, 1.1) }, [
    { kind: 'poly', pts: onFace({ x0: 1.55, y0: 1.55, x1: 1.85, y1: 1.61 }, '+y', 0.03, 0.27, 0.05, 0.12, 0.004), color: city.lineWhite, layer: 1 },
  ]));
  parts.push(broadleafTree(0.2, 1.65, 0.6, 1), broadleafTree(1.82, 1.8, 0.55, 2));
  parts.push(...streetLamp(0.2, 1.35, '+x'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 0.9 };
}

/* ---------- 中央公園（4×4）: 池・遊歩道・芝・木立・噴水と東屋 ---------- */

export function centralPark(): Model {
  const path = mix(city.sand, city.paving, 0.35);
  const water = mix(city.water, city.shallow, 0.6);
  const lawn = mix(city.grass, city.tree3, 0.12);
  const ground: Poly[] = [
    pad(0, 0, 4, 4, lawn),
    // 外周の遊歩道と、入口から噴水・池をめぐる道
    pad(0.08, 0.08, 3.92, 0.22, path), pad(0.08, 3.78, 3.92, 3.92, path), pad(0.08, 0.08, 0.22, 3.92, path), pad(3.78, 0.08, 3.92, 3.92, path),
    pad(1.85, 2.4, 2.15, 3.92, path),
    groundPoly([[0.22, 2.05], [1.6, 2.05], [1.85, 2.2], [1.85, 2.4], [1.6, 2.25], [0.22, 2.25]], path),
    groundPoly([[2.15, 2.4], [2.4, 2.1], [3.78, 2.1], [3.78, 2.3], [2.45, 2.3], [2.15, 2.6]], path),
    groundEllipse(2, 2.55, 0.42, 0.3, mix(city.paving, city.lineWhite, 0.35), 24),
    // 池（北西。岸の砂と、水面のさざ波）
    groundEllipse(1.15, 1.05, 0.88, 0.62, mix(city.sand, city.grassDark, 0.2), 28),
    groundEllipse(1.15, 1.05, 0.8, 0.55, water, 28),
    groundEllipse(0.95, 0.95, 0.22, 0.08, mix(city.shallow, city.lineWhite, 0.45), 14),
    groundEllipse(1.4, 1.2, 0.16, 0.05, mix(city.shallow, city.lineWhite, 0.45), 12),
    // 芝の広場（南東）
    groundEllipse(3.0, 3.05, 0.55, 0.45, mix(city.grass, city.lineWhite, 0.08), 22),
  ];
  const parts: Part[] = [];
  // 噴水（入口の先の円い広場の真ん中）
  const stone = mix(city.wallStone, city.lineWhite, 0.35);
  parts.push(prism(2, 2.55, 0.24, 0, 0.07, stone, mix(water, city.shallow, 0.3), 20));
  parts.push(prism(2, 2.55, 0.04, 0.07, 0.24, stone, undefined, 10));
  parts.push(prism(2, 2.55, 0.11, 0.24, 0.27, stone, water, 14));
  parts.push(part([{ kind: 'blob', center: [2, 2.55, 0.36], r: 0.04, squash: 1.8, color: mix(city.shallow, city.lineWhite, 0.65) }], [1.96, 2.51, 0.27], [2.04, 2.59, 0.45]));
  // 東屋（池の東の岸。八角の屋根と柱、低い床）
  const gx = 2.35;
  const gy = 0.85;
  parts.push(prism(gx, gy, 0.24, 0, 0.05, mix(city.paving, city.sand, 0.3), undefined, 8));
  for (let i = 0; i < 8; i += 2) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    parts.push(rod([gx + Math.cos(a) * 0.19, gy + Math.sin(a) * 0.19, 0.05], [gx + Math.cos(a) * 0.19, gy + Math.sin(a) * 0.19, 0.3], 0.014, mix(city.roofTile, city.curb, 0.4)));
  }
  parts.push(pyramidRoof(gx - 0.26, gy - 0.26, gx + 0.26, gy + 0.26, 0.3, 0.18, mix(city.roofTile, city.tree3, 0.35), 0.02));
  // 池の桟橋と、貸しボート
  parts.push(box({ x0: 1.75, y0: 1.25, z0: 0.01, x1: 2.05, y1: 1.33, z1: 0.04, wall: mix(city.roofTile, city.sand, 0.4) }));
  parts.push(box({ x0: 1.45, y0: 1.32, z0: 0.005, x1: 1.6, y1: 1.4, z1: 0.04, wall: city.lineWhite, top: mix(city.roofTile, city.lineWhite, 0.3) }));
  // 木立（北東と南西にまとまり、外周に並木）
  const groves: [number, number, number, number][] = [
    [3.0, 0.55, 0.95, 0], [3.4, 0.75, 0.85, 1], [3.15, 1.1, 1.0, 2], [3.55, 1.35, 0.8, 0], [2.85, 1.45, 0.75, 1],
    [0.55, 2.75, 0.95, 2], [0.9, 3.1, 0.85, 0], [0.45, 3.35, 0.9, 1], [1.3, 3.4, 0.75, 2], [1.25, 2.75, 0.7, 0],
  ];
  for (const [x, y, s, v] of groves) parts.push(broadleafTree(x, y, s, v));
  for (const [x, y, s] of [[3.6, 0.35, 0.7], [0.35, 3.0, 0.75], [1.6, 3.55, 0.65]] as [number, number, number][]) parts.push(conifer(x, y, s));
  for (const x of [0.4, 0.95, 2.6, 3.1, 3.6]) parts.push(broadleafTree(x, 3.68, 0.55, Math.round(x * 2) % 3));
  // ベンチ・街灯・植え込み・入口の門柱
  parts.push(...bench(1.6, 2.65, 'y'), ...bench(2.33, 2.65, 'y'), ...bench(0.6, 1.8, 'x'), ...bench(3.0, 2.38, 'x'));
  parts.push(...streetLamp(1.75, 3.3, '+x'), ...streetLamp(2.25, 3.3, '-x'), ...streetLamp(0.3, 2.15, '+x'), ...streetLamp(3.7, 2.2, '-x'));
  parts.push(hedge(0.25, 3.8, 1.75, 3.86), hedge(2.25, 3.8, 3.75, 3.86));
  for (const x of [1.78, 2.16]) parts.push(box({ x0: x, y0: 3.82, z0: 0, x1: x + 0.06, y1: 3.92, z1: 0.2, wall: stone, top: mix(stone, city.lineWhite, 0.3) }));
  parts.push(lowWall([0.03, 0.03], [3.97, 0.03], 0.05, mix(city.wallStone, city.curb, 0.2), 0.04));
  return { w: 4, d: 4, ground, parts, shadowHeight: 0 };
}
