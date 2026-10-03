import { city, domain, mix, shade, state } from '@/ui/tokens';
import { fencedLot } from '../buildings';
import { band, beacon, bench, dish, lift, lowWall, mullions, NAVY, noiseOf, shutter } from '../facilityKit';
import type { Model, Part, Poly } from '../mesh';
import {
  box, broadleafTree, conifer, door, groundPoly, hedge, onFace, pad, parapet, part, prism, rod, rooftopUnit, signBoard, streetLamp, windows,
} from '../shapes';

/**
 * 2×2 の施設の模型（docs/city-design.md 4 章の「見た目の特徴」と、Lv が上がると加わるもの）。正面（入口）は +y。
 * Web 施設・セキュリティセンター・開発オフィス・監視・運用センター・DevOps 推進本部・インシデント対応本部。
 */

/* ---------- Web 施設: ガラス張りの低層ビル → 看板（Lv2）→ 展望フロア（Lv3）→ 3 階（Lv4）→ 4 階と尖塔（Lv5） ---------- */

export function web(level = 1): Model {
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
  // ガラスの本館（Lv1〜3 は 2 階、Lv4 は 3 階、Lv5 は 4 階）
  const main = { x0: 0.45, y0: 0.5, x1: 1.75, y1: 1.3 };
  const fh = 0.28;
  const floors = level >= 5 ? 4 : level >= 4 ? 3 : 2;
  const h = fh * floors + 0.06;
  parts.push(box({ ...main, z0: 0, z1: h, wall: glass, top: mix(city.paving, city.lineWhite, 0.4) }, [
    ...windows(main, { floor: fh, floors, base: 0.04, width: 0.16, pitch: 0.2, height: 0.78, litRatio: 0.45, noise: noiseOf(32), glass: mix(glass, city.lineWhite, 0.15), skip: [{ side: '+y', u0: 0.5, u1: 0.8, floor: 0 }] }),
    ...mullions(main, '+x', 0, h, 0.2, frame),
    ...mullions(main, '+y', 0, h, 0.2, frame),
    ...band(main, fh + 0.03, fh + 0.06, frame, 4),
    ...(floors >= 3 ? band(main, fh * 2 + 0.03, fh * 2 + 0.06, frame, 4) : []),
  ]));
  // 屋上のテラスの手すりと植え込み
  parts.push(...parapet(main.x0, main.y0, main.x1, main.y1, h, 0.02, frame, 0.02));
  parts.push(rooftopUnit(main.x0 + 0.1, main.y0 + 0.1, h, 1));
  parts.push(hedge(main.x0 + 0.5, main.y0 + 0.12, main.x1 - 0.1, main.y0 + 0.2));
  if (level >= 2) {
    // 屋上の大きな看板（2 本の脚と、分野の色に光る板）
    const z = 0.28;
    for (const x of [0.6, 1.6]) parts.push(rod([x, 0.3, z], [x, 0.3, z + 0.42], 0.025, city.curb));
    parts.push(box({ x0: 0.5, y0: 0.26, z0: z + 0.18, x1: 1.7, y1: 0.3, z1: z + 0.48, wall: shade(domain.web, 0.7) }, [
      { kind: 'poly', pts: onFace({ x0: 0.5, y0: 0.26, x1: 1.7, y1: 0.3 }, '+y', 0.06, 1.14, z + 0.2, z + 0.46, 0.008), color: mix(domain.web, city.lineWhite, 0.35), lit: true, layer: 1 },
      { kind: 'poly', pts: onFace({ x0: 0.5, y0: 0.26, x1: 1.7, y1: 0.3 }, '+y', 0.15, 0.75, z + 0.3, z + 0.36, 0.012), color: city.lineWhite, lit: true, layer: 2 },
      { kind: 'poly', pts: onFace({ x0: 0.5, y0: 0.26, x1: 1.7, y1: 0.3 }, '+y', 0.85, 1.05, z + 0.26, z + 0.4, 0.012), color: city.windowLit, lit: true, layer: 2 },
    ]));
  }
  if (level >= 3) {
    // 展望フロア（屋上に、一回り小さいガラスの階と、ぐるりの手すり）
    const deck = { x0: 0.75, y0: 0.7, x1: 1.6, y1: 1.2 };
    const dz = h + 0.26;
    parts.push(box({ ...deck, z0: h, z1: dz, wall: mix(city.wallGlass, city.windowLit, 0.4), top: mix(city.paving, city.lineWhite, 0.4) }, [
      ...mullions(deck, '+x', h, dz, 0.12, frame),
      ...mullions(deck, '+y', h, dz, 0.12, frame),
    ]));
    parts.push(box({ x0: deck.x0 - 0.06, y0: deck.y0 - 0.06, z0: dz, x1: deck.x1 + 0.06, y1: deck.y1 + 0.06, z1: dz + 0.03, wall: frame }));
    parts.push(...parapet(deck.x0 - 0.06, deck.y0 - 0.06, deck.x1 + 0.06, deck.y1 + 0.06, dz + 0.03, 0.05, mix(frame, city.wallGlass, 0.3), 0.012));
    if (level >= 5) {
      parts.push(rod([1.18, 0.95, dz + 0.03], [1.18, 0.95, dz + 0.75], 0.02, frame));
      parts.push(beacon(1.18, 0.95, dz + 0.75, domain.web));
    }
  }
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
  if (level >= 4) parts.push(...streetLamp(0.65, 1.9, '+x'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 0.7 + (floors - 2) * 0.28 + (level >= 3 ? 0.2 : 0) };
}

/* ---------- セキュリティセンター: 堅牢な建物と門 → 監視カメラ（Lv2）→ 塔（Lv3）→ 3 階（Lv4）→ 4 階と塔の灯り（Lv5） ---------- */

/** 監視カメラ（柱か壁の腕と、箱と、赤い点） */
function camera(x: number, y: number, z: number, dir: [number, number]): Part[] {
  const [dx, dy] = dir;
  return [
    rod([x, y, z], [x + dx * 0.06, y + dy * 0.06, z], 0.012, city.curb),
    box({ x0: x + dx * 0.06 - 0.025, y0: y + dy * 0.06 - 0.025, z0: z - 0.03, x1: x + dx * 0.06 + 0.025, y1: y + dy * 0.06 + 0.025, z1: z + 0.01, wall: mix(city.lineWhite, city.wallStone, 0.2) }, [
      { kind: 'blob', center: [x + dx * 0.09, y + dy * 0.09, z - 0.01], r: 0.008, squash: 1, color: state.bad, lit: true, layer: 1 },
    ]),
  ];
}

export function security(level = 1): Model {
  const wall = mix(city.wallStone, city.curb, 0.4);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.curb, 0.25)),
    pad(0.75, 1.3, 1.25, 2, mix(city.paving, city.lineWhite, 0.15)),
  ];
  // 本館（窓は細く少ない、厚い壁）
  const main = { x0: 0.25, y0: 0.2, x1: 1.75, y1: 1.15 };
  const fh = 0.27;
  const floors = level >= 5 ? 4 : level >= 4 ? 3 : 2;
  const h = fh * floors + 0.08;
  parts.push(box({ ...main, z0: 0, z1: h, wall, top: mix(city.paving, city.curb, 0.3) }, [
    ...windows(main, { floor: fh, floors, base: 0.06, width: 0.05, pitch: 0.28, height: 0.5, litRatio: 0.4, noise: noiseOf(41), frame: shade(wall, 0.55), skip: [{ side: '+y', u0: 0.55, u1: 0.95, floor: 0 }] }),
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
  if (level < 3) parts.push(rooftopUnit(1.3, 0.35, h, 1));
  if (level >= 3) {
    // 塔（屋上から立ち上がる見張りの塔と、上の窓の帯の部屋）
    const t = { x0: 1.3, y0: 0.3, x1: 1.62, y1: 0.62 };
    const top = h + (level >= 5 ? 1.0 : 0.7);
    parts.push(box({ ...t, z0: h, z1: top, wall: shade(wall, 0.95) }, [
      ...windows(t, { floor: 0.3, floors: Math.floor((top - h) / 0.3), base: h + 0.02, width: 0.04, pitch: 0.15, height: 0.5, litRatio: 0.4, noise: noiseOf(43), frame: shade(wall, 0.55) }),
    ]));
    const room = { x0: t.x0 - 0.05, y0: t.y0 - 0.05, x1: t.x1 + 0.05, y1: t.y1 + 0.05 };
    parts.push(box({ ...room, z0: top, z1: top + 0.18, wall: mix(city.wallGlass, city.windowLit, 0.35) }, [
      ...mullions(room, '+x', top, top + 0.18, 0.1, shade(wall, 0.6)),
      ...mullions(room, '+y', top, top + 0.18, 0.1, shade(wall, 0.6)),
    ]));
    parts.push(box({ x0: room.x0 - 0.03, y0: room.y0 - 0.03, z0: top + 0.18, x1: room.x1 + 0.03, y1: room.y1 + 0.03, z1: top + 0.23, wall: mix(domain.sec, wall, 0.3) }));
    parts.push(rod([1.46, 0.46, top + 0.23], [1.46, 0.46, top + 0.45], 0.012, city.curb));
    if (level >= 5) parts.push(beacon(1.46, 0.46, top + 0.45, state.bad));
    parts.push(...camera(room.x1 + 0.03, room.y1, top - 0.05, [1, 0]));
  }
  // 塀と門（守衛所と遮断機）
  const wallColor = mix(city.wallStone, city.curb, 0.2);
  const wh = level >= 5 ? 0.24 : 0.16;
  parts.push(lowWall([0.06, 0.06], [1.94, 0.06], wh, wallColor));
  parts.push(lowWall([0.06, 0.06], [0.06, 1.94], wh, wallColor));
  parts.push(lowWall([1.94, 0.06], [1.94, 1.94], wh, wallColor));
  parts.push(lowWall([0.06, 1.94], [0.7, 1.94], wh, wallColor));
  parts.push(lowWall([1.3, 1.94], [1.94, 1.94], wh, wallColor));
  const gate = { x0: 1.36, y0: 1.5, x1: 1.6, y1: 1.72 };
  parts.push(box({ ...gate, z0: 0, z1: 0.24, wall: mix(city.lineWhite, wall, 0.3) }, windows(gate, { floor: 0.2, floors: 1, base: 0.04, width: 0.1, pitch: 0.12, height: 0.55, litRatio: 0.9, noise: noiseOf(42) })));
  parts.push(box({ x0: gate.x0 - 0.02, y0: gate.y0 - 0.02, z0: 0.24, x1: gate.x1 + 0.02, y1: gate.y1 + 0.02, z1: 0.27, wall: shade(wall, 0.8) }));
  parts.push(rod([1.3, 1.86, 0], [1.3, 1.86, 0.12], 0.03, shade(city.curb, 0.8)));
  parts.push(rod([1.3, 1.86, 0.11], [0.78, 1.86, 0.11], 0.02, domain.sec));
  if (level >= 2) {
    // 監視カメラ（門の柱・塀の角・本館の角）
    parts.push(rod([0.72, 1.94, 0], [0.72, 1.94, 0.4], 0.02, city.curb), ...camera(0.72, 1.94, 0.4, [0, 1]));
    parts.push(rod([1.92, 1.92, 0], [1.92, 1.92, 0.4], 0.02, city.curb), ...camera(1.92, 1.92, 0.4, [1, 0]));
    parts.push(...camera(main.x1, main.y1, h - 0.08, [1, 1]));
    parts.push(...camera(main.x0 + 0.02, main.y1, h - 0.08, [0, 1]));
  }
  // 車止めと木
  for (const x of [0.8, 0.92, 1.08, 1.2]) parts.push(prism(x, 1.36, 0.025, 0, 0.07, shade(city.curb, 0.85), undefined, 6));
  parts.push(conifer(0.3, 1.55, 0.7));
  parts.push(conifer(0.55, 1.7, 0.55));
  if (level >= 4) parts.push(...streetLamp(1.75, 1.35, '-x'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 0.75 + (floors - 2) * 0.27 };
}

/* ---------- 開発オフィス: 中層のオフィス → 屋上庭園（Lv2）→ 渡り廊下と別棟（Lv3）→ 7 階（Lv4）→ 9 階と冠（Lv5） ---------- */

export function devoffice(level = 1): Model {
  const wall = mix(city.wallStone, city.lineWhite, 0.35);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.sand, 0.3)),
    pad(0.7, 1.35, 1.3, 2, mix(city.paving, city.lineWhite, 0.25)),
    groundPoly([[1.4, 1.4], [1.92, 1.4], [1.92, 1.92], [1.4, 1.92]], city.grass),
  ];
  const tower = { x0: 0.35, y0: 0.25, x1: 1.55, y1: 1.15 };
  const fh = 0.25;
  const floors = level >= 5 ? 9 : level >= 4 ? 7 : 5;
  const h = floors * fh + 0.06;
  // 別棟（Lv3 から。右奥の細い棟）の分だけ本館を細くする
  if (level >= 3) tower.x1 = 1.3;
  parts.push(box({ ...tower, z0: 0, z1: h, wall, top: mix(city.paving, city.lineWhite, 0.3) }, [
    ...windows(tower, { floor: fh, floors, base: 0.05, width: 0.14, pitch: 0.2, height: 0.6, litRatio: 0.42, noise: noiseOf(51), glass: mix(city.wallGlass, domain.git, 0.08), frame: shade(wall, 0.6), skip: [{ side: '+y', u0: 0.45, u1: 0.75, floor: 0 }] }),
    ...band(tower, fh + 0.04, fh + 0.06, mix(domain.git, wall, 0.25)),
    ...(floors >= 7 ? band(tower, fh * 5 + 0.04, fh * 5 + 0.06, mix(domain.git, wall, 0.25)) : []),
  ]));
  // 1 階のガラスのロビー（少し張り出す）
  const lobby = { x0: 0.75, y0: 1.15, x1: 1.35, y1: 1.3 };
  if (level >= 3) { lobby.x0 = 0.6; lobby.x1 = 1.2; }
  parts.push(box({ ...lobby, z0: 0, z1: 0.26, wall: mix(city.wallGlass, city.windowLit, 0.3), top: shade(wall, 0.9) }, mullions(lobby, '+y', 0, 0.26, 0.15, shade(wall, 0.7))));
  parts.push(...door(lobby, '+y', 0.2, 0.2, 0.2, mix(NAVY, city.wallGlass, 0.4), shade(wall, 0.8)));
  parts.push(...parapet(tower.x0, tower.y0, tower.x1, tower.y1, h, 0.05, shade(wall, 0.9)));
  if (level >= 2) {
    // 屋上庭園（芝の床・植え込み・小さな木・ベンチ）
    parts.push(box({ x0: tower.x0 + 0.08, y0: tower.y0 + 0.35, z0: h, x1: tower.x1 - 0.08, y1: tower.y1 - 0.08, z1: h + 0.02, wall: shade(city.grass, 0.9), top: city.grass }));
    parts.push(lift(hedge(tower.x0 + 0.08, tower.y1 - 0.14, tower.x1 - 0.08, tower.y1 - 0.08), h));
    parts.push(lift(broadleafTree(tower.x0 + 0.25, tower.y0 + 0.55, 0.55, 1), h + 0.02));
    parts.push(lift(broadleafTree(tower.x1 - 0.25, tower.y0 + 0.6, 0.5, 2), h + 0.02));
    parts.push(...bench(tower.x0 + 0.45, tower.y0 + 0.7, 'x').map((p) => lift(p, h + 0.02)));
    // 屋上の階段室と空調（奥）
    parts.push(box({ x0: 0.5, y0: 0.32, z0: h, x1: 0.75, y1: 0.55, z1: h + 0.14, wall: shade(wall, 0.92) }));
    parts.push(rooftopUnit(0.95, 0.32, h, 0.9));
    if (level >= 5) {
      // 冠（上の階を囲う分野の色の枠と、標識灯）
      parts.push(...parapet(tower.x0 - 0.02, tower.y0 - 0.02, tower.x1 + 0.02, tower.y1 + 0.02, h, 0.12, mix(domain.git, wall, 0.2), 0.04));
      parts.push(rod([0.62, 0.43, h + 0.14], [0.62, 0.43, h + 0.6], 0.016, city.curb));
      parts.push(beacon(0.62, 0.43, h + 0.6, domain.git));
    } else {
      parts.push(rod([0.62, 0.43, h + 0.14], [0.62, 0.43, h + 0.45], 0.012, city.curb));
    }
  } else {
    // 屋上の階段室・空調・アンテナ
    parts.push(box({ x0: 0.5, y0: 0.35, z0: h, x1: 0.75, y1: 0.6, z1: h + 0.14, wall: shade(wall, 0.92) }));
    parts.push(rooftopUnit(0.95, 0.4, h, 1.1));
    parts.push(rooftopUnit(1.2, 0.4, h, 1.1));
    parts.push(rod([0.62, 0.48, h + 0.14], [0.62, 0.48, h + 0.45], 0.012, city.curb));
  }
  // 壁の縦の看板（分野の色）
  if (level >= 3) parts.push(signBoard(tower, '-x', 0.2, 0.4, h - 0.55, h - 0.1, domain.git));
  else parts.push(signBoard(tower, '+x', 0.1, 0.3, h - 0.55, h - 0.1, domain.git));
  if (level >= 3) {
    // 別棟（右奥）と、2 か所の渡り廊下（ガラスの筒）
    const side = { x0: 1.5, y0: 0.2, x1: 1.88, y1: 0.95 };
    const sf = level >= 5 ? 6 : level >= 4 ? 5 : 4;
    const sh = sf * fh + 0.05;
    parts.push(box({ ...side, z0: 0, z1: sh, wall: mix(wall, city.wallGlass, 0.3), top: mix(city.paving, city.lineWhite, 0.3) }, [
      ...windows(side, { floor: fh, floors: sf, base: 0.05, width: 0.12, pitch: 0.19, height: 0.6, litRatio: 0.45, noise: noiseOf(52), glass: mix(city.wallGlass, domain.git, 0.12), frame: shade(wall, 0.6) }),
    ]));
    parts.push(...parapet(side.x0, side.y0, side.x1, side.y1, sh, 0.04, shade(wall, 0.9)));
    parts.push(rooftopUnit(1.6, 0.35, sh, 0.9));
    for (const f of level >= 4 ? [2, 4] : [2]) {
      const z = f * fh + 0.05;
      const bridge = { x0: tower.x1, y0: 0.45, x1: side.x0, y1: 0.68 };
      parts.push(box({ ...bridge, z0: z, z1: z + 0.16, wall: mix(city.wallGlass, city.windowLit, 0.35), top: shade(wall, 0.9) }, [
        ...mullions(bridge, '+y', z, z + 0.16, 0.07, shade(wall, 0.6)),
      ]));
      parts.push(box({ ...bridge, z0: z - 0.03, z1: z, wall: shade(wall, 0.8) }));
    }
  }
  // 自転車置き場・植え込み・木
  for (let i = 0; i < 5; i += 1) parts.push(rod([0.12 + i * 0.07, 1.6, 0], [0.12 + i * 0.07, 1.6, 0.07], 0.01, shade(city.curb, 0.7)));
  parts.push(rod([0.1, 1.6, 0.07], [0.42, 1.6, 0.07], 0.01, shade(city.curb, 0.7)));
  parts.push(hedge(0.1, 1.85, 0.6, 1.92));
  parts.push(broadleafTree(1.7, 1.65, 0.85, 1));
  if (level < 3) parts.push(broadleafTree(1.8, 0.5, 0.7, 0));
  else parts.push(broadleafTree(1.75, 1.2, 0.7, 0));
  parts.push(...streetLamp(0.6, 1.8, '+x'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 1.3 + (floors - 5) * 0.25 };
}

/* ---------- 監視・運用センター: 大きな窓の管制室とアンテナ → 大型画面（Lv2）→ 塔（Lv3）→ 3 階（Lv4）→ 4 階と高い塔（Lv5） ---------- */

export function monitor(level = 1): Model {
  const wall = mix(city.wallStone, city.wallGlass, 0.2);
  const parts: Part[] = [];
  const ground: Poly[] = [
    pad(0, 0, 2, 2, mix(city.paving, city.sand, 0.2)),
    pad(0.3, 1.3, 0.8, 2, mix(city.paving, city.lineWhite, 0.25)),
  ];
  // 下の階（事務室。Lv4 で 3 階、Lv5 で 4 階）
  const base = { x0: 0.2, y0: 0.35, x1: 1.4, y1: 1.25 };
  const fh = 0.26;
  const floors = level >= 5 ? 4 : level >= 4 ? 3 : 2;
  parts.push(box({ ...base, z0: 0, z1: fh * floors + 0.04, wall }, windows(base, {
    floor: fh, floors, base: 0.04, width: 0.12, pitch: 0.22, height: 0.55, litRatio: 0.4, noise: noiseOf(61), frame: shade(wall, 0.55),
    skip: [{ side: '+y', u0: 0.75, u1: 1.0, floor: 0 }, ...(level >= 2 ? [0, 1, 2, 3].map((f) => ({ side: '+x' as const, u0: 0.1, u1: 0.8, floor: f })) : [])],
  })));
  parts.push(...door(base, '+y', 0.78, 0.18, 0.22, NAVY, shade(wall, 0.75)));
  // 上の管制室（張り出した大きな窓の帯。灯りがともる）
  const z0 = fh * floors + 0.04;
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
  if (level >= 2) {
    // 大型画面（右の壁一面。グラフの線と、状態の色の帯）
    const sz0 = 0.08;
    const sz1 = fh * floors - 0.04;
    const screen: Poly[] = [
      { kind: 'poly', pts: onFace(base, '+x', 0.08, 0.82, sz0, sz1, 0.01), color: shade(NAVY, 1.15), lit: true, layer: 1 },
      { kind: 'poly', pts: onFace(base, '+x', 0.12, 0.78, sz0 + 0.04, sz0 + 0.07, 0.014), color: state.ok, lit: true, layer: 2 },
      { kind: 'poly', pts: onFace(base, '+x', 0.12, 0.3, sz1 - 0.1, sz1 - 0.05, 0.014), color: state.info, lit: true, layer: 2 },
      { kind: 'poly', pts: onFace(base, '+x', 0.34, 0.5, sz1 - 0.1, sz1 - 0.05, 0.014), color: state.warn, lit: true, layer: 2 },
    ];
    // 折れ線のグラフ（短い帯を並べる）
    const pts = [0.3, 0.45, 0.38, 0.6, 0.52, 0.7, 0.62];
    for (let i = 0; i + 1 < pts.length; i += 1) {
      const u0 = 0.14 + i * 0.1;
      const v0 = sz0 + 0.1 + (sz1 - sz0 - 0.25) * (pts[i] as number);
      const v1 = sz0 + 0.1 + (sz1 - sz0 - 0.25) * (pts[i + 1] as number);
      screen.push({ kind: 'poly', pts: [
        [base.x1 + 0.014, base.y0 + u0, v0], [base.x1 + 0.014, base.y0 + u0 + 0.1, v1], [base.x1 + 0.014, base.y0 + u0 + 0.1, v1 + 0.025], [base.x1 + 0.014, base.y0 + u0, v0 + 0.025],
      ], color: mix(domain.mon, city.lineWhite, 0.3), lit: true, layer: 2 });
    }
    parts.push(part(screen, [base.x1, base.y0, sz0], [base.x1 + 0.02, base.y1, sz1]));
  }
  if (level >= 3) {
    // 塔（アンテナの柱の代わりに、細い塔と上の見晴らしの部屋）
    const t = { x0: 1.58, y0: 0.38, x1: 1.82, y1: 0.62 };
    const top = level >= 5 ? 2.1 : 1.7;
    parts.push(box({ ...t, z0: 0, z1: top, wall: mix(city.lineWhite, wall, 0.4) }, [
      ...windows(t, { floor: 0.3, floors: Math.floor(top / 0.3), base: 0.05, width: 0.05, pitch: 0.12, height: 0.4, litRatio: 0.35, noise: noiseOf(62), frame: shade(wall, 0.55) }),
    ]));
    const cab = { x0: 1.5, y0: 0.3, x1: 1.9, y1: 0.7 };
    parts.push(box({ ...cab, z0: top, z1: top + 0.2, wall: mix(city.wallGlass, city.windowLit, 0.5) }, [
      ...mullions(cab, '+x', top, top + 0.2, 0.1, shade(wall, 0.5)),
      ...mullions(cab, '+y', top, top + 0.2, 0.1, shade(wall, 0.5)),
    ]));
    parts.push(box({ x0: cab.x0 - 0.03, y0: cab.y0 - 0.03, z0: top + 0.2, x1: cab.x1 + 0.03, y1: cab.y1 + 0.03, z1: top + 0.25, wall: mix(domain.mon, wall, 0.3) }));
    parts.push(rod([1.7, 0.5, top + 0.25], [1.7, 0.5, top + 0.5], 0.014, city.curb));
    parts.push(beacon(1.7, 0.5, top + 0.5, state.bad));
  } else {
    // アンテナの柱と皿
    parts.push(rod([1.7, 0.5, 0], [1.7, 0.5, 1.7], 0.035, mix(city.lineWhite, city.curb, 0.3)));
    for (const z of [0.5, 0.95, 1.4]) parts.push(rod([1.6, 0.5, z], [1.8, 0.5, z], 0.014, mix(city.lineWhite, city.curb, 0.3)));
    parts.push(rod([1.7, 0.5, 1.7], [1.7, 0.5, 1.9], 0.012, state.bad));
  }
  parts.push(...dish(0.5, 0.55, zt + 0.04, 0.12));
  parts.push(...dish(1.1, 0.55, zt + 0.04, 0.09));
  parts.push(rooftopUnit(0.75, 0.9, zt + 0.04, 0.9));
  if (level >= 4) parts.push(...dish(0.4, 1.05, zt + 0.04, 0.1));
  // 柵・木・街灯
  parts.push(...fencedLot(2, 2, shade(city.curb, 0.85), { from: 0.25, to: 0.85 }));
  parts.push(broadleafTree(1.65, 1.5, 0.85, 2));
  parts.push(hedge(1.0, 1.75, 1.85, 1.82));
  parts.push(...streetLamp(0.95, 1.6, '-x'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 1.0 + (floors - 2) * 0.26 };
}

/* ---------- DevOps 推進本部: 中層ビルと広場 → 連絡橋（Lv2）→ 5 階（Lv3）→ 6 階と 2 本目の連絡橋（Lv4）→ 7 階と屋上庭園（Lv5） ---------- */

export function devops(level = 1): Model {
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
  // 連絡橋の分だけ、本館を細くする（Lv2 は右、Lv4 から左にも）
  const b = { x0: level >= 4 ? 0.55 : 0.2, y0: 0.15, x1: level >= 2 ? 1.45 : 1.8, y1: 0.85 };
  const fh = 0.26;
  const floors = level >= 5 ? 7 : level >= 4 ? 6 : level >= 3 ? 5 : 4;
  const h = floors * fh + 0.05;
  parts.push(box({ ...b, z0: 0, z1: h, wall, top: mix(city.paving, city.lineWhite, 0.3) }, [
    ...windows(b, { floor: fh, floors, base: 0.04, width: 0.12, pitch: 0.2, height: 0.62, litRatio: 0.4, noise: noiseOf(71), frame: shade(wall, 0.55), skip: [{ side: '+y', u0: (b.x1 - b.x0) / 2 - 0.15, u1: (b.x1 - b.x0) / 2 + 0.15, floor: 0 }] }),
    ...band(b, 0.3, 0.33, mix(domain.devops, wall, 0.2)),
    ...(floors >= 5 ? band(b, fh * 4 + 0.04, fh * 4 + 0.07, mix(domain.devops, wall, 0.2)) : []),
  ]));
  parts.push(...parapet(b.x0, b.y0, b.x1, b.y1, h, 0.05, shade(wall, 0.9)));
  parts.push(...door(b, '+y', (b.x1 - b.x0) / 2 - 0.12, 0.24, 0.24, NAVY, mix(domain.devops, wall, 0.3)));
  parts.push(rooftopUnit(b.x0 + 0.15, 0.3, h, 1));
  parts.push(rooftopUnit(b.x0 + 0.4, 0.3, h, 1));
  parts.push(box({ x0: b.x1 - 0.4, y0: 0.25, z0: h, x1: b.x1 - 0.15, y1: 0.5, z1: h + 0.12, wall: shade(wall, 0.92) }));
  // 屋上の緑（Lv5 は庭園）
  parts.push(hedge(b.x1 - 0.9, 0.6, b.x1 - 0.2, 0.68));
  if (level >= 5) {
    parts.push(box({ x0: b.x0 + 0.1, y0: 0.5, z0: h, x1: b.x0 + 0.5, y1: 0.78, z1: h + 0.02, wall: shade(city.grass, 0.9), top: city.grass }));
    parts.push(lift(broadleafTree(b.x0 + 0.22, 0.64, 0.5, 1), h + 0.02));
    parts.push(lift(broadleafTree(b.x0 + 0.4, 0.66, 0.45, 2), h + 0.02));
    parts.push(rod([b.x1 - 0.28, 0.38, h + 0.12], [b.x1 - 0.28, 0.38, h + 0.55], 0.016, city.curb));
    parts.push(beacon(b.x1 - 0.28, 0.38, h + 0.55, domain.devops));
  }
  if (level >= 2) {
    // 連絡橋（ガラスの筒が、敷地の端まで伸びて隣の施設へつながる）
    const bridges: { z: number; side: '-x' | '+x' }[] = [{ z: fh * 2 + 0.05, side: '+x' }, ...(level >= 4 ? [{ z: fh * 3 + 0.05, side: '-x' as const }] : [])];
    for (const { z, side } of bridges) {
      const tube = side === '+x' ? { x0: b.x1, y0: 0.38, x1: 2.0, y1: 0.62 } : { x0: 0, y0: 0.38, x1: b.x0, y1: 0.62 };
      parts.push(box({ ...tube, z0: z - 0.03, z1: z, wall: shade(wall, 0.8) }));
      parts.push(box({ ...tube, z0: z, z1: z + 0.16, wall: mix(city.wallGlass, city.windowLit, 0.35), top: mix(domain.devops, wall, 0.4) }, [
        ...mullions(tube, '+y', z, z + 0.16, 0.06, shade(wall, 0.6)),
      ]));
      const px = side === '+x' ? 1.92 : 0.08;
      parts.push(rod([px, 0.5, 0], [px, 0.5, z - 0.03], 0.04, shade(wall, 0.85)));
    }
  }
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
  return { w: 2, d: 2, ground, parts, shadowHeight: 1.1 + (floors - 4) * 0.26 };
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

/* ---------- インシデント対応本部: 消防署に似た建物と車庫 → 出動車両（Lv2）→ 指令塔（Lv3）→ 3 階（Lv4）→ 4 階と高い指令塔（Lv5） ---------- */

/** 出動車両（車体・運転席・屋根の警告灯・白い帯） */
function responseCar(x: number, y: number, long: boolean): Part[] {
  const l = long ? 0.42 : 0.3;
  const body = { x0: x, y0: y, x1: x + 0.17, y1: y + l };
  const color = mix(domain.trouble, state.bad, 0.55);
  return [
    box({ ...body, z0: 0.03, z1: 0.17, wall: color, top: mix(color, city.lineWhite, 0.15) }, [
      ...band(body, 0.09, 0.11, city.lineWhite),
      { kind: 'poly', pts: onFace(body, '+y', 0.03, 0.14, 0.1, 0.15, 0.008), color: mix(city.wallGlass, NAVY, 0.3), layer: 2 },
    ]),
    box({ x0: x + 0.03, y0: y + l - 0.14, z0: 0.17, x1: x + 0.14, y1: y + l - 0.02, z1: 0.22, wall: color }, [
      { kind: 'poly', pts: onFace({ x0: x + 0.03, y0: y + l - 0.14, x1: x + 0.14, y1: y + l - 0.02 }, '+y', 0.01, 0.1, 0.175, 0.215, 0.006), color: mix(city.wallGlass, NAVY, 0.3), layer: 1 },
    ]),
    part([
      { kind: 'blob', center: [x + 0.05, y + l - 0.08, 0.235], r: 0.018, squash: 0.8, color: state.bad, lit: true },
      { kind: 'blob', center: [x + 0.12, y + l - 0.08, 0.235], r: 0.018, squash: 0.8, color: state.info, lit: true },
    ], [x + 0.03, y + l - 0.1, 0.22], [x + 0.14, y + l - 0.06, 0.25]),
    ...(long ? [rod([x + 0.085, y + 0.04, 0.2], [x + 0.085, y + l - 0.18, 0.2], 0.02, city.lineWhite)] : []),
  ];
}

export function incident(level = 1): Model {
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
  const floors = level >= 5 ? 4 : level >= 4 ? 3 : 2;
  const h = fh * floors + 0.04;
  parts.push(box({ ...b, z0: 0, z1: h, wall, top: mix(city.paving, city.curb, 0.2) }, [
    // 2 階から窓（1 階は車庫の扉）
    ...windows(b, { floor: fh, floors, base: 0.02, width: 0.12, pitch: 0.22, height: 0.5, litRatio: 0.45, noise: noiseOf(81), frame: shade(wall, 0.55), skip: [{ side: '+y', u0: 0, u1: 2, floor: 0 }] }),
    ...band(b, fh, fh + 0.04, trim),
  ]));
  parts.push(...parapet(b.x0, b.y0, b.x1, b.y1, h, 0.05, trim));
  // 車庫の 3 枚の大きな扉
  for (const [u0, u1] of [[0.08, 0.42], [0.48, 0.82], [0.88, 1.22]] as [number, number][]) {
    parts.push(shutter(b, u0, u1, 0.24, mix(domain.trouble, city.lineWhite, 0.25)));
  }
  // 名板（分野の色）
  parts.push(signBoard(b, '+y', 0.2, 1.1, h - 0.16, h - 0.06, shade(domain.trouble, 0.8)));
  // 横の訓練塔（Lv3 から指令塔: 高くして、上にガラスの指令室）
  const tower = { x0: 1.55, y0: 0.3, x1: 1.85, y1: 0.6 };
  const th = level >= 5 ? 1.75 : level >= 3 ? 1.45 : 1.25;
  parts.push(box({ ...tower, z0: 0, z1: th, wall: shade(wall, 0.95) }, windows(tower, { floor: 0.3, floors: Math.floor(th / 0.3), base: 0.05, width: 0.1, pitch: 0.3, height: 0.45, litRatio: 0.3, noise: noiseOf(82), frame: shade(wall, 0.5) })));
  if (level >= 3) {
    const cab = { x0: 1.47, y0: 0.22, x1: 1.93, y1: 0.68 };
    parts.push(box({ ...cab, z0: th, z1: th + 0.22, wall: mix(city.wallGlass, city.windowLit, 0.5) }, [
      ...mullions(cab, '+x', th, th + 0.22, 0.1, shade(wall, 0.5)),
      ...mullions(cab, '+y', th, th + 0.22, 0.1, shade(wall, 0.5)),
    ]));
    parts.push(box({ x0: cab.x0 - 0.03, y0: cab.y0 - 0.03, z0: th + 0.22, x1: cab.x1 + 0.03, y1: cab.y1 + 0.03, z1: th + 0.27, wall: mix(domain.trouble, wall, 0.3) }));
    parts.push(rod([1.7, 0.45, th + 0.27], [1.7, 0.45, th + 0.6], 0.014, city.curb));
    parts.push(rod([1.6, 0.45, th + 0.45], [1.8, 0.45, th + 0.45], 0.01, city.curb));
    parts.push(beacon(1.7, 0.45, th + 0.6, state.bad));
  } else {
    parts.push(box({ x0: tower.x0 - 0.03, y0: tower.y0 - 0.03, z0: th, x1: tower.x1 + 0.03, y1: tower.y1 + 0.03, z1: th + 0.05, wall: trim }));
    parts.push(rod([1.7, 0.45, th + 0.05], [1.7, 0.45, th + 0.25], 0.012, city.curb));
  }
  // 横の扉・ホースの棚・屋上の空調
  parts.push(...door(tower, '+y', 0.08, 0.14, 0.2, NAVY, trim));
  parts.push(rooftopUnit(0.3, 0.35, h, 1));
  parts.push(rooftopUnit(0.6, 0.35, h, 1));
  if (level >= 4) parts.push(...dish(1.1, 0.45, h, 0.1));
  parts.push(box({ x0: 1.55, y0: 0.9, z0: 0, x1: 1.85, y1: 0.98, z1: 0.18, wall: mix(domain.trouble, city.curb, 0.4) }));
  if (level >= 2) {
    // 出動車両（車庫の前に並ぶ）
    parts.push(...responseCar(0.3, 1.25, true));
    parts.push(...responseCar(0.72, 1.3, false));
    if (level >= 4) parts.push(...responseCar(1.12, 1.25, true));
  }
  // 消火栓・木・街灯
  parts.push(prism(1.62, 1.5, 0.03, 0, 0.08, state.bad, undefined, 8));
  parts.push(broadleafTree(1.75, 1.75, 0.8, 1));
  parts.push(...streetLamp(1.55, 1.85, '-x'));
  return { w: 2, d: 2, ground, parts, shadowHeight: 0.9 + (floors - 2) * 0.3 };
}
