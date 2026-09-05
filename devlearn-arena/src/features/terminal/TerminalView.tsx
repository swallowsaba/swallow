import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { complete } from '@/engines/kernel/completion';
import {
  backspace, createLineState, deleteForward, expandBang, historyMove, insert, killToStart,
  killWord, moveCursor, toLineEnd, toLineStart, type LineState,
} from '@/engines/kernel/lineEditor';
import { displayPath } from '@/engines/kernel/path';
import type { ShellSession } from './useShellSession';

export interface TerminalHandle {
  /** 外部（モバイル入力欄など）から1行実行する */
  submit: (line: string) => void;
  insertText: (text: string) => void;
  requestComplete: () => void;
  focus: () => void;
}

interface Props {
  session: ShellSession;
  /** コマンド実行後に呼ばれる（レッスン判定に使う） */
  onExecuted?: (line: string) => void;
}

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value === '' ? fallback : value;
}

export const TerminalView = forwardRef<TerminalHandle, Props>(function TerminalView(
  { session, onExecuted },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const lineRef = useRef<LineState>(createLineState());
  const sessionRef = useRef(session);
  const executedRef = useRef(onExecuted);
  sessionRef.current = session;
  executedRef.current = onExecuted;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize: 13,
      fontFamily: cssVar('--f-mono', 'monospace'),
      theme: {
        background: cssVar('--c-void', '#070a0f'),
        foreground: cssVar('--c-text', '#dbe5f0'),
        cursor: cssVar('--c-accent', '#3f8cff'),
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;

    const prompt = (): string => `learner@arena:${displayPath(sessionRef.current.getState().cwd)}$ `;

    const redraw = (): void => {
      const { line, cursor } = lineRef.current;
      term.write(`\r\u001b[K${prompt()}${line}`);
      const back = line.length - cursor;
      if (back > 0) term.write(`\u001b[${String(back)}D`);
    };

    const newPrompt = (): void => {
      lineRef.current = createLineState();
      term.write(`\r\n${prompt()}`);
    };

    const runLine = (raw: string): void => {
      const { line: expanded, expanded: didExpand } = expandBang(raw, sessionRef.current.getState().history);
      if (didExpand) term.write(`\r\u001b[K${prompt()}${expanded}`);
      term.write('\r\n');
      const chunks = sessionRef.current.run(expanded);
      for (const chunk of chunks) {
        const text = chunk.text.replace(/\n/g, '\r\n');
        term.write(chunk.stream === 'stderr' ? `\u001b[31m${text}\u001b[0m` : text);
      }
      executedRef.current?.(expanded);
      lineRef.current = createLineState();
      term.write(prompt());
    };

    const doComplete = (): void => {
      const { line, cursor } = lineRef.current;
      const result = complete(line, cursor, {
        shell: sessionRef.current.getState(),
        registry: sessionRef.current.registry,
      });
      if (result.candidates.length === 0) return;
      if (result.commonPrefix.length > cursor - result.start) {
        const before = line.slice(0, result.start);
        const after = line.slice(cursor);
        const suffix = result.candidates.length === 1 ? ' ' : '';
        const next = before + result.commonPrefix + suffix;
        lineRef.current = { ...lineRef.current, line: next + after, cursor: next.length };
        redraw();
        return;
      }
      if (result.candidates.length > 1) {
        term.write(`\r\n${result.candidates.join('  ')}\r\n`);
        redraw();
      }
    };

    const onKey = (data: string): void => {
      const state = lineRef.current;

      switch (data) {
        case '\r':
          runLine(state.line);
          return;
        case '\u007f':
          lineRef.current = backspace(state);
          redraw();
          return;
        case '\t':
          doComplete();
          return;
        case '\u0003': // Ctrl+C
          term.write('^C');
          newPrompt();
          return;
        case '\u000c': // Ctrl+L
          term.write('\u001b[2J\u001b[H');
          redraw();
          return;
        case '\u0001':
          lineRef.current = toLineStart(state);
          redraw();
          return;
        case '\u0005':
          lineRef.current = toLineEnd(state);
          redraw();
          return;
        case '\u0015':
          lineRef.current = killToStart(state);
          redraw();
          return;
        case '\u0017':
          lineRef.current = killWord(state);
          redraw();
          return;
        case '\u001b[A':
          lineRef.current = historyMove(state, sessionRef.current.getState().history, -1);
          redraw();
          return;
        case '\u001b[B':
          lineRef.current = historyMove(state, sessionRef.current.getState().history, 1);
          redraw();
          return;
        case '\u001b[C':
          lineRef.current = moveCursor(state, 1);
          redraw();
          return;
        case '\u001b[D':
          lineRef.current = moveCursor(state, -1);
          redraw();
          return;
        case '\u001b[3~':
          lineRef.current = deleteForward(state);
          redraw();
          return;
        default:
          break;
      }

      // 制御文字は無視し、印字可能な文字だけ受け取る
      if (data.charCodeAt(0) < 32) return;
      lineRef.current = insert(state, data);
      redraw();
    };

    const disposable = term.onData(onKey);
    term.write(`DevLearn Arena shell — help でコマンド一覧\r\n${prompt()}`);

    // fit() が端末のサイズを変え、それがまた ResizeObserver を呼ぶ循環を避ける。
    // 実際に行桁が変わるときだけ適用する
    const observer = new ResizeObserver(() => {
      const dims = fit.proposeDimensions();
      if (!dims) return;
      if (!Number.isFinite(dims.cols) || !Number.isFinite(dims.rows)) return;
      if (dims.cols === term.cols && dims.rows === term.rows) return;
      fit.fit();
    });
    observer.observe(host);

    return () => {
      observer.disconnect();
      disposable.dispose();
      term.dispose();
      termRef.current = null;
    };
    // session は ref 経由で参照するため、依存に入れて作り直さない
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    submit: (line: string) => {
      const term = termRef.current;
      if (!term) return;
      term.write(line);
      lineRef.current = { ...createLineState(), line, cursor: line.length };
      term.input('\r');
    },
    insertText: (text: string) => {
      termRef.current?.input(text);
    },
    requestComplete: () => {
      termRef.current?.input('\t');
    },
    focus: () => {
      termRef.current?.focus();
    },
  }));

  return <div ref={hostRef} className="h-full min-h-[280px] w-full p-2" />;
});
