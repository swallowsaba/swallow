/**
 * 1行入力の編集状態。xterm からのキー入力をここに集約する。
 * React に依存しないので、テストで純粋に検証できる。
 */
export interface LineState {
  line: string;
  cursor: number;
  historyIndex: number | null;
  /** ↑で遡る前に打ちかけていた行 */
  draft: string;
}

export function createLineState(): LineState {
  return { line: '', cursor: 0, historyIndex: null, draft: '' };
}

export function insert(state: LineState, text: string): LineState {
  const line = state.line.slice(0, state.cursor) + text + state.line.slice(state.cursor);
  return { ...state, line, cursor: state.cursor + text.length };
}

export function backspace(state: LineState): LineState {
  if (state.cursor === 0) return state;
  const line = state.line.slice(0, state.cursor - 1) + state.line.slice(state.cursor);
  return { ...state, line, cursor: state.cursor - 1 };
}

export function deleteForward(state: LineState): LineState {
  if (state.cursor >= state.line.length) return state;
  return { ...state, line: state.line.slice(0, state.cursor) + state.line.slice(state.cursor + 1) };
}

export function moveCursor(state: LineState, delta: number): LineState {
  return { ...state, cursor: Math.max(0, Math.min(state.line.length, state.cursor + delta)) };
}

export function toLineStart(state: LineState): LineState {
  return { ...state, cursor: 0 };
}

export function toLineEnd(state: LineState): LineState {
  return { ...state, cursor: state.line.length };
}

/** Ctrl+U: カーソルより前を消す */
export function killToStart(state: LineState): LineState {
  return { ...state, line: state.line.slice(state.cursor), cursor: 0 };
}

/** Ctrl+W: 直前の単語を消す */
export function killWord(state: LineState): LineState {
  const before = state.line.slice(0, state.cursor);
  const trimmed = before.replace(/\S+\s*$/, '');
  return { ...state, line: trimmed + state.line.slice(state.cursor), cursor: trimmed.length };
}

export function clearLine(state: LineState): LineState {
  return { ...state, line: '', cursor: 0, historyIndex: null, draft: '' };
}

/** ↑↓ の履歴移動。direction: -1 が過去方向。 */
export function historyMove(
  state: LineState,
  history: readonly string[],
  direction: -1 | 1,
): LineState {
  if (history.length === 0) return state;
  const currentIndex = state.historyIndex;

  if (direction === -1) {
    const nextIndex = currentIndex === null ? history.length - 1 : Math.max(0, currentIndex - 1);
    const line = history[nextIndex] ?? '';
    return {
      line,
      cursor: line.length,
      historyIndex: nextIndex,
      draft: currentIndex === null ? state.line : state.draft,
    };
  }

  if (currentIndex === null) return state;
  const nextIndex = currentIndex + 1;
  if (nextIndex >= history.length) {
    return { line: state.draft, cursor: state.draft.length, historyIndex: null, draft: '' };
  }
  const line = history[nextIndex] ?? '';
  return { ...state, line, cursor: line.length, historyIndex: nextIndex };
}

/** !! を直前のコマンドに置き換える。置換したら true。 */
export function expandBang(line: string, history: readonly string[]): { line: string; expanded: boolean } {
  if (!line.includes('!!')) return { line, expanded: false };
  const last = history[history.length - 1];
  if (last === undefined) return { line, expanded: false };
  return { line: line.replaceAll('!!', last), expanded: true };
}
