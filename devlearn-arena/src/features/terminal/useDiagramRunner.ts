import { useCallback, type RefObject } from 'react';
import { useMotionEnabled } from '@/ui/motion';
import type { TerminalHandle } from './TerminalView';

/**
 * 図の操作を端末のコマンドとして打つ関数を返す。
 * 図は状態を直接いじらず、必ずこの関数でコマンドを1行打つ。
 * 動きを付ける設定なら1文字ずつ打ち込まれる様子を見せ、付けない設定ならすぐ実行する。
 */
export function useDiagramRunner(terminalRef: RefObject<TerminalHandle>): (line: string) => void {
  const animate = useMotionEnabled();
  return useCallback(
    (line: string) => {
      const terminal = terminalRef.current;
      if (!terminal) return;
      if (animate) terminal.type(line);
      else terminal.submit(line);
    },
    [terminalRef, animate],
  );
}
