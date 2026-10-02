import { accent, city, domain, hud, mix, rgbaOf, shade, state } from '@/ui/tokens';
import type { Model, Part } from './mesh';
import { box, part } from './shapes';

/**
 * 車と人の模型（docs/visual-design.md 6.1: 車 5 色・人 4 種。人は小さな影絵で顔を描かない）。
 * 正面（進む向き）は +y。この模型から src/city/assets/agents/*.svg を作る（tools/build-facility-svgs.mts）。
 */

const NAVY = rgbaOf(hud.bg, 1);

export const CAR_COLORS = [domain.net, mix(city.lineWhite, city.wallStone, 0.2), state.bad, mix(city.curb, NAVY, 0.45), state.warn] as const;
export const PERSON_COLORS = [domain.web, domain.ctr, mix(domain.sec, city.roofTile, 0.3), accent.gold] as const;

/** 乗用車（車体・屋根と窓・灯り・車輪） */
export function carModel(variant: number): Model {
  const body = CAR_COLORS[variant % CAR_COLORS.length] as string;
  const w = 0.16;
  const l = 0.32;
  const glass = mix(city.wallGlass, NAVY, 0.35);
  const parts: Part[] = [];
  // 車輪（車体の下の暗い板）
  parts.push(box({ x0: 0.005, y0: 0.05, z0: 0, x1: w - 0.005, y1: 0.1, z1: 0.03, wall: shade(NAVY, 1.4) }));
  parts.push(box({ x0: 0.005, y0: l - 0.1, z0: 0, x1: w - 0.005, y1: l - 0.05, z1: 0.03, wall: shade(NAVY, 1.4) }));
  // 車体と、窓のある屋根
  parts.push(box({ x0: 0.01, y0: 0.01, z0: 0.02, x1: w - 0.01, y1: l - 0.01, z1: 0.07, wall: body, top: mix(body, city.lineWhite, 0.12) }, [
    // 前の灯りと後ろの灯り
    { kind: 'poly', pts: [[w - 0.03, l - 0.004, 0.04], [w - 0.06, l - 0.004, 0.04], [w - 0.06, l - 0.004, 0.055], [w - 0.03, l - 0.004, 0.055]], color: city.windowLit, lit: true, layer: 1 },
    { kind: 'poly', pts: [[0.06, l - 0.004, 0.04], [0.03, l - 0.004, 0.04], [0.03, l - 0.004, 0.055], [0.06, l - 0.004, 0.055]], color: city.windowLit, lit: true, layer: 1 },
  ]));
  parts.push(box({ x0: 0.025, y0: 0.08, z0: 0.07, x1: w - 0.025, y1: l - 0.1, z1: 0.115, wall: glass, top: mix(body, city.lineWhite, 0.2) }));
  return { w, d: l, parts, shadowHeight: 0.08 };
}

/** 歩く人（胴と頭の影絵。顔は描かない） */
export function personModel(variant: number): Model {
  const cloth = PERSON_COLORS[variant % PERSON_COLORS.length] as string;
  const s = 0.05;
  const parts: Part[] = [
    box({ x0: 0.01, y0: 0.015, z0: 0, x1: s - 0.01, y1: s - 0.015, z1: 0.05, wall: mix(NAVY, city.curb, 0.4) }),
    box({ x0: 0.005, y0: 0.01, z0: 0.05, x1: s - 0.005, y1: s - 0.01, z1: 0.11, wall: cloth }),
    part([{ kind: 'blob', center: [s / 2, s / 2, 0.13], r: 0.022, color: mix(city.sand, city.roofTile, 0.25 + (variant % 2) * 0.25) }], [0, 0, 0.11], [s, s, 0.15]),
  ];
  return { w: s, d: s, parts, shadowHeight: 0.04 };
}
