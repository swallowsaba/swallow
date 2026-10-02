import type { EngineerRank } from './types';

/**
 * エンジニア段階（docs/game-design.md 9 章・docs/decisions.md D-08）。総合 XP で決まる。
 */

export const RANKS: readonly { rank: EngineerRank; name: string; xp: number }[] = [
  { rank: 'apprentice', name: '見習い', xp: 0 },
  { rank: 'junior', name: 'ジュニア', xp: 1000 },
  { rank: 'middle', name: 'ミドル', xp: 5000 },
  { rank: 'senior', name: 'シニア', xp: 12000 },
  { rank: 'lead', name: 'リード', xp: 20000 },
];

export const RANK_NAMES = Object.fromEntries(RANKS.map((r) => [r.rank, r.name])) as Record<EngineerRank, string>;

export function rankOf(xp: number): EngineerRank {
  let rank: EngineerRank = 'apprentice';
  for (const r of RANKS) if (xp >= r.xp) rank = r.rank;
  return rank;
}

/** 次の段階と、そこまでの XP。リードなら null */
export function nextRankOf(xp: number): { rank: EngineerRank; name: string; xp: number; remaining: number; from: number } | null {
  const index = RANKS.findIndex((r) => r.rank === rankOf(xp));
  const next = RANKS[index + 1];
  const from = RANKS[index]?.xp ?? 0;
  return next ? { ...next, remaining: next.xp - xp, from } : null;
}
