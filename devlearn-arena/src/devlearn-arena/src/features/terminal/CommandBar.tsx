import { useState, type FormEvent, type RefObject } from 'react';
import type { TerminalHandle } from './TerminalView';

interface Props {
  terminal: RefObject<TerminalHandle>;
  chips?: readonly string[];
}

const DEFAULT_CHIPS = ['help', 'ls -la', 'pwd', 'cat README.txt', 'mkdir reports', 'cd ..'] as const;

/**
 * 常設の行入力。xterm に直接打つのが速い人はそちらでもよいが、
 * 「どこに入力するのか分からない」を無くすために必ず見える場所に置く。
 */
export function CommandBar({ terminal, chips = DEFAULT_CHIPS }: Props) {
  const [value, setValue] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    if (value.trim() === '') return;
    terminal.current?.submit(value);
    setValue('');
  }

  return (
    <div className="border-t border-wood-dark bg-cream">
      <div className="flex flex-wrap gap-2 px-4 pt-4">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              setValue(chip);
            }}
            className="border border-wood-dark px-3 py-1.5 font-mono text-sm text-ink-soft transition-colors hover:border-wood-dark hover:text-[var(--gold-dark)]"
          >
            {chip}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex items-center gap-3 p-4">
        <span aria-hidden className="font-mono text-lg text-[var(--gold-dark)]">
          $
        </span>
        <input
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
          }}
          aria-label="コマンドを入力"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="send"
          placeholder="ここにコマンドを入力して Enter"
          className="min-w-0 flex-1 border-2 border-wood-dark bg-[var(--wood-dark)] px-4 py-3 font-mono text-base text-ink placeholder:text-ink-soft focus:border-wood-dark"
        />
        <button
          type="button"
          onClick={() => {
            terminal.current?.requestComplete();
          }}
          className="border-2 border-wood-dark px-4 py-3 font-mono text-sm text-ink-soft transition-colors hover:border-wood-dark"
        >
          Tab
        </button>
        <button
          type="submit"
          className="border-2 border-wood-dark px-6 py-3 font-mono text-base font-bold text-[var(--gold-dark)] transition-colors hover:bg-gold hover:text-ink"
        >
          実行
        </button>
      </form>
    </div>
  );
}
