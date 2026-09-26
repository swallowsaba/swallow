import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { missionById } from '@/engines/lesson/registry';
import type { LessonProgressState } from '@/engines/lesson/types';
import { click, mount } from '@/visual/mountForTest';
import { CARD_MIN, clampCard, loadLayout, saveLayout } from './layoutPrefs';
import { TaskCard } from './TaskCard';
import { SIZE } from './theme';

/**
 * 課題の札を動かす（REWORK 4-1〜4-3）。
 * 見出しをつかんで移動、右下の角で大きさ変更。位置と大きさは保存する。畳める。本文は「…」で切らない。
 */

const LESSON = (() => {
  const built = missionById('k8s/01/first-kubectl')?.build();
  if (built === undefined) throw new Error('任務が無い');
  return built;
})();

const PROGRESS: LessonProgressState = { stepIndex: 0, cleared: false, hintsUsed: 0, commandsUsed: 0, mistakes: 0, skipped: [] };

beforeAll(() => {
  // jsdom にはポインタの捕捉が無い。ドラッグの間だけ使うので、何もしないものを置く
  if (typeof Element.prototype.setPointerCapture !== 'function') {
    Element.prototype.setPointerCapture = () => undefined;
    Element.prototype.releasePointerCapture = () => undefined;
  }
});

beforeEach(() => {
  window.localStorage.clear();
  window.innerWidth = 1600;
  window.innerHeight = 900;
});

afterEach(() => {
  window.localStorage.clear();
});

function open() {
  return mount(
    <TaskCard
      mission={LESSON}
      progress={PROGRESS}
      passingNow={false}
      diagnosis={null}
      revealedHints={0}
      reward={{ xp: 40, rights: 2 }}
      onHint={() => undefined}
      onWhy={() => undefined}
    />,
  );
}

const cardOf = (view: Element): HTMLElement => {
  const el = view.querySelector<HTMLElement>('[data-testid="task-card"]');
  if (el === null) throw new Error('札が無い');
  return el;
};

/** 要素を (fromX, fromY) でつかみ、(toX, toY) まで運んで放す */
function pull(view: Element, testId: string, from: [number, number], to: [number, number]): void {
  const target = view.querySelector(`[data-testid="${testId}"]`);
  if (target === null) throw new Error(`${testId} が無い`);
  const at = ([clientX, clientY]: [number, number]) => ({ bubbles: true, clientX, clientY });
  act(() => {
    target.dispatchEvent(new MouseEvent('pointerdown', at(from)));
  });
  act(() => {
    target.dispatchEvent(new MouseEvent('pointermove', at(to)));
  });
  act(() => {
    target.dispatchEvent(new MouseEvent('pointerup', at(to)));
  });
}

describe('札を動かす', () => {
  it('はじめは端末の右の決まった所に出る', () => {
    const card = cardOf(open());
    expect(card.style.left).toBe('calc(var(--dock, 440px) + 16px)');
    expect(card.style.top).toBe(`${String(SIZE.panelTop)}px`);
  });

  it('見出しをつかんで運ぶと、その分だけ札が動く', () => {
    const view = open();
    // jsdom は配置を計算しないので、札は (0, 0) にあるものとして測られる
    pull(view, 'task-handle', [100, 100], [700, 400]);
    const card = cardOf(view);
    expect(card.style.left).toBe('600px');
    expect(card.style.top).toBe('300px');
  });

  it('右下の角をつまんで引くと、札が大きくなる', () => {
    saveLayout({ card: { left: 500, top: 100, width: 330, height: 400 } });
    const view = open();
    pull(view, 'task-resize', [830, 500], [1030, 650]);
    const card = cardOf(view);
    expect(card.style.width).toBe('530px');
    expect(card.style.height).toBe('550px');
  });

  it('小さくしすぎても、下限より小さくならない', () => {
    saveLayout({ card: { left: 500, top: 100, width: 330, height: 400 } });
    const view = open();
    pull(view, 'task-resize', [830, 500], [100, 100]);
    const card = cardOf(view);
    expect(card.style.width).toBe(`${String(CARD_MIN.width)}px`);
    expect(card.style.height).toBe(`${String(CARD_MIN.height)}px`);
  });

  it('画面の外へは出ていかない。見出しの一部は必ず画面に残る', () => {
    expect(clampCard({ left: 5000, top: 5000, width: 330, height: 300 }, { width: 1600, height: 900 })).toEqual({
      left: 1480,
      top: 856,
      width: 330,
      height: 300,
    });
    // 上の帯の下からしか出ない
    expect(clampCard({ left: 10, top: -50, width: 330, height: 300 }, { width: 1600, height: 900 }).top).toBe(SIZE.topBar + 4);
  });
});

describe('位置と大きさの保存', () => {
  it('放すと保存され、開き直しても同じ所・同じ大きさで出る', () => {
    const first = open();
    pull(first, 'task-handle', [100, 100], [300, 200]);
    const saved = loadLayout().card;
    expect(saved).toEqual({ left: 200, top: 100, width: expect.any(Number) as number, height: expect.any(Number) as number });
    const again = cardOf(open());
    expect(again.style.left).toBe('200px');
    expect(again.style.top).toBe('100px');
  });

  it('畳むと見出しだけになり、それも保存される', () => {
    const view = open();
    expect(view.querySelector('[data-testid="task-body"]')).not.toBeNull();
    click(view, '[data-testid="task-fold"]');
    expect(cardOf(view).getAttribute('data-folded')).toBe('true');
    expect(view.querySelector('[data-testid="task-body"]')).toBeNull();
    // 見出し（題と進み具合）は残る
    expect(view.querySelector('[data-testid="task-title"]')?.textContent).toBe(LESSON.title);
    expect(loadLayout().cardFolded).toBe(true);
    // 開き直しても畳んだまま。押せば開く
    const again = open();
    expect(cardOf(again).getAttribute('data-folded')).toBe('true');
    click(again, '[data-testid="task-fold"]');
    expect(again.querySelector('[data-testid="task-body"]')).not.toBeNull();
  });
});

describe('本文を切らない', () => {
  it('札の中に「…」で切る指定（truncate）が無い', () => {
    const card = cardOf(open());
    expect(card.querySelectorAll('.truncate')).toHaveLength(0);
    expect(card.textContent).not.toContain('…');
  });

  it('はみ出したら札の中で縦に送る', () => {
    const body = open().querySelector('[data-testid="task-body"]');
    expect(body?.className).toContain('overflow-y-auto');
    expect(body?.className).toContain('min-h-0');
  });
});
