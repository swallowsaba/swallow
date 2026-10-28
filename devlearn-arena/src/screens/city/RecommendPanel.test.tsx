import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LESSONS } from '@/game/lessons';
import { completeLesson, startLesson } from '@/game/progress';
import { createProgressStore } from '../progressStore';
import { nowIso } from '../clock';
import type { Application } from '@/sim/types';
import { createCityStore } from './cityStore';
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

describe('おすすめの欄の、公聴会を待つ論点のレッスン（G7。docs/learning-design.md 12.3）', () => {
  const app: Application = {
    id: 'a1', kind: 'facility', target: { type: 'datacenter', origin: { x: 46, y: 45 }, rotation: 0 }, stage: 'hearing', stageDay: 20, filedDay: 0,
    wallet: 'funds', reserved: 650, exception: false, opposition: 62, mods: {},
    objections: [
      { reasonId: 'dc-power', group: 'neighbors', district: 0, strength: 0.42, share: 20, full: 20, basis: { value: 3, ref: 7 }, layers: [4], issue: true },
      { reasonId: 'dc-jobs', group: 'neighbors', district: 0, strength: 0.81, share: 40, full: 40, basis: { value: 2.5, ref: 13.5 }, layers: [0, 1], issue: true },
    ],
  };
  const cityWith = (a: Application | null) => {
    const city = createCityStore(1);
    city.getState().load({ ...city.getState().world, applications: a ? [a] : [] });
    return city;
  };
  const render = (store: ReturnType<typeof createProgressStore>, city: ReturnType<typeof createCityStore>, onLesson = vi.fn()): HTMLElement => {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root?.render(<RecommendPanel progress={store} city={city} onLesson={onLesson} />));
    return host;
  };

  it('公聴会を待つ申請の、一番大きな答えていない論点のレッスンを 1 つだけ並べ、押すとそのレッスン。推奨の物と並ぶ（3 行まで）', () => {
    const onLesson = vi.fn();
    const host = render(createProgressStore(() => undefined), cityWith(app), onLesson);
    const civic = host.querySelectorAll<HTMLButtonElement>('.recommend-item.is-civic');
    expect(civic).toHaveLength(1);
    // 雇用が少ない（40%）が一番大きい。その理由の最初のレッスン
    expect(civic[0]?.dataset.lesson).toBe('db.b.01');
    expect(civic[0]?.textContent).toContain('審議中のデータセンターの論点: 雇用が少ない');
    expect(host.querySelectorAll('.recommend-item')).toHaveLength(3);
    expect(host.querySelectorAll('.recommend-item[data-reason]').length).toBe(2);
    act(() => civic[0]?.click());
    expect(onLesson).toHaveBeenCalledWith('db.b.01');
  });

  it('修了したレッスンは飛ばす。答えた論点・議会の段の申請・申請が無い時は出さない', () => {
    const store = createProgressStore(() => undefined);
    const at = nowIso();
    store.setState({ progress: completeLesson(startLesson(store.getState().progress, 'db.b.01', at), 'db.b.01', at, LESSONS).progress });
    expect(render(store, cityWith(app)).querySelector<HTMLElement>('.recommend-item.is-civic')?.dataset.lesson).toBe('db.a.02');
    act(() => root?.unmount());
    const answered = { ...app, objections: app.objections.map((o) => (o.reasonId === 'dc-jobs' ? { ...o, hand: { kind: 'push' as const, capital: 8, day: 21 } } : o)) };
    expect(render(createProgressStore(() => undefined), cityWith(answered)).querySelector<HTMLElement>('.recommend-item.is-civic')?.textContent).toContain('電力の逼迫');
    act(() => root?.unmount());
    expect(render(createProgressStore(() => undefined), cityWith({ ...app, stage: 'council' })).querySelector('.recommend-item.is-civic')).toBeNull();
    act(() => root?.unmount());
    expect(render(createProgressStore(() => undefined), cityWith(null)).querySelector('.recommend-item.is-civic')).toBeNull();
  });
});
