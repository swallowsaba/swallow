import { cellKey, frontOf, roadCells } from './cells';
import { footprintOf } from './facilities';
import { zoneBuildingModel } from './generate/buildings';
import type { Model } from './generate/mesh';
import { broadleafTree, conifer, streetLamp } from './generate/shapes';
import type { Rotation } from './projection';
import { seedOf } from './random';
import { distanceToPolyline, type Terrain } from './terrain';
import type { City, FacilityType } from './types';

/**
 * 都市の状態と地形から、描く物の一覧を作る（純粋な計算）。
 * 描画（src/city/render）はこの一覧を読むだけ。
 */

export interface SceneObject {
  id: string;
  /** 地図の上の敷地（回す前）。x, y はマスの角 */
  x: number;
  y: number;
  w: number;
  d: number;
  /** 地面の高さ（丘の上の木など） */
  z: number;
  /** 描画順の判定に使う高さ */
  height: number;
  /** 建物自身の向き（0〜3。正面 +y を基準に 90 度ずつ） */
  facing: Rotation;
  source: { kind: 'model'; key: string; model: () => Model } | { kind: 'facility'; type: FacilityType; level: number };
}

export { frontOf, roadCells } from './cells';

const key = cellKey;

export function buildScene(cityState: City, terrain: Terrain): SceneObject[] {
  const out: SceneObject[] = [];
  const roads = roadCells(cityState.roads);
  const taken = new Set<string>(roads);

  const zoneKind = new Map(cityState.zones.map((z) => [z.id, z.kind]));
  for (const b of cityState.buildings) {
    const kind = zoneKind.get(b.zoneId);
    const facing = frontOf(b.cell, roads);
    if (!kind || facing === null) continue; // 道路に面していない区画には建たない
    taken.add(key(b.cell.x, b.cell.y));
    const seed = seedOf(b.id, cityState.seed);
    out.push({
      id: b.id, x: b.cell.x, y: b.cell.y, w: 1, d: 1, z: 0, height: 1.2, facing,
      source: { kind: 'model', key: `zone:${kind}:${String(b.level)}:${String(seed)}`, model: () => zoneBuildingModel(kind, b.level, seed) },
    });
  }

  for (const f of cityState.facilities) {
    const size = footprintOf(f.type, f.rotation);
    for (let x = 0; x < size.w; x += 1) for (let y = 0; y < size.d; y += 1) taken.add(key(f.origin.x + x, f.origin.y + y));
    out.push({
      id: f.id, x: f.origin.x, y: f.origin.y, w: size.w, d: size.d, z: 0, height: 2.5,
      facing: (f.rotation / 90) as Rotation,
      source: { kind: 'facility', type: f.type, level: f.level },
    });
  }

  // 街灯: 一般道の両側の縁石の内に、3 マスごと。交差点には立てない
  for (const road of cityState.roads) {
    if (road.kind !== 'street') continue;
    const [a, b] = road.path;
    if (!a || !b || road.path.length !== 2) continue;
    const alongX = Math.abs(b.x - a.x) > Math.abs(b.y - a.y);
    const len = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
    for (let i = 1; i < len; i += 3) {
      const t = i / len;
      const px = a.x + (b.x - a.x) * t;
      const py = a.y + (b.y - a.y) * t;
      const spots: { x: number; y: number; arm: '+x' | '-x' | '+y' | '-y' }[] = alongX
        ? [{ x: px, y: py - 0.43, arm: '+y' }, { x: px + 1.5, y: py + 0.43, arm: '-y' }]
        : [{ x: px - 0.43, y: py, arm: '+x' }, { x: px + 0.43, y: py + 1.5, arm: '-x' }];
      for (const spot of spots) {
        const nearOther = cityState.roads.some((o) => o.id !== road.id && distanceToPolyline(spot, o.path).dist < 1.1);
        if (nearOther || !roads.has(key(Math.floor(spot.x), Math.floor(spot.y)))) continue;
        out.push({
          id: `lamp-${road.id}-${String(i)}-${spot.arm}`, x: spot.x - 0.05, y: spot.y - 0.05, w: 0.1, d: 0.1, z: 0, height: 0.6, facing: 0,
          source: { kind: 'model', key: `lamp:${spot.arm}`, model: () => ({ w: 0.1, d: 0.1, parts: streetLamp(0.05, 0.05, spot.arm), shadowHeight: 0 }) },
        });
      }
    }
  }

  // 地形の木。道路・区画・施設のマスには生えない
  terrain.trees.forEach((t, i) => {
    if (taken.has(key(Math.floor(t.x), Math.floor(t.y)))) return;
    const s = t.scale;
    const r = 0.3 * s;
    const variant = t.variant;
    const modelKey = t.kind === 'conifer' ? `tree:c:${s.toFixed(2)}` : `tree:b:${s.toFixed(2)}:${String(variant)}`;
    out.push({
      id: `tree-${String(i)}`, x: t.x - r, y: t.y - r, w: r * 2, d: r * 2, z: t.z, height: 0.9 * s, facing: 0,
      source: {
        kind: 'model',
        key: modelKey,
        model: () => ({
          w: r * 2, d: r * 2, shadowHeight: 0.5 * s,
          parts: [t.kind === 'conifer' ? conifer(r, r, s) : broadleafTree(r, r, s, variant)],
        }),
      },
    });
  });

  return out;
}
