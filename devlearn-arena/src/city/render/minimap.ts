import { accent, city, domain as domainColors, hud, mix, rgbaOf, shade, state, zoneTint } from '@/ui/tokens';
import { cellKindAt } from '../cells';
import { FACILITY_DEFS, footprintOf } from '../facilities';
import { toMinimap, type MinimapFrame } from '../minimap';
import type { P2 } from '../projection';
import type { Terrain } from '../terrain';
import type { City, FacilityType } from '../types';

/**
 * ミニマップを描く（docs/ui-design.md 3 章、docs/decisions.md D-18）。座標は src/city/minimap.ts。
 */

/** 施設の点の色。分野の施設は分野の色、公園などは草の濃い色 */
export function facilityDotColor(type: FacilityType): string {
  const d = FACILITY_DEFS[type].domain;
  return d ? domainColors[d] : mix(city.tree3, state.ok, 0.35);
}

/** 地図の上の多角形の道を作る */
function trace(ctx: CanvasRenderingContext2D, f: MinimapFrame, pts: readonly P2[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const m = toMinimap(f, p);
    if (i === 0) ctx.moveTo(m.mx, m.my);
    else ctx.lineTo(m.mx, m.my);
  });
  ctx.closePath();
}

/** マスの矩形（x, y から w × h） */
function rect(x: number, y: number, w: number, h: number): P2[] {
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
}

/**
 * 地図の下絵を描く（拡大率 1 の画素で。画面の画素の倍率は呼ぶ側で掛ける）。
 * 地盤の外は透明。海 → 陸 → 川と丘 → 区画 → 道路 → 晴れていない所の霞 → 施設の点、の順に重ねる
 */
export function drawMinimapBase(ctx: CanvasRenderingContext2D, f: MinimapFrame, terrain: Terrain, c: Pick<City, 'roads' | 'zones' | 'facilities' | 'revealed'>): void {
  ctx.clearRect(0, 0, f.box, f.box);
  // 1 マスの辺の長さ（画素）。マスは斜めに置くので √2 倍
  const cell = f.scale * Math.SQRT2;
  trace(ctx, f, terrain.slab);
  ctx.fillStyle = city.water;
  ctx.fill();
  trace(ctx, f, terrain.coast);
  ctx.fillStyle = city.grass;
  ctx.fill();
  for (let y = 0; y < terrain.size; y += 1) {
    for (let x = 0; x < terrain.size; x += 1) {
      const kind = cellKindAt(terrain, x, y);
      if (kind === 'land' || kind === 'sea') continue;
      trace(ctx, f, rect(x - 0.05, y - 0.05, 1.1, 1.1));
      ctx.fillStyle = kind === 'river' ? mix(city.water, city.shallow, 0.5) : city.grassDark;
      ctx.fill();
    }
  }
  for (const z of c.zones) {
    ctx.fillStyle = zoneTint[z.kind];
    for (const p of z.cells) {
      trace(ctx, f, rect(p.x, p.y, 1, 1));
      ctx.fill();
    }
  }
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = mix(city.paving, city.lineWhite, 0.55);
  for (const r of c.roads) {
    ctx.lineWidth = Math.max(1.5, cell * (r.kind === 'avenue' ? 1.4 : 0.9));
    ctx.beginPath();
    if (r.kind === 'roundabout') {
      // 環状交差点は、中心のまわり 3 × 3 マスの輪
      const m = toMinimap(f, r.path[0] ?? { x: 0, y: 0 });
      ctx.arc(m.mx, m.my, cell, 0, Math.PI * 2);
    } else {
      // 道の線はマスの中心を通る
      r.path.forEach((p, i) => {
        const m = toMinimap(f, p);
        if (i === 0) ctx.moveTo(m.mx, m.my);
        else ctx.lineTo(m.mx, m.my);
      });
    }
    ctx.stroke();
  }
  // 晴れていない所（都市ビューの霧と同じ）
  for (const r of c.revealed) {
    if (r.w >= f.size && r.h >= f.size) continue;
    ctx.save();
    trace(ctx, f, terrain.slab);
    ctx.clip();
    ctx.beginPath();
    ctx.rect(0, 0, f.box, f.box);
    const inner = rect(r.x, r.y, r.w, r.h).map((p) => toMinimap(f, p));
    inner.forEach((m, i) => (i === 0 ? ctx.moveTo(m.mx, m.my) : ctx.lineTo(m.mx, m.my)));
    ctx.closePath();
    ctx.fillStyle = rgbaOf(mix(city.lineWhite, hud.textSub, 0.35), 0.45);
    ctx.fill('evenodd');
    ctx.restore();
  }
  // 施設の点（小さい公園でも見えるように、敷地か最小の点の大きい方。縁を暗くして地面から浮かせる）
  ctx.lineWidth = 1;
  for (const fac of c.facilities) {
    const { w, d } = footprintOf(fac.type, fac.rotation);
    const m = toMinimap(f, { x: fac.origin.x + w / 2, y: fac.origin.y + d / 2 });
    const r = Math.max(2.5, (Math.max(w, d) * cell) / 2.4);
    ctx.beginPath();
    ctx.arc(m.mx, m.my, r, 0, Math.PI * 2);
    ctx.fillStyle = fac.state === 'active' ? facilityDotColor(fac.type) : mix(facilityDotColor(fac.type), city.paving, 0.55);
    ctx.fill();
    ctx.strokeStyle = shade(city.groundSide, 0.6);
    ctx.stroke();
  }
}

/** 今の視野の枠を描く（ミニマップの外にはみ出す所は切る） */
export function drawViewFrame(ctx: CanvasRenderingContext2D, f: MinimapFrame, corners: readonly { mx: number; my: number }[]): void {
  ctx.save();
  ctx.beginPath();
  ctx.rect(1, 1, f.box - 2, f.box - 2);
  ctx.clip();
  ctx.beginPath();
  corners.forEach((m, i) => (i === 0 ? ctx.moveTo(m.mx, m.my) : ctx.lineTo(m.mx, m.my)));
  ctx.closePath();
  ctx.fillStyle = rgbaOf(accent.goldLight, 0.12);
  ctx.fill();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = rgbaOf(hud.bgStrong, 0.8);
  ctx.lineWidth = 3.5;
  ctx.stroke();
  ctx.strokeStyle = accent.goldLight;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}
