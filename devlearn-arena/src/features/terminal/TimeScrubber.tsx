import { useEffect, useState } from 'react';
import type { ShellSession } from './useShellSession';

interface Props {
  session: ShellSession;
}

const SPEEDS = [0.5, 1, 2, 4] as const;

/**
 * 時間の操作盤。
 * 打ったコマンドの履歴を「再生」して、世界が組み上がっていく様子を眺められる。
 * どの時点にも飛べる。
 */
export function TimeScrubber({ session }: Props) {
  const { journal, atLatest, seekTo } = session;
  const last = journal.entries.length - 1;
  const label = journal.entries[journal.cursor]?.label ?? 'initial';
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);

  useEffect(() => {
    if (!playing) return;
    if (journal.cursor >= last) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => {
      seekTo(journal.cursor + 1);
    }, 900 / speed);
    return () => {
      clearTimeout(id);
    };
  }, [playing, journal.cursor, last, speed, seekTo]);

  return (
    <div className="flex flex-nowrap items-center gap-2 overflow-hidden border-t border-wood-dark px-4 py-3">
      <button
        type="button"
        onClick={() => {
          if (journal.cursor >= last) seekTo(0);
          setPlaying((p) => !p);
        }}
        disabled={last === 0}
        aria-label={playing ? '再生を止める' : '履歴を再生する'}
        className="border-2 border-wood-dark px-4 py-1.5 font-mono text-base text-[var(--gold-dark)] hover:bg-gold hover:text-ink disabled:opacity-40"
      >
        {playing ? '❙❙' : '▶'}
      </button>

      <button
        type="button"
        onClick={() => {
          setPlaying(false);
          seekTo(journal.cursor + 1);
        }}
        disabled={journal.cursor >= last}
        aria-label="1つ進める"
        className="border border-wood-dark px-3 py-1.5 font-mono text-base text-ink-soft hover:border-wood-dark disabled:opacity-40"
      >
        ⇥
      </button>

      <div className="flex items-center gap-1" role="group" aria-label="再生速度">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setSpeed(s);
            }}
            aria-pressed={speed === s}
            className={`border px-2.5 py-1 font-mono text-sm ${
              speed === s ? 'border-wood-dark text-[var(--gold-dark)]' : 'border-wood-dark text-ink-soft'
            }`}
          >
            {s}×
          </button>
        ))}
      </div>

      <input
        type="range"
        min={0}
        max={last}
        value={journal.cursor}
        onChange={(e) => {
          setPlaying(false);
          seekTo(Number(e.target.value));
        }}
        aria-label="実行履歴をたどる"
        aria-valuetext={label}
        className="h-2 min-w-[80px] flex-1 accent-[var(--gold-dark)]"
        disabled={last === 0}
      />

      {/* 幅と有無を固定する。ここが伸び縮みすると枠全体の高さが変わり、
          Enter のたびにターミナルが上下にずれてしまう */}
      <span
        className="w-[140px] shrink-0 truncate font-mono text-sm text-ink-soft"
        title={label}
      >
        {journal.cursor}/{last} {label}
      </span>

      <button
        type="button"
        onClick={() => {
          setPlaying(false);
          seekTo(last);
        }}
        disabled={atLatest}
        className="knob shrink-0 px-3 py-1.5 font-mono text-sm disabled:opacity-40"
      >
        最新へ
      </button>
    </div>
  );
}
