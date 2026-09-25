import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount } from '@/visual/mountForTest';
import { PlaygroundFrame } from './PlaygroundFrame';

/**
 * 図解の枠（REWORK 6-2 / 6-4）。
 * 図の中で手を動かすと、同じことをするコマンドが下に出て、端末へ送れること。
 * 仕組みが落ち着くまで少しずつ進み、目標に届くと星が付くこと。
 */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function click(el: Element | null | undefined) {
  act(() => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('遊べる図解の枠', () => {
  it('住人を消すと、コマンドが出て、監督が作り直し、星が付く', () => {
    const typed: string[] = [];
    const view = mount(<PlaygroundFrame id="desired-vs-actual" onType={(line) => typed.push(line)} />);
    expect(view.querySelector('[data-testid="playground-goal"]')?.textContent).toContain('住人を 1 人消して');
    const first = view.querySelector('[data-pod]');
    const name = first?.getAttribute('data-pod') ?? '';
    click(first);

    expect(view.querySelector('[data-testid="playground-command"]')?.textContent).toBe(`kubectl delete pod ${name}`);
    // 消した直後は足りない。歯車が回っている
    expect(view.querySelector('[data-testid="playground-gear"][data-spinning]')).not.toBeNull();
    expect(view.querySelector('[data-testid="playground"]')?.getAttribute('data-reached')).toBeNull();

    for (let i = 0; i < 12; i += 1) {
      act(() => {
        vi.advanceTimersByTime(700);
      });
    }
    expect(view.querySelector('[data-testid="desired-count"]')?.textContent).toContain('3 人 / 注文 3 人');
    expect(view.querySelector('[data-testid="playground"]')?.getAttribute('data-reached')).toBe('true');
    // 作り直された住人は、消した住人とは別の名前で来る
    const names = [...view.querySelectorAll('[data-pod]')].map((el) => el.getAttribute('data-pod'));
    expect(names.filter((n) => n !== name).length).toBe(3);

    click(view.querySelector('[data-testid="playground-type"]'));
    expect(typed).toEqual([`kubectl delete pod ${name}`]);
  });

  it('満員のビルへの引っ越しは断られ、理由が赤く出る', () => {
    const view = mount(<PlaygroundFrame id="pod-in-node" />);
    click(view.querySelector('[data-pod="web-1"]'));
    click(view.querySelector('[data-node="node-2"]'));
    for (let i = 0; i < 6; i += 1) {
      act(() => {
        vi.advanceTimersByTime(700);
      });
    }
    click(view.querySelector('[data-pod="web-2"]'));
    click(view.querySelector('[data-node="node-2"]'));
    expect(view.querySelector('[data-testid="playground-refused"]')?.textContent).toContain('満員');
    expect(view.querySelector('[data-node="node-1"] [data-pod="web-2"]')).not.toBeNull();
  });

  it('札をインデックスへ運び、写真を撮ると、コミットの台に移る', () => {
    const view = mount(<PlaygroundFrame id="git-three-areas" />);
    click(view.querySelector('[data-area="worktree"] [data-card="app.txt"]'));
    expect(view.querySelector('[data-testid="playground-command"]')?.textContent).toBe('git add app.txt');
    expect(view.querySelector('[data-area="index"] [data-card="app.txt"]')).not.toBeNull();
    click(view.querySelector('[data-testid="take-photo"]'));
    expect(view.querySelector('[data-area="commit"] [data-card="app.txt"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="commit-count"]')?.textContent).toContain('写真 2 枚');
  });
});
