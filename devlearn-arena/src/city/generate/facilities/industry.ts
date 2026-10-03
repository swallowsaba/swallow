import { city, domain, mix, shade, state } from '@/ui/tokens';
import { fencedLot } from '../buildings';
import { band, beacon, lowWall, NAVY, noiseOf, shutter, solarPanels } from '../facilityKit';
import type { Model, Part, Poly } from '../mesh';
import {
  box, broadleafTree, conifer, door, gableRoof, groundPoly, hedge, pad, parapet, part, prism, rod, rooftopUnit, signBoard, streetLamp, windows,
} from '../shapes';

/**
 * 工場・港・大きな建物の施設の模型（docs/city-design.md 4 章の「見た目の特徴」）。正面（入口）は +y。
 * デプロイセンター（3×2）・コンテナ施設（3×3）・データセンター（3×2）。Lv が上がると「加わるもの」を足す。
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

/** 荷を運ぶトラック（運転台と荷台。+x 向き） */
function truck(x: number, y: number, color: string): Part[] {
  const cargo = { x0: x, y0: y, x1: x + 0.46, y1: y + 0.2 };
  return [
    box({ ...cargo, z0: 0.04, z1: 0.26, wall: mix(city.lineWhite, city.wallStone, 0.2), top: mix(city.lineWhite, city.paving, 0.1) }, [
      ...band(cargo, 0.15, 0.19, color),
    ]),
    box({ x0: x + 0.48, y0: y + 0.01, z0: 0.04, x1: x + 0.62, y1: y + 0.19, z1: 0.2, wall: color }, [
      { kind: 'poly', pts: [[x + 0.626, y + 0.03, 0.12], [x + 0.626, y + 0.17, 0.12], [x + 0.626, y + 0.17, 0.18], [x + 0.626, y + 0.03, 0.18]], color: mix(city.wallGlass, NAVY, 0.3), layer: 1 },
    ]),
    box({ x0: x + 0.02, y0: y + 0.01, z0: 0, x1: x + 0.6, y1: y + 0.19, z1: 0.04, wall: shade(city.curb, 0.5) }),
  ];
}

/* ---------- デプロイセンター（3×2）: 工場とベルトコンベア → 出荷口（Lv2）→ 自動倉庫（Lv3）→ 2 本目の煙突と空中の搬送路（Lv4）→ 高い自動倉庫と標識灯（Lv5） ---------- */

export function deploy(level = 1): Model {
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
  for (const cx of level >= 4 ? [0.35, 0.75] : [0.35]) {
    parts.push(prism(cx, 0.35, 0.06, h, h + 0.6, mix(city.wallStone, city.lineWhite, 0.2), shade(city.curb, 0.5), 10));
    parts.push(box({ x0: cx - 0.04, y0: 0.31, z0: h + 0.48, x1: cx + 0.04, y1: 0.39, z1: h + 0.52, wall: state.bad }));
  }
  // ベルトコンベア（工場から出荷口へ。脚の上の帯と、載った箱）
  const zc = 0.22;
  parts.push(box({ x0: 1.85, y0: 0.62, z0: zc, x1: 2.75, y1: 0.78, z1: zc + 0.04, wall: shade(city.curb, 0.8), top: mix(city.curb, NAVY, 0.4) }));
  for (const x of [1.95, 2.3, 2.65]) {
    parts.push(rod([x, 0.64, 0], [x, 0.64, zc], 0.02, mix(domain.cicd, city.curb, 0.4)));
    parts.push(rod([x, 0.76, 0], [x, 0.76, zc], 0.02, mix(domain.cicd, city.curb, 0.4)));
  }
  for (const x of [2.0, 2.28, 2.56]) parts.push(box({ x0: x, y0: 0.64, z0: zc + 0.04, x1: x + 0.12, y1: 0.76, z1: zc + 0.13, wall: mix(city.sand, city.roofTile, 0.25) }));
  if (level >= 3) {
    // 自動倉庫（棚の並ぶ高い棟。縦の筋と、荷の出入口。Lv5 でさらに高く、標識灯）
    const rack = { x0: 2.2, y0: 0.1, x1: 2.9, y1: 0.56 };
    const rh = level >= 5 ? 1.35 : 1.0;
    const ribs: Poly[] = [];
    for (let i = 1; i < 6; i += 1) {
      const x = rack.x0 + ((rack.x1 - rack.x0) * i) / 6;
      ribs.push({ kind: 'poly', pts: [[x + 0.012, rack.y1 + 0.006, 0.08], [x - 0.012, rack.y1 + 0.006, 0.08], [x - 0.012, rack.y1 + 0.006, rh - 0.1], [x + 0.012, rack.y1 + 0.006, rh - 0.1]], color: shade(wall, 0.8), layer: 1 });
    }
    for (let i = 1; i < 4; i += 1) {
      const y = rack.y0 + ((rack.y1 - rack.y0) * i) / 4;
      ribs.push({ kind: 'poly', pts: [[rack.x1 + 0.006, y - 0.012, 0.08], [rack.x1 + 0.006, y + 0.012, 0.08], [rack.x1 + 0.006, y + 0.012, rh - 0.1], [rack.x1 + 0.006, y - 0.012, rh - 0.1]], color: shade(wall, 0.8), layer: 1 });
    }
    parts.push(box({ ...rack, z0: 0, z1: rh, wall: mix(wall, city.lineWhite, 0.3), top: mix(city.paving, city.lineWhite, 0.3) }, [
      ...ribs,
      ...band(rack, rh - 0.08, rh - 0.05, domain.cicd),
      ...(level >= 5 ? band(rack, rh * 0.5, rh * 0.5 + 0.03, mix(domain.cicd, city.lineWhite, 0.4), 2) : []),
    ]));
    parts.push(...parapet(rack.x0, rack.y0, rack.x1, rack.y1, rh, 0.03, shade(wall, 0.9)));
    parts.push(signBoard(rack, '+y', 0.08, 0.42, rh - 0.32, rh - 0.18, domain.cicd));
    parts.push(rooftopUnit(2.3, 0.2, rh, 1));
    if (level >= 5) parts.push(beacon(2.75, 0.3, rh, domain.cicd));
  } else {
    // 出荷口の小屋
    const dock = { x0: 2.45, y0: 0.2, x1: 2.85, y1: 0.6 };
    parts.push(box({ ...dock, z0: 0, z1: 0.3, wall: mix(wall, city.lineWhite, 0.2) }));
    parts.push(box({ x0: dock.x0 - 0.04, y0: dock.y0 - 0.04, z0: 0.3, x1: dock.x1 + 0.04, y1: dock.y1 + 0.12, z1: 0.33, wall: domain.cicd }));
  }
  if (level >= 4) {
    // 工場の屋根から自動倉庫へ渡る、覆いのある搬送路
    const bridge = { x0: 1.85, y0: 0.22, x1: 2.2, y1: 0.4 };
    parts.push(box({ ...bridge, z0: h + 0.12, z1: h + 0.26, wall: mix(domain.cicd, city.lineWhite, 0.35), top: mix(city.curb, city.lineWhite, 0.3) }, [
      ...windows(bridge, { floor: 0.14, floors: 1, base: h + 0.15, width: 0.06, pitch: 0.1, height: 0.5, litRatio: 0.6, noise: noiseOf(94) }),
    ]));
  }
  if (level >= 2) {
    // 出荷口（屋根の下の荷積み場と、荷を待つトラック）
    ground.push(groundPoly([[1.95, 0.86], [2.95, 0.86], [2.95, 0.89], [1.95, 0.89]], state.warn));
    parts.push(...truck(2.05, 1.0, domain.cicd));
    parts.push(rod([1.98, 0.98, 0], [1.98, 0.98, 0.42], 0.02, shade(city.curb, 0.8)));
    parts.push(rod([2.92, 0.98, 0], [2.92, 0.98, 0.42], 0.02, shade(city.curb, 0.8)));
    parts.push(box({ x0: 1.94, y0: 0.84, z0: 0.42, x1: 2.96, y1: 1.0, z1: 0.45, wall: domain.cicd, top: mix(domain.cicd, city.lineWhite, 0.3) }));
  }
  // 積んだ荷
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
  return { w: 3, d: 2, ground, parts, shadowHeight: level >= 5 ? 1.2 : level >= 3 ? 0.95 : 0.75 };
}

/* ---------- コンテナ施設（3×3）: 港とクレーン、積まれたコンテナ → 倉庫（Lv2）→ 第二埠頭の Docker 工房（Lv3）→ 3 段に積んだコンテナと 2 基目のクレーン（Lv4）→ 2 階の倉庫・工房の塔と標識灯（Lv5） ---------- */

export function container(level = 1): Model {
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
  // 積まれたコンテナ（色の違う 3 列 × 2〜3 段。Lv4 から全て 3 段）
  const colors = [domain.ctr, domain.docker, domain.cicd, domain.sec, mix(domain.devops, city.curb, 0.2), domain.k8s];
  let k = 0;
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const levels = (row + col) % 3 === 0 || level >= 4 ? 3 : 2;
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
  if (level >= 2) {
    // 倉庫（切妻屋根の棟と、荷の出入口 2 つ。Lv5 で高く）
    const store = { x0: 1.95, y0: 2.2, x1: 2.85, y1: 2.72 };
    const sh = level >= 5 ? 0.5 : 0.3;
    parts.push(box({ ...store, z0: 0, z1: sh, wall: mix(city.wallStone, domain.ctr, 0.15) }, [
      ...windows(store, { floor: 0.2, floors: 1, base: sh - 0.16, width: 0.07, pitch: 0.16, height: 0.5, litRatio: 0.4, noise: noiseOf(104), frame: shade(city.wallStone, 0.6) }),
      ...band(store, 0.02, 0.05, shade(city.curb, 0.8)),
    ]));
    parts.push(shutter(store, 0.12, 0.42, 0.22, shade(city.curb, 1.15)));
    parts.push(shutter(store, 0.5, 0.8, 0.22, shade(city.curb, 1.15)));
    parts.push(gableRoof({ ...store, z: sh, rise: 0.16, ridge: 'x', roof: mix(domain.ctr, city.lineWhite, 0.35), wall: mix(city.wallStone, domain.ctr, 0.15), eave: 0.04 }));
  }
  if (level >= 3) {
    // 第二埠頭（船だまりへ張り出した桟橋）と、その上の Docker 工房
    const pier = { x0: 1.85, y0: 0.12, x1: 2.88, y1: 0.95 };
    parts.push(box({ ...pier, z0: 0, z1: 0.06, wall: shade(city.wallStone, 0.8), top: mix(city.paving, city.curb, 0.25) }));
    const shop = { x0: 2.0, y0: 0.22, x1: 2.75, y1: 0.7 };
    const wh = level >= 5 ? 0.62 : 0.4;
    parts.push(box({ ...shop, z0: 0.06, z1: wh, wall: mix(domain.docker, city.lineWhite, 0.55), top: mix(city.paving, city.lineWhite, 0.25) }, [
      ...windows(shop, { floor: 0.2, floors: 1, base: wh - 0.28, width: 0.09, pitch: 0.17, height: 0.55, litRatio: 0.55, noise: noiseOf(105), frame: shade(domain.docker, 0.6) }),
      ...band(shop, wh - 0.07, wh - 0.04, domain.docker),
    ]));
    parts.push(...parapet(shop.x0, shop.y0, shop.x1, shop.y1, wh, 0.03, shade(domain.docker, 0.9)));
    parts.push(signBoard(shop, '+y', 0.1, 0.5, wh - 0.18, wh - 0.09, domain.docker));
    parts.push(rooftopUnit(2.1, 0.3, wh, 1));
    parts.push(containerBox(2.35, 0.78, 0.06, true, domain.docker));
    if (level >= 5) {
      // 工房の塔（港の目印。上に標識灯）
      const tower = { x0: 2.48, y0: 0.26, x1: 2.7, y1: 0.48 };
      const th = 1.5;
      parts.push(box({ ...tower, z0: wh, z1: th, wall: mix(domain.docker, city.lineWhite, 0.45), top: mix(city.paving, city.lineWhite, 0.25) }, [
        ...band(tower, th - 0.24, th - 0.12, mix(city.wallGlass, city.windowLit, 0.4), 1),
        ...band(tower, th - 0.07, th - 0.04, domain.docker),
      ]));
      parts.push(beacon(2.59, 0.37, th, domain.docker));
    }
  }
  if (level >= 4) {
    // 2 基目のクレーン（コンテナの置き場をまたぐ門形）
    const steel2 = mix(domain.docker, city.lineWhite, 0.25);
    const gx0 = 1.6, gx1 = 2.72, gy0 = 1.15, gy1 = 1.98, gt = 0.85;
    for (const [x, y] of [[gx0, gy0], [gx1, gy0], [gx0, gy1], [gx1, gy1]] as [number, number][]) parts.push(rod([x, y, 0], [x, y, gt], 0.035, steel2));
    parts.push(box({ x0: gx0 - 0.03, y0: gy0 - 0.03, z0: gt, x1: gx0 + 0.03, y1: gy1 + 0.03, z1: gt + 0.06, wall: steel2 }));
    parts.push(box({ x0: gx1 - 0.03, y0: gy0 - 0.03, z0: gt, x1: gx1 + 0.03, y1: gy1 + 0.03, z1: gt + 0.06, wall: steel2 }));
    parts.push(box({ x0: gx0, y0: 1.5, z0: gt + 0.06, x1: gx1, y1: 1.6, z1: gt + 0.12, wall: steel2 }));
    parts.push(box({ x0: 2.1, y0: 1.47, z0: gt + 0.12, x1: 2.28, y1: 1.63, z1: gt + 0.22, wall: city.lineWhite }));
  }
  parts.push(...fencedLot(3, 3, shade(city.curb, 0.85), { from: 1.15, to: 1.85 }));
  parts.push(...streetLamp(2.0, 2.85, '-x'));
  parts.push(...streetLamp(2.85, 1.15, '-x'));
  parts.push(level >= 2 ? conifer(2.75, 2.86, 0.45) : broadleafTree(2.6, 2.6, 0.8, 0));
  return { w: 3, d: 3, ground, parts, shadowHeight: level >= 4 ? 0.9 : 0.6 };
}

/* ---------- データセンター（3×2）: 窓の少ない大きな建物と空調 → 増設棟（Lv2）→ 予備電源（Lv3）→ 2 階の増設棟と配管の橋（Lv4）→ 3 階の増設棟・屋上の太陽光・標識灯（Lv5） ---------- */

export function datacenter(level = 1): Model {
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
  if (level >= 2) {
    // 増設棟（屋上の奥に積み増した、窓の無い棟。換気の帯だけ。Lv4 で 2 階・Lv5 で 3 階）
    const annex = { x0: 0.25, y0: 0.22, x1: 1.35, y1: 0.85 };
    const af = level >= 5 ? 3 : level >= 4 ? 2 : 1;
    const az = h + af * 0.3;
    const annexVents: Poly[] = [];
    for (let f = 0; f < af; f += 1) {
      const z = h + 0.1 + f * 0.3;
      for (let i = 0; i < 5; i += 1) {
        const x = annex.x0 + 0.1 + i * 0.2;
        annexVents.push({ kind: 'poly', pts: [[x + 0.1, annex.y1 + 0.006, z], [x, annex.y1 + 0.006, z], [x, annex.y1 + 0.006, z + 0.12], [x + 0.1, annex.y1 + 0.006, z + 0.12]], color: shade(wall, 0.72), layer: 1 });
      }
      for (let i = 0; i < 3; i += 1) {
        const y = annex.y0 + 0.08 + i * 0.18;
        annexVents.push({ kind: 'poly', pts: [[annex.x1 + 0.006, y, z], [annex.x1 + 0.006, y + 0.1, z], [annex.x1 + 0.006, y + 0.1, z + 0.12], [annex.x1 + 0.006, y, z + 0.12]], color: shade(wall, 0.72), layer: 1 });
      }
    }
    parts.push(box({ ...annex, z0: h, z1: az, wall: mix(wall, city.lineWhite, 0.15), top: mix(city.paving, city.lineWhite, 0.25) }, [
      ...annexVents,
      ...band(annex, az - 0.07, az - 0.04, domain.db),
    ]));
    parts.push(...parapet(annex.x0, annex.y0, annex.x1, annex.y1, az, 0.04, shade(wall, 0.92)));
    for (let i = 0; i < 3; i += 1) parts.push(rooftopUnit(0.35 + i * 0.34, 0.35, az, 1.2));
    if (level >= 5) {
      parts.push(rod([1.2, 0.72, az], [1.2, 0.72, az + 0.4], 0.018, city.curb));
      parts.push(beacon(1.2, 0.72, az + 0.4, domain.db));
      parts.push(...solarPanels(0.3, 0.95, 1.35, 1.32, h, 2));
    } else {
      for (let i = 0; i < 2; i += 1) parts.push(rooftopUnit(0.35 + i * 0.5, 1.0, h, 1.3));
    }
    // 残った屋上の空調の列
    for (let i = 0; i < 2; i += 1) for (let j = 0; j < 2; j += 1) parts.push(rooftopUnit(1.5 + i * 0.36, 0.35 + j * 0.45, h, 1.3));
    if (level >= 4) {
      // 屋上から横の冷却設備へ渡る配管の橋
      parts.push(rod([1.95, 1.2, h + 0.06], [2.55, 1.2, h + 0.06], 0.035, mix(domain.db, city.lineWhite, 0.4)));
      parts.push(rod([2.55, 1.2, h + 0.06], [2.55, 1.2, 0.17], 0.035, mix(domain.db, city.lineWhite, 0.4)));
    }
    parts.push(rod([1.45, 1.25, h + 0.06], [2.05, 1.25, h + 0.06], 0.035, mix(city.curb, city.lineWhite, 0.3)));
  } else {
    // 屋上の空調の列
    for (let i = 0; i < 4; i += 1) for (let j = 0; j < 2; j += 1) parts.push(rooftopUnit(0.35 + i * 0.42, 0.35 + j * 0.45, h, 1.3));
    parts.push(rod([0.3, 1.25, h + 0.06], [2.05, 1.25, h + 0.06], 0.035, mix(city.curb, city.lineWhite, 0.3)));
  }
  if (level >= 3) {
    // 予備電源（発電機の箱 2 台と排気筒・燃料の円筒タンク）
    ground.push(groundPoly([[1.2, 1.5], [2.25, 1.5], [2.25, 1.88], [1.2, 1.88]], mix(city.paving, state.warn, 0.15)));
    for (const x of [1.28, 1.64]) {
      const g = { x0: x, y0: 1.55, x1: x + 0.3, y1: 1.83 };
      parts.push(box({ ...g, z0: 0, z1: 0.22, wall: mix(domain.db, city.curb, 0.35), top: mix(city.curb, city.lineWhite, 0.2) }, [
        ...band(g, 0.15, 0.17, state.warn),
      ]));
      parts.push(rod([x + 0.06, 1.6, 0.22], [x + 0.06, 1.6, 0.42], 0.03, shade(city.curb, 0.7)));
    }
    parts.push(prism(2.1, 1.69, 0.11, 0, 0.24, mix(city.lineWhite, city.wallStone, 0.25), mix(city.lineWhite, city.wallStone, 0.1), 12));
  }
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
  parts.push(level >= 3 ? hedge(0.95, 1.6, 1.15, 1.67) : hedge(1.0, 1.6, 2.2, 1.67));
  parts.push(broadleafTree(2.6, 1.7, 0.8, 1));
  parts.push(conifer(0.12, 1.2, 0.55));
  parts.push(...streetLamp(0.9, 1.8, '-x'));
  return { w: 3, d: 2, ground, parts, shadowHeight: level >= 2 ? 0.8 + (level >= 5 ? 0.9 : level >= 4 ? 0.6 : 0.3) : 0.8 };
}
