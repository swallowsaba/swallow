import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { Application } from '@/sim/types';
import { createCityStore } from './cityStore';
import { HearingWindow } from './HearingWindow';
import { hearingModel, modsText, newAnswerNotes } from './hearingView';
import { placeOf } from './permitView';
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
    // 出した手が分かる（ほかの候補は押せなくなる）
    expect(host.querySelector('[data-explanation="dc-jobs-number"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-explanation="dc-jobs-around"]')?.getAttribute('aria-pressed')).toBe('false');
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

  it('誤った説明の後は、なぜ誤りかと、学べるレッスンを示す（17.2）。確かな説明にはレッスンを添えない', () => {
    const store = storeWith(dc());
    store.getState().openHearing('a1');
    const host = mount(<HearingWindow store={store} skills={{ cloud: 10 }} />);
    act(() => (host.querySelector('.hearing-issue[data-reason="dc-power"]') as HTMLButtonElement).click());
    act(() => (host.querySelector('[data-explanation="dc-power-cloud"]') as HTMLButtonElement).click());
    expect(host.querySelector('[data-testid="hearing-reaction"]')?.textContent).toContain('電気を使うのはここだと指摘され');
    expect(host.querySelector('[data-testid="hearing-reaction-lesson"]')?.textContent).toBe('学べるレッスン: 仮想化とクラウド（初級）');
    const other = storeWith(dc());
    other.getState().openHearing('a1');
    const ok = mount(<HearingWindow store={other} skills={{ db: 50 }} />);
    act(() => (ok.querySelector('[data-explanation="dc-jobs-number"]') as HTMLButtonElement).click());
    expect(ok.querySelector('[data-testid="hearing-reaction-lesson"]')).toBeNull();
  });

  it('G7: 論点ごとに「この論点を学ぶ」。押すとそのレッスンの入口の札へ行き、公聴会の窓は開いたまま待つ', () => {
    const store = storeWith(dc());
    store.getState().openHearing('a1');
    const learned: string[] = [];
    const host = mount(<HearingWindow store={store} skills={{}} onLearn={(id) => learned.push(id)} />);
    // 雇用が少ない（dc-jobs）の学べるレッスンは、データの lessons の順
    const rows = [...host.querySelectorAll('[data-testid="hearing-learn"] [data-lesson]')];
    expect(rows.map((b) => b.getAttribute('data-lesson'))).toEqual(['db.b.01', 'db.a.02']);
    expect(rows[0]?.textContent).toContain('データベースとは');
    expect(rows[0]?.textContent).toContain('初級');
    act(() => (rows[0] as HTMLButtonElement).click());
    expect(learned).toEqual(['db.b.01']);
    // 学びに行っても公聴会は終わらず、時間は止まったまま
    expect(store.getState().hearingId).toBe('a1');
    expect(store.getState().holds).toContain('window');
    // 論点を変えると、その論点のレッスン
    act(() => (host.querySelector('.hearing-issue[data-reason="dc-power"]') as HTMLButtonElement).click());
    expect([...host.querySelectorAll('[data-testid="hearing-learn"] [data-lesson]')].map((b) => b.getAttribute('data-lesson'))).toEqual(['db.b.01', 'cloud.b.03']);
  });

  it('G7: 誤った説明の後の「学べるレッスン」も、押すと入口の札へ行ける', () => {
    const store = storeWith(dc());
    store.getState().openHearing('a1');
    const learned: string[] = [];
    const host = mount(<HearingWindow store={store} skills={{ cloud: 10 }} onLearn={(id) => learned.push(id)} />);
    act(() => (host.querySelector('.hearing-issue[data-reason="dc-power"]') as HTMLButtonElement).click());
    act(() => (host.querySelector('[data-explanation="dc-power-cloud"]') as HTMLButtonElement).click());
    act(() => (host.querySelector('[data-testid="hearing-reaction-lesson"]') as HTMLButtonElement).click());
    expect(learned).toEqual(['cloud.b.01']);
  });

  it('G7: スキル段階が上がって戻ると、公聴会を待つ論点に新しく出せる説明を知らせに添える（docs/learning-design.md 12.3）', () => {
    const store = storeWith(dc());
    const world = store.getState().world;
    // データベース 0 → 初級（30）: 雇用が少ない（db 段階 1・2）に新しい説明。電力の逼迫にも db 1 の説明がある
    expect(newAnswerNotes(world, {}, { db: 30 })).toEqual(['データベースの段階が上がり、データセンター（' + placeOf(dc(), world) + '）の公聴会で「雇用が少ない」「電力の逼迫」に新しい説明を出せる']);
    // 段階が変わらなければ何も添えない。論点に入らない理由（夜間の騒音 2%）は数えない
    expect(newAnswerNotes(world, { db: 12 }, { db: 18 })).toEqual([]);
    // 上級に届くと、技術の代案も
    expect(newAnswerNotes(world, { db: 50 }, { db: 70 })).toEqual(['データベースの段階が上がり、データセンター（' + placeOf(dc(), world) + '）の公聴会で「雇用が少ない」に技術の代案を出せる']);
    // 手を出した論点と、公聴会を終えた申請は数えない
    const answered = storeWith(dc({ objections: objections.map((o) => (o.reasonId === 'dc-jobs' ? { ...o, hand: { kind: 'push' as const, capital: 8, day: 21 } } : o)) })).getState().world;
    expect(newAnswerNotes(answered, {}, { db: 30 })[0]).toContain('「電力の逼迫」に新しい説明');
    expect(newAnswerNotes(answered, {}, { db: 30 })[0]).not.toContain('雇用');
    expect(newAnswerNotes(storeWith(dc({ stage: 'council' })).getState().world, {}, { db: 30 })).toEqual([]);
    // 都市へ戻った時の知らせに出る
    store.getState().leave({});
    store.getState().welcomeBack({ db: 30 }, [], 0);
    const shown = [store.getState().notice?.text, ...store.getState().queue.map((q) => (typeof q === 'string' ? q : q.text))];
    expect(shown.some((t) => t?.includes('「雇用が少ない」「電力の逼迫」に新しい説明を出せる'))).toBe(true);
  });

  it('G7: まだ出せない技術の代案は、分野と段階だけを伏せて示す。段階 4 で譲歩の列に印付きで並ぶ', () => {
    const store = storeWith(dc());
    store.getState().openHearing('a1');
    const host = mount(<HearingWindow store={store} skills={{}} />);
    expect(host.querySelector('[data-testid="hearing-hidden"]')?.textContent).toContain('データベース 上級で出せる技術の代案が 1 つある');
    expect(host.querySelector('[data-concession="dc-jobs-dba"]')).toBeNull();
    const skilled = storeWith(dc());
    skilled.getState().openHearing('a1');
    const later = mount(<HearingWindow store={skilled} skills={{ db: 70 }} />);
    expect(later.querySelector('[data-concession="dc-jobs-dba"] .hearing-tech')?.textContent).toBe('データベース 上級の技術の代案');
    expect(later.querySelector('[data-testid="hearing-hidden"]')?.textContent ?? '').not.toContain('技術の代案');
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
