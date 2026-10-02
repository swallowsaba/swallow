import { city, domain, mix, shade, state } from '@/ui/tokens';
import { fencedLot } from '../buildings';
import { band, lowWall, NAVY, noiseOf, shutter } from '../facilityKit';
import type { Model, Part, Poly } from '../mesh';
import {
  box, broadleafTree, conifer, door, groundPoly, hedge, pad, parapet, part, prism, rod, rooftopUnit, signBoard, streetLamp, windows,
} from '../shapes';

/**
 * 工場・港・大きな建物の施設の模型（docs/city-design.md 4 章の Lv1）。正面（入口）は +y。
 * デプロイセンター（3×2）・コンテナ施設（3×3）・データセンター（3×2）。
 */

/** 積んだコンテナ 1 個（波板の筋と扉の縁） */
function containerBox(x: number, y: number, z: number, alongX: boolean, color: string): Part {
  const l = 0.4;
  const w = 0.16;
  const h = 0.15;
  const b = alongX ? { x0: x, y0: y, x1: x + l, y1: y + w } : { x0: x, y0: y, x1: x + w, y1: y + l };
  const ribs: Poly[] = [];
  const n = 5;
  for (let i = 1; i < n; i += 1) {
    const t = i / n;
    if (alongX) {
      const px = b.x0 + (b.x1 - b.x0) * t;
      ribs.push({ kind: 'poly', pts: [[px + 0.008, b.y1 + 0.004, z + 0.01], [px - 0.008, b.y1 + 0.004, z + 0.01], [px - 0.008, b.y1 + 0.004, z + h - 0.01], [px + 0.008, b.y1 + 0.004, z + h - 0.01]], color: shade(color, 0.85), layer: 1 });
    } else {
      const py = b.y0 + (b.y1 - b.y0) * t;
      ribs.push({ kind: 'poly', pts: [[b.x1 + 0.004, py - 0.008, z + 0.01], [b.x1 + 0.004, py + 0.008, z + 0.01], [b.x1 + 0.004, py + 0.008, z + h - 0.01], [b.x1 + 0.004, py - 0.008, z + h - 0.01]], color: shade(color, 0.85), layer: 1 });
    }
  }
  return box({ ...b, z0: z, z1: z + h, wall: color, top: mix(color, city.lineWhite, 0.15) }, ribs);
}

/* ---------- デプロイセンター（3×2）: 工場とベルトコンベア ---------- */

export function deploy(): Model {
  const wall = mix(city.wallStone, city.curb, 0.2);
  const roof = mix(city.curb, city.lineWhite, 0.25);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 3, 2, mix(city.paving, city.curb, 0.15)),
    pad(1.9, 1.2, 2.95, 1.95, mix(city.paving, city.lineWhite, 0.2)),
    groundPoly([[1.9, 1.2], [2.95, 1.2], [2.95, 1.23], [1.9, 1.23]], state.warn),
  ];
  // 工場の棟（のこぎり屋根）
  const hall = { x0: 0.15, y0: 0.15, x1: 1.85, y1: 1.4 };
  const h = 0.48;
  parts.push(box({ ...hall, z0: 0, z1: h, wall }, [
    ...windows(hall, { floor: 0.4, floors: 1, base: 0.06, width: 0.12, pitch: 0.3, height: 0.4, litRatio: 0.5, noise: noiseOf(91), frame: shade(wall, 0.55), skip: [{ side: '+y', u0: 0.15, u1: 0.95, floor: 0 }] }),
    ...band(hall, h - 0.06, h - 0.03, mix(domain.cicd, wall, 0.2)),
  ]));
  const teeth = 4;
  for (let i = 0; i < teeth; i += 1) {
    const y0 = hall.y0 + ((hall.y1 - hall.y0) * i) / teeth;
    const y1 = hall.y0 + ((hall.y1 - hall.y0) * (i + 1)) / teeth;
    // 北向きの縦のガラス面と、南へ下る屋根面（屋根を 1 つの凸な立体に）
    parts.push(part([
      { kind: 'poly', pts: [[hall.x0, y0, h], [hall.x1, y0, h], [hall.x1, y0, h + 0.18], [hall.x0, y0, h + 0.18]], color: mix(city.wallGlass, city.windowLit, 0.2) },
      { kind: 'poly', pts: [[hall.x1, y0, h + 0.18], [hall.x1, y1, h], [hall.x0, y1, h], [hall.x0, y0, h + 0.18]], color: roof },
      { kind: 'poly', pts: [[hall.x1, y0, h], [hall.x1, y1, h], [hall.x1, y0, h + 0.18]], color: wall },
      { kind: 'poly', pts: [[hall.x0, y1, h], [hall.x0, y0, h], [hall.x0, y0, h + 0.18]], color: wall },
    ], [hall.x0, y0, h], [hall.x1, y1, h + 0.18]));
  }
  // 搬入口のシャッター 2 枚と扉
  parts.push(shutter(hall, 0.2, 0.55, 0.3, shade(city.curb, 1.15)));
  parts.push(shutter(hall, 0.65, 1.0, 0.3, shade(city.curb, 1.15)));
  parts.push(...door(hall, '+y', 1.25, 0.14, 0.22, NAVY, shade(wall, 0.8)));
  parts.push(signBoard(hall, '+y', 1.05, 1.6, h - 0.16, h - 0.08, domain.cicd));
  // 煙突と排気の筒
  parts.push(prism(0.35, 0.35, 0.06, h, h + 0.6, mix(city.wallStone, city.lineWhite, 0.2), shade(city.curb, 0.5), 10));
  parts.push(box({ x0: 0.31, y0: 0.31, z0: h + 0.48, x1: 0.39, y1: 0.39, z1: h + 0.52, wall: state.bad }));
  // ベルトコンベア（工場から出荷口へ。脚の上の帯と、載った箱）
  const zc = 0.22;
  parts.push(box({ x0: 1.85, y0: 0.62, z0: zc, x1: 2.75, y1: 0.78, z1: zc + 0.04, wall: shade(city.curb, 0.8), top: mix(city.curb, NAVY, 0.4) }));
  for (const x of [1.95, 2.3, 2.65]) {
    parts.push(rod([x, 0.64, 0], [x, 0.64, zc], 0.02, mix(domain.cicd, city.curb, 0.4)));
    parts.push(rod([x, 0.76, 0], [x, 0.76, zc], 0.02, mix(domain.cicd, city.curb, 0.4)));
  }
  for (const x of [2.0, 2.28, 2.56]) parts.push(box({ x0: x, y0: 0.64, z0: zc + 0.04, x1: x + 0.12, y1: 0.76, z1: zc + 0.13, wall: mix(city.sand, city.roofTile, 0.25) }));
  // 出荷口の小屋と、積んだ荷
  const dock = { x0: 2.45, y0: 0.2, x1: 2.85, y1: 0.6 };
  parts.push(box({ ...dock, z0: 0, z1: 0.3, wall: mix(wall, city.lineWhite, 0.2) }));
  parts.push(box({ x0: dock.x0 - 0.04, y0: dock.y0 - 0.04, z0: 0.3, x1: dock.x1 + 0.04, y1: dock.y1 + 0.12, z1: 0.33, wall: domain.cicd }));
  for (const [x, y] of [[2.1, 1.35], [2.3, 1.35], [2.1, 1.55]] as [number, number][]) {
    parts.push(box({ x0: x, y0: y, z0: 0, x1: x + 0.16, y1: y + 0.16, z1: 0.12, wall: mix(city.sand, city.roofTile, 0.3), top: mix(city.sand, city.lineWhite, 0.2) }));
  }
  // 小さな荷役車（フォークリフト）
  parts.push(box({ x0: 2.55, y0: 1.45, z0: 0.02, x1: 2.75, y1: 1.6, z1: 0.1, wall: state.warn }));
  parts.push(rod([2.53, 1.47, 0.02], [2.53, 1.47, 0.2], 0.015, city.curb));
  parts.push(...fencedLot(3, 2, shade(city.curb, 0.85), { from: 1.95, to: 2.9 }));
  parts.push(conifer(0.2, 1.8, 0.6));
  parts.push(hedge(0.15, 1.55, 1.8, 1.62));
  parts.push(...streetLamp(1.75, 1.85, '+x'));
  return { w: 3, d: 2, ground, parts, shadowHeight: 0.75 };
}

/* ---------- コンテナ施設（3×3）: 港とクレーン、積まれたコンテナ ---------- */

export function container(): Model {
  const parts: Part[] = [];
  const quay = mix(city.paving, city.curb, 0.2);
  const ground: Poly[] = [
    pad(0, 0, 3, 3, quay),
    // 奥の船だまり（水）と、岸壁の白線
    pad(0.08, 0.08, 2.92, 0.95, mix(city.water, city.shallow, 0.4)),
    groundPoly([[0.08, 0.95], [2.92, 0.95], [2.92, 1.0], [0.08, 1.0]], city.lineWhite),
    groundPoly([[0.15, 2.05], [2.85, 2.05], [2.85, 2.08], [0.15, 2.08]], state.warn),
    pad(1.2, 2.5, 1.8, 3, mix(city.paving, city.lineWhite, 0.2)),
  ];
  // 岸壁の縁（低い壁）
  parts.push(box({ x0: 0.06, y0: 0.95, z0: 0, x1: 2.94, y1: 1.02, z1: 0.04, wall: shade(city.wallStone, 0.85) }));
  // 船だまりの小さな船（船体と船橋）
  parts.push(box({ x0: 0.4, y0: 0.32, z0: 0, x1: 1.6, y1: 0.68, z1: 0.1, wall: mix(domain.ctr, NAVY, 0.45), top: mix(city.paving, city.roofTile, 0.3) }));
  parts.push(box({ x0: 0.45, y0: 0.38, z0: 0.1, x1: 0.7, y1: 0.62, z1: 0.3, wall: city.lineWhite }, windows({ x0: 0.45, y0: 0.38, x1: 0.7, y1: 0.62 }, { floor: 0.18, floors: 1, base: 0.12, width: 0.06, pitch: 0.08, height: 0.4, litRatio: 0.6, noise: noiseOf(101) })));
  for (const x of [0.8, 1.2]) parts.push(containerBox(x, 0.42, 0.1, true, x < 1 ? domain.docker : domain.sec));
  // 積まれたコンテナ（色の違う 3 列 × 2〜3 段）
  const colors = [domain.ctr, domain.docker, domain.cicd, domain.sec, mix(domain.devops, city.curb, 0.2), domain.k8s];
  let k = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const levels = (row + col) % 3 === 0 ? 3 : 2;
      for (let lv = 0; lv < levels; lv += 1) {
        parts.push(containerBox(1.7 + col * 0.5, 1.25 + row * 0.22, lv * 0.15, true, colors[k % colors.length] as string));
        k += 1;
      }
    }
  }
  // 門形のクレーン（4 本の脚・上の梁・海へ伸びる腕・吊った荷）
  const steel = mix(domain.ctr, city.lineWhite, 0.15);
  const cx0 = 0.5;
  const cx1 = 1.2;
  const cy0 = 1.15;
  const cy1 = 1.55;
  const top = 1.05;
  for (const [x, y] of [[cx0, cy0], [cx1, cy0], [cx0, cy1], [cx1, cy1]] as [number, number][]) parts.push(rod([x, y, 0], [x, y, top], 0.04, steel));
  parts.push(rod([cx0, cy0, top], [cx1, cy0, top], 0.035, steel));
  parts.push(rod([cx0, cy1, top], [cx1, cy1, top], 0.035, steel));
  parts.push(rod([cx0, cy0, 0.55], [cx0, cy1, 0.55], 0.025, steel));
  parts.push(rod([cx1, cy0, 0.55], [cx1, cy1, 0.55], 0.025, steel));
  // 上の 2 本の桁（岸から海の上へ伸びる）と、横のつなぎ
  parts.push(box({ x0: cx0 - 0.04, y0: 0.25, z0: top, x1: cx0 + 0.04, y1: cy1 + 0.08, z1: top + 0.08, wall: steel }));
  parts.push(box({ x0: cx1 - 0.04, y0: 0.25, z0: top, x1: cx1 + 0.04, y1: cy1 + 0.08, z1: top + 0.08, wall: steel }));
  for (const y of [0.3, 0.7, cy0, cy1]) parts.push(rod([cx0, y, top + 0.06], [cx1, y, top + 0.06], 0.025, steel));
  parts.push(rod([cx0, 0.3, top + 0.08], [cx0, cy0, top + 0.3], 0.015, steel));
  parts.push(rod([cx1, 0.3, top + 0.08], [cx1, cy0, top + 0.3], 0.015, steel));
  parts.push(rod([cx0, cy0, top + 0.3], [cx1, cy0, top + 0.3], 0.02, steel));
  parts.push(box({ x0: 0.75, y0: cy1 - 0.1, z0: top + 0.07, x1: 0.98, y1: cy1 + 0.06, z1: top + 0.2, wall: city.lineWhite }, windows({ x0: 0.75, y0: cy1 - 0.1, x1: 0.98, y1: cy1 + 0.06 }, { floor: 0.12, floors: 1, base: 0.02, width: 0.07, pitch: 0.1, height: 0.5, litRatio: 0.7, noise: noiseOf(102) })));
  parts.push(rod([0.85, 0.55, top], [0.85, 0.55, 0.42], 0.01, city.curb));
  parts.push(containerBox(0.65, 0.47, 0.27, true, domain.ctr));
  // 管理棟（小さな事務所）と、門
  const office = { x0: 0.2, y0: 2.2, x1: 0.95, y1: 2.65 };
  parts.push(box({ ...office, z0: 0, z1: 0.32, wall: mix(city.wallStone, city.lineWhite, 0.4) }, windows(office, { floor: 0.28, floors: 1, base: 0.03, width: 0.1, pitch: 0.2, height: 0.55, litRatio: 0.45, noise: noiseOf(103), frame: shade(city.wallStone, 0.6), skip: [{ side: '+y', u0: 0.5, u1: 0.7, floor: 0 }] })));
  parts.push(...parapet(office.x0, office.y0, office.x1, office.y1, 0.32, 0.03, shade(city.wallStone, 0.9)));
  parts.push(...door(office, '+y', 0.5, 0.14, 0.22, NAVY, domain.ctr));
  parts.push(signBoard(office, '+y', 0.05, 0.45, 0.22, 0.3, domain.ctr));
  parts.push(...fencedLot(3, 3, shade(city.curb, 0.85), { from: 1.15, to: 1.85 }));
  parts.push(...streetLamp(2.0, 2.85, '-x'));
  parts.push(...streetLamp(2.85, 1.15, '-x'));
  parts.push(broadleafTree(2.6, 2.6, 0.8, 0));
  return { w: 3, d: 3, ground, parts, shadowHeight: 0.6 };
}

/* ---------- データセンター（3×2）: 窓の少ない大きな建物と空調 ---------- */

export function datacenter(): Model {
  const wall = mix(city.wallStone, city.curb, 0.3);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 3, 2, mix(city.paving, city.curb, 0.2)),
    pad(0.3, 1.45, 0.75, 2, mix(city.paving, city.lineWhite, 0.2)),
    groundPoly([[2.3, 0.15], [2.85, 0.15], [2.85, 1.4], [2.3, 1.4]], mix(city.paving, city.curb, 0.4)),
  ];
  const hall = { x0: 0.15, y0: 0.15, x1: 2.2, y1: 1.4 };
  const h = 0.62;
  // 縦の換気の帯（窓の代わり）と、入口の横の細い窓だけ
  const vents: Poly[] = [];
  for (let i = 0; i < 7; i += 1) {
    const x = hall.x0 + 0.15 + i * 0.28;
    vents.push({ kind: 'poly', pts: [[x + 0.1, hall.y1 + 0.006, 0.12], [x, hall.y1 + 0.006, 0.12], [x, hall.y1 + 0.006, h - 0.1], [x + 0.1, hall.y1 + 0.006, h - 0.1]], color: shade(wall, 0.72), layer: 1 });
  }
  for (let i = 0; i < 4; i += 1) {
    const y = hall.y0 + 0.15 + i * 0.28;
    vents.push({ kind: 'poly', pts: [[hall.x1 + 0.006, y, 0.12], [hall.x1 + 0.006, y + 0.1, 0.12], [hall.x1 + 0.006, y + 0.1, h - 0.1], [hall.x1 + 0.006, y, h - 0.1]], color: shade(wall, 0.72), layer: 1 });
  }
  parts.push(box({ ...hall, z0: 0, z1: h, wall, top: mix(city.paving, city.lineWhite, 0.2) }, [
    ...vents,
    ...band(hall, h - 0.07, h - 0.04, mix(domain.db, wall, 0.2)),
    { kind: 'poly', pts: [[0.62, hall.y1 + 0.006, 0.05], [0.56, hall.y1 + 0.006, 0.05], [0.56, hall.y1 + 0.006, 0.26], [0.62, hall.y1 + 0.006, 0.26]], color: city.windowLit, lit: true, layer: 2 },
  ]));
  parts.push(...parapet(hall.x0, hall.y0, hall.x1, hall.y1, h, 0.05, shade(wall, 0.92)));
  parts.push(...door(hall, '+y', 1.55, 0.2, 0.24, NAVY, shade(wall, 0.8)));
  parts.push(signBoard(hall, '+y', 0.9, 1.45, h - 0.2, h - 0.11, domain.db));
  // 屋上の空調の列
  for (let i = 0; i < 4; i += 1) for (let j = 0; j < 2; j += 1) parts.push(rooftopUnit(0.35 + i * 0.42, 0.35 + j * 0.45, h, 1.3));
  parts.push(rod([0.3, 1.25, h + 0.06], [2.05, 1.25, h + 0.06], 0.035, mix(city.curb, city.lineWhite, 0.3)));
  // 横の冷却設備（大きな室外機の並び）
  for (let i = 0; i < 4; i += 1) {
    const y = 0.25 + i * 0.28;
    parts.push(box({ x0: 2.35, y0: y, z0: 0, x1: 2.75, y1: y + 0.22, z1: 0.16, wall: mix(city.wallStone, city.lineWhite, 0.3) }, [
      { kind: 'blob', center: [2.55, y + 0.11, 0.165], r: 0.08, squash: 0.5, color: shade(city.curb, 0.5), layer: 1 },
    ]));
  }
  // 高い柵（二重の線）と、警備の小さな門
  parts.push(lowWall([0.06, 1.94], [0.25, 1.94], 0.18, shade(city.curb, 0.9)));
  parts.push(lowWall([0.8, 1.94], [2.94, 1.94], 0.18, shade(city.curb, 0.9)));
  parts.push(lowWall([0.06, 0.06], [2.94, 0.06], 0.18, shade(city.curb, 0.9)));
  parts.push(lowWall([0.06, 0.06], [0.06, 1.94], 0.18, shade(city.curb, 0.9)));
  parts.push(lowWall([2.94, 0.06], [2.94, 1.94], 0.18, shade(city.curb, 0.9)));
  parts.push(hedge(1.0, 1.6, 2.2, 1.67));
  parts.push(broadleafTree(2.6, 1.7, 0.8, 1));
  parts.push(conifer(0.12, 1.2, 0.55));
  parts.push(...streetLamp(0.9, 1.8, '-x'));
  return { w: 3, d: 2, ground, parts, shadowHeight: 0.8 };
}
