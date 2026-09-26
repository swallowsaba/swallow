import { describe, expect, it } from 'vitest';
import {
  backspace, createLineState, displayWidth, expandBang, historyMove, insert, killToStart, killWord,
  moveCursor, redrawLine, toLineEnd, toLineStart,
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

describe('折り返した行の描き直し（REWORK 3-2）', () => {
  it('全角の字は 2 桁を取る', () => {
    expect(displayWidth('abc')).toBe(3);
    expect(displayWidth('あいう')).toBe(6);
    expect(displayWidth('echo こんにちは')).toBe(15);
  });

  it('1 行に収まるときは、行頭に戻って消してから書く', () => {
    const { text, row } = redrawLine(0, '$ ', 'ls', 2, 40);
    expect(text).toBe('\r\u001b[J$ ls\r\u001b[4C');
    expect(row).toBe(0);
  });

  it('折り返しているときは、プロンプトの始まりの行まで上がってから消す', () => {
    // 前回はカーソルが 2 行目（row 1）にいた
    const { text } = redrawLine(1, '$ ', 'x'.repeat(45), 45, 40);
    expect(text.startsWith('\u001b[1A\r\u001b[J$ ')).toBe(true);
  });

  it('カーソルが行の途中なら、その行と桁へ戻る', () => {
    // 47 字のうち 10 字目。カーソルは 1 行目にいて、書き終えた 2 行目から 1 行上がる
    const { text, row } = redrawLine(0, '$ ', 'x'.repeat(45), 8, 40);
    expect(text.endsWith('\u001b[1A\r\u001b[10C')).toBe(true);
    expect(row).toBe(0);
  });

  it('右端ちょうどで終わったら、カーソルを次の行の頭へ送る', () => {
    const { text, row } = redrawLine(0, '$ ', 'x'.repeat(38), 38, 40);
    expect(text.endsWith('\r\n\r')).toBe(true);
    expect(row).toBe(1);
  });
});
