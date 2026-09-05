/** XP とランク。レベル曲線は「最初は速く、後半は緩やか」の二次曲線。 */
export const RANKS = ['Novice', 'Junior', 'Mid', 'Senior', 'SRE'] as const;
export type Rank = (typeof RANKS)[number];

const RANK_AT_LEVEL: readonly { min: number; rank: Rank }[] = [
  { min: 40, rank: 'SRE' },
  { min: 25, rank: 'Senior' },
  { min: 14, rank: 'Mid' },
  { min: 6, rank: 'Junior' },
  { min: 1, rank: 'Novice' },
];

/** レベル n に到達するのに必要な累計 XP */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  return 50 * n * (n + 1);
}

export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1;
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level += 1;
  return level;
}

export function rankFromLevel(level: number): Rank {
  for (const entry of RANK_AT_LEVEL) {
    if (level >= entry.min) return entry.rank;
  }
  return 'Novice';
}

export interface XpProgress {
  level: number;
  rank: Rank;
  intoLevel: number;
  levelSpan: number;
  ratio: number;
}

export function xpProgress(xp: number): XpProgress {
  const level = levelFromXp(xp);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  const span = ceil - floor;
  const into = xp - floor;
  return {
    level,
    rank: rankFromLevel(level),
    intoLevel: into,
    levelSpan: span,
    ratio: span === 0 ? 0 : Math.min(1, into / span),
  };
}

/** ヒントと超過手数で減点したスコア（0-100） */
export function scoreAttempt(input: {
  hintsUsed: number;
  commandsUsed: number;
  parCommands: number;
}): number {
  const hintPenalty = input.hintsUsed * 12;
  const over = Math.max(0, input.commandsUsed - input.parCommands);
  const overPenalty = Math.min(30, over * 3);
  return Math.max(0, Math.min(100, 100 - hintPenalty - overPenalty));
}

export function xpForScore(score: number, kind: 'concept' | 'drill' | 'challenge' | 'boss'): number {
  const base = { concept: 20, drill: 30, challenge: 60, boss: 120 }[kind];
  return Math.round((base * Math.max(20, score)) / 100);
}
