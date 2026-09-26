import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { missionById } from '@/engines/lesson/registry';
import ParkPage from '@/features/park/ParkPage';
import { useStore } from '@/store';
import { click, mount } from '@/visual/mountForTest';

/**
 * 学びの流れ（REWORK 1-2〜1-5）を、学習画面の上で頭から通す。
 * 体験 → 登場 → 確かめ → 操作。コマンドを打つのは操作の段だけ。
 */

const FIRST = 'k8s/01/first-kubectl';

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));
  }
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance', 'Date'] });
  act(() => {
    useStore.setState((s) => ({
      facilitiesBuilt: [],
      introsRead: [],
      lessons: {},
      missionProgress: {},
      missionState: {},
      lastMissionId: null,
      growth: {},
      settings: { ...s.settings, motion: 'reduced', introAlways: false },
    }));
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function open(path = `/world/k8s?mission=${encodeURIComponent(FIRST)}`) {
  return mount(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/world/:trackId" element={<ParkPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const q = (view: Element, id: string) => view.querySelector(`[data-testid="${id}"]`);

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('学びの流れ', () => {
  it('初めて開くと体験の段から始まる。課題の札もコマンドの説明もまだ出ない', () => {
    const view = open();
    expect(q(view, 'flow-stage')?.getAttribute('data-stage')).toBe('experience');
    expect(q(view, 'task-card')).toBeNull();
    // 端末は閉じないが、いまはコマンドを使わないと伝える
    expect(q(view, 'terminal')).not.toBeNull();
    expect(q(view, 'terminal-note')?.textContent).toContain('コマンドは使わず');
    // 体験の段には用語が出ない
    expect(q(view, 'flow-stage')?.textContent).not.toContain('Pod');
    expect(q(view, 'flow-stage')?.textContent).not.toContain('ノード');
  });

  it('体験では町を押して住人を案内する。空きのあるビルを押すと片付く', () => {
    const view = open();
    click(view, '[data-testid="experience-start"]');
    advance(2000);
    const before = q(view, 'experience-chore')?.textContent ?? '';
    expect(before).toContain('案内せよ');
    click(view, '[data-thing="t3"]');
    expect(q(view, 'experience-note')?.textContent).toContain('ビル 3に入った');
  });

  it('体験 → 登場 → 確かめ → 操作 の順に進み、確かめで正解すると街が育つ', () => {
    const view = open();
    click(view, '[data-testid="experience-start"]');
    // 何もしないでいると待ちが溜まり、30 秒を過ぎたところで「手が追いつかない」で終わる
    advance(31000);
    expect(q(view, 'experience')?.getAttribute('data-over')).toBe('swamped');
    expect(q(view, 'experience-result')?.textContent).toContain('手で片付けた');
    click(view, '[data-testid="experience-next"]');

    // 登場: 施設が建ち、用語が町の物に結ばれる
    expect(q(view, 'flow-stage')?.getAttribute('data-stage')).toBe('reveal');
    expect(q(view, 'reveal-facility')?.textContent).toContain('Kubernetes');
    expect(q(view, 'reveal-replaces')?.textContent).toContain('さっき');
    advance(2500);
    const pointers = [...view.querySelectorAll('[data-pointer]')].map((el) => el.getAttribute('data-pointer'));
    expect(pointers).toEqual(missionById(FIRST)?.build().reveal.terms.map((t) => t.points));
    click(view, '[data-testid="reveal-next"]');

    // 確かめ 1: 住人の入っているビルを全部選ぶ。まず外す
    expect(q(view, 'quiz')?.getAttribute('data-quiz-kind')).toBe('pick');
    click(view, '[data-thing="t3"]');
    click(view, '[data-testid="quiz-answer"]');
    expect(q(view, 'quiz')?.getAttribute('data-verdict')).toBe('wrong');
    // 外れたら正解の所に印が付く
    expect(view.querySelector('[data-thing="t1"]')?.getAttribute('data-mark')).toBe('ok');
    expect(view.querySelector('[data-thing="t3"]')?.getAttribute('data-mark')).toBe('miss');
    click(view, '[data-testid="quiz-retry"]');
    const housesBefore = useStore.getState().growth['k8s']?.houses ?? 0;
    for (const id of ['t1', 't2', 't4']) click(view, `[data-thing="${id}"]`);
    click(view, '[data-testid="quiz-answer"]');
    expect(q(view, 'quiz')?.getAttribute('data-verdict')).toBe('ok');
    expect(useStore.getState().growth['k8s']?.houses ?? 0).toBeGreaterThan(housesBefore);
    click(view, '[data-testid="quiz-next"]');

    // 確かめ 2: 札を正しい順に並べる
    expect(q(view, 'quiz')?.getAttribute('data-quiz-kind')).toBe('order');
    const order = missionById(FIRST)?.build().quiz[1];
    const cards = order?.kind === 'order' ? order.cards : [];
    for (const card of cards) {
      const button = [...view.querySelectorAll('[data-testid="quiz-card"]')].find((b) => b.textContent === card);
      act(() => {
        (button as HTMLButtonElement | undefined)?.click();
      });
    }
    expect(q(view, 'quiz')?.getAttribute('data-verdict')).toBe('ok');
    click(view, '[data-testid="quiz-next"]');

    // 操作: 札が出て、いまの手順の目的が先に 1 行で出る
    expect(q(view, 'flow-stage')).toBeNull();
    expect(q(view, 'task-card')).not.toBeNull();
    expect(q(view, 'task-purpose')?.textContent).toContain(missionById(FIRST)?.build().steps[0]?.purpose ?? '---');
    expect(useStore.getState().introsRead).toContain(FIRST);
  });

  it('一度確かめまで終えた任務は、次に開くと操作の段から始まる', () => {
    act(() => {
      useStore.setState({ introsRead: [FIRST] });
    });
    const view = open();
    expect(q(view, 'flow-stage')).toBeNull();
    expect(q(view, 'task-card')).not.toBeNull();
  });

  it('操作の段から「体験からやり直す」で、体験の段に戻れる', () => {
    act(() => {
      useStore.setState({ introsRead: [FIRST] });
    });
    const view = open();
    click(view, '[data-testid="task-replay"]');
    expect(q(view, 'flow-stage')?.getAttribute('data-stage')).toBe('experience');
  });
});
