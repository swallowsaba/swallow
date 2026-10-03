import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LESSONS } from '@/game/lessons';
import { completeLesson, startLesson } from '@/game/progress';
import { createProgressStore } from '../progressStore';
import { nowIso } from '../clock';
import { RecommendPanel } from './RecommendPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

function show(store: ReturnType<typeof createProgressStore>, onLesson = vi.fn()): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<RecommendPanel progress={store} onLesson={onLesson} />));
  return host;
}

describe('おすすめの欄（docs/ui-design.md 3 章）', () => {
  it('初めは IT 基礎の最初のレッスンから 3 つ。押すとそのレッスンを始める', () => {
    const onLesson = vi.fn();
    const host = show(createProgressStore(() => undefined), onLesson);
    const items = [...host.querySelectorAll<HTMLButtonElement>('.recommend-item')];
    expect(items.map((b) => b.dataset.lesson)).toEqual(['found.b.01', 'found.b.02', 'found.b.03']);
    act(() => items[0]?.click());
    expect(onLesson).toHaveBeenCalledWith('found.b.01');
  });

  it('修了すると、次に学ぶとよいレッスンと、復習の予定が出る（高さ 160 に収まる 3 行まで）', () => {
    const store = createProgressStore(() => undefined);
    const at = nowIso();
    store.setState({ progress: completeLesson(startLesson(store.getState().progress, 'found.b.04', at), 'found.b.04', at, LESSONS).progress });
    const host = show(store);
    expect([...host.querySelectorAll<HTMLElement>('.recommend-item')].map((b) => b.dataset.reason ?? 'review')).toEqual(['next', 'next', 'review']);
    expect(host.querySelector('[data-review="found.b.04"]')?.textContent).toContain('明日');
  });

  it('畳むと見出しだけになる', () => {
    const host = show(createProgressStore(() => undefined));
    act(() => host.querySelector<HTMLButtonElement>('.recommend-head')?.click());
    expect(host.querySelectorAll('.recommend-item')).toHaveLength(0);
    expect(host.querySelector('.recommend-head')?.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('おすすめの欄の挑戦中のミッション', () => {
  it('挑戦中のミッションが先頭に 1 つ出て、押すとミッション一覧で開く。全部で 3 行まで', () => {
    const store = createProgressStore(() => undefined);
    store.getState().startMission('incident');
    const onMission = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(<RecommendPanel progress={store} onLesson={vi.fn()} onMission={onMission} />));
    const items = [...host.querySelectorAll<HTMLButtonElement>('.recommend-item')];
    expect(items).toHaveLength(3);
    expect(items[0]?.dataset.mission).toBe('incident');
    expect(items[0]?.textContent).toContain('障害原因を特定せよ');
    act(() => items[0]?.click());
    expect(onMission).toHaveBeenCalledWith('incident');
  });
});
