import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { complete } from '@/engines/kernel/completion';
import {
  backspace, createLineState, deleteForward, displayWidth, expandBang, historyMove, insert,
  killToStart, killWord, moveCursor, redrawLine, toLineEnd, toLineStart, type LineState,
} from '@/engines/kernel/lineEditor';
import { feedLine, splitCommands, type PendingInput } from '@/engines/kernel/continuation';
import { accent, fontFamily, hud, rgbaOf, state } from '@/ui/tokens';
import { promptOf } from './prompt';
import type { ShellSession } from './useShellSession';

/**
 * 仮想端末（docs/learning-design.md 6 章）。表示は xterm、中身は模擬のシェル（src/engines/kernel）。
 * 本物の機械には何もしない。行の編集・履歴・Tab の補完・ヒアドキュメントを扱う。
 */

export interface TerminalHandle {
  /** 外から 1 行実行する（キーで打ったのと同じ道筋） */
  submit: (line: string) => void;
  focus: () => void;
}

interface Props {
  session: ShellSession;
  /** コマンド実行後に呼ばれる（実戦の判定に使う） */
  onExecuted?: (line: string, exitCode: number, stderr: string) => void;
  /** vi などがエディタを要求したときに呼ばれる */
  onEditor?: (request: { path: string; content: string; tool: string }) => void;
  /** 最初に出す 1 行 */
  banner?: string;
}


export const TerminalView = forwardRef<TerminalHandle, Props>(function TerminalView(
  { session, onExecuted, onEditor, banner = 'help で使えるコマンドの一覧が出る' },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const lineRef = useRef<LineState>(createLineState());
  // ヒアドキュメントの本文を待っている間の入力
  const pendingRef = useRef<PendingInput | null>(null);
  // 外から1行流し込むときに、キー入力と同じ道筋で実行するため
  const runRef = useRef<((line: string) => void) | null>(null);
  /**
   * いまカーソルがいる行。プロンプトの始まりの行を 0 と数える。
   * 行が右端で折り返したとき、描き直す前にどこまで上がるかを知るのに使う（REWORK 3-2）
   */
  const rowRef = useRef(0);
  // 行が右端ちょうどで終わり、カーソルがもう次の行の頭にいる。Enter で改行を重ねない
  const freshRef = useRef(false);
  const sessionRef = useRef(session);
  const executedRef = useRef(onExecuted);
  const editorRef = useRef(onEditor);
  sessionRef.current = session;
  executedRef.current = onExecuted;
  editorRef.current = onEditor;
  const bannerRef = useRef(banner);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      convertEol: true,
      cursorBlink: true,
      fontSize: 14,
      lineHeight: 1.25,
      fontFamily: fontFamily.mono,
      theme: {
        background: rgbaOf(hud.bg, 1),
        foreground: hud.text,
        cursor: accent.gold,
        cursorAccent: rgbaOf(hud.bg, 1),
        selectionBackground: rgbaOf(accent.gold, 0.35),
        red: state.bad,
        brightRed: state.bad,
        green: state.ok,
        yellow: accent.goldLight,
        blue: state.info,
        brightBlack: hud.textSub,
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    termRef.current = term;

    const prompt = (): string => (pendingRef.current !== null ? '> ' : promptOf(sessionRef.current.getState()));

    /** 新しいプロンプトを書く。カーソルはプロンプトの後ろ（折り返していればその行）にいる */
    const writePrompt = (): void => {
      const text = prompt();
      term.write(text);
      rowRef.current = Math.floor(displayWidth(text) / Math.max(1, term.cols));
      freshRef.current = false;
    };

    /** 打っている行を描き直す。折り返した行も、プロンプトの始まりまで上がってから描く */
    const redraw = (): void => {
      const { line, cursor } = lineRef.current;
      const next = redrawLine(rowRef.current, prompt(), line, cursor, term.cols);
      term.write(next.text);
      rowRef.current = next.row;
      freshRef.current = next.fresh;
    };

    /** カーソルを行の終わりへ運ぶ。行の途中で Enter を押しても、出力が行を上書きしないように */
    const toEnd = (): void => {
      lineRef.current = toLineEnd(lineRef.current);
      redraw();
    };

    const newPrompt = (): void => {
      lineRef.current = createLineState();
      pendingRef.current = null;
      term.write('\r\n');
      writePrompt();
    };

    const runLine = (raw: string): void => {
      // ヒアドキュメントの本文は、終端記号の行が来るまで貯めてから1つのコマンドとして実行する
      const inBody = pendingRef.current !== null;
      const { line: typed, expanded: didExpand } = inBody
        ? { line: raw, expanded: false }
        : expandBang(raw, sessionRef.current.getState().history);
      const fed = feedLine(pendingRef.current, typed);
      const expanded = fed.kind === 'run' ? fed.text : typed;
      let fresh = freshRef.current;
      if (didExpand) {
        const shown = redrawLine(rowRef.current, prompt(), expanded, expanded.length, term.cols);
        term.write(shown.text);
        fresh = shown.fresh;
      }
      // 右端ちょうどで終わった行は、カーソルがもう次の行にいる。改行を重ねると空の行ができる
      if (!fresh) term.write('\r\n');
      freshRef.current = false;
      if (fed.kind === 'more') {
        pendingRef.current = fed.pending;
        lineRef.current = createLineState();
        writePrompt();
        return;
      }
      pendingRef.current = null;
      const { chunks, exitCode, editor } = sessionRef.current.run(expanded);
      let errorText = '';
      for (const chunk of chunks) {
        const text = chunk.text.replace(/\n/g, '\r\n');
        if (chunk.stream === 'stderr') errorText += chunk.text;
        term.write(chunk.stream === 'stderr' ? `\u001b[31m${text}\u001b[0m` : text);
      }
      if (editor !== null) editorRef.current?.(editor);
      // 失敗の中身も渡す。画面側で「なぜ通らないか」を出すのに使う
      executedRef.current?.(expanded, exitCode, errorText);
      lineRef.current = createLineState();
      writePrompt();
    };

    runRef.current = runLine;

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
        // 候補が1つに絞れたら空白を足す。ただしディレクトリ（末尾が /）には足さない
        const only = result.candidates.length === 1 ? result.candidates[0] : undefined;
        const suffix = only !== undefined && !only.endsWith('/') ? ' ' : '';
        const next = before + result.commonPrefix + suffix;
        lineRef.current = { ...lineRef.current, line: next + after, cursor: next.length };
        redraw();
        return;
      }
      if (result.candidates.length > 1) {
        // 候補は行の下に出し、その下に打ちかけの行を出し直す
        toEnd();
        term.write(`\r\n${result.candidates.join('  ')}\r\n`);
        rowRef.current = 0;
        lineRef.current = { ...lineRef.current, cursor };
        redraw();
      }
    };

    const onKey = (data: string): void => {
      const state = lineRef.current;

      switch (data) {
        case '\r':
          toEnd();
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
          toEnd();
          term.write('^C');
          newPrompt();
          return;
        case '\u000c': // Ctrl+L
          term.write('\u001b[2J\u001b[H');
          rowRef.current = 0;
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
    term.write(`\u001b[90m# ${bannerRef.current}\u001b[0m\r\n`);
    writePrompt();

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
      // xterm は開いた直後に、表示の大きさを測る処理を次の番に回す。すぐ閉じる（StrictMode の付け外し）と、
      // 閉じた後にその処理が走って落ちるので、閉じるのも次の番に回す
      setTimeout(() => term.dispose(), 0);
      termRef.current = null;
      runRef.current = null;
    };
    // session は ref 経由で参照するため、依存に入れて端末を作り直さない
  }, []);

  useImperativeHandle(ref, () => ({
    submit: (text: string) => {
      const term = termRef.current;
      if (!term) return;
      // 複数行は1コマンドずつ順に打つ。ヒアドキュメントの本文はまとめて1つにする
      for (const line of splitCommands(text)) {
        term.write(line.replace(/\n/g, '\r\n'));
        runRef.current?.(line);
      }
    },
    focus: () => {
      termRef.current?.focus();
    },
  }));

  return <div ref={hostRef} className="term-host" data-testid="terminal" />;
});
