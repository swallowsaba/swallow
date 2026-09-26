import { useRef, type RefObject } from 'react';
import { TerminalView, type TerminalHandle } from '@/features/terminal/TerminalView';
import type { ShellSession } from '@/features/terminal/useShellSession';
import type { EditorTarget } from '@/features/park/EditorPanel';
import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';
import { DOCK_WIDTH, HUD, SIZE } from './theme';

interface Props {
  session: ShellSession;
  innerRef: RefObject<TerminalHandle>;
  onExecuted: (line: string, exitCode: number, stderr: string) => void;
  onEditor: (target: EditorTarget) => void;
  /** 端末の上に添える一言。体験の段では「いまはコマンドを使わない」と伝える（打つこと自体は止めない） */
  note?: string | null;
  /** いまの幅（px）。右端の仕切りに出す */
  width?: number;
  /** 仕切りを動かしている間。幅の下限と上限は受け取った側が収める */
  onResize?: (width: number) => void;
  /** 仕切りを放したとき。ここで保存する */
  onResized?: () => void;
}

/**
 * 左に常駐する端末。上の帯の下から画面の下端まで。
 *
 * 閉じない。待たせない。条件を付けない。
 * 説明を読んでいる間も、街を眺めている間も、ここはいつでも打てる。
 */
export function TerminalDock({ session, innerRef, onExecuted, onEditor, note = null, width = SIZE.dock, onResize, onResized }: Props) {
  const t = useT();
  return (
    <aside
      data-testid="terminal-dock"
      className="absolute bottom-0 left-0 z-20 flex flex-col"
      style={{ top: SIZE.topBar, width: DOCK_WIDTH, background: HUD.dock, borderRight: `1px solid ${HUD.line}` }}
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
      {onResize === undefined ? null : <DockDivider width={width} onResize={onResize} onResized={onResized} />}
    </aside>
  );
}

/** 矢印キー 1 回で動かす幅（px） */
const KEY_STEP = 24;

/**
 * 端末と街の間の縦の仕切り（REWORK 3-3）。ドラッグで端末の幅を変える。
 * 矢印キーでも動かせる。幅の下限と上限は受け取った側が収める。
 */
function DockDivider({
  width,
  onResize,
  onResized,
}: {
  width: number;
  onResize: (width: number) => void;
  onResized: (() => void) | undefined;
}) {
  const dragging = useRef(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="端末の幅を変える仕切り"
      aria-valuenow={width}
      tabIndex={0}
      data-testid="dock-divider"
      title="ドラッグで端末の幅を変える"
      className="group absolute bottom-0 top-0 z-30 flex w-3 cursor-col-resize touch-none justify-center outline-none"
      style={{ right: -6 }}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
      }}
      onPointerMove={(event) => {
        if (!dragging.current) return;
        onResize(event.clientX);
      }}
      onPointerUp={(event) => {
        if (!dragging.current) return;
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
        onResized?.();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        onResize(width + (event.key === 'ArrowRight' ? KEY_STEP : -KEY_STEP));
        onResized?.();
      }}
    >
      {/* 細い線。触れると太く光り、つまめる所だと分かる */}
      <span
        className="h-full w-px transition-all group-hover:w-[3px] group-focus-visible:w-[3px]"
        style={{ background: HUD.accentEdge }}
      />
      <span
        aria-hidden="true"
        className="absolute top-1/2 h-10 w-[5px] -translate-y-1/2 rounded-full"
        style={{ background: HUD.accentDeep, boxShadow: `0 0 8px ${HUD.accentEdge}` }}
      />
    </div>
  );
}
