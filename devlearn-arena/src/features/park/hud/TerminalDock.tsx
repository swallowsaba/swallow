import type { RefObject } from 'react';
import { TerminalView, type TerminalHandle } from '@/features/terminal/TerminalView';
import type { ShellSession } from '@/features/terminal/useShellSession';
import type { EditorTarget } from '@/features/park/EditorPanel';
import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';
import { HUD, SIZE } from './theme';

interface Props {
  session: ShellSession;
  innerRef: RefObject<TerminalHandle>;
  onExecuted: (line: string, exitCode: number, stderr: string) => void;
  onEditor: (target: EditorTarget) => void;
  /** 端末の上に添える一言。体験の段では「いまはコマンドを使わない」と伝える（打つこと自体は止めない） */
  note?: string | null;
}

/**
 * 左に常駐する端末。上の帯の下から画面の下端まで。
 *
 * 閉じない。待たせない。条件を付けない。
 * 説明を読んでいる間も、街を眺めている間も、ここはいつでも打てる。
 */
export function TerminalDock({ session, innerRef, onExecuted, onEditor, note = null }: Props) {
  const t = useT();
  return (
    <aside
      data-testid="terminal-dock"
      className="absolute bottom-0 left-0 z-20 flex flex-col"
      style={{ top: SIZE.topBar, width: SIZE.dock, background: HUD.dock, borderRight: `1px solid ${HUD.line}` }}
    >
      <div
        className="flex shrink-0 items-center gap-2 px-3.5 py-2.5 text-[13px]"
        style={{ color: HUD.soft, borderBottom: `1px solid ${HUD.line}` }}
      >
        <Icon name="terminal" size={15} />
        {t('hud.terminal')}
        <span className="ml-auto font-mono text-[12px]" style={{ color: HUD.dim }}>
          {session.state.cwd}
        </span>
      </div>
      {note === null ? null : (
        <p
          data-testid="terminal-note"
          className="shrink-0 px-3.5 py-2 text-[12.5px] leading-snug"
          style={{ background: HUD.accentFill, color: HUD.accentText, borderBottom: `1px solid ${HUD.line}` }}
        >
          {note}
        </p>
      )}
      <div data-testid="terminal" className="min-h-0 min-w-0 flex-1 overflow-hidden">
        <TerminalView ref={innerRef} session={session} onExecuted={onExecuted} onEditor={onEditor} />
      </div>
    </aside>
  );
}
