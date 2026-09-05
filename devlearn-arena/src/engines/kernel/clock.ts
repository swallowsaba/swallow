/**
 * 仮想時計。エンジン層は実時間を見ない（同じ操作列は必ず同じ結果になる）。
 * UI 側が tick() を呼ぶ速度を変えても、シミュレーション結果は変わらない。
 */
export interface SimClock {
  /** 起動からの経過 tick 数 */
  readonly tick: number;
  /** 起動からの経過ミリ秒（tick × tickDurationMs） */
  readonly nowMs: number;
  readonly tickDurationMs: number;
}

export interface MutableClock extends SimClock {
  advance: (ticks?: number) => void;
  reset: () => void;
}

export function createClock(tickDurationMs = 500): MutableClock {
  let tick = 0;
  return {
    get tick() {
      return tick;
    },
    get nowMs() {
      return tick * tickDurationMs;
    },
    tickDurationMs,
    advance(ticks = 1) {
      if (!Number.isInteger(ticks) || ticks < 0) {
        throw new RangeError('advance には 0 以上の整数を渡すこと');
      }
      tick += ticks;
    },
    reset() {
      tick = 0;
    },
  };
}

/** 指数バックオフ（CrashLoopBackOff 用）。上限で頭打ちにする。 */
export function backoffMs(restarts: number, baseMs = 10_000, capMs = 300_000): number {
  if (restarts <= 0) return 0;
  const raw = baseMs * 2 ** (restarts - 1);
  return Math.min(raw, capMs);
}
