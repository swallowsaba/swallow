import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { POLITICS_RULES } from '@/content/politics';
import type { Article, World } from '@/sim/types';
import { grownVillage } from '@/sim/__fixtures__/cities';
import { TopBar } from '@/ui/TopBar';
import { civicNotices, createCityStore } from './cityStore';
import { budgetModel, capitalModel, inboxRows, newsIssues, openRewards, powerLine, rewardRows, taxPreview } from './civicView';
import { powerUse } from '@/sim/power';
import { BudgetWindow, InboxWindow, NewsWindow, RewardsWindow } from './CivicWindows';

/**
 * 受信箱（docs/ui-design.md 10.8）・予算（10.9）・市内新聞（10.10）と、上の帯の財政（3.1）
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

const GROWN = grownVillage(120).world;
const ENTRY = { id: 'rent-low@18', petitionId: 'rent-low', arrivedWeek: GROWN.sim.week - 3, district: 66, layer: 3, value: 37.4 };
const withInbox: World = { ...GROWN, petitions: { inbox: [ENTRY], handled: {}, effects: [] } };

function storeOf(world: World) {
  const store = createCityStore(undefined, undefined, { world });
  store.getState().load(world);
  return store;
}

describe('受信箱（10.8）', () => {
  it('送った集団（層と地区）・要望の文・届いた理由の模擬の値・期限・受理の効きと拒否で下がる信頼を、押す前に示す', () => {
    const store = storeOf(withInbox);
    const [row] = inboxRows(store.getState().world, store.getState().terrain, POLITICS_RULES);
    const place = GROWN.sim.districtNames[66] ?? '';
    expect(row).toMatchObject({
      title: '家賃が上がって、もう住み続けられない',
      from: `働く人の会（低い収入の世帯）`,
      basis: `${place}の低い収入の世帯の家賃の負担が 37.4%（30% を超えると暮らしが苦しくなる）`,
      weeksLeft: 5,
      reject: '低い収入の世帯の信頼 -2',
    });
    expect(row?.accept.effect).toBe(`${place}の低い収入の世帯の家賃を 10% 下げる（12 週）`);
    expect(row?.accept.cost).toBe('毎週 6 × 12 週（計 72）');
    expect(row?.accept.trust).toBe('低い収入の世帯の信頼 +2');
    expect(row?.at).toBeDefined();
  });

  it('受理を押すと請願が受信箱から消え、受け取られ方を知らせる', () => {
    const store = storeOf(withInbox);
    const host = mount(<InboxWindow store={store} stack={0} shifted={false} />);
    expect(host.querySelector('[data-testid="petition-basis"]')?.textContent).toContain('37.4%');
    act(() => (host.querySelector('[data-testid="petition-accept"]') as HTMLButtonElement).click());
    expect(store.getState().world.petitions.inbox).toEqual([]);
    expect(store.getState().world.petitions.handled['rent-low']?.choice).toBe('accept');
    expect(store.getState().notice?.text).toContain('受理した: 差額の 1 割を市が持つ');
  });

  it('保留は模擬に何も送らず、その請願を畳む', () => {
    const store = storeOf(withInbox);
    const host = mount(<InboxWindow store={store} stack={0} shifted={false} />);
    act(() => (host.querySelector('[data-testid="petition-hold"]') as HTMLButtonElement).click());
    expect(store.getState().world.petitions.inbox).toHaveLength(1);
    expect(host.querySelector('[data-testid="petition-accept"]')).toBeNull();
    expect(host.textContent).toContain('保留中・広げる');
  });

  it('届いた請願を知らせる（押すと受信箱）。不祥事の記事も知らせる', () => {
    const scandal: Article = { id: 'n999', week: 1, day: 7, kind: 'scandal', headline: '反対の押し切り、この任期で 3 回目', body: 'x。y。' };
    const after: World = { ...withInbox, history: { ...withInbox.history, news: [...GROWN.history.news, scandal] } };
    const n = civicNotices(GROWN.petitions, GROWN.history.news, after);
    expect(n).toEqual([
      { text: `請願が届いた: 「家賃が上がって、もう住み続けられない」（${GROWN.sim.districtNames[66] ?? ''}）。押すと受信箱`, window: 'inbox' },
      { text: '市民新報: 反対の押し切り、この任期で 3 回目。押すと記事', window: 'news' },
    ]);
  });
});

describe('予算（10.9）', () => {
  it('今週の収支を項ごとの数と棒で。財政の残り。開発資金は別の財布', () => {
    const store = storeOf(GROWN);
    const m = budgetModel(GROWN);
    const row = GROWN.budget.ledger.at(-1);
    expect(m.incomeTotal).toBeCloseTo((row?.income.residents ?? 0) + (row?.income.businesses ?? 0), 6);
    expect(Math.max(...[...m.income, ...m.spend].map((l) => l.ratio))).toBeCloseTo(1, 6);
    const host = mount(<BudgetWindow store={store} stack={0} shifted={false} />);
    expect(host.querySelector('[data-testid="budget-treasury"]')?.textContent).toContain(Math.round(GROWN.budget.treasury).toLocaleString('ja-JP'));
    expect(host.querySelector('[data-testid="budget-funds-note"]')?.textContent).toBe('開発資金は学習で増える。ここでは使わない（財政とは別の財布）');
  });

  it('税率のつまみ: 動かすと、見込みの税収の増減と、層ごとの「税」の点の増減。決めると次の週から', () => {
    const p = taxPreview(GROWN, 15);
    const row = GROWN.budget.ledger.at(-1);
    const income = (row?.income.residents ?? 0) + (row?.income.businesses ?? 0);
    expect(p.incomeDelta).toBeCloseTo(income * 0.5, 6);
    // 税の点は (10 − 税率) × 重み。上げると全ての層で下がる
    expect(p.points.every((v) => v < 0)).toBe(true);
    const store = storeOf(GROWN);
    const host = mount(<BudgetWindow store={store} stack={0} shifted={false} />);
    const slider = host.querySelector('[data-testid="tax-slider"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(slider, '15');
      slider.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(host.querySelector('[data-testid="tax-layers"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="tax-income"]')?.textContent).toMatch(/^\+/);
    act(() => (host.querySelector('[data-testid="tax-apply"]') as HTMLButtonElement).click());
    expect(store.getState().world.budget.pendingTaxRate).toBe(15);
    expect(store.getState().world.budget.taxRate).toBe(10);
    expect(store.getState().notice?.text).toBe('税率を 15% に決めた。次の週から効く（今週は 10% のまま）');
  });

  it('政治資本: 今の値・上限・この任期の得と使いを理由ごとにまとめる', () => {
    const w: World = { ...GROWN, politics: { ...GROWN.politics, capital: 12, capitalLog: [
      { day: 1, amount: 5, why: '公約を果たした（人口を増やす）' },
      { day: 2, amount: -4, why: '押し切った（騒音）' },
      { day: 3, amount: -2, why: '押し切った（電力）' },
      { day: 4, amount: 1, why: '支持率の上昇' },
    ] } };
    const m = capitalModel(w);
    expect(m).toMatchObject({ value: 12, cap: 30 });
    expect(m.gains).toEqual([{ why: '公約を果たした', amount: 5, count: 1 }, { why: '支持率の上昇', amount: 1, count: 1 }]);
    expect(m.uses).toEqual([{ why: '押し切った', amount: -6, count: 2 }]);
  });
});

describe('市内新聞（10.10）', () => {
  const art = (id: string, week: number, headline: string, at?: { x: number; y: number }): Article => ({ id, week, day: week * 7, kind: 'completed', headline, body: '本文。本文。', ...(at ? { at } : {}) });
  const news = [art('n1', 3, 'Web 開発会社が完成'), art('n2', 5, 'サーバ施設の申請'), art('n3', 5, 'サーバ施設が完成', { x: 40, y: 41 })];

  it('最新の号を上に、週ごとにまとめる。見出しで探せる', () => {
    expect(newsIssues(news).map((i) => [i.date, i.articles.map((a) => a.id)])).toEqual([['1 年目 6 週', ['n3', 'n2']], ['1 年目 4 週', ['n1']]]);
    expect(newsIssues(news, '完成').flatMap((i) => i.articles.map((a) => a.id))).toEqual(['n3', 'n1']);
    expect(newsIssues(news, 'サーバ 完成').flatMap((i) => i.articles.map((a) => a.id))).toEqual(['n3']);
  });

  it('記事を押すと、その場所へカメラが寄る', () => {
    const store = storeOf({ ...GROWN, history: { ...GROWN.history, news } });
    const host = mount(<NewsWindow store={store} stack={0} shifted={false} />);
    expect(host.querySelector('#news-window-title')?.textContent).toBe('市民新報');
    act(() => (host.querySelector('[data-testid="news-n3"] button') as HTMLButtonElement).click());
    expect(store.getState().focus?.at).toEqual({ x: 40, y: 41 });
  });
});

describe('上の帯の財政（3.1）', () => {
  const props = { cityName: '灯町', funds: 1200, xp: 0, rankName: '見習い', population: 0, stageName: '村' };

  it('財政の数字。赤字の間は赤い色と「赤字」。押すと予算の窓', () => {
    let opened = 0;
    const host = mount(<TopBar {...props} treasury={{ value: -340, onOpen: () => (opened += 1) }} />);
    const t = host.querySelector('[data-testid="topbar-treasury"]') as HTMLButtonElement;
    expect(t.className).toContain('is-deficit');
    expect(t.textContent).toContain('-340');
    expect(t.textContent).toContain('赤字');
    act(() => t.click());
    expect(opened).toBe(1);
  });

  it('黒字なら赤くしない', () => {
    const host = mount(<TopBar {...props} treasury={{ value: 980, onOpen: () => undefined }} />);
    expect(host.querySelector('[data-testid="topbar-treasury"]')?.className).not.toContain('is-deficit');
  });
});

describe('発電所を選んでいる間の電力の 1 行（docs/ui-design.md 11.5）', () => {
  it('使う量と来る量（発電所と外の電気）を MW で出し、止まった地区があれば数を添える。道具を離すと消える', () => {
    const plant = { id: 'pt', type: 'power-thermal' as const, origin: { x: 53, y: 48 }, rotation: 0 as const, level: 1 as const, state: 'active' as const, builtDay: 0 };
    const w: World = { ...GROWN, city: { ...GROWN.city, facilities: [...GROWN.city.facilities, plant] } };
    const line = powerLine(w, POLITICS_RULES);
    const use = powerUse(w.city, POLITICS_RULES);
    expect(line).toBe(`電力 使う ${use.toFixed(1)} MW ／ 来る ${(40 + w.sim.power.externalCapMW).toFixed(1)} MW（発電所 40.0・外の電気 ${w.sim.power.externalCapMW.toFixed(1)} まで）`);
    const off: World = { ...w, sim: { ...w.sim, power: { ...w.sim.power, recent: [[3, 4]] } } };
    expect(powerLine(off, POLITICS_RULES)).toMatch(/・止まっている地区 2$/);
    const red: World = { ...w, budget: { ...w.budget, treasury: -5 } };
    expect(powerLine(red, POLITICS_RULES)).toContain('発電所 28.0（赤字の間は 7 割）');

    const store = createCityStore(undefined, undefined, { world: w });
    expect(store.getState().tool.kind).toBe('none');
    store.getState().setTool({ kind: 'facility', type: 'power-solar' });
    expect(store.getState().overlay).toBe('power');
    store.getState().setTool({ kind: 'facility', type: 'school' });
    expect(store.getState().overlay).toBe('school');
    store.getState().setTool({ kind: 'none' });
    expect(store.getState().overlay).toBeNull();
    store.getState().setOverlay('rent');
    store.getState().setTool({ kind: 'facility', type: 'police' });
    expect(store.getState().overlay).toBe('police');
    store.getState().openMenu(null);
    expect(store.getState().overlay).toBe('rent');
  });
});

describe('褒賞の一覧（10.11）', () => {
  const unlocked: World = { ...GROWN, city: { ...GROWN.city, population: 3420 }, sim: { ...GROWN.sim, lastWeek: { ...GROWN.sim.lastWeek, approval: 58 } }, rewards: { unlocked: { 'city-hall': 140 }, built: {}, highApprovalWeeks: 3 } };

  it('5 つの名前・節目の条件と今の値・効き・建てたかを示す。届いた物は届いた日', () => {
    const rows = rewardRows(unlocked);
    expect(rows.map((r) => [r.name, r.status])).toEqual([
      ['新しい市庁舎', 'open'], ['市民記念館', 'locked'], ['競技場', 'locked'], ['市民ホール', 'locked'], ['中央公園', 'locked'],
    ]);
    expect(rows[0]?.parts.map((p) => p.label)).toEqual(['1 年目 21 週に節目に届いた']);
    expect(rows[1]?.parts).toEqual([{ label: '人口 3,420 / 5,000', met: false }, { label: '支持率 58% / 55%', met: true }]);
    expect(rows[3]?.parts).toEqual([{ label: '支持率 65% 以上の週 3 / 8', met: false }]);
    expect(rows[0]?.effect).toBe('政治資本の上限 +5（30 → 35）。議員の説得が政治資本 2 で済む');
    expect(rows[0]?.note).toBe('建てられる（財政 1,000。申請が要る）');
    expect(openRewards(unlocked)).toBe(1);
  });

  it('届いた物の「建てる」を押すと、建設メニューの公共の引き出しで、その建物を選んだ状態になる', () => {
    const store = storeOf(unlocked);
    store.getState().openWindow('rewards');
    const host = mount(<RewardsWindow store={store} stack={0} shifted={false} />);
    const buttons = host.querySelectorAll('[data-testid="reward-build"]');
    expect(buttons).toHaveLength(1);
    act(() => (buttons[0] as HTMLButtonElement).click());
    expect(store.getState().menu).toBe('civic');
    expect(store.getState().tool).toEqual({ kind: 'facility', type: 'city-hall' });
    expect(host.querySelector('[data-testid="reward-memorial"] [data-testid="reward-status"]')?.textContent).toBe('まだ');
  });

  it('節目に届いた週に「建てられるようになった」の知らせ（押すと褒賞の一覧）', () => {
    const notes = civicNotices(GROWN.petitions, GROWN.history.news, unlocked, GROWN.rewards);
    expect(notes).toContainEqual({ text: '節目に届いた: 新しい市庁舎を建てられるようになった（建設メニューの「公共」）。押すと褒賞の一覧', window: 'rewards' });
    expect(civicNotices(GROWN.petitions, GROWN.history.news, unlocked, unlocked.rewards).filter((n) => n.window === 'rewards')).toEqual([]);
  });
});
