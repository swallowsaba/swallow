import { city, mix, shade, state } from '@/ui/tokens';
import { band, lowWall, NAVY, noiseOf, shutter } from '../facilityKit';
import type { Model, Part, Poly } from '../mesh';
import {
  box, broadleafTree, conifer, door, faceDisc, gableRoof, groundPoly, groundRing, hedge, onFace, pad, parapet, part, prism, rod,
  rooftopUnit, signBoard, streetLamp, windows,
} from '../shapes';

/**
 * 公共サービスと発電所と陸揚げ所の模型（docs/city-design.md 9.2・9.4）。Lv は無い（1 つの見た目）。
 * この模型から src/city/assets/civic/<建物>.svg を作る（tools/build-facility-svgs.mts。docs/city-design.md 9.6・docs/decisions.md C-9）。
 * 正面（入口）は +y。IT 施設と見分けられるよう、分野の差し色を使わず、公共の色（紺・白・赤）で塗る
 */

/** 小さな車（屋根の灯り。パトカーは白と紺、消防車は赤で長い） */
function serviceCar(x: number, y: number, kind: 'police' | 'fire' | 'ambulance'): Part[] {
  const long = kind === 'fire';
  const l = long ? 0.44 : 0.28;
  const w = long ? 0.18 : 0.15;
  const body = { x0: x, y0: y, x1: x + w, y1: y + l };
  const color = kind === 'fire' ? mix(state.bad, city.roofTile, 0.35) : city.lineWhite;
  const stripe = kind === 'police' ? NAVY : kind === 'ambulance' ? state.bad : city.lineWhite;
  const glass = mix(city.wallGlass, NAVY, 0.35);
  const out: Part[] = [
    box({ ...body, z0: 0.03, z1: long ? 0.17 : 0.11, wall: color, top: mix(color, city.lineWhite, 0.15) }, [
      ...band(body, long ? 0.09 : 0.06, long ? 0.11 : 0.08, stripe),
      { kind: 'poly', pts: onFace(body, '+y', 0.02, w - 0.02, long ? 0.1 : 0.07, long ? 0.15 : 0.1, 0.008), color: glass, layer: 2 },
    ]),
  ];
  if (kind === 'police') {
    const cab = { x0: x + 0.02, y0: y + 0.07, x1: x + w - 0.02, y1: y + 0.22 };
    out.push(box({ ...cab, z0: 0.11, z1: 0.16, wall: NAVY }, [{ kind: 'poly', pts: onFace(cab, '+x', 0.01, 0.14, 0.115, 0.155, 0.006), color: glass, layer: 1 }]));
  }
  // 屋根の回転灯（赤と、パトカーは青に寄せた紺）
  const z = long ? 0.17 : kind === 'police' ? 0.16 : 0.11;
  out.push(part([
    { kind: 'blob', center: [x + w * 0.3, y + l * 0.55, z + 0.015], r: 0.016, squash: 0.8, color: state.bad, lit: true },
    { kind: 'blob', center: [x + w * 0.7, y + l * 0.55, z + 0.015], r: 0.016, squash: 0.8, color: kind === 'police' ? state.info : state.bad, lit: true },
  ], [x, y + l * 0.5, z], [x + w, y + l * 0.6, z + 0.035]));
  if (long) out.push(rod([x + w / 2, y + 0.04, 0.19], [x + w / 2, y + l - 0.12, 0.19], 0.02, city.lineWhite));
  return out;
}

/** 旗の柱（白い柱と、紺の旗） */
function flagpole(x: number, y: number, h: number): Part[] {
  return [
    rod([x, y, 0], [x, y, h], 0.012, city.lineWhite),
    part([{ kind: 'poly', pts: [[x, y, h - 0.02], [x + 0.14, y, h - 0.04], [x + 0.14, y, h - 0.12], [x, y, h - 0.1]], color: NAVY, double: true }], [x, y, h - 0.12], [x + 0.14, y + 0.01, h]),
  ];
}

/* ---------- 警察署（2×2）: 2 階建ての庁舎と車庫、屋上の無線の柱、前に並ぶ車 ---------- */

export function police(): Model {
  const wall = mix(city.wallStone, city.lineWhite, 0.35);
  const trim = mix(NAVY, city.wallStone, 0.25);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.sand, 0.2)),
    // 前の駐車場の白線と、車の出入りの舗装
    pad(0.1, 1.2, 1.9, 1.98, mix(city.paving, city.curb, 0.25)),
    ...[0.42, 0.74, 1.06].map((x) => groundPoly([[x, 1.28], [x + 0.025, 1.28], [x + 0.025, 1.7], [x, 1.7]], city.lineWhite)),
  ];
  // 庁舎（2 階建て）
  const hall = { x0: 0.12, y0: 0.15, x1: 1.3, y1: 1.05 };
  const fh = 0.3;
  const h = fh * 2 + 0.05;
  parts.push(box({ ...hall, z0: 0, z1: h, wall, top: mix(city.paving, city.curb, 0.15) }, [
    ...windows(hall, { floor: fh, floors: 2, base: 0.03, width: 0.12, pitch: 0.22, height: 0.5, litRatio: 0.45, noise: noiseOf(101), frame: shade(wall, 0.6), skip: [{ side: '+y', u0: 0.4, u1: 0.75, floor: 0 }] }),
    ...band(hall, fh, fh + 0.04, trim),
  ]));
  parts.push(...parapet(hall.x0, hall.y0, hall.x1, hall.y1, h, 0.05, trim));
  parts.push(...door(hall, '+y', 0.45, 0.26, 0.24, NAVY, trim));
  // 名板（紺の地に白の帯）
  parts.push(signBoard(hall, '+y', 0.05, 0.4, h - 0.17, h - 0.07, trim));
  // 車庫（平屋。2 枚のシャッター）
  const garage = { x0: 1.3, y0: 0.25, x1: 1.88, y1: 1.05 };
  parts.push(box({ ...garage, z0: 0, z1: 0.3, wall: shade(wall, 0.95), top: mix(city.paving, city.curb, 0.3) }));
  parts.push(shutter(garage, 0.04, 0.27, 0.22, mix(city.curb, city.lineWhite, 0.35)));
  parts.push(shutter(garage, 0.31, 0.54, 0.22, mix(city.curb, city.lineWhite, 0.35)));
  // 屋上の無線の柱（腕木と、頂の灯り）・空調
  parts.push(rod([0.35, 0.4, h], [0.35, 0.4, h + 0.55], 0.016, city.curb));
  parts.push(rod([0.27, 0.4, h + 0.4], [0.43, 0.4, h + 0.4], 0.01, city.curb));
  parts.push(rod([0.29, 0.4, h + 0.28], [0.41, 0.4, h + 0.28], 0.01, city.curb));
  parts.push(part([{ kind: 'blob', center: [0.35, 0.4, h + 0.57], r: 0.02, squash: 0.8, color: state.bad, lit: true }], [0.33, 0.38, h + 0.55], [0.37, 0.42, h + 0.6]));
  parts.push(rooftopUnit(0.85, 0.35, h, 1));
  // 前に並ぶパトカー
  parts.push(...serviceCar(0.5, 1.33, 'police'), ...serviceCar(0.82, 1.33, 'police'));
  // 旗の柱・植え込み・木・街灯
  parts.push(...flagpole(0.2, 1.3, 0.75));
  parts.push(hedge(1.35, 1.88, 1.9, 1.95));
  parts.push(broadleafTree(1.7, 1.5, 0.75, 2));
  parts.push(...streetLamp(0.15, 1.88, '+x'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 0.75 };
}

/* ---------- 消防署（2×2）: 大きな車庫の扉と訓練の塔、赤い車 ---------- */

export function fire(): Model {
  const wall = mix(city.wallStone, city.sand, 0.3);
  const red = mix(state.bad, city.roofTile, 0.35);
  const trim = mix(city.lineWhite, city.wallStone, 0.25);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.sand, 0.15)),
    // 出動の舗装と、止まってはいけない白の斜線
    pad(0.1, 1.05, 1.35, 1.98, mix(city.paving, city.curb, 0.3)),
    ...[0.2, 0.5, 0.8, 1.1].map((x) => groundPoly([[x, 1.9], [x + 0.12, 1.9], [x + 0.2, 1.97], [x + 0.08, 1.97]], city.lineWhite)),
  ];
  // 車庫と事務所（2 階建て。1 階は 3 枚の赤い扉）
  const b = { x0: 0.1, y0: 0.2, x1: 1.35, y1: 1.05 };
  const fh = 0.32;
  const h = fh * 2 + 0.04;
  parts.push(box({ ...b, z0: 0, z1: h, wall, top: mix(city.paving, city.curb, 0.2) }, [
    ...windows(b, { floor: fh, floors: 2, base: 0.02, width: 0.12, pitch: 0.22, height: 0.48, litRatio: 0.4, noise: noiseOf(111), frame: shade(wall, 0.55), skip: [{ side: '+y', u0: 0, u1: 2, floor: 0 }] }),
    ...band(b, fh, fh + 0.04, red),
  ]));
  parts.push(...parapet(b.x0, b.y0, b.x1, b.y1, h, 0.05, trim));
  for (const [u0, u1] of [[0.06, 0.4], [0.46, 0.8], [0.86, 1.2]] as [number, number][]) parts.push(shutter(b, u0, u1, 0.27, red));
  parts.push(signBoard(b, '+y', 0.3, 0.95, h - 0.15, h - 0.06, red));
  // 訓練の塔（窓の開いた 5 段と、ホースを干す頂）
  const tower = { x0: 1.5, y0: 0.25, x1: 1.85, y1: 0.6 };
  const th = 1.55;
  parts.push(box({ ...tower, z0: 0, z1: th, wall: shade(wall, 0.92) }, [
    ...windows(tower, { floor: 0.28, floors: 5, base: 0.08, width: 0.14, pitch: 0.3, height: 0.5, litRatio: 0, noise: noiseOf(112), glass: shade(city.curb, 0.6) }),
    ...band(tower, th - 0.12, th - 0.08, red),
  ]));
  parts.push(box({ x0: tower.x0 - 0.04, y0: tower.y0 - 0.04, z0: th, x1: tower.x1 + 0.04, y1: tower.y1 + 0.04, z1: th + 0.05, wall: trim }));
  parts.push(rod([1.67, 0.42, th + 0.05], [1.67, 0.42, th + 0.3], 0.014, city.curb));
  // 塔の外の非常階段（斜めの手すり）
  parts.push(rod([1.88, 0.3, 0.05], [1.88, 0.58, 0.6], 0.012, city.curb), rod([1.88, 0.58, 0.6], [1.88, 0.3, 1.15], 0.012, city.curb));
  // 赤い車（はしご車とポンプ車）
  parts.push(...serviceCar(0.3, 1.2, 'fire'), ...serviceCar(0.75, 1.25, 'fire'));
  // 消火栓・屋上の空調・木・街灯
  parts.push(prism(1.55, 1.25, 0.035, 0, 0.1, state.bad, undefined, 8));
  parts.push(rooftopUnit(0.4, 0.4, h, 1));
  parts.push(conifer(1.7, 1.6, 0.8));
  parts.push(broadleafTree(1.5, 1.82, 0.65, 1));
  parts.push(...streetLamp(1.9, 1.88, '-x'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 1.0 };
}

/* ---------- 学校（3×2）: L 字の校舎と校庭（白線）、体育館、門と並木 ---------- */

export function school(): Model {
  const wall = mix(city.wallStone, city.lineWhite, 0.5);
  const roof = mix(city.roofTile, city.curb, 0.15);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 3, 2, mix(city.paving, city.sand, 0.35)),
    // 校庭（土の色）と白線のトラック
    pad(1.15, 0.95, 2.9, 1.92, mix(city.sand, city.roofTile, 0.12)),
    ...groundRing(2.02, 1.43, 0.72, 0.36, 0.03, city.lineWhite),
    groundPoly([[2.0, 1.07], [2.03, 1.07], [2.03, 1.79], [2.0, 1.79]], city.lineWhite),
    // 門から昇降口までの石畳
    pad(0.35, 1.05, 0.75, 1.98, mix(city.paving, city.lineWhite, 0.3)),
  ];
  const fh = 0.28;
  const floors = 3;
  const h = fh * floors + 0.05;
  // L 字の校舎（東西に長い棟と、西の南北の棟）
  const main = { x0: 0.1, y0: 0.12, x1: 2.25, y1: 0.7 };
  const west = { x0: 0.1, y0: 0.7, x1: 0.32, y1: 1.6 };
  for (const [b, seed] of [[main, 121], [west, 122]] as const) {
    parts.push(box({ ...b, z0: 0, z1: h, wall, top: mix(city.paving, city.curb, 0.1) }, [
      ...windows(b, { floor: fh, floors, base: 0.03, width: 0.13, pitch: 0.2, height: 0.55, litRatio: 0.35, noise: noiseOf(seed), frame: shade(wall, 0.65),
        skip: b === main ? [{ side: '+y', u0: 1.55, u1: 1.85, floor: 0 }] : [] }),
      ...band(b, fh * 2, fh * 2 + 0.03, mix(city.wallGlass, NAVY, 0.3)),
    ]));
    parts.push(...parapet(b.x0, b.y0, b.x1, b.y1, h, 0.04, shade(wall, 0.85)));
  }
  // 時計（校舎の正面）と昇降口
  parts.push(part([faceDisc(main, '+y', 1.1, h - 0.17, 0.1, city.lineWhite, 2), faceDisc(main, '+y', 1.1, h - 0.17, 0.07, NAVY, 3)], [1.0, main.y1, h - 0.3], [1.2, main.y1 + 0.02, h - 0.05]));
  parts.push(...door(main, '+y', 1.58, 0.24, 0.22, NAVY, shade(wall, 0.8)));
  // 体育館（切妻の大屋根）
  const gym = { x0: 2.3, y0: 0.12, x1: 2.9, y1: 0.85 };
  parts.push(box({ ...gym, z0: 0, z1: 0.55, wall: mix(wall, city.sand, 0.35) }, [
    ...windows(gym, { floor: 0.5, floors: 1, base: 0.3, width: 0.1, pitch: 0.18, height: 0.3, litRatio: 0.3, noise: noiseOf(123) }),
  ]));
  parts.push(gableRoof({ ...gym, z: 0.55, rise: 0.22, ridge: 'y', roof, wall: mix(wall, city.sand, 0.35), eave: 0.05 }));
  // 屋上の給水塔
  parts.push(prism(0.5, 0.35, 0.08, h, h + 0.18, mix(city.lineWhite, city.wallStone, 0.3), undefined, 10));
  // 門柱と並木・鉄棒
  parts.push(box({ x0: 0.3, y0: 1.9, z0: 0, x1: 0.36, y1: 1.97, z1: 0.18, wall: shade(wall, 0.85) }), box({ x0: 0.74, y0: 1.9, z0: 0, x1: 0.8, y1: 1.97, z1: 0.18, wall: shade(wall, 0.85) }));
  for (const x of [1.25, 1.65, 2.05, 2.45, 2.85]) parts.push(broadleafTree(x, 1.93, 0.55, Math.round(x * 3) % 3));
  parts.push(rod([2.65, 1.05, 0.14], [2.85, 1.05, 0.14], 0.012, city.curb), rod([2.65, 1.05, 0], [2.65, 1.05, 0.14], 0.012, city.curb), rod([2.85, 1.05, 0], [2.85, 1.05, 0.14], 0.012, city.curb));
  parts.push(...streetLamp(0.95, 1.88, '-x'));
  return { w: 3, d: 2, ground, parts, shadowHeight: 0.9 };
}

/* ---------- 診療所（1×2）: 白い 2 階建てと十字でない印（葉を抱く輪）、車寄せ ---------- */

export function clinic(): Model {
  const wall = mix(city.lineWhite, city.wallStone, 0.15);
  const green = mix(city.tree3, city.lineWhite, 0.25);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 1, 2, mix(city.paving, city.sand, 0.25)),
    // 車寄せのロータリーの白線
    pad(0.08, 1.25, 0.92, 1.98, mix(city.paving, city.curb, 0.2)),
    ...groundRing(0.5, 1.62, 0.28, 0.2, 0.025, city.lineWhite),
    groundPoly([[0.05, 1.05], [0.95, 1.05], [0.95, 1.2], [0.05, 1.2]], city.grass),
  ];
  const b = { x0: 0.1, y0: 0.12, x1: 0.9, y1: 1.0 };
  const fh = 0.3;
  const h = fh * 2 + 0.04;
  parts.push(box({ ...b, z0: 0, z1: h, wall, top: mix(city.paving, city.lineWhite, 0.3) }, [
    ...windows(b, { floor: fh, floors: 2, base: 0.03, width: 0.12, pitch: 0.2, height: 0.5, litRatio: 0.5, noise: noiseOf(131), frame: shade(wall, 0.7), skip: [{ side: '+y', u0: 0.25, u1: 0.55, floor: 0 }] }),
    ...band(b, fh, fh + 0.03, green),
  ]));
  parts.push(...parapet(b.x0, b.y0, b.x1, b.y1, h, 0.04, shade(wall, 0.85)));
  // 印（緑の輪の中に、白い 2 枚の葉。十字は使わない）
  parts.push(part([
    faceDisc(b, '+y', 0.15, h - 0.17, 0.1, green, 2),
    faceDisc(b, '+y', 0.15, h - 0.17, 0.075, city.lineWhite, 3),
    { kind: 'poly', pts: onFace(b, '+y', 0.11, 0.15, h - 0.24, h - 0.13, 0.012), color: green, layer: 4 },
    { kind: 'poly', pts: onFace(b, '+y', 0.15, 0.19, h - 0.21, h - 0.1, 0.012), color: green, layer: 4 },
  ], [b.x1 - 0.27, b.y1, h - 0.3], [b.x1 - 0.03, b.y1 + 0.02, h - 0.05]));
  parts.push(...door(b, '+y', 0.3, 0.2, 0.22, mix(city.wallGlass, NAVY, 0.2), wall));
  // 車寄せの屋根（4 本の柱）
  const roofZ = 0.3;
  parts.push(box({ x0: 0.22, y0: 1.0, z0: roofZ, x1: 0.78, y1: 1.4, z1: roofZ + 0.04, wall: mix(wall, city.curb, 0.15), top: wall }));
  for (const [x, y] of [[0.25, 1.37], [0.75, 1.37]] as [number, number][]) parts.push(rod([x, y, 0], [x, y, roofZ], 0.02, city.curb));
  // 救急車と、屋上の空調・植え込み・木
  parts.push(...serviceCar(0.18, 1.55, 'ambulance'));
  parts.push(rooftopUnit(0.4, 0.4, h, 0.8));
  parts.push(hedge(0.05, 1.08, 0.2, 1.18));
  parts.push(broadleafTree(0.82, 1.82, 0.55, 0));
  return { w: 1, d: 2, ground, parts, shadowHeight: 0.7 };
}

/* ---------- 火力の発電所（2×2）: 煙突 2 本（白い湯気）・タンク・変電の設備・囲いの塀 ---------- */

export function powerThermal(): Model {
  const steel = mix(city.wallStone, city.curb, 0.45);
  const wall = mix(city.wallStone, city.curb, 0.2);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.curb, 0.2)),
    pad(1.25, 1.2, 1.92, 1.92, mix(city.paving, city.sand, 0.3)),
  ];
  // 発電機の建屋（タービンの棟。高い窓の帯）
  const hall = { x0: 0.12, y0: 0.15, x1: 1.15, y1: 0.95 };
  const h = 0.62;
  parts.push(box({ ...hall, z0: 0, z1: h, wall }, [
    ...windows(hall, { floor: 0.55, floors: 1, base: 0.35, width: 0.08, pitch: 0.16, height: 0.35, litRatio: 0.4, noise: noiseOf(141), frame: shade(wall, 0.55) }),
    ...band(hall, 0.25, 0.28, shade(steel, 0.85)),
  ]));
  parts.push(gableRoof({ ...hall, z: h, rise: 0.1, ridge: 'x', roof: shade(steel, 0.9), wall, eave: 0.03 }));
  parts.push(...door(hall, '+y', 0.15, 0.3, 0.3, shade(steel, 0.7), wall));
  // 煙突 2 本（赤白の帯）と、頂の白い湯気
  for (const [cx, cy] of [[0.4, 0.45], [0.8, 0.45]] as [number, number][]) {
    parts.push(prism(cx, cy, 0.07, h, 1.75, mix(city.lineWhite, city.wallStone, 0.3), shade(steel, 0.6), 12));
    parts.push(prism(cx, cy, 0.075, 1.45, 1.55, mix(state.bad, city.roofTile, 0.3), undefined, 12));
    parts.push(prism(cx, cy, 0.075, 1.65, 1.72, mix(state.bad, city.roofTile, 0.3), undefined, 12));
    parts.push(part([
      { kind: 'blob', center: [cx + 0.03, cy - 0.02, 1.86], r: 0.11, squash: 0.7, color: mix(city.lineWhite, city.wallGlass, 0.15), alpha: 0.85 },
      { kind: 'blob', center: [cx + 0.12, cy - 0.06, 1.98], r: 0.09, squash: 0.7, color: city.lineWhite, alpha: 0.7, layer: 1 },
    ], [cx - 0.08, cy - 0.15, 1.75], [cx + 0.21, cy + 0.08, 2.05]));
  }
  // 燃料のタンク 2 基（丸い筒と、上の手すり）
  for (const [cx, cy] of [[1.5, 0.45], [1.5, 0.95]] as [number, number][]) {
    parts.push(prism(cx, cy, 0.2, 0, 0.42, mix(city.lineWhite, city.wallStone, 0.2), mix(city.lineWhite, city.wallStone, 0.35), 16));
    parts.push(rod([cx - 0.2, cy, 0.42], [cx - 0.2, cy, 0.48], 0.008, city.curb));
    parts.push(rod([cx + 0.18, cy - 0.08, 0.42], [cx + 0.18, cy - 0.08, 0.48], 0.008, city.curb));
  }
  parts.push(rod([1.3, 0.45, 0.25], [1.15, 0.45, 0.25], 0.025, shade(steel, 0.8)), rod([1.3, 0.95, 0.25], [1.15, 0.75, 0.25], 0.025, shade(steel, 0.8)));
  // 変電の設備（碍子の柱と、横の線）
  for (const x of [1.35, 1.6, 1.85]) {
    parts.push(rod([x, 1.4, 0], [x, 1.4, 0.4], 0.016, steel));
    parts.push(box({ x0: x - 0.06, y0: 1.55, z0: 0, x1: x + 0.04, y1: 1.7, z1: 0.18, wall: mix(steel, NAVY, 0.2) }));
  }
  parts.push(rod([1.3, 1.4, 0.38], [1.9, 1.4, 0.38], 0.008, city.curb));
  // 囲いの塀（正面に門）
  parts.push(lowWall([0.03, 0.03], [1.97, 0.03], 0.16, mix(wall, city.sand, 0.2)));
  parts.push(lowWall([0.03, 0.03], [0.03, 1.97], 0.16, mix(wall, city.sand, 0.2)));
  parts.push(lowWall([1.97, 0.03], [1.97, 1.97], 0.16, mix(wall, city.sand, 0.2)));
  parts.push(lowWall([0.03, 1.97], [0.7, 1.97], 0.16, mix(wall, city.sand, 0.2)));
  parts.push(lowWall([1.2, 1.97], [1.97, 1.97], 0.16, mix(wall, city.sand, 0.2)));
  parts.push(...streetLamp(0.9, 1.85, '-x'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 1.1 };
}

/* ---------- 太陽光の発電所（3×3）: 傾いた板の列・管理棟・変電の設備・周りの草地 ---------- */

export function powerSolar(): Model {
  const panel = mix(city.wallGlass, NAVY, 0.55);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 3, 3, city.grassDark),
    pad(0.05, 2.45, 1.1, 2.95, mix(city.paving, city.sand, 0.3)),
    // 板の列の間の保守の通路
    ...[0.68, 1.28, 1.88].map((y) => groundPoly([[0.15, y], [2.85, y], [2.85, y + 0.05], [0.15, y + 0.05]], mix(city.sand, city.grass, 0.4))),
  ];
  // 板の列（4 列。南へ傾け、細い脚で支える。面の傾きに沿った反射の筋）
  for (const [r, y0] of [0.15, 0.75, 1.35, 1.95].entries()) {
    const y1 = y0 + 0.42;
    const x0 = r === 3 ? 1.2 : 0.15;
    const x1 = 2.85;
    const lo = 0.08;
    const hi = 0.26;
    parts.push(part([
      { kind: 'poly', pts: [[x1, y1, lo], [x0, y1, lo], [x0, y0, hi], [x1, y0, hi]], color: panel, double: true },
      ...Array.from({ length: Math.floor((x1 - x0) / 0.3) }, (_, i): Poly => {
        const x = x0 + 0.3 * (i + 1);
        return { kind: 'poly', pts: [[x + 0.01, y1, lo + 0.002], [x - 0.01, y1, lo + 0.002], [x - 0.01, y0, hi + 0.002], [x + 0.01, y0, hi + 0.002]], color: mix(panel, city.lineWhite, 0.25), layer: 1, double: true };
      }),
      { kind: 'poly', pts: [[x1, y0 + 0.16, hi - 0.072], [x0, y0 + 0.16, hi - 0.072], [x0, y0 + 0.1, hi - 0.045], [x1, y0 + 0.1, hi - 0.045]], color: mix(panel, city.lineWhite, 0.45), layer: 2, double: true },
    ], [x0, y0, lo], [x1, y1, hi]));
    for (const x of [x0 + 0.05, (x0 + x1) / 2, x1 - 0.05]) parts.push(rod([x, y0 + 0.05, 0], [x, y0 + 0.05, hi - 0.02], 0.01, city.curb));
  }
  // 管理棟（平屋と、屋根の上の小さな板）
  const office = { x0: 0.15, y0: 2.0, x1: 0.95, y1: 2.45 };
  const wall = mix(city.wallStone, city.lineWhite, 0.4);
  parts.push(box({ ...office, z0: 0, z1: 0.3, wall }, windows(office, { floor: 0.28, floors: 1, base: 0.02, width: 0.12, pitch: 0.22, height: 0.5, litRatio: 0.4, noise: noiseOf(151), frame: shade(wall, 0.6), skip: [{ side: '+y', u0: 0.3, u1: 0.55, floor: 0 }] })));
  parts.push(gableRoof({ ...office, z: 0.3, rise: 0.1, ridge: 'x', roof: city.roofTile, wall, eave: 0.04 }));
  parts.push(...door(office, '+y', 0.32, 0.2, 0.2, NAVY, wall));
  // 変電の設備（柵の中の変圧器と、碍子の柱）
  const yard = { x0: 1.5, y0: 2.3, x1: 2.85, y1: 2.9 };
  parts.push(box({ x0: 1.65, y0: 2.45, z0: 0, x1: 2.0, y1: 2.75, z1: 0.24, wall: mix(city.curb, NAVY, 0.15) }, [...band({ x0: 1.65, y0: 2.45, x1: 2.0, y1: 2.75 }, 0.16, 0.18, state.warn)]));
  for (const x of [2.2, 2.45, 2.7]) parts.push(rod([x, 2.55, 0], [x, 2.55, 0.42], 0.015, mix(city.wallStone, city.curb, 0.4)));
  parts.push(rod([2.15, 2.55, 0.4], [2.75, 2.55, 0.4], 0.008, city.curb));
  parts.push(lowWall([yard.x0, yard.y0], [yard.x1, yard.y0], 0.12, city.curb, 0.02), lowWall([yard.x0, yard.y0], [yard.x0, yard.y1], 0.12, city.curb, 0.02));
  // 周りの草地の木と植え込み
  parts.push(broadleafTree(1.25, 2.75, 0.6, 1), conifer(2.92, 0.1, 0.55), hedge(0.05, 2.9, 1.1, 2.97));
  return { w: 3, d: 3, ground, parts, shadowHeight: 0.35 };
}

/* ---------- 陸揚げ所（1×1）: 小さな変電の建物と、海へ伸びる線 ---------- */

export function landing(): Model {
  const wall = mix(city.wallStone, city.lineWhite, 0.3);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0.05, 0.05, 0.95, 0.95, mix(city.paving, city.sand, 0.35)),
    // 海底ケーブルの埋めた線（点検のふたの並び）
    groundPoly([[0.45, 0.6], [0.55, 0.6], [0.55, 1.0], [0.45, 1.0]], mix(city.curb, NAVY, 0.3)),
    groundPoly([[0.42, 0.85], [0.58, 0.85], [0.58, 0.92], [0.42, 0.92]], shade(city.curb, 0.7)),
  ];
  const b = { x0: 0.15, y0: 0.15, x1: 0.62, y1: 0.55 };
  parts.push(box({ ...b, z0: 0, z1: 0.3, wall }, [
    ...band(b, 0.22, 0.24, state.warn),
    { kind: 'poly', pts: onFace(b, '+x', 0.1, 0.3, 0.05, 0.22), color: shade(city.curb, 0.8), layer: 1 },
  ]));
  parts.push(...parapet(b.x0, b.y0, b.x1, b.y1, 0.3, 0.03, shade(wall, 0.85)));
  // 碍子の柱と、引き込みの線
  parts.push(rod([0.78, 0.3, 0], [0.78, 0.3, 0.45], 0.014, mix(city.wallStone, city.curb, 0.4)));
  parts.push(rod([0.62, 0.35, 0.25], [0.78, 0.3, 0.42], 0.008, city.curb));
  parts.push(rod([0.78, 0.3, 0.42], [0.5, 0.75, 0.04], 0.008, city.curb));
  // 柵と、低い植え込み
  parts.push(...[[0.05, 0.05, 0.95, 0.05], [0.95, 0.05, 0.95, 0.95], [0.05, 0.05, 0.05, 0.95]].map(([ax, ay, bx, by]) => lowWall([ax as number, ay as number], [bx as number, by as number], 0.1, city.curb, 0.02)));
  parts.push(hedge(0.1, 0.82, 0.38, 0.92));
  return { w: 1, d: 1, ground, parts, shadowHeight: 0.4 };
}

/** 陸揚げ所の絵の名前（src/city/assets/civic/landing.svg） */
export const LANDING_ASSET = 'landing';
