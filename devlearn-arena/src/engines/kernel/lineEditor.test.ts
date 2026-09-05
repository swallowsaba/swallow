import { describe, expect, it } from 'vitest';
import {
  backspace, createLineState, expandBang, historyMove, insert, killToStart, killWord,
  moveCursor, toLineEnd, toLineStart,
} from './lineEditor';

describe('行編集', () => {
  it('挿入とカーソル移動', () => {
    let s = insert(createLineState(), 'echo');
    expect(s.line).toBe('echo');
    s = moveCursor(s, -2);
    s = insert(s, 'X');
    expect(s.line).toBe('ecXho');
  });

  it('カーソル位置で backspace', () => {
    let s = insert(createLineState(), 'abc');
    s = moveCursor(s, -1);
    s = backspace(s);
    expect(s.line).toBe('ac');
  });

  it('行頭では backspace が効かない', () => {
    const s = backspace(toLineStart(insert(createLineState(), 'abc')));
    expect(s.line).toBe('abc');
  });

  it('Ctrl+A / Ctrl+E', () => {
    const s = insert(createLineState(), 'hello');
    expect(toLineStart(s).cursor).toBe(0);
    expect(toLineEnd(toLineStart(s)).cursor).toBe(5);
  });

  it('Ctrl+U はカーソルより前を消す', () => {
    let s = insert(createLineState(), 'abcdef');
    s = moveCursor(s, -2);
    expect(killToStart(s).line).toBe('ef');
  });

  it('Ctrl+W は直前の単語を消す', () => {
    const s = insert(createLineState(), 'git commit -m');
    expect(killWord(s).line).toBe('git commit ');
  });
});

describe('履歴', () => {
  const history = ['ls', 'cd /etc', 'pwd'];

  it('↑で直前から遡る', () => {
    let s = historyMove(createLineState(), history, -1);
    expect(s.line).toBe('pwd');
    s = historyMove(s, history, -1);
    expect(s.line).toBe('cd /etc');
  });

  it('先頭より前には行かない', () => {
    let s = createLineState();
    for (let i = 0; i < 5; i += 1) s = historyMove(s, history, -1);
    expect(s.line).toBe('ls');
  });

  it('↓で戻ると打ちかけの行が復活する', () => {
    let s = insert(createLineState(), 'half typed');
    s = historyMove(s, history, -1);
    expect(s.line).toBe('pwd');
    s = historyMove(s, history, 1);
    expect(s.line).toBe('half typed');
  });

  it('履歴が無ければ何も起きない', () => {
    expect(historyMove(createLineState(), [], -1).line).toBe('');
  });

  it('!! を直前のコマンドに置き換える', () => {
    expect(expandBang('!!', history)).toEqual({ line: 'pwd', expanded: true });
    expect(expandBang('sudo !!', history).line).toBe('sudo pwd');
    expect(expandBang('echo hi', history).expanded).toBe(false);
  });
});
