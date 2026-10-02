import { STAGE_THRESHOLDS, type Stage } from '@/game/stage';
import { facilityCells, frontOf, occupancyOf } from './cells';
import { FACILITY_DEFS } from './facilities';
import { CAPACITY, constructionStage, revealedFor } from './rules';
import type { Agent, Network } from './traffic';
import type { City, DomainId, Point, Rect } from './types';

/**
 * 表示の切り替え（docs/ui-design.md 3 章・8 章: 学習の進み・人口・交通・発展段階を色で重ねる）。
 * 色を塗るマスと、その強さ（0〜1）を計算する。純粋な関数。
 */

export type OverlayKind = 'learning' | 'population' | 'traffic' | 'stage';

export interface OverlayCell {
  x: number;
  y: number;
  /** 0〜1 */
  value: number;
}

/** 道路の線の一部（地図の座標の折れ線）と、その強さ（0〜1） */
export interface OverlayPath {
  pts: Point[];
  value: number;
}

/** 交通の表示で 1 つに塗る長さ（道路の線の点 4 つ = 1 マス） */
const PATH_POINTS = 4;

export type Overlay =
  | { kind: 'cells'; cells: OverlayCell[] }
  | { kind: 'paths'; paths: OverlayPath[] }
  | { kind: 'areas'; current: Rect; next: Rect | null; stage: Stage; need: { techPower: number; population: number } | null };

export interface OverlayInput {
  /** 分野ごとのスキルの値（0〜100）。学習の記録が無ければ空 */
  skills?: Partial<Record<DomainId, number>>;
  net?: Network;
  agents?: readonly Agent[];
}

export function overlayOf(kind: OverlayKind, city: City, input: OverlayInput = {}): Overlay {
  switch (kind) {
    case 'learning': {
      // 施設ごとの習熟（対応する分野のスキル）。記録が無ければ 0
      const cells: OverlayCell[] = [];
      for (const f of city.facilities) {
        const def = FACILITY_DEFS[f.type];
        if (def.group !== 'facility' || !def.domain) continue;
        const value = Math.max(0, Math.min(1, (input.skills?.[def.domain] ?? 0) / 100));
        for (const c of facilityCells(f)) cells.push({ ...c, value });
      }
      return { kind: 'cells', cells };
    }
    case 'population': {
      // 住宅の区画の建物に住む人の多さ（都市の一番多い所を 1 とする）
      const occ = occupancyOf(city);
      const zoneKind = new Map(city.zones.map((z) => [z.id, z.kind]));
      const raw: OverlayCell[] = [];
      for (const b of city.buildings) {
        if (zoneKind.get(b.zoneId) !== 'residential' || constructionStage(b.builtDay, city.day) !== 'done') continue;
        if (frontOf(b.cell, occ.roads) === null) continue;
        raw.push({ ...b.cell, value: CAPACITY.residential[b.level - 1] ?? 0 });
      }
      const max = Math.max(1, ...raw.map((c) => c.value));
      return { kind: 'cells', cells: raw.map((c) => ({ ...c, value: c.value / max })) };
    }
    case 'traffic': {
      // 車の道のりが通る回数を、道路の線の上の点ごとに数え、1 マスほどの長さに分けて塗る
      const net = input.net;
      if (!net) return { kind: 'paths', paths: [] };
      const counts = net.lanes.map((lane) => new Array<number>(lane.pts.length).fill(0));
      for (const agent of input.agents ?? []) {
        if (agent.kind !== 'car') continue;
        for (const leg of agent.route.legs) {
          const lane = net.lanes[leg.lane];
          const count = counts[leg.lane];
          if (!lane || !count) continue;
          const lo = Math.min(leg.s0, leg.s1);
          const hi = Math.max(leg.s0, leg.s1);
          lane.acc.forEach((s, i) => {
            if (s >= lo && s <= hi) count[i] = (count[i] ?? 0) + 1;
          });
        }
      }
      const max = Math.max(1, ...counts.flat());
      const paths: OverlayPath[] = [];
      net.lanes.forEach((lane, li) => {
        const count = counts[li] ?? [];
        for (let i = 0; i < lane.pts.length - 1; i += PATH_POINTS) {
          const n = Math.max(...count.slice(i, i + PATH_POINTS + 1));
          if (n > 0) paths.push({ pts: lane.pts.slice(i, i + PATH_POINTS + 1), value: n / max });
        }
      });
      return { kind: 'paths', paths };
    }
    case 'stage': {
      // 今使える範囲と、次の段階で霧が晴れる範囲。次の段階までの条件
      const stage = city.stage;
      const next = stage < 5 ? ((stage + 1) as Stage) : null;
      const current = city.revealed[0] ?? revealedFor(stage)[0] ?? { x: 0, y: 0, w: 0, h: 0 };
      return {
        kind: 'areas',
        current,
        next: next ? revealedFor(next)[0] ?? null : null,
        stage,
        need: next ? STAGE_THRESHOLDS[next] : null,
      };
    }
  }
}

/** 次の発展段階までに足りないもの（技術力と都市規模の両方が要る） */
export function stageProgress(city: City): { next: Stage | null; techPower: [number, number]; population: [number, number] } {
  const next = city.stage < 5 ? ((city.stage + 1) as Stage) : null;
  const need = next ? STAGE_THRESHOLDS[next] : { techPower: 0, population: 0 };
  return { next, techPower: [city.techPower, need.techPower], population: [city.population, need.population] };
}
