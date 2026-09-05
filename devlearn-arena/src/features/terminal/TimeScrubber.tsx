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
    <div className="flex items-center gap-3 border-t border-line px-3 py-2">
      <span className="font-mono text-[11px] text-muted">履歴</span>
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
        className="min-w-0 flex-1 accent-[var(--c-accent)]"
        disabled={last === 0}
      />
      <span className="max-w-[40%] truncate font-mono text-[11px] text-muted" title={label}>
        {journal.cursor}/{last} {label}
      </span>
      {!atLatest ? (
        <button
          type="button"
          onClick={() => {
            seekTo(last);
          }}
          className="border border-accent px-2 py-0.5 font-mono text-[11px] text-accent"
        >
          最新へ
        </button>
      ) : null}
    </div>
  );
}
