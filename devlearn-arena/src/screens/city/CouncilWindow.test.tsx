import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COUNCIL, EXPLAIN } from '@/content/politics';
import type { Application, ObjectionState } from '@/sim/types';
import { createSettingsStore } from '../settingsStore';
import { SettingsContext } from '../settingsContext';
import { AppealWindow } from './AppealWindow';
import { createCityStore, stageNotices } from './cityStore';
import { CouncilWindow, REVEAL_MS } from './CouncilWindow';
import { appealModel, councilModel, memberLine } from './councilView';
import { PermitDetailWindow } from './PermitWindows';
import { permitDetail } from './permitView';

/**
 * 議会の採決の画面（docs/ui-design.md 10.4）と、異議申し立ての知らせと小さな窓（10.5）。
 * 7 人の並び・1 人ずつ 0.4 秒ごとに賛否（動きを減らす設定では一度に）・各人の 1 行・説得・申し立ての 2 つの方法
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function mount(node: React.ReactNode, reduceMotion = false): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  const settings = createSettingsStore();
  settings.getState().set({ reduceMotion });
  act(() => root.render(<SettingsContext.Provider value={settings}>{node}</SettingsContext.Provider>));
  return host;
}

const o = (reasonId: string, share: number, patch: Partial<ObjectionState> = {}): ObjectionState => ({
  reasonId, group: 'neighbors', district: 0, strength: 0.5, share, full: share, basis: { value: 0 }, issue: true, layers: [0, 4], ...patch,
});
const dc = (patch: Partial<Application> = {}): Application => ({
  id: 'a1', kind: 'facility', target: { type: 'datacenter', origin: { x: 46, y: 45 }, rotation: 0 }, stage: 'council', stageDay: 20, filedDay: 0,
  wallet: 'funds', reserved: 650, exception: true, objections: [o('dc-jobs', 20), o('dc-power', 10, { hand: { kind: 'concede', concessionId: 'dc-power-trim', day: 18 } })],
  opposition: 30, mods: { power: 0.6, tech: 0.85 }, hearing: { heldDay: 18, attended: true }, ...patch,
});
const VOTE: Application['vote'] = {
  day: 28, consent: false, passed: true,
  members: COUNCIL.map((m, i) => ({ memberId: m.id, score: i - 2, yes: i >= 2, reasonKey: i >= 2 ? 'gain:tech:1' : 'unanswered:dc-jobs', persuaded: false })),
};

function storeWith(app: Application, capital = 10) {
  const store = createCityStore(1);
  const s = store.getState();
  store.getState().load({ ...s.world, city: { ...s.world.city, day: 22, funds: 5000 }, applications: [app], politics: { ...s.world.politics, capital } });
  return store;
}

describe('議員の 1 行（18.2・docs/decisions.md C-10）', () => {
  it('点に最も効いた項を、その議員の口ぶりで言う。差し込み名に、理由の題・得の値・支持率・立場が入る', () => {
    const kajiya = COUNCIL.find((m) => m.id === 'kajiya');
    if (!kajiya) throw new Error('鍛冶谷がいない');
    expect(memberLine(kajiya, 'gain:jobs:60')).toBe('雇用が 60 人分増える。働き口が増えるなら、文句はねえ。賛成だ');
    expect(memberLine(kajiya, 'unanswered:dc-jobs')).toBe('「雇用が少ない」を聞かれて、市長は黙ってた。それじゃ通せねえよ');
    expect(memberLine(kajiya, 'approval:35')).toBe('支持が 35% か。町の空気には逆らえねえな');
    expect(memberLine(kajiya, 'stance')).toBe('こういう話には、昔から賛成だ');
    // 口ぶりが無い鍵は共通の型の文
    const plain = { ...kajiya, lines: {} };
    expect(memberLine(plain, 'concern:dc-power')).toBe(EXPLAIN.member.concern.replace('{reason}', '「電力の逼迫」'));
  });
});

describe('議会の採決の画面（10.4）', () => {
  it('採決の前に開くと見込み: 時間が止まり、7 人の名前と主な論点と向きと 1 行。議員を選んで説得すると政治資本が 3 減り、2 人目は説得できない', () => {
    const store = storeWith(dc());
    store.getState().openCouncil('a1');
    expect(store.getState().holds).toContain('window');
    const host = mount(<CouncilWindow store={store} />);
    const seats = [...host.querySelectorAll('[data-testid="council-seats"] > li')];
    expect(seats.map((s) => s.getAttribute('data-member'))).toEqual(COUNCIL.map((m) => m.id));
    expect(host.textContent).toContain('鍛冶谷 剛');
    expect(host.querySelector('[data-member="kajiya"] .council-issue')?.textContent).toBe('雇用');
    for (const s of seats) expect(s.querySelector('.council-vote')?.textContent).toMatch(/^(賛成|反対)の見込み$/);
    for (const s of seats) expect((s.querySelector('.council-line')?.textContent ?? '').length).toBeGreaterThan(5);
    expect(host.querySelector('[data-testid="council-verdict"]')?.textContent).toMatch(/^このままなら(可決|否決)$/);
    // 説得: 選ぶまで押せない
    const button = (): HTMLButtonElement => host.querySelector('[data-testid="council-persuade"]') as HTMLButtonElement;
    expect(button().disabled).toBe(true);
    act(() => (host.querySelector('[data-member="michishita"] .council-seat-button') as HTMLButtonElement).click());
    expect(host.querySelector('[data-testid="council-profile"]')?.textContent).toContain('路線バスの運転士');
    expect(button().textContent).toContain('道下 健吾を説得する');
    act(() => button().click());
    expect(store.getState().world.politics.capital).toBe(7);
    expect(store.getState().world.applications[0]?.persuaded).toBe('michishita');
    expect(host.querySelector('[data-testid="council-persuaded"]')).not.toBeNull();
    expect(host.querySelector('[data-member="michishita"] .council-persuaded')?.textContent).toBe('説得した');
  });

  it('採決の後は結果: 1 人ずつ 0.4 秒ごとに賛否が出て、最後に「可決（賛成 4 以上）」', () => {
    const store = storeWith(dc({ stage: 'construction', vote: VOTE }));
    store.getState().openCouncil('a1');
    const host = mount(<CouncilWindow store={store} />);
    const shown = (): number => host.querySelectorAll('.council-seat:not(.is-wait)').length;
    expect(shown()).toBe(0);
    expect(host.querySelector('[data-testid="council-verdict"]')?.textContent).toBe('採決中');
    act(() => {
      vi.advanceTimersByTime(REVEAL_MS);
    });
    expect(shown()).toBe(1);
    act(() => {
      vi.advanceTimersByTime(REVEAL_MS * 3);
    });
    expect(shown()).toBe(4);
    act(() => {
      vi.advanceTimersByTime(REVEAL_MS * 3);
    });
    expect(shown()).toBe(7);
    expect(host.querySelector('[data-testid="council-yes"]')?.textContent).toBe('5');
    expect(host.querySelector('[data-testid="council-verdict"]')?.textContent).toBe('可決（賛成 4 以上）');
    expect(host.querySelector('[data-testid="council-vote-nadamoto"]')?.textContent).toBe('反対');
    expect(host.querySelector('[data-testid="council-line-nadamoto"]')?.textContent).toBe('「雇用が少ない」について、公聴会で一言もありませんでした。住む人を置き去りにはできません');
    expect(host.querySelector('[data-testid="council-persuade"]')).toBeNull();
  });

  it('動きを減らす設定では、賛否が一度に出る', () => {
    const store = storeWith(dc({ stage: 'rejected', vote: { ...VOTE, passed: false, members: VOTE.members.map((m) => ({ ...m, yes: false })) } }));
    store.getState().openCouncil('a1');
    const host = mount(<CouncilWindow store={store} />, true);
    expect(host.querySelectorAll('.council-seat.is-no')).toHaveLength(7);
    expect(host.querySelector('[data-testid="council-verdict"]')?.textContent).toBe('否決');
  });

  it('同意の案件は採決の画面を出さない。大きな窓は 1 つまで（採決の画面を開くと公聴会の窓は閉じる）', () => {
    const consent = storeWith(dc({ stage: 'construction', vote: { day: 28, consent: true, members: [], passed: true }, hearing: undefined }));
    consent.getState().openCouncil('a1');
    expect(consent.getState().councilId).toBeNull();
    expect(councilModel(consent.getState().world, 'a1')).toBeNull();
    // 議会の日を待っている同意の案件も、見込みの画面と説得を出さない
    const waiting = storeWith(dc({ stage: 'council', hearing: undefined, exception: false, objections: [o('dc-cooling-water', 16, { issue: undefined })], opposition: 16 }));
    waiting.getState().openCouncil('a1');
    expect(waiting.getState().councilId).toBeNull();
    expect(councilModel(waiting.getState().world, 'a1')).toBeNull();
    expect(permitDetail(waiting.getState().world, 'a1')?.council).toBeNull();
    const store = storeWith(dc({ stage: 'hearing' }));
    store.getState().openHearing('a1');
    const s = store.getState();
    store.getState().load({ ...s.world, applications: [dc()] });
    store.getState().openCouncil('a1');
    expect(store.getState().hearingId).toBeNull();
    expect(store.getState().councilId).toBe('a1');
    store.getState().leaveCouncil();
    expect(store.getState().holds).not.toContain('window');
  });

  it('申請の詳細から: 議会の段は「議会の見込みを見る」、採決の後は「採決の結果を見る」', () => {
    const store = storeWith(dc());
    store.getState().openPermit('a1');
    const host = mount(<PermitDetailWindow store={store} stack={0} shifted={false} />);
    const b = host.querySelector('[data-testid="permit-open-council"]') as HTMLButtonElement;
    expect(b.textContent).toContain('議会の見込みを見る');
    act(() => b.click());
    expect(store.getState().councilId).toBe('a1');
    const done = storeWith(dc({ stage: 'construction', vote: VOTE }));
    done.getState().openPermit('a1');
    const host2 = mount(<PermitDetailWindow store={done} stack={0} shifted={false} />);
    expect(host2.querySelector('[data-testid="permit-open-council"]')?.textContent).toContain('採決の結果を見る');
  });
});

describe('知らせ（docs/ui-design.md 3 章・10.5）', () => {
  it('採決の後は賛否の数を添え、押すと採決の画面。申し立ては押すと申し立ての窓', () => {
    const store = storeWith(dc());
    const w = store.getState().world;
    const voted = { ...w, applications: [dc({ stage: 'construction', stageDay: 28, vote: VOTE })] };
    expect(stageNotices([dc()], voted)[0]).toMatchObject({ text: expect.stringContaining('議会が可決した（賛成 5・反対 2）') as string, window: 'council' });
    const rejected = { ...w, applications: [dc({ stage: 'rejected', stageDay: 28, vote: { ...VOTE, passed: false } })] };
    expect(stageNotices([dc()], rejected)[0]?.text).toContain('議会が否決した');
    const appealed = { ...w, applications: [dc({ stage: 'appeal', stageDay: 28, vote: VOTE, appeal: { day: 28, group: 'neighbors' } })] };
    const n = stageNotices([dc()], appealed)[0];
    expect(n?.window).toBe('appeal');
    expect(n?.text).toMatch(/の住民が異議を申し立てた。28 日、着工が止まる$/);
    const expired = { ...w, applications: [dc({ stage: 'construction', stageDay: 56, vote: VOTE, appeal: { day: 28, group: 'neighbors', resolved: 'expired' } })] };
    expect(stageNotices([dc({ stage: 'appeal', vote: VOTE, appeal: { day: 28, group: 'neighbors' } })], expired)[0]?.text).toMatch(/^28 日が過ぎ、申し立ては退けられた。データセンターを着工した/);
  });
});

describe('異議申し立ての小さな窓（10.5）', () => {
  const appealed = (): Application => dc({
    stage: 'appeal', stageDay: 20, vote: VOTE, appeal: { day: 20, group: 'neighbors' },
    objections: [o('dc-jobs', 25, { hand: { kind: 'push', capital: 6, day: 18 } }), o('dc-power', 12, { hand: { kind: 'concede', concessionId: 'dc-power-trim', day: 18 } }), o('dc-cooling-water', 6, { group: 'environment' })],
    opposition: 43,
  });

  it('申し立てた集団・理由・止まる日数・2 つの方法とそれぞれの損を出す', () => {
    const store = storeWith(appealed());
    store.getState().openAppeal('a1');
    const m = appealModel(store.getState().world, 'a1', {});
    expect(m?.reasons.map((r) => `${r.title}:${r.how}`)).toEqual(['雇用が少ない:押し切った', '冷却水の使用:答えなかった']);
    // 公聴会で譲歩した電力には出せない
    expect(m?.concessions.map((c) => c.reasonId)).toEqual(['dc-jobs', 'dc-cooling-water']);
    const host = mount(<AppealWindow store={store} stack={0} shifted={false} skills={{}} />);
    expect(host.querySelector('[data-testid="appeal-now"]')?.textContent).toContain('あと 26 日、着工が止まる');
    expect(host.textContent).toContain('申し立ての境 35%');
    expect(host.querySelector('[data-testid="appeal-suppress"]')?.textContent).toContain('市政への信頼が 2 下がる');
    expect(host.textContent).toContain('何もしなければ、28 日で退けられて着工する');
  });

  it('政治資本 4 で抑えると、信頼が下がり、窓は「抑えた」になる', () => {
    const store = storeWith(appealed());
    store.getState().openAppeal('a1');
    const host = mount(<AppealWindow store={store} stack={0} shifted={false} skills={{}} />);
    act(() => (host.querySelector('[data-testid="appeal-suppress"]') as HTMLButtonElement).click());
    expect(store.getState().world.politics.capital).toBe(6);
    expect(store.getState().world.applications[0]?.appeal?.resolved).toBe('capital');
    expect(host.querySelector('[data-testid="appeal-now"]')?.textContent).toContain('政治資本で抑えた');
  });

  it('許認可の一覧の行に、申し立ての赤い印', async () => {
    const { PermitListWindow } = await import('./PermitWindows');
    const store = storeWith(appealed());
    const host = mount(<PermitListWindow store={store} stack={0} shifted={false} />);
    expect(host.querySelector('[data-testid="permit-row-appeal-a1"]')?.textContent).toBe('申し立て');
  });
});
