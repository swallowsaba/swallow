/**
 * 効果音。音声ファイルは持たず、Web Audio で波形を合成する
 * （外部フェッチ禁止の制約があるため、かつ数十バイトで済むため）。
 * 既定は無音で、設定で有効にしたときだけ鳴る。
 */
let context: AudioContext | null = null;

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor = window.AudioContext;
  if (typeof Ctor !== 'function') return null;
  context ??= new Ctor();
  return context;
}

interface Note {
  /** 周波数(Hz) */
  hz: number;
  /** 開始位置(秒) */
  at: number;
  /** 長さ(秒) */
  dur: number;
  gain?: number;
}

function play(notes: readonly Note[], type: OscillatorType = 'square'): void {
  const ctx = ensureContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') void ctx.resume();
  const now = ctx.currentTime;

  for (const note of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(note.hz, now + note.at);
    // 立ち上がりと減衰を付けないと耳障りなクリック音になる
    gain.gain.setValueAtTime(0, now + note.at);
    gain.gain.linearRampToValueAtTime(note.gain ?? 0.08, now + note.at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + note.at + note.dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + note.at);
    osc.stop(now + note.at + note.dur + 0.02);
  }
}

export const sfx = {
  /** 手順を1つ達成 */
  step(): void {
    play([
      { hz: 880, at: 0, dur: 0.09 },
      { hz: 1320, at: 0.07, dur: 0.12 },
    ]);
  },
  /** ミッション達成 */
  clear(): void {
    play([
      { hz: 660, at: 0, dur: 0.12 },
      { hz: 880, at: 0.1, dur: 0.12 },
      { hz: 1320, at: 0.2, dur: 0.28 },
    ]);
  },
  /** レベルアップ */
  levelUp(): void {
    play(
      [
        { hz: 523, at: 0, dur: 0.1 },
        { hz: 659, at: 0.09, dur: 0.1 },
        { hz: 784, at: 0.18, dur: 0.1 },
        { hz: 1046, at: 0.27, dur: 0.4 },
      ],
      'triangle',
    );
  },
  /** コマンドが失敗 */
  error(): void {
    play([{ hz: 180, at: 0, dur: 0.18, gain: 0.05 }], 'sawtooth');
  },
};
