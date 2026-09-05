import type { ShellSession } from './useShellSession';

interface Props {
  session: ShellSession;
}

/** 全スナップショットを行き来するスクラバー。 */
export function TimeScrubber({ session }: Props) {
  const { journal, atLatest, seekTo } = session;
  const last = journal.entries.length - 1;
  const label = journal.entries[journal.cursor]?.label ?? 'initial';

  return (
    <div className="flex flex-wrap items-center gap-4 border-t border-line px-4 py-3">
      <span className="font-mono text-sm uppercase tracking-[0.2em] text-muted">時間</span>
      <input
        type="range"
        min={0}
        max={last}
        value={journal.cursor}
        onChange={(e) => {
          seekTo(Number(e.target.value));
        }}
        aria-label="実行履歴をたどる"
        aria-valuetext={label}
        className="h-2 min-w-[200px] flex-1 accent-[var(--c-accent)]"
        disabled={last === 0}
      />
      <span className="max-w-[45%] truncate font-mono text-sm text-muted" title={label}>
        {journal.cursor}/{last} {label}
      </span>
      {!atLatest ? (
        <button
          type="button"
          onClick={() => {
            seekTo(last);
          }}
          className="border-2 border-accent px-4 py-1.5 font-mono text-sm text-accent hover:bg-accent hover:text-void"
        >
          最新へ
        </button>
      ) : null}
    </div>
  );
}
