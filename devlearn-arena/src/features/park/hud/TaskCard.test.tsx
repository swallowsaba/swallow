import { act } from 'react';
import { describe, expect, it } from 'vitest';
import { k8sFirstPod } from '@/engines/lesson/missions';
import type { LessonProgressState } from '@/engines/lesson/types';
import { mount } from '@/visual/mountForTest';
import { TaskCard } from './TaskCard';

/**
 * 課題の札の用語（REWORK 5-2 / 5-5）。
 * 見たいのは、札が「いまの手順までに出てきた語」だけを説明し、
 * 先の手順の語を先回りして出さないこと。
 */

function progressAt(stepIndex: number): LessonProgressState {
  return { stepIndex, cleared: false, hintsUsed: 0, commandsUsed: 0, mistakes: 0, skipped: [] };
}

function card(stepIndex: number) {
  return mount(
    <TaskCard
      mission={k8sFirstPod}
      progress={progressAt(stepIndex)}
      passingNow={false}
      diagnosis={null}
      revealedHints={0}
      reward={{ xp: 40, rights: 2 }}
      onHint={() => undefined}
      onWhy={() => undefined}
    />,
  );
}

const wordsOn = (view: HTMLElement): string[] =>
  [...view.querySelectorAll('[data-word]')].map((el) => el.getAttribute('data-word') ?? '');

describe('最初の任務の札', () => {
  it('最初の手順では、Pod という語をどこにも出さない', () => {
    const view = card(0);
    expect(view.textContent).not.toContain('Pod');
    expect(view.textContent).toContain('Kubernetes');
  });

  it('最初の手順で説明する語に、Kubernetes とノードが入る', () => {
    const view = card(0);
    act(() => {
      view.querySelector<HTMLButtonElement>('[data-testid="task-terms-more"]')?.click();
    });
    expect(wordsOn(view)).toEqual(expect.arrayContaining(['Kubernetes', 'ノード']));
  });

  it('Pod を作る手順に来ると、Pod が「この任務で出てくる言葉」の折り畳まれない所に並ぶ', () => {
    const view = card(1);
    expect(k8sFirstPod.steps[1]?.prompt).toContain('Pod');
    expect(wordsOn(view)).toContain('Pod');
  });

  it('先の手順は中身を伏せる', () => {
    const view = card(0);
    const later = view.querySelector('[data-step="3"]');
    expect(later?.textContent).not.toContain(k8sFirstPod.steps[3]?.prompt ?? '---');
  });

  it('いまの手順の用語には下線が付き、マウスを乗せると言い換えと例えが浮かぶ', () => {
    const view = card(1);
    const word = view.querySelector<HTMLElement>('[data-step="1"] [data-term="Pod"]');
    expect(word).not.toBeNull();
    act(() => {
      word?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    const tip = view.querySelector('[data-testid="term-tip-Pod"]');
    expect(tip?.textContent).toContain('街で言えば');
    expect(tip?.querySelector('[data-diagram="pod-in-node"]')).not.toBeNull();
  });
});
