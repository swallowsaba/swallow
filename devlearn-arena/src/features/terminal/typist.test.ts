import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTypist } from './typist';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function harness() {
  let line = '';
  const ran: string[] = [];
  const typist = createTypist({
    typeChar: (ch) => {
      line += ch;
    },
    run: () => {
      ran.push(line);
      line = '';
    },
    charMs: 10,
    pauseMs: 20,
  });
  return { typist, ran, current: () => line };
}

describe('図からのコマンドを1文字ずつ打つ', () => {
  it('1文字ずつ入力欄に現れ、打ち終えてから実行される', () => {
    const h = harness();
    h.typist.enqueue('ls -a');
    expect(h.current()).toBe('l');
    vi.advanceTimersByTime(10);
    expect(h.current()).toBe('ls');
    expect(h.ran).toEqual([]);
    vi.advanceTimersByTime(40);
    expect(h.current()).toBe('ls -a');
    expect(h.ran).toEqual([]);
    vi.advanceTimersByTime(20);
    expect(h.ran).toEqual(['ls -a']);
    expect(h.typist.busy()).toBe(false);
  });

  it('続けて押されたものは、前を打ち終えてから順に打つ', () => {
    const h = harness();
    h.typist.enqueue('pwd');
    h.typist.enqueue('ls');
    vi.advanceTimersByTime(1000);
    expect(h.ran).toEqual(['pwd', 'ls']);
  });

  it('before は、その行を打ち始める直前に呼ばれる（前の行を打っている間は待つ）', () => {
    const h = harness();
    const notes: string[] = [];
    h.typist.enqueue('pwd', () => notes.push(`note:${h.ran.length}`));
    h.typist.enqueue('ls', () => notes.push(`note:${h.ran.length}`));
    expect(notes).toEqual(['note:0']);
    vi.advanceTimersByTime(1000);
    expect(notes).toEqual(['note:0', 'note:1']);
  });

  it('全角も1文字ずつ打つ', () => {
    const h = harness();
    h.typist.enqueue('echo あい');
    vi.advanceTimersByTime(1000);
    expect(h.ran).toEqual(['echo あい']);
  });

  it('やめると、打ちかけも待ちも捨てる', () => {
    const h = harness();
    h.typist.enqueue('pwd');
    h.typist.enqueue('ls');
    h.typist.cancel();
    vi.advanceTimersByTime(1000);
    expect(h.ran).toEqual([]);
    expect(h.typist.busy()).toBe(false);
  });
});
