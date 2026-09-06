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
    <div className="flex flex-wrap items-center gap-3 border-t border-line px-4 py-3">
      <button
        type="button"
        onClick={() => {
          if (journal.cursor >= last) seekTo(0);
          setPlaying((p) => !p);
        }}
        disabled={last === 0}
        aria-label={playing ? '再生を止める' : '履歴を再生する'}
        className="border-2 border-accent px-4 py-1.5 font-mono text-base text-accent hover:bg-accent hover:text-void disabled:opacity-40"
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
        className="border border-line px-3 py-1.5 font-mono text-base text-muted hover:border-accent disabled:opacity-40"
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
              speed === s ? 'border-accent text-accent' : 'border-line text-muted'
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
        className="h-2 min-w-[160px] flex-1 accent-[var(--c-accent)]"
        disabled={last === 0}
      />

      <span className="max-w-[40%] truncate font-mono text-sm text-muted" title={label}>
        {journal.cursor}/{last} {label}
      </span>

      {!atLatest ? (
        <button
          type="button"
          onClick={() => {
            setPlaying(false);
            seekTo(last);
          }}
          className="border-2 border-accent px-3 py-1.5 font-mono text-sm text-accent hover:bg-accent hover:text-void"
        >
          最新へ
        </button>
      ) : null}
    </div>
  );
}
