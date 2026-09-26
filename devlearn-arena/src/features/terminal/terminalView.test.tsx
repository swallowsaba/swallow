import { act, useRef } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { mount } from '@/visual/mountForTest';
import { FakeScreen } from './fakeScreen';
import { TerminalView, type TerminalHandle } from './TerminalView';
import { useShellSession } from './useShellSession';

/**
 * 端末の画面（REWORK 3-2）。
 *
 * 本物の xterm は jsdom で描けないので、書き込まれた制御文字を小さな画面の模型（FakeScreen）で解釈し、
 * 学習者に見える行を確かめる。端末の幅は 40 桁にしてある。
 */

const COLS = 40;

const screens: FakeScreen[] = [];
const feeds: ((data: string) => void)[] = [];

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    cols = COLS;
    rows = 24;
    private screen = new FakeScreen(COLS);
    constructor() {
      screens.push(this.screen);
    }
    loadAddon(): void {}
    open(): void {}
    write(data: string): void {
      this.screen.write(data);
    }
    onData(cb: (data: string) => void) {
      feeds.push(cb);
      return { dispose: () => undefined };
    }
    input(data: string): void {
      feeds[feeds.length - 1]?.(data);
    }
    focus(): void {}
    dispose(): void {}
  },
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit(): void {}
    proposeDimensions() {
      return undefined;
    }
  },
}));

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

function Shell() {
  const session = useShellSession({});
  const ref = useRef<TerminalHandle>(null);
  return <TerminalView session={session} ref={ref} />;
}

/** 端末を開き、キーを打つ関数と、見えている画面を返す */
function openTerminal() {
  mount(<Shell />);
  const screen = screens[screens.length - 1];
  const feed = feeds[feeds.length - 1];
  if (screen === undefined || feed === undefined) throw new Error('端末が開かなかった');
  const press = (data: string): void => {
    act(() => {
      feed(data);
    });
  };
  const typeText = (text: string): void => {
    for (const ch of text) press(ch);
  };
  return { screen, press, typeText };
}

const PROMPT = 'learner@arena:~$ ';

/** 見えている行のうち、プロンプトから後ろ（いま打っている行）を 1 本につなげる */
function editing(screen: FakeScreen): string {
  const lines = screen.lines();
  const start = lines.map((l) => l.startsWith(PROMPT)).lastIndexOf(true);
  return lines.slice(start).join('');
}

describe('端末の行が右端で折り返すとき', () => {
  it('Tab で補完した後に打ち続けても、同じ行が何度も出ない', () => {
    const { screen, press, typeText } = openTerminal();
    typeText('mkdir reports');
    press('\r');
    typeText('grep localhost rep');
    press('\t');
    expect(editing(screen)).toBe(`${PROMPT}grep localhost reports/`);
    // ここから打つ字で、行が 40 桁を超えて折り返す
    typeText('hosts.txt > reports/local.txt');
    const prompts = screen.lines().filter((l) => l.startsWith(`${PROMPT}grep`));
    expect(prompts).toHaveLength(1);
    expect(editing(screen)).toBe(`${PROMPT}grep localhost reports/hosts.txt > reports/local.txt`);
  });

  it('折り返した行で消しても、消した字が画面に残らない', () => {
    const { screen, press, typeText } = openTerminal();
    typeText('echo 0123456789012345678901234567890123');
    for (let i = 0; i < 20; i += 1) press('\u007f');
    expect(editing(screen)).toBe(`${PROMPT}echo 01234567890123`);
    expect(screen.lines().filter((l) => l.startsWith(PROMPT))).toHaveLength(1);
  });

  it('折り返した行の途中にカーソルを戻して字を足せる', () => {
    const { screen, press, typeText } = openTerminal();
    typeText('echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaz');
    press('\u001b[D');
    typeText('b');
    expect(editing(screen)).toBe(`${PROMPT}echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaabz`);
    // カーソルは足した字の直後（z の上）にいる
    const at = screen.cursor();
    const typed = `${PROMPT}echo aaaaaaaaaaaaaaaaaaaaaaaaaaaaaab`.length;
    expect(at).toEqual({ row: 1 + Math.floor(typed / COLS), col: typed % COLS });
  });

  it('右端ちょうどで終わる行で Enter を押しても、空の行を挟まない', () => {
    const { screen, press, typeText } = openTerminal();
    // プロンプト 17 字 + 23 字 = 40 桁ちょうど
    typeText('echo 123456789012345678');
    press('\r');
    const lines = screen.lines();
    expect(lines[1]).toBe(`${PROMPT}echo 123456789012345678`);
    expect(lines[2]).toBe('123456789012345678');
  });

  it('折り返した行の途中で Enter を押すと、出力は行の下に出る（行を上書きしない）', () => {
    const { screen, press, typeText } = openTerminal();
    typeText('echo 0123456789012345678901234567890123');
    for (let i = 0; i < 30; i += 1) press('\u001b[D');
    press('\r');
    const lines = screen.lines();
    expect(lines.slice(1, 3).join('')).toBe(`${PROMPT}echo 0123456789012345678901234567890123`);
    expect(lines[3]).toBe('0123456789012345678901234567890123');
  });
});
