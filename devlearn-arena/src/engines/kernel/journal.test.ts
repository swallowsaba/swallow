import { describe, expect, it } from 'vitest';
import { createJournal, current, isAtLatest, labels, push, seek } from './journal';

describe('journal', () => {
  it('初期状態を1件持つ', () => {
    const j = createJournal({ n: 0 });
    expect(j.entries).toHaveLength(1);
    expect(current(j)).toEqual({ n: 0 });
  });

  it('積むとカーソルが最新に来る', () => {
    let j = createJournal({ n: 0 });
    j = push(j, { n: 1 }, 'step1');
    j = push(j, { n: 2 }, 'step2');
    expect(current(j)).toEqual({ n: 2 });
    expect(isAtLatest(j)).toBe(true);
    expect(labels(j)).toEqual(['initial', 'step1', 'step2']);
  });

  it('巻き戻してその時点の状態を見られる', () => {
    let j = createJournal({ n: 0 });
    j = push(j, { n: 1 }, 'a');
    j = push(j, { n: 2 }, 'b');
    j = seek(j, 1);
    expect(current(j)).toEqual({ n: 1 });
    expect(isAtLatest(j)).toBe(false);
  });

  it('範囲外の seek は端で止まる', () => {
    let j = createJournal({ n: 0 });
    j = push(j, { n: 1 }, 'a');
    expect(current(seek(j, 99))).toEqual({ n: 1 });
    expect(current(seek(j, -5))).toEqual({ n: 0 });
  });

  it('巻き戻し中に積むと、その先は捨てられる（履歴を分岐させない）', () => {
    let j = createJournal({ n: 0 });
    j = push(j, { n: 1 }, 'a');
    j = push(j, { n: 2 }, 'b');
    j = seek(j, 1);
    j = push(j, { n: 9 }, 'c');
    expect(labels(j)).toEqual(['initial', 'a', 'c']);
    expect(current(j)).toEqual({ n: 9 });
  });

  it('上限を超えたら古いものから捨てる', () => {
    let j = createJournal(0);
    for (let i = 1; i <= 10; i += 1) j = push(j, i, `s${String(i)}`, 3);
    expect(j.entries).toHaveLength(3);
    expect(current(j)).toBe(10);
    expect(j.entries.map((e) => e.index)).toEqual([0, 1, 2]);
  });
});
