import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { directHost } from '@/sim/host';
import { grownVillage } from '@/sim/__fixtures__/cities';
import { TERM_DAYS } from '@/sim/election';
import type { World } from '@/sim/types';
import { createCityStore } from './cityStore';
import { ElectionWindow } from './ElectionWindow';

/**
 * 選挙の画面（docs/ui-design.md 10.6）と任期の終わりの一覧・公約を選ぶ（10.7）。
 * 4×3 の表・得票に効いた層・落選の敗因と 2 つの道（学習の記録は消えない）・公約を 2 つ選ぶ
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

const GROWN = grownVillage(120);
const today = (w: World): number => Math.floor(w.city.day);
const beforeElection = (w: World, n: number): World => ({ ...w, politics: { ...w.politics, term: { ...w.politics.term, startDay: today(w) + n - TERM_DAYS + 1 } } });
const supported = (w: World, low: number, high: number): World => ({
  ...w,
  history: { ...w.history, breakdown: w.history.breakdown.map((b) => ({ ...b, layers: (b.layers ?? []).map((_, i) => (i < 6 ? low : high)) })) },
});

function mount(world: World, onNewCity?: () => void) {
  const store = createCityStore(undefined, undefined, { world, host: directHost() });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<ElectionWindow store={store} {...(onNewCity ? { onNewCity } : {})} />));
  return { store, host };
}
const q = (host: HTMLElement, id: string) => host.querySelector(`[data-testid="${id}"]`);
const click = (el: Element | null): void => act(() => (el as HTMLButtonElement).click());
/** 選挙の日まで進める（1 日） */
const toElection = (store: ReturnType<typeof createCityStore>): void => act(() => store.getState().tick(2));

describe('選挙の見込み', () => {
  it('上の帯から開くと、得票率・12 層の 4×3 の表・得票に効いた層・選挙までの週と公約', () => {
    const { store, host } = mount(beforeElection(GROWN.world, 7 * 38));
    act(() => store.getState().openElection('preview'));
    expect(q(host, 'election-window')?.getAttribute('data-mode')).toBe('preview');
    const rows = host.querySelectorAll('[data-testid="election-table"] tbody tr');
    expect(rows.length).toBe(4);
    expect([...rows].map((r) => r.querySelectorAll('td').length)).toEqual([3, 3, 3, 3]);
    expect([...rows].map((r) => r.querySelector('th')?.textContent)).toEqual(['若者', '子育て', '中年', '高齢']);
    // 字は支持と投票率（色だけに頼らない）
    expect(rows[0]?.querySelector('td')?.textContent).toMatch(/^\d+%投票 \d+%$/);
    expect(host.textContent).toContain('選挙まで 38 週');
    expect(q(host, 'election-verdict')?.textContent).toMatch(/^(当選|落選)の見込み$/);
    // 公約を選んでいなければ、選ぶ窓へ
    click(q(host, 'election-pick'));
    expect(store.getState().election).toBe('term');
    expect(q(host, 'pledge-picker')).not.toBeNull();
  });
});

describe('落選', () => {
  it('敗因（層・要因・決定）と 2 つの道。どちらにも「学習の記録は消えない」と添える', () => {
    const onNewCity = vi.fn();
    const { store, host } = mount(supported(beforeElection(GROWN.world, 1), 20, 45), onNewCity);
    toElection(store);
    expect(q(host, 'election-window')?.getAttribute('data-mode')).toBe('result');
    expect(q(host, 'election-verdict')?.textContent).toBe('落選');
    expect(host.querySelectorAll('[data-testid="election-causes"] li').length).toBe(3);
    expect(q(host, 'election-causes')?.textContent).toContain('満足を下げた要因');
    expect(q(host, 'election-keep')?.textContent).toBe('どちらを選んでも、学習の記録（XP・スキル・レッスンの進み・ミッション）は消えない');
    click(q(host, 'election-new-city'));
    expect(onNewCity).toHaveBeenCalledTimes(1);
  });

  it('同じ都市で再び立つと、任期の一覧（落選）と次の任期の公約を選ぶ窓になる', () => {
    const { store, host } = mount(supported(beforeElection(GROWN.world, 1), 20, 45));
    toElection(store);
    click(q(host, 'election-rerun'));
    expect(store.getState().world.politics.term.no).toBe(2);
    expect(q(host, 'election-window')?.getAttribute('data-mode')).toBe('term');
    expect(q(host, 'election-summary')?.textContent).toContain('1 期目');
    expect(q(host, 'pledge-picker')).not.toBeNull();
    expect(host.querySelector('#election-title')?.textContent).toBe('2 期目の公約を選ぶ');
  });

  it('保存の口が無ければ、新しい都市で始めるは押せない（同じ都市で再び立つ道は残る）', () => {
    const { store, host } = mount(supported(beforeElection(GROWN.world, 1), 20, 45));
    toElection(store);
    expect((q(host, 'election-new-city') as HTMLButtonElement).disabled).toBe(true);
    expect((q(host, 'election-rerun') as HTMLButtonElement).disabled).toBe(false);
  });
});

describe('当選と公約', () => {
  it('当選すると、任期の一覧から次の公約へ。2 つ選ぶまで決められず、3 つ目を押すと最初の物が外れる', () => {
    const { store, host } = mount(supported(beforeElection(GROWN.world, 1), 90, 90));
    toElection(store);
    expect(q(host, 'election-verdict')?.textContent).toBe('当選');
    expect(q(host, 'election-causes')).toBeNull();
    click(q(host, 'election-term'));
    expect(q(host, 'election-summary')).not.toBeNull();
    const confirm = q(host, 'pledge-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    expect(confirm.textContent).toBe('あと 2 つ選ぶ');
    const option = (id: string) => host.querySelector(`[data-pledge="${id}"]`);
    click(option('pop-grow'));
    click(option('it-two'));
    click(option('jobs-grow'));
    expect(option('pop-grow')?.getAttribute('aria-pressed')).toBe('false');
    expect(confirm.disabled).toBe(false);
    click(confirm);
    expect(store.getState().world.politics.term.pledges.map((p) => p.pledgeId)).toEqual(['it-two', 'jobs-grow']);
    expect(q(host, 'election-window')).toBeNull();
  });

  it('1 期目（前の任期が無い）は、公約を選ぶだけ。候補ごとに果たす条件と今の値と重く見る層', () => {
    const { store, host } = mount(GROWN.world);
    act(() => store.getState().askPledges());
    expect(q(host, 'election-summary')).toBeNull();
    expect(host.querySelector('#election-title')?.textContent).toBe('1 期目の公約を選ぶ');
    const first = host.querySelector('[data-pledge="pop-grow"]');
    expect(first?.textContent).toMatch(/^人口を 2 割増やす人口 [\d,]+人（目標 [\d,.]+人以上）重く見る層: /);
  });
});
