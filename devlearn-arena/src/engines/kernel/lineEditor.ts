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

/** 全角で 2 桁を取る字か（CJK・かな・全角記号・絵文字など） */
function isWide(code: number): boolean {
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x1f300 && code <= 0x1f64f) ||
    (code >= 0x1f900 && code <= 0x1f9ff) ||
    (code >= 0x20000 && code <= 0x3fffd)
  );
}

/** 端末の上での幅（桁数）。全角の字は 2 桁を取る */
export function displayWidth(text: string): number {
  let width = 0;
  for (const ch of text) width += isWide(ch.codePointAt(0) ?? 0) ? 2 : 1;
  return width;
}

/**
 * 打っている行を消す制御文字列。
 * 行が右端で折り返していると、カーソルのいる行だけを消しても上の行が残る。
 * そこで、プロンプトの始まりの行まで上がってから、そこより下を全部消す。
 *
 * @param row いまカーソルがいる行。プロンプトの始まりの行を 0 と数える
 */
export function clearTyped(row: number): string {
  return `${row > 0 ? `\u001b[${String(row)}A` : ''}\r\u001b[J`;
}

/**
 * 打っている行を描き直す制御文字列と、描き直した後にカーソルがいる行（REWORK 3-2）。
 *
 * 折り返した行を `\r` と行消しだけで描き直すと、上の行が残って同じ行が何度も出る。
 * プロンプトの始まりまで上がって消し、書き、カーソルを行の中の位置へ戻す。
 *
 * @param row いまカーソルがいる行。プロンプトの始まりの行を 0 と数える
 * @param cols 端末の横幅（桁）
 */
export function redrawLine(
  row: number,
  prompt: string,
  line: string,
  cursor: number,
  cols: number,
): {
  text: string;
  row: number;
  /** 行が右端ちょうどで終わり、カーソルが次の行の頭にいる。Enter で改行を足すと空の行ができる */
  fresh: boolean;
} {
  const width = Math.max(1, cols);
  let text = clearTyped(row) + prompt + line;
  const total = displayWidth(prompt + line);
  // 右端ちょうどで終わると、端末はカーソルを右端に留めたままにする。次の行の頭へ送っておく
  if (total > 0 && total % width === 0) text += '\r\n';
  const endRow = Math.floor(total / width);
  const at = displayWidth(prompt + line.slice(0, cursor));
  const atRow = Math.floor(at / width);
  const atCol = at % width;
  if (endRow > atRow) text += `\u001b[${String(endRow - atRow)}A`;
  text += '\r';
  if (atCol > 0) text += `\u001b[${String(atCol)}C`;
  return { text, row: atRow, fresh: at === total && total > 0 && total % width === 0 };
}
