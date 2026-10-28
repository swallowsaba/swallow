import { DISTRICT_SIZE, NOISE } from './rules';
import { DISTRICT_COUNT, DISTRICTS_PER_SIDE, type Space } from './space';
import type { PetitionEffect, PoliticsRules, World } from './types';

/**
 * 受理した請願の中身のうち、続く物（家賃の補助・騒音の制限・バス）を、週の計算に効く形にする（docs/game-design.md 22.1）。
 * 週の計算（week.ts）と申請の見込みの両方が同じ物を使う
 */

export interface PetitionMods {
  /** 地区 → 家賃を下げる割合と、下げる層（送った層） */
  rent: Map<number, { ratio: number; layers: readonly number[] }>;
  /** 工業の建物 ID → 騒音の倍率（売上も同じ割合で下がる） */
  noise: Map<string, number>;
  /** [地区] 住む地区から通う人の通勤の時間の倍率（無ければ undefined） */
  bus?: Float64Array;
}

export const NO_PETITION_MODS: PetitionMods = { rent: new Map(), noise: new Map() };

/** 地区の四角（マス。右と下は含まない） */
function districtRect(d: number): { x0: number; y0: number; x1: number; y1: number } {
  const x0 = (d % DISTRICTS_PER_SIDE) * DISTRICT_SIZE;
  const y0 = Math.floor(d / DISTRICTS_PER_SIDE) * DISTRICT_SIZE;
  return { x0, y0, x1: x0 + DISTRICT_SIZE, y1: y0 + DISTRICT_SIZE };
}

/** 点から地区の四角までの距離 */
function distToDistrict(x: number, y: number, d: number): number {
  const r = districtRect(d);
  const dx = Math.max(r.x0 - x, 0, x - r.x1);
  const dy = Math.max(r.y0 - y, 0, y - r.y1);
  return Math.hypot(dx, dy);
}

/** その週（week）に効いている請願の中身 */
export function petitionModsOf(world: Pick<World, 'petitions'>, space: Pick<Space, 'workplaces'>, rules: Pick<PoliticsRules, 'petitions'>, week: number): PetitionMods {
  const active = world.petitions.effects.filter((e) => e.untilWeek >= week && e.district !== undefined);
  if (active.length === 0 || !rules.petitions) return NO_PETITION_MODS;
  const byId = new Map(rules.petitions.map((p) => [p.id, p]));
  const out: PetitionMods = { rent: new Map(), noise: new Map() };
  for (const e of active) {
    const p = byId.get(e.petitionId);
    const d = e.district as number;
    if (!p) continue;
    const effect: PetitionEffect = p.accept.effect;
    switch (effect.kind) {
      case 'rent-subsidy': {
        const cur = out.rent.get(d);
        // 同じ地区に 2 つ重なれば、大きい割合の方（層は合わせる）
        out.rent.set(d, { ratio: Math.max(cur?.ratio ?? 0, effect.ratio), layers: [...new Set([...(cur?.layers ?? []), ...(p.layers ?? [])])] });
        break;
      }
      case 'noise-limit':
        for (const w of space.workplaces) {
          if (w.kind !== 'industrial') continue;
          const x = w.building.cell.x + 0.5;
          const y = w.building.cell.y + 0.5;
          if (distToDistrict(x, y, d) >= NOISE.industrialRadius) continue;
          out.noise.set(w.building.id, Math.min(out.noise.get(w.building.id) ?? 1, effect.factor));
        }
        break;
      case 'bus':
        out.bus ??= new Float64Array(DISTRICT_COUNT).fill(1);
        out.bus[d] = Math.min(out.bus[d] as number, effect.traffic);
        break;
      default:
        break;
    }
  }
  return out;
}
