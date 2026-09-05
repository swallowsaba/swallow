import { useState, type FormEvent, type RefObject } from 'react';
import type { TerminalHandle } from './TerminalView';

interface Props {
  terminal: RefObject<TerminalHandle>;
  /** よく使うコマンド。トラックごとに差し替える */
  chips?: readonly string[];
}

const DEFAULT_CHIPS = ['help', 'ls -la', 'pwd', 'cat README.txt', 'cd ..'] as const;

/**
 * モバイルでも確実に入力できる行入力。
 * xterm は端末によってソフトキーボードが出ないことがあるため、
 * 画面上の入力欄を常設し、デスクトップのキーボード入力と同じ経路に流す。
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
    <div className="border-t border-line bg-panel/60">
      <div className="flex gap-1.5 overflow-x-auto px-2 pt-2">
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => {
              setValue(chip);
            }}
            className="whitespace-nowrap border border-line px-2 py-1 font-mono text-[11px] text-muted hover:border-accent hover:text-ink"
          >
            {chip}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 p-2">
        <span aria-hidden className="font-mono text-xs text-accent">
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
          placeholder="コマンドを入力して送信"
          className="min-w-0 flex-1 border border-line bg-void px-2 py-1.5 font-mono text-sm text-ink placeholder:text-muted/60"
        />
        <button
          type="button"
          onClick={() => {
            terminal.current?.requestComplete();
          }}
          className="border border-line px-2 py-1.5 font-mono text-[11px] text-muted hover:border-accent"
        >
          Tab
        </button>
        <button
          type="submit"
          className="border border-accent px-3 py-1.5 font-mono text-[11px] text-accent hover:bg-accent hover:text-void"
        >
          実行
        </button>
      </form>
    </div>
  );
}
