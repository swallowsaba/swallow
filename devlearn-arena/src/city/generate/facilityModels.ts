import { city, domain, hud, mix, rgbaOf, shade, state } from '@/ui/tokens';
import type { FacilityType } from '../types';
import { fencedLot } from './buildings';
import { band, beacon, solarPanels } from './facilityKit';
import { cloud, cluster, research } from './facilities/campus';
import { container, datacenter, deploy } from './facilities/industry';
import { devoffice, devops, incident, monitor, security, web } from './facilities/offices';
import { fountain, park, plaza, treerow } from './facilities/parks';
import type { Model, Part, Poly } from './mesh';
import {
  box, broadleafTree, conifer, door, faceDisc, gableRoof, groundPoly, groundRing, hedge, hipRoof, pad, parapet, part, prism,
  pyramidRoof, rod, rooftopUnit, signBoard, streetLamp, windows,
} from './shapes';

/**
 * 施設の模型（docs/city-design.md 4 章の「見た目の特徴」）。
 * この模型から施設の SVG（src/city/assets/facilities/<施設>/lv<N>.svg）を作る（tools/build-facility-svgs.mts）。
 * 正面（入口）は +y。Lv が上がると「加わるもの」を足す。
 */

const NAVY = rgbaOf(hud.bg, 1);
const noiseOf = (seed: number) => (a: number, b: number, c: number): number => {
  const v = Math.sin(seed * 12.9898 + a * 78.233 + b * 37.719 + c * 11.131) * 43758.5453;
  return v - Math.floor(v);
};

/* ---------- 市立 IT 学院（3×3）: 校舎と時計塔 → 図書館棟（Lv2）→ 講堂（Lv3）→ 3 階建て（Lv4）→ 4 階建てと鐘楼（Lv5） ---------- */

function academy(level: number): Model {
  const wall = mix(city.wallStone, city.lineWhite, 0.45);
  const roof = city.roofTile;
  const fh = 0.3;
  const noise = noiseOf(1);
  const frame = shade(wall, 0.55);
  const parts: Part[] = [];
  const floors = level >= 5 ? 4 : level >= 4 ? 3 : 2;
  const ground: Poly[] = [pad(0, 0, 3, 3, mix(city.paving, city.sand, 0.5))];
  if (level < 3) {
    // 運動場（Lv2 は図書館棟の分だけ右へ寄せる）
    const [x0, cx, rx] = level >= 2 ? [0.95, 1.45, 0.45] : [0.12, 1.03, 0.78];
    ground.push(pad(x0, 1.55, 1.95, 2.88, mix(city.sand, city.roofTile, 0.12)), ...groundRing(cx, 2.22, rx, 0.55, 0.035, city.lineWhite));
  } else {
    // 講堂の前の石畳の広場
    ground.push(pad(0.12, 2.45, 1.95, 2.9, mix(city.paving, city.lineWhite, 0.3)));
  }
  ground.push(
    pad(2.25, 2.2, 2.75, 3, mix(city.paving, city.lineWhite, 0.35)),
    groundPoly([[0.02, 1.2], [0.1, 1.2], [0.1, 2.95], [0.02, 2.95]], city.grass),
  );

  // 本館（東西に長い。Lv が上がると階が増える）
  const main = { x0: 0.15, y0: 0.18, x1: 2.85, y1: 0.95 };
  const h = floors * fh + 0.06;
  parts.push(box({ ...main, z0: 0, z1: h, wall }, [
    ...windows(main, { floor: fh, floors, base: 0.06, width: 0.13, pitch: 0.28, height: 0.55, litRatio: 0.4, noise, frame }),
    ...(level >= 4 ? band(main, fh + 0.04, fh + 0.06, mix(domain.found, wall, 0.4)) : []),
  ]));
  parts.push(gableRoof({ ...main, z: h, rise: 0.24, ridge: 'x', roof, wall, eave: 0.07 }));
  if (level >= 4) {
    // 屋根の明かり取り（ドーマー）
    for (const x of [0.45, 1.75, 2.35]) {
      const d = { x0: x, y0: 0.66, x1: x + 0.2, y1: 0.86 };
      parts.push(box({ ...d, z0: h, z1: h + 0.15, wall }, windows(d, { floor: 0.13, floors: 1, base: 0.01, width: 0.08, pitch: 0.2, height: 0.7, litRatio: 0.5, noise: noiseOf(x * 10) })));
      parts.push(gableRoof({ ...d, z: h + 0.15, rise: 0.08, ridge: 'y', roof, wall, eave: 0.02 }));
    }
  }
  // 東棟（南北に長い）
  const wing = { x0: 2.05, y0: 0.95, x1: 2.85, y1: 2.15 };
  parts.push(box({ ...wing, z0: 0, z1: h, wall }, windows(wing, { floor: fh, floors, base: 0.06, width: 0.12, pitch: 0.24, height: 0.55, litRatio: 0.4, noise: noiseOf(2), frame,
    skip: [{ side: '+y', u0: 0.25, u1: 0.55, floor: 0 }] })));
  parts.push(gableRoof({ ...wing, z: h, rise: 0.22, ridge: 'y', roof, wall, eave: 0.07 }));
  parts.push(...door(wing, '+y', 0.28, 0.24, 0.24, shade(city.roofTile, 0.45), shade(roof, 0.85)));
  // 時計塔（本館より高い）
  const tower = { x0: 0.95, y0: 0.82, x1: 1.45, y1: 1.32 };
  const th = h + 0.69;
  const towerFloors = Math.floor((th - 0.3) / 0.3);
  parts.push(box({ ...tower, z0: 0, z1: th, wall: mix(wall, city.sand, 0.3) }, [
    ...windows(tower, { floor: 0.3, floors: towerFloors, base: 0.08, width: 0.1, pitch: 0.24, height: 0.5, litRatio: 0.5, noise: noiseOf(3), frame, skip: [{ side: '+y', u0: 0.1, u1: 0.4, floor: 0 }] }),
    faceDisc(tower, '+y', 0.25, th - 0.2, 0.13, city.lineWhite, 2),
    faceDisc(tower, '+x', 0.25, th - 0.2, 0.13, city.lineWhite, 2),
  ]));
  // 時計の針
  parts.push(part([
    { kind: 'poly', pts: [[1.21, 1.33, th - 0.2], [1.19, 1.33, th - 0.2], [1.19, 1.33, th - 0.1], [1.21, 1.33, th - 0.1]], color: NAVY, layer: 3, lit: true },
    { kind: 'poly', pts: [[1.2, 1.335, th - 0.205], [1.13, 1.335, th - 0.205], [1.13, 1.335, th - 0.19], [1.2, 1.335, th - 0.19]], color: NAVY, layer: 3, lit: true },
  ], [1.13, 1.33, th - 0.21], [1.21, 1.34, th - 0.1]));
  parts.push(box({ x0: 0.9, y0: 0.77, z0: th, x1: 1.5, y1: 1.37, z1: th + 0.05, wall: shade(wall, 0.85) }));
  let spire = th + 0.05;
  if (level >= 5) {
    // 鐘楼（4 本の柱の間に鐘）
    for (const [x, y] of [[0.95, 0.82], [1.4, 0.82], [0.95, 1.27], [1.4, 1.27]] as [number, number][]) parts.push(box({ x0: x, y0: y, z0: th + 0.05, x1: x + 0.05, y1: y + 0.05, z1: th + 0.27, wall: mix(wall, city.sand, 0.3) }));
    parts.push(prism(1.2, 1.07, 0.08, th + 0.1, th + 0.22, mix(city.sand, city.roofTile, 0.5), undefined, 8));
    parts.push(box({ x0: 0.9, y0: 0.77, z0: th + 0.27, x1: 1.5, y1: 1.37, z1: th + 0.32, wall: shade(wall, 0.85) }));
    spire = th + 0.32;
  }
  const rise = level >= 5 ? 0.6 : 0.42;
  parts.push(pyramidRoof(0.92, 0.79, 1.48, 1.35, spire, rise, mix(roof, NAVY, 0.25), 0.03));
  parts.push(rod([1.2, 1.07, spire + rise], [1.2, 1.07, spire + rise + 0.15], 0.014, city.curb));
  parts.push(...door(tower, '+y', 0.13, 0.24, 0.24, shade(city.roofTile, 0.45), shade(roof, 0.85)));

  if (level >= 2) {
    // 図書館棟（西。縦長の大きな窓と寄棟屋根）
    const lib = { x0: 0.15, y0: 1.15, x1: 0.82, y1: 2.15 };
    const lfl = level >= 5 ? 3 : 2;
    const lh = lfl * 0.32 + 0.06;
    parts.push(box({ ...lib, z0: 0, z1: lh, wall: mix(wall, city.sand, 0.2) }, [
      ...windows(lib, { floor: 0.32, floors: lfl, base: 0.06, width: 0.09, pitch: 0.2, height: 0.75, litRatio: 0.5, noise: noiseOf(4), frame, skip: [{ side: '+x', u0: 0.35, u1: 0.65, floor: 0 }] }),
      ...band(lib, 0.36, 0.38, mix(domain.found, wall, 0.5)),
    ]));
    parts.push(hipRoof(lib.x0, lib.y0, lib.x1, lib.y1, lh, 0.26, mix(roof, city.wallGlass, 0.2), 0.06));
    parts.push(...door(lib, '+x', 0.38, 0.22, 0.26, shade(city.roofTile, 0.45), shade(roof, 0.85)));
    parts.push(signBoard(lib, '+y', 0.12, 0.55, lh - 0.18, lh - 0.08, mix(domain.found, NAVY, 0.3)));
  }
  if (level >= 3) {
    // 講堂（前に列柱と三角の破風）
    const hall = { x0: 0.98, y0: 1.5, x1: 1.92, y1: 2.35 };
    const ah = 0.62;
    const hallWall = mix(wall, city.lineWhite, 0.3);
    parts.push(box({ ...hall, z0: 0, z1: ah, wall: hallWall }, [
      ...windows(hall, { floor: 0.5, floors: 1, base: 0.06, width: 0.08, pitch: 0.2, height: 0.8, litRatio: 0.45, noise: noiseOf(5), frame, skip: [{ side: '+y', u0: 0, u1: 2, floor: 0 }] }),
      ...band(hall, ah - 0.08, ah - 0.04, mix(domain.found, NAVY, 0.2)),
    ]));
    parts.push(gableRoof({ ...hall, z: ah, rise: 0.3, ridge: 'y', roof: mix(roof, NAVY, 0.15), wall: hallWall, eave: 0.05 }));
    parts.push(...door(hall, '+y', 0.32, 0.3, 0.32, shade(city.roofTile, 0.45), hallWall));
    // 列柱の張り出し（柱 4 本と、上の梁と、足元の段）
    parts.push(box({ x0: 1.02, y0: 2.35, z0: 0, x1: 1.88, y1: 2.55, z1: 0.03, wall: mix(city.paving, city.lineWhite, 0.4) }));
    for (let i = 0; i < 4; i += 1) parts.push(prism(1.1 + i * 0.23, 2.47, 0.035, 0.03, ah - 0.06, city.lineWhite, undefined, 8));
    parts.push(box({ x0: 1.02, y0: 2.35, z0: ah - 0.06, x1: 1.88, y1: 2.55, z1: ah, wall: city.lineWhite }));
  }
  // 旗竿と旗
  parts.push(rod([2.0, 1.4, 0], [2.0, 1.4, 1.0], 0.016, city.curb));
  parts.push(part([{ kind: 'poly', pts: [[2.0, 1.4, 0.98], [2.0, 1.72, 0.94], [2.0, 1.72, 0.8], [2.0, 1.4, 0.84]], color: domain.found, double: true }], [2, 1.4, 0.8], [2.01, 1.72, 0.98]));
  // 看板（門の横）
  parts.push(box({ x0: 2.05, y0: 2.82, z0: 0, x1: 2.2, y1: 2.92, z1: 0.24, wall: shade(city.curb, 0.85) }, [
    { kind: 'poly', pts: [[2.2 + 0.006, 2.83, 0.08], [2.2 + 0.006, 2.91, 0.08], [2.2 + 0.006, 2.91, 0.21], [2.2 + 0.006, 2.83, 0.21]], color: mix(domain.found, city.lineWhite, 0.3), layer: 1 },
  ]));
  parts.push(box({ x0: 2.8, y0: 2.82, z0: 0, x1: 2.92, y1: 2.92, z1: 0.24, wall: shade(city.curb, 0.85) }));
  // 植え込み・並木・自転車置き場
  parts.push(hedge(0.15, 2.92, 1.95, 2.98));
  parts.push(hedge(1.98, 1.5, 2.04, 2.85));
  const trees: [number, number, number][] = level >= 2
    ? [[0.25, 2.4, 0], [0.55, 2.7, 1], [2.9, 2.5, 0]]
    : [[0.3, 1.3, 0], [0.12, 1.75, 1], [0.12, 2.3, 2], [0.4, 2.75, 1], [2.9, 2.5, 0]];
  for (const [x, y, v] of trees) parts.push(broadleafTree(x, y, 0.85, v));
  for (let i = 0; i < 5; i += 1) parts.push(rod([2.3 + i * 0.1, 2.3, 0], [2.3 + i * 0.1, 2.3, 0.08], 0.012, shade(city.curb, 0.7)));
  parts.push(rod([2.28, 2.3, 0.08], [2.72, 2.3, 0.08], 0.012, shade(city.curb, 0.7)));
  if (level >= 4) parts.push(...streetLamp(0.95, 2.75, '+x'), ...streetLamp(1.9, 2.62, '-x'));

  return { w: 3, d: 3, ground, parts, shadowHeight: 1.1 + (floors - 2) * 0.3 };
}

/* ---------- サーバ施設（2×2）: 平屋のサーバ棟と冷却塔 → 増築棟（Lv2）→ 発電設備（Lv3）→ 2 階建て（Lv4）→ 屋上の太陽光と高い増築棟（Lv5） ---------- */

function server(level: number): Model {
  const wall = mix(city.wallStone, city.curb, 0.25);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.lineWhite, 0.15)),
    pad(0.8, 1.6, 1.2, 2, mix(city.paving, city.sand, 0.25)),
    groundPoly([[1.35, 0.25], [1.95, 0.25], [1.95, 1.5], [1.35, 1.5]], mix(city.paving, city.curb, 0.4)),
  ];
  if (level >= 3) ground.push(groundPoly([[1.3, 1.58], [1.95, 1.58], [1.95, 1.95], [1.3, 1.95]], mix(city.paving, state.warn, 0.15)));
  const hall = { x0: 0.18, y0: 0.18, x1: 1.3, y1: 1.55 };
  const floors = level >= 4 ? 2 : 1;
  const h = 0.46 + (floors - 1) * 0.34;
  // 細い換気口の帯（灯りは少なく）
  const vents: Poly[] = [];
  for (let f = 0; f < floors; f += 1) {
    for (let i = 0; i < 4; i += 1) {
      const z = 0.3 + f * 0.34;
      vents.push({ kind: 'poly', pts: [[hall.x1 + 0.006, 0.3 + i * 0.3, z], [hall.x1 + 0.006, 0.5 + i * 0.3, z], [hall.x1 + 0.006, 0.5 + i * 0.3, z + 0.08], [hall.x1 + 0.006, 0.3 + i * 0.3, z + 0.08]], color: shade(wall, 0.6), layer: 1 });
    }
  }
  parts.push(box({ ...hall, z0: 0, z1: h, wall, top: mix(city.paving, city.lineWhite, 0.3) }, [
    ...vents,
    ...windows(hall, { floor: 0.4, floors: 1, base: 0.05, width: 0.08, pitch: 0.28, height: 0.3, litRatio: 0.35, noise: noiseOf(5), frame: shade(wall, 0.5),
      skip: [{ side: '+y', u0: 0.3, u1: 0.8, floor: 0 }, { side: '+x', u0: 0, u1: 2, floor: 0 }] }),
    ...(floors >= 2 ? windows(hall, { floor: 0.34, floors: 1, base: 0.46, width: 0.08, pitch: 0.2, height: 0.45, litRatio: 0.45, noise: noiseOf(6), frame: shade(wall, 0.5), skip: [{ side: '+x', u0: 0, u1: 2, floor: 0 }] }) : []),
    ...(floors >= 2 ? band(hall, 0.44, 0.47, mix(domain.linux, wall, 0.3)) : []),
  ]));
  parts.push(...parapet(hall.x0, hall.y0, hall.x1, hall.y1, h, 0.04, shade(wall, 0.9)));
  // 搬入口のシャッター（横縞）
  const shutterRows: Poly[] = [];
  for (let i = 0; i < 6; i += 1) {
    const z0 = 0.02 + i * 0.045;
    shutterRows.push({ kind: 'poly', pts: [[hall.x1 - 0.32, hall.y1 + 0.007, z0], [hall.x1 - 0.72, hall.y1 + 0.007, z0], [hall.x1 - 0.72, hall.y1 + 0.007, z0 + 0.035], [hall.x1 - 0.32, hall.y1 + 0.007, z0 + 0.035]], color: i % 2 ? shade(city.curb, 0.95) : shade(city.curb, 0.8), layer: 1 });
  }
  parts.push(part(shutterRows, [hall.x1 - 0.72, hall.y1, 0], [hall.x1 - 0.32, hall.y1 + 0.01, 0.3]));
  parts.push(box({ x0: hall.x1 - 0.78, y0: hall.y1, z0: 0.3, x1: hall.x1 - 0.26, y1: hall.y1 + 0.14, z1: 0.33, wall: shade(city.curb, 0.9) }));
  parts.push(...door(hall, '+y', 0.1, 0.12, 0.22, NAVY, shade(wall, 0.8)));
  parts.push(signBoard(hall, '+y', 0.05, 0.4, 0.32, 0.42, domain.linux));
  if (level >= 2) {
    // 増築棟（奥の半分に積み増した高い棟。Lv5 でさらに高く）
    const annex = { x0: 0.24, y0: 0.24, x1: 1.24, y1: 0.85 };
    const af = level >= 5 ? 3 : 2;
    const az = h + af * 0.3;
    parts.push(box({ ...annex, z0: h, z1: az, wall: mix(wall, city.lineWhite, 0.2), top: mix(city.paving, city.lineWhite, 0.3) }, [
      ...windows({ ...annex }, { floor: 0.3, floors: af, base: h + 0.04, width: 0.07, pitch: 0.18, height: 0.45, litRatio: 0.45, noise: noiseOf(7), frame: shade(wall, 0.5) }),
      ...band(annex, az - 0.06, az - 0.03, domain.linux),
    ]));
    parts.push(...parapet(annex.x0, annex.y0, annex.x1, annex.y1, az, 0.03, shade(wall, 0.9)));
    parts.push(rooftopUnit(0.35, 0.35, az, 1.1));
    parts.push(rooftopUnit(0.75, 0.35, az, 1.1));
    if (level >= 5) {
      parts.push(rod([1.1, 0.4, az], [1.1, 0.4, az + 0.45], 0.018, city.curb));
      parts.push(beacon(1.1, 0.4, az + 0.45, domain.linux));
      parts.push(...solarPanels(0.3, 0.95, 1.2, 1.5, h, 2));
    } else {
      parts.push(rooftopUnit(0.3, 1.05, h, 1.2));
    }
  } else {
    // 屋上の空調と配管
    parts.push(rooftopUnit(0.3, 0.3, h, 1.2));
    parts.push(rooftopUnit(0.62, 0.3, h, 1.2));
    parts.push(rooftopUnit(0.3, 0.8, h, 1.2));
    parts.push(rod([0.5, 1.2, h + 0.06], [1.2, 1.2, h + 0.06], 0.03, mix(city.curb, city.lineWhite, 0.25)));
  }
  // 冷却塔 2 基（円柱と、上のファン）。Lv4 から高く
  const ct = level >= 4 ? 0.62 : 0.42;
  for (const cy of [0.55, 1.15]) {
    const cx = 1.66;
    parts.push(prism(cx, cy, 0.21, 0, ct, mix(city.wallStone, city.lineWhite, 0.3), mix(city.paving, city.curb, 0.5), 14));
    parts.push(part([
      { kind: 'blob', center: [cx, cy, ct + 0.005], r: 0.15, squash: 0.5, color: shade(city.curb, 0.4), layer: 1 },
      { kind: 'blob', center: [cx, cy, ct + 0.01], r: 0.06, squash: 0.5, color: shade(city.curb, 0.75), layer: 2 },
    ], [cx - 0.2, cy - 0.2, ct], [cx + 0.2, cy + 0.2, ct + 0.02]));
    parts.push(rod([hall.x1, cy, 0.3], [cx - 0.2, cy, 0.3], 0.035, mix(city.curb, city.lineWhite, 0.3)));
  }
  if (level >= 3) {
    // 発電設備（発電機の箱 2 台・排気筒・燃料の円筒タンク）
    for (const x of [1.35, 1.62]) {
      const g = { x0: x, y0: 1.62, x1: x + 0.24, y1: 1.9 };
      parts.push(box({ ...g, z0: 0, z1: 0.2, wall: mix(domain.linux, city.curb, 0.35), top: mix(city.curb, city.lineWhite, 0.2) }, [
        ...band(g, 0.14, 0.16, state.warn),
      ]));
      parts.push(rod([x + 0.06, 1.68, 0.2], [x + 0.06, 1.68, 0.38], 0.03, shade(city.curb, 0.7)));
    }
    parts.push(prism(1.05, 1.82, 0.1, 0, 0.18, mix(city.lineWhite, city.wallStone, 0.25), mix(city.lineWhite, city.wallStone, 0.1), 12));
  }
  // 柵と門
  parts.push(...fencedLot(2, 2, shade(city.curb, 0.85), { from: 0.75, to: 1.25 }));
  parts.push(...streetLamp(0.7, 1.9, '+x'));
  parts.push(conifer(0.12, 1.85, 0.6));
  if (level >= 4) parts.push(conifer(0.35, 1.85, 0.5));

  return { w: 2, d: 2, ground, parts, shadowHeight: level >= 2 ? h + (level >= 5 ? 0.9 : 0.6) : 0.55 };
}

/* ---------- ネットワークセンター（2×2）: 局舎と鉄塔 → アンテナ（Lv2）→ 光ケーブルの地中線（Lv3）→ 3 階と高い鉄塔（Lv4）→ 4 階と標識灯（Lv5） ---------- */

function network(level: number): Model {
  const wall = mix(city.wallStone, city.wallGlass, 0.25);
  const parts: Part[] = [];
  const fiber = mix(domain.net, city.lineWhite, 0.5);
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.sand, 0.2)),
    groundPoly([[1.15, 0.15], [1.9, 0.15], [1.9, 1.0], [1.15, 1.0]], mix(city.paving, city.curb, 0.45)),
    // 鉄塔から局舎への地中線のふた
    groundPoly([[1.2, 0.75], [1.28, 0.75], [1.28, 1.05], [1.2, 1.05]], shade(city.curb, 0.7)),
  ];
  const office = { x0: 0.18, y0: 0.85, x1: 1.2, y1: 1.7 };
  const fh = 0.27;
  const floors = level >= 5 ? 4 : level >= 4 ? 3 : 2;
  const h = floors * fh + 0.05;
  parts.push(box({ ...office, z0: 0, z1: h, wall, top: mix(city.paving, city.lineWhite, 0.25) }, [
    ...windows(office, {
      floor: fh, floors, base: 0.05, width: 0.13, pitch: 0.21, height: 0.55, litRatio: 0.42, noise: noiseOf(7), frame: shade(wall, 0.55),
      skip: [{ side: '+y', u0: 0.6, u1: 0.85, floor: 0 }],
    }),
    ...(level >= 4 ? band(office, fh * 2 + 0.03, fh * 2 + 0.05, mix(domain.net, wall, 0.3)) : []),
  ]));
  parts.push(...parapet(office.x0, office.y0, office.x1, office.y1, h, 0.04, shade(wall, 0.9)));
  parts.push(...door(office, '+y', 0.62, 0.2, 0.22, NAVY, shade(wall, 0.75)));
  parts.push(signBoard(office, '+y', 0.08, 0.5, h - 0.14, h - 0.04, domain.net));
  parts.push(rooftopUnit(0.3, 0.95, h, 1));
  // 屋上の小さなパラボラ
  parts.push(rod([0.95, 1.3, h], [0.95, 1.3, h + 0.12], 0.02, city.curb));
  parts.push(part([
    { kind: 'blob', center: [0.97, 1.32, h + 0.15], r: 0.1, squash: 0.55, color: mix(city.lineWhite, city.wallStone, 0.3) },
    { kind: 'blob', center: [0.975, 1.325, h + 0.155], r: 0.07, squash: 0.5, color: shade(city.wallStone, 0.8), layer: 1 },
  ], [0.88, 1.23, h + 0.1], [1.06, 1.41, h + 0.2]));
  if (level >= 2) {
    // 屋上のアンテナの柱（3 本）
    for (const [x, y, t] of [[0.35, 1.5, 0.4], [0.55, 1.55, 0.3], [0.75, 1.5, 0.35]] as [number, number, number][]) parts.push(rod([x, y, h], [x, y, h + t], 0.012, city.curb));
  }

  // 鉄塔（4 本の脚が上ですぼまる格子）。Lv4 から高い
  const cx = 1.52;
  const cy = 0.58;
  const height = level >= 5 ? 2.7 : level >= 4 ? 2.4 : 2.1;
  const steel = mix(city.lineWhite, city.curb, 0.35);
  const accent = mix(domain.net, city.lineWhite, 0.15);
  const rAt = (z: number): number => 0.27 - (0.27 - 0.06) * (z / height);
  const legs: [number, number][] = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
  // 奥の脚と斜材を先に、手前を後に（この SVG は回転 0 で描くため、ここで順を決める）
  const order = [3, 0, 2, 1];
  for (const li of order) {
    const [sx, sy] = legs[li] as [number, number];
    parts.push(rod([cx + sx * rAt(0), cy + sy * rAt(0), 0], [cx + sx * rAt(height), cy + sy * rAt(height), height], 0.03, li === 1 ? steel : shade(steel, 0.85)));
  }
  const tiers = Math.round(height / 0.35);
  for (let t = 0; t < tiers; t += 1) {
    const z0 = (t / tiers) * height;
    const z1 = ((t + 1) / tiers) * height;
    for (const [i, j] of [[0, 1], [1, 2]] as [number, number][]) {
      const [ax, ay] = legs[i] as [number, number];
      const [bx, by] = legs[j] as [number, number];
      parts.push(rod([cx + ax * rAt(z0), cy + ay * rAt(z0), z0], [cx + bx * rAt(z1), cy + by * rAt(z1), z1], 0.012, steel, 1));
      parts.push(rod([cx + bx * rAt(z0), cy + by * rAt(z0), z0], [cx + ax * rAt(z1), cy + ay * rAt(z1), z1], 0.012, steel, 1));
      parts.push(rod([cx + ax * rAt(z1), cy + ay * rAt(z1), z1], [cx + bx * rAt(z1), cy + by * rAt(z1), z1], 0.014, steel, 1));
    }
  }
  // 頂部のアンテナ（3 面の板）と避雷針。Lv2 から中ほどにもう 1 段と、マイクロ波の皿
  const panelRings = level >= 2 ? [height - 0.35, height * 0.72] : [height - 0.35];
  for (const [k, za] of panelRings.entries()) {
    const rr = k === 0 ? 0.1 : rAt(za) + 0.04;
    for (const [ux, uy] of [[1, 0], [0, 1], [-0.7, -0.7]] as [number, number][]) {
      const px = cx + ux * rr;
      const py = cy + uy * rr;
      parts.push(box({ x0: px - 0.03, y0: py - 0.03, z0: za, x1: px + 0.03, y1: py + 0.03, z1: za + 0.22, wall: mix(city.lineWhite, city.wallStone, 0.2) }));
    }
  }
  if (level >= 2) {
    for (const [dx, dy, z] of [[1, 0, height * 0.45], [0, 1, height * 0.58]] as [number, number, number][]) {
      const r = rAt(z) + 0.03;
      parts.push(part([
        { kind: 'blob', center: [cx + dx * r, cy + dy * r, z], r: 0.09, squash: 1, color: mix(city.lineWhite, city.wallStone, 0.25) },
        { kind: 'blob', center: [cx + dx * (r + 0.01), cy + dy * (r + 0.01), z], r: 0.06, squash: 1, color: shade(city.wallStone, 0.85), layer: 1 },
      ], [cx + dx * r - 0.09, cy + dy * r - 0.09, z - 0.09], [cx + dx * r + 0.09, cy + dy * r + 0.09, z + 0.09]));
    }
  }
  parts.push(rod([cx, cy, height], [cx, cy, height + 0.3], 0.014, steel));
  if (level >= 5) parts.push(beacon(cx, cy, height + 0.3, state.bad));
  // 中ほどの作業床（分野の色の帯）
  const zp = height * 0.55;
  const rp = rAt(zp) + 0.05;
  parts.push(box({ x0: cx - rp, y0: cy - rp, z0: zp, x1: cx + rp, y1: cy + rp, z1: zp + 0.02, wall: accent, top: shade(steel, 0.9) }));
  if (level >= 3) {
    // 光ケーブルの地中線（光る線と、点検のふた・接続箱）
    ground.push(
      groundPoly([[1.2, 1.05], [1.29, 1.05], [1.29, 1.97], [1.2, 1.97]], fiber),
      groundPoly([[1.29, 1.41], [1.97, 1.41], [1.97, 1.49], [1.29, 1.49]], fiber),
      groundPoly([[0.03, 1.76], [1.2, 1.76], [1.2, 1.84], [0.03, 1.84]], fiber),
      groundPoly([[1.16, 1.71], [1.33, 1.71], [1.33, 1.88], [1.16, 1.88]], shade(city.curb, 0.7)),
      groundPoly([[1.55, 1.36], [1.7, 1.36], [1.7, 1.53], [1.55, 1.53]], shade(city.curb, 0.7)),
    );
    for (const [x, y] of [[1.75, 1.6], [0.25, 1.88]] as [number, number][]) {
      parts.push(box({ x0: x, y0: y, z0: 0, x1: x + 0.12, y1: y + 0.08, z1: 0.14, wall: mix(city.lineWhite, city.wallStone, 0.35) }, [
        { kind: 'poly', pts: [[x + 0.11, y + 0.086, 0.09], [x + 0.01, y + 0.086, 0.09], [x + 0.01, y + 0.086, 0.11], [x + 0.11, y + 0.086, 0.11]], color: fiber, lit: true, layer: 1 },
      ]));
    }
  }
  // 柵・植え込み・木
  parts.push(...fencedLot(2, 2, shade(city.curb, 0.85), { from: 0.5, to: 1.0 }));
  parts.push(hedge(1.25, 1.85, 1.9, 1.92));
  parts.push(broadleafTree(1.65, 1.45 + (level >= 3 ? 0.2 : 0), 0.8, 1));
  parts.push(...streetLamp(0.3, 1.88, '+x'));

  return { w: 2, d: 2, ground, parts, shadowHeight: 0.8 + (floors - 2) * 0.25 };
}

const MODELS: Partial<Record<FacilityType, (level: number) => Model>> = {
  academy, server, network, web, security, devoffice, deploy, container, cluster, datacenter, cloud, monitor, devops, incident, research,
  park, treerow, plaza, fountain,
};

/** 模型のある施設（Phase 2 で 15 施設と公園の類の Lv1） */
export const MODELED_FACILITIES = Object.keys(MODELS) as FacilityType[];

export function facilityModel(type: FacilityType, level: number): Model | null {
  return MODELS[type]?.(level) ?? null;
}
