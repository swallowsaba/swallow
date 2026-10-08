import type { Progress } from '@/game/types';
import type { Session } from './session';

/**
 * 効果音（docs/decisions.md Q-03: 効果音のみ。既定は消音）。音は src/lib/sfx.ts が波形から作る（音声ファイルを持たない）。
 * 学習の記録の変化から鳴らす音を決める。設定の「音」を入れた時だけ鳴らす。
 */
export type SoundName = 'step' | 'levelUp' | 'clear' | 'error';

/** 学習の記録が prev から next に変わった時に鳴らす音。ミッションの達成 > レッスンの修了 > 正解・実戦の成功 */
export function soundFor(prev: Progress, next: Progress): SoundName | null {
  if (next.xpLog === prev.xpLog) return null;
  // 記録は直近 1,000 件で切れるので、長さでなく、前に無かった物を新しい物とする
  const before = new Set(prev.xpLog);
  const added = next.xpLog.filter((e) => !before.has(e));
  if (added.some((e) => e.source === 'mission')) return 'clear';
  if (added.some((e) => e.source === 'lesson-complete')) return 'levelUp';
  if (added.some((e) => e.source === 'quiz' || e.source === 'practice' || e.source === 'troubleshoot')) return 'step';
  return null;
}

/** 学習の記録を見張り、音を鳴らす。外す関数を返す */
export function attachSounds(session: Session, play: (name: SoundName) => void): () => void {
  return session.progress.subscribe((s, prev) => {
    if (!session.settings.getState().settings.sound) return;
    const name = soundFor(prev.progress, s.progress);
    if (name) play(name);
  });
}
