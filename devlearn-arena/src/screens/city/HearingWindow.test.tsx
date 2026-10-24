import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { Application } from '@/sim/types';
import { createCityStore } from './cityStore';
import { HearingWindow } from './HearingWindow';
import { hearingModel, modsText } from './hearingView';
import { PermitDetailWindow } from './PermitWindows';

/**
 * 公聴会の窓（docs/ui-design.md 10.3）と、申請の詳細の「公聴会を開く」・先回りの譲歩（10.2）。
 * スキルが無い時も、譲歩と押し切るは必ず出る。説明はスキル段階で増える
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

function mount(node: React.ReactNode): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(node));
  return host;
}

const objections: Application['objections'] = [
  { reasonId: 'dc-jobs', group: 'neighbors', district: 0, strength: 0.81, share: 40, full: 40, basis: { value: 2.5, ref: 13.5 }, topLayer: 0, layers: [0, 1], issue: true },
  { reasonId: 'dc-power', group: 'neighbors', district: 0, strength: 0.42, share: 20, full: 20, basis: { value: 3, ref: 7 }, topLayer: 4, layers: [4], issue: true },
  { reasonId: 'dc-night-noise', group: 'neighbors', district: 0, strength: 0.05, share: 2, full: 2, basis: { value: 1.5, ref: 3 }, layers: [4] },
];
const dc = (patch: Partial<Application> = {}): Application => ({
  id: 'a1', kind: 'facility', target: { type: 'datacenter', origin: { x: 46, y: 45 }, rotation: 0 }, stage: 'hearing', stageDay: 20, filedDay: 0,
  wallet: 'funds', reserved: 650, exception: false, objections, opposition: 62, mods: {}, ...patch,
});

function storeWith(app: Application) {
  const store = createCityStore(1);
  const s = store.getState();
  store.getState().load({ ...s.world, city: { ...s.world.city, day: 22, funds: 5000 }, applications: [app] });
  return store;
}

describe('公聴会の窓（10.3）', () => {
  it('開くと時間が止まり、論点（5% 以上）が並ぶ。スキル 0 では説明が無いと示し、譲歩と押し切るは必ず出る', () => {
    const store = storeWith(dc());
    store.getState().openHearing('a1');
    expect(store.getState().holds).toContain('window');
    const host = mount(<HearingWindow store={store} skills={{}} />);
    const issues = [...host.querySelectorAll('[data-testid="hearing-issues"] .hearing-issue')].map((e) => e.getAttribute('data-reason'));
    expect(issues).toEqual(['dc-jobs', 'dc-power']);
    expect(host.querySelector('[data-testid="hearing-no-explain"]')?.textContent).toBe('今出せる説明は無い。学ぶと増える');
    expect(host.querySelectorAll('[data-concession]').length).toBeGreaterThan(0);
    expect(host.querySelector('[data-testid="hearing-push"]')?.textContent).toContain('政治資本 8 を使う');
    // 伏せた候補: 段階と分野を示す
    expect(host.querySelector('[data-testid="hearing-hidden"]')?.textContent).toContain('データベース 中級で出せる説明が 1 つある');
    expect(host.querySelector('[data-testid="hearing-end"]')?.textContent).toBe('公聴会を終える（答えていない論点 2）');
  });

  it('スキルの段階を上げると、説明の候補が並ぶ（質は出さない）', () => {
    const store = storeWith(dc());
    store.getState().openHearing('a1');
    const low = mount(<HearingWindow store={store} skills={{ db: 30 }} />);
    expect(low.querySelectorAll('[data-explanation]')).toHaveLength(2);
    const high = mount(<HearingWindow store={store} skills={{ db: 50 }} />);
    expect(high.querySelectorAll('[data-explanation]')).toHaveLength(3);
    expect(high.textContent).not.toMatch(/確か|誤り|sound|wrong/);
  });

  it('手を出すと、論点に結果が付き、住民と議員の受け取り方の 1 行が出る。同じ論点に 2 つ目の手は出せない', () => {
    const store = storeWith(dc());
    store.getState().openHearing('a1');
    const host = mount(<HearingWindow store={store} skills={{ db: 50 }} />);
    act(() => (host.querySelector('[data-explanation="dc-jobs-number"]') as HTMLButtonElement).click());
    expect(host.querySelector('[data-testid="hearing-reaction"]')?.textContent).toBe('人数の約束と知らせ方が示され、雇用を重く見る議員が評価した。');
    expect(host.querySelector('.hearing-issue[data-reason="dc-jobs"] .hearing-issue-done')?.textContent).toBe('説明した');
    expect((host.querySelector('[data-testid="hearing-push"]') as HTMLButtonElement).disabled).toBe(true);
    // 押し切ると政治資本が減る
    act(() => (host.querySelector('.hearing-issue[data-reason="dc-power"]') as HTMLButtonElement).click());
    const capital = store.getState().world.politics.capital;
    const cost = Number(host.querySelector('[data-testid="hearing-push"] .num')?.textContent);
    expect(cost).toBeGreaterThanOrEqual(2);
    act(() => (host.querySelector('[data-testid="hearing-push"]') as HTMLButtonElement).click());
    expect(store.getState().world.politics.capital).toBe(capital - cost);
    expect(host.querySelector('[data-testid="hearing-capital"]')?.textContent).toBe(String(capital - cost));
  });

  it('「公聴会を終える」で議会の採決の段へ進み、窓が閉じ、時間が動く', () => {
    const store = storeWith(dc());
    store.getState().openHearing('a1');
    const host = mount(<HearingWindow store={store} skills={{}} />);
    act(() => (host.querySelector('[data-testid="hearing-end"]') as HTMLButtonElement).click());
    const s = store.getState();
    expect(s.world.applications[0]).toMatchObject({ stage: 'council', hearing: { attended: true } });
    expect(s.hearingId).toBeNull();
    expect(s.holds).not.toContain('window');
    expect(host.querySelector('[data-testid="hearing-window"]')).toBeNull();
  });

  it('中身: 題・反対率・政治資本。譲歩の効きを平易に言う', () => {
    const world = storeWith(dc()).getState().world;
    expect(hearingModel(world, 'a1')).toMatchObject({ name: 'データセンター', opposition: 62, capital: 10, left: 2 });
    expect(modsText({ nightNoise: 0, tech: 0.8, height: -1, jobs: 1.6 })).toEqual(['夜の騒音 なくす', '技術力への効き 2 割減', '高さ 1 段低く', '雇う人数 6 割増']);
  });
});

describe('申請の詳細から公聴会へ・先回りの譲歩（10.2）', () => {
  it('公聴会の段では「公聴会を開く」の金のボタン。押すと公聴会の窓が開く', () => {
    const store = storeWith(dc());
    store.getState().openPermit('a1');
    const host = mount(<PermitDetailWindow store={store} stack={0} shifted={false} />);
    act(() => (host.querySelector('[data-testid="permit-open-hearing"]') as HTMLButtonElement).click());
    expect(store.getState().hearingId).toBe('a1');
  });

  it('反対の受付の間は、先回りの譲歩を出せる。出した論点は「譲歩した」になる', () => {
    const store = storeWith(dc({ stage: 'objection', stageDay: 15, objections: objections.map((o) => ({ ...o, share: o.full / 2 })), opposition: 31 }));
    store.getState().openPermit('a1');
    const host = mount(<PermitDetailWindow store={store} stack={0} shifted={false} />);
    const pre = host.querySelector('[data-testid="permit-preempt"]');
    expect(pre?.querySelectorAll('.permit-preempt-row')).toHaveLength(2);
    expect(host.querySelector('[data-testid="permit-open-hearing"]')).toBeNull();
    act(() => (pre?.querySelector('[data-concession="dc-power-trim"]') as HTMLButtonElement).click());
    const app = store.getState().world.applications[0];
    expect(app?.objections.find((o) => o.reasonId === 'dc-power')?.hand).toMatchObject({ kind: 'concede', concessionId: 'dc-power-trim' });
    expect(app?.mods).toEqual({ power: 0.6, tech: 0.85 });
    expect(host.querySelector('[data-testid="permit-preempt"]')?.textContent).toContain('譲歩した');
  });
});
