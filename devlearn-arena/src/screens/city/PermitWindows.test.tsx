import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { Facility } from '@/city/types';
import { emptyProgress } from '@/game/progress';
import type { Application, World } from '@/sim/types';
import { createCityStore, stageNotices } from './cityStore';
import { panelModel } from './infoPanelModel';
import { PermitDetailWindow, PermitListWindow } from './PermitWindows';
import { mayorCount, permitDetail, permitRows, sitesOf, stageMarks } from './permitView';

/**
 * 許認可の一覧・申請の詳細・看板・情報パネル（docs/ui-design.md 5・10.1・10.2 章、docs/city-design.md 9.1）。
 * 申請中の施設からも学習を始められること（docs/game-design.md 20 章）。
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

const app = (patch: Partial<Application> & Pick<Application, 'id' | 'stage'>): Application => ({
  kind: 'facility', target: { type: 'server', origin: { x: 51, y: 48 }, rotation: 180 }, stageDay: 0, filedDay: 0, wallet: 'funds', reserved: 400,
  exception: false, objections: [], opposition: 0, mods: {}, ...patch,
});

function storeWith(apps: Application[], day = 10, facilities: Facility[] = []) {
  const store = createCityStore(1);
  const s = store.getState();
  store.getState().load({ ...s.world, city: { ...s.world.city, day, funds: 5000, facilities }, applications: apps });
  return store;
}

function mount(node: React.ReactNode): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(node));
  return host;
}

describe('許認可の一覧（10.1）', () => {
  it('市長の手が要る申請（公聴会）を先に、次に残りの日数の短い順に並べる。終わった申請は下に分ける', () => {
    const world = storeWith([
      app({ id: 'a1', stage: 'objection', stageDay: 5 }),
      app({ id: 'a2', stage: 'zoning', stageDay: 8, target: { type: 'deploy', origin: { x: 40, y: 44 }, rotation: 0 } }),
      app({ id: 'a3', stage: 'hearing', stageDay: 9, exception: true }),
      app({ id: 'a4', stage: 'withdrawn', stageDay: 9 }),
    ]).getState().world;
    const rows = permitRows(world);
    expect(rows.open.map((r) => r.id)).toEqual(['a3', 'a2', 'a1']);
    expect(rows.open[0]).toMatchObject({ mayor: true, waiting: '開ける。あと 13 日で市長抜きで開かれる' });
    expect(rows.open[1]?.waiting).toBe('あと 5 日');
    expect(rows.finished.map((r) => r.id)).toEqual(['a4']);
    expect(mayorCount(world)).toBe(1);
  });

  it('行を押すと申請の詳細が開き、場所の印を押すと敷地へカメラが寄る', () => {
    const store = storeWith([app({ id: 'a1', stage: 'objection', stageDay: 5 })]);
    store.getState().openWindow('permits');
    const host = mount(<PermitListWindow store={store} stack={0} shifted={false} />);
    const row = host.querySelector('[data-testid="permit-row-a1"]');
    expect(row?.textContent).toContain('サーバ施設');
    expect(row?.textContent).toContain('反対の受付');
    expect(row?.querySelector('.permit-row-wait')?.textContent).toBe('あと 9 日');
    act(() => (row?.querySelector('.permit-row-pin') as HTMLButtonElement).click());
    expect(store.getState().focus).toMatchObject({ at: { x: 52, y: 49 }, size: { x: 2, y: 2 } });
    act(() => (row?.querySelector('.permit-row-main') as HTMLButtonElement).click());
    expect(store.getState().permitId).toBe('a1');
    expect(store.getState().windows).toEqual(['permits', 'permit']);
  });
});

describe('申請 1 件の詳細（10.2）', () => {
  it('8 段の進み: 同意の案件は公聴会を「省いた」、アップグレードは用途地域の審査を「省いた」', () => {
    const consent = app({ id: 'a1', stage: 'construction', stageDay: 28, filedDay: 0, vote: { day: 28, consent: true, members: [], passed: true } });
    expect(stageMarks(consent).map((m) => `${m.stage}:${m.state}`)).toEqual([
      'filed:done', 'zoning:done', 'objection:done', 'hearing:skipped', 'council:done', 'appeal:skipped', 'construction:now', 'done:todo',
    ]);
    expect(stageMarks(consent).find((m) => m.stage === 'objection')?.day).toBe(7);
    const up = app({ id: 'a2', kind: 'upgrade', target: { facilityId: 'f1', toLevel: 2 }, stage: 'objection', stageDay: 3, filedDay: 3 });
    expect(stageMarks(up).slice(0, 3).map((m) => m.state)).toEqual(['done', 'skipped', 'now']);
  });

  it('費用・完成までの見込み・通った時の得を出し、取り下げは確かめてから。取り下げると費用が全て戻る', () => {
    const store = storeWith([app({ id: 'a1', stage: 'zoning', stageDay: 8, filedDay: 8 })], 10);
    const funds = store.getState().world.city.funds;
    const d = permitDetail(store.getState().world, 'a1');
    // 審査は 15 日目まで → 反対の受付は 29 日目まで → 次の議会（42 日目）→ 工事 28 日 = 70 日目。今は 10 日目
    expect(d).toMatchObject({ toComplete: 60, reserved: 400, wallet: '開発資金', canWithdraw: true, gains: [{ label: '雇用', value: '+15 人分の仕事' }, { label: '技術力', value: '+1' }] });
    store.getState().openPermit('a1');
    const host = mount(<PermitDetailWindow store={store} stack={0} shifted={false} />);
    expect(host.querySelector('[data-testid="permit-now"]')?.textContent).toContain('用途地域の審査');
    act(() => (host.querySelector('[data-testid="permit-withdraw"]') as HTMLButtonElement).click());
    // まだ取り下げていない（確かめの段）
    expect(store.getState().world.applications[0]?.stage).toBe('zoning');
    act(() => (host.querySelector('[data-testid="permit-withdraw-yes"]') as HTMLButtonElement).click());
    expect(store.getState().world.applications[0]?.stage).toBe('withdrawn');
    expect(store.getState().world.city.funds).toBe(funds + 400);
    expect(store.getState().notice?.text).toBe('サーバ施設の申請を取り下げた。取り分けた 400 資金が戻った');
    // 着工の後は取り下げの手が無い
    const built = storeWith([app({ id: 'a2', stage: 'construction', stageDay: 8 })]);
    built.getState().openPermit('a2');
    const host2 = mount(<PermitDetailWindow store={built} stack={0} shifted={false} />);
    expect(host2.querySelector('[data-testid="permit-withdraw"]')).toBeNull();
  });
});

describe('看板と囲い（docs/city-design.md 9.1）', () => {
  it('審議中の施設は囲いと看板（名前と「審議中」）。議会を待つ間は議会の日付、工事中は残りの日数', () => {
    const world = storeWith([
      app({ id: 'a1', stage: 'zoning', stageDay: 8 }),
      app({ id: 'a2', stage: 'council', stageDay: 21, target: { type: 'deploy', origin: { x: 40, y: 44 }, rotation: 0 } }),
      app({ id: 'a3', stage: 'rejected', stageDay: 9 }),
    ], 22).getState().world;
    const sites = sitesOf(world);
    expect(sites.map((s) => s.id)).toEqual(['a1', 'a2']);
    expect(sites[0]).toMatchObject({ kind: 'facility', title: 'サーバ施設', line: '審議中・用途地域の審査 あと 0 日', building: false, w: 2, d: 2 });
    expect(sites[1]?.line).toBe('議会の採決 1 年目 5 週');
  });

  it('用途地域の変更は、塗るマスの全てを敷地にする', () => {
    const cells = [{ x: 40, y: 46 }, { x: 41, y: 46 }, { x: 42, y: 46 }];
    const world = storeWith([app({ id: 'a1', kind: 'rezone', target: { zone: { kind: 'industrial', cells } }, stage: 'objection', stageDay: 8 })]).getState().world;
    const [site] = sitesOf(world);
    expect(site).toMatchObject({ kind: 'rezone', cells, title: '工業区画への変更', w: 3, d: 1 });
  });
});

describe('申請中の施設からも学べる（docs/ui-design.md 5 章・docs/game-design.md 20 章）', () => {
  it('申請中の敷地を選ぶと、情報パネルに段階と「ここで学ぶ」が出て、申請の詳細の窓も開く', () => {
    const store = storeWith([app({ id: 'a1', stage: 'objection', stageDay: 5 })]);
    store.getState().select({ kind: 'application', id: 'a1' });
    const s = store.getState();
    expect(s.windows).toContain('permit');
    expect(s.permitId).toBe('a1');
    const m = panelModel(s.city, { kind: 'application', id: 'a1' }, {}, emptyProgress(), s.world.applications);
    expect(m).toMatchObject({ kind: 'facility', name: 'サーバ施設', permitId: 'a1', condition: { text: '申請中: 反対の受付 あと 9 日', tone: 'warn' } });
    expect(m?.kind === 'facility' ? m.lessons.length : 0).toBe(3);
  });

  it('工事中の施設の情報パネルは、完成までの日数と「ここで学ぶ」を出す', () => {
    const f: Facility = { id: 'f9', type: 'server', domain: 'linux', origin: { x: 51, y: 48 }, rotation: 180, level: 1, state: 'constructing', builtDay: 28, completeDay: 56 };
    const store = storeWith([app({ id: 'a1', stage: 'construction', stageDay: 28, target: { type: 'server', origin: { x: 51, y: 48 }, rotation: 180, facilityId: 'f9' } })], 40, [f]);
    const s = store.getState();
    const m = panelModel(s.city, { kind: 'facility', id: 'f9' }, {}, emptyProgress(), s.world.applications);
    expect(m?.condition.text).toBe('建設中（骨組み）・完成まで 16 日');
    expect(m?.kind === 'facility' && m.permitId).toBe('a1');
    expect(m?.kind === 'facility' ? m.lessons.length : 0).toBe(3);
  });
});

describe('段階が進んだ時の知らせ（docs/ui-design.md 3 章）', () => {
  it('公聴会の段に入った・可決して着工した・完成した を知らせ、押すとその申請を開く', () => {
    const before = [app({ id: 'a1', stage: 'objection' }), app({ id: 'a2', stage: 'council' }), app({ id: 'a3', stage: 'construction' }), app({ id: 'a4', stage: 'zoning' })];
    const world = storeWith([], 28).getState().world;
    const after: World = {
      ...world,
      applications: [
        app({ id: 'a1', stage: 'hearing', stageDay: 28 }),
        app({ id: 'a2', stage: 'construction', stageDay: 28 }),
        app({ id: 'a3', stage: 'done', stageDay: 28 }),
        app({ id: 'a4', stage: 'objection', stageDay: 28 }),
      ],
    };
    expect(stageNotices(before, after)).toEqual([
      { text: 'サーバ施設の申請が公聴会の段に入った。14 日のうちに開ける', permitId: 'a1' },
      { text: 'サーバ施設の申請が可決された。着工した（完成まで 28 日）', permitId: 'a2' },
      { text: 'サーバ施設が完成した', permitId: 'a3' },
    ]);
  });

  it('時間を進めて着工すると、知らせが出て、押すと申請の詳細が開く', () => {
    const store = createCityStore(1);
    const w = store.getState().world;
    // 議会の日（14 日目）の前の日に、議会を待つ申請
    store.getState().load({ ...w, city: { ...w.city, day: 13, funds: 5000 }, applications: [app({ id: 'a1', stage: 'council', stageDay: 12 })] });
    for (let i = 0; i < 3; i += 1) store.getState().tick(1);
    const s = store.getState();
    expect(s.world.applications[0]?.stage).toBe('construction');
    expect(s.notice).toMatchObject({ text: 'サーバ施設の申請が可決された。着工した（完成まで 28 日）', permitId: 'a1' });
  });
});

describe('反対（G4。docs/ui-design.md 10.2 の 2・3、docs/city-design.md 9.1）', () => {
  const objections: Application['objections'] = [
    { reasonId: 'dc-night-noise', group: 'neighbors', district: 0, strength: 0.08, share: 3.4, full: 3.4, basis: { value: 2.3, ref: 3 }, topLayer: 1 },
    { reasonId: 'dc-power', group: 'neighbors', district: 0, strength: 0.42, share: 10.3, full: 10.3, basis: { value: 3, ref: 7.07 }, topLayer: 4 },
    { reasonId: 'dc-jobs', group: 'neighbors', district: 0, strength: 0.81, share: 12.6, full: 12.6, basis: { value: 2.5, ref: 13.5 }, topLayer: 0 },
    { reasonId: 'dc-cooling-water', group: 'environment', strength: 0.15, share: 5.9, full: 5.9, basis: { value: 0.15 }, topLayer: 10 },
  ];
  const dc = (patch: Partial<Application> = {}): Application => app({
    id: 'a1', stage: 'hearing', stageDay: 9, target: { type: 'datacenter', origin: { x: 46, y: 36 }, rotation: 0 }, reserved: 650,
    objections, opposition: 32.2, ...patch,
  });

  it('内訳: 理由ごとの割合（整数）の合計が、大きな数字の反対率と一致する。集団は地区の名前で呼び、多い層を添える', () => {
    const world = storeWith([dc()]).getState().world;
    const d = permitDetail(world, 'a1');
    expect(d?.opposition).toBe(32);
    expect(d?.objections.map((r) => [r.title, r.share])).toEqual([['雇用が少ない', 13], ['電力の逼迫', 10], ['冷却水の使用', 6], ['夜間の騒音', 3]]);
    expect(d?.objections.reduce((a, r) => a + r.share, 0)).toBe(32);
    const district = world.sim.districtNames[0] ?? '';
    expect(d?.objections[0]).toMatchObject({ group: `${district}の住民`, layer: '低い収入の若者', heat: 'jobs' });
    expect(d?.objections.find((r) => r.title === '冷却水の使用')).toMatchObject({ group: '環境の会', layer: '中くらいの収入の高齢' });
    expect(d?.objections.find((r) => r.title === '夜間の騒音')?.basis).toBe('半径 3 の住まいで、夜の騒音が 2.3 増える見込み（30 増えると、懸念が一番強くなる）');
    expect(d?.objections.find((r) => r.title === '電力の逼迫')?.basis).toBe('使う電力 3 MW に対し、今の電力の余りは 7.07 MW');
  });

  it('理由を押すと、強さの元の値の 1 文が出て、その値のヒートマップを重ね、敷地へ寄る', () => {
    const store = storeWith([dc()]);
    store.getState().openPermit('a1');
    const host = mount(<PermitDetailWindow store={store} stack={0} shifted={false} />);
    const reasons = host.querySelector('[data-testid="permit-reasons"]');
    expect(reasons?.querySelectorAll('.permit-reason')).toHaveLength(4);
    const noise = reasons?.querySelector('[data-reason="dc-night-noise"] .permit-reason-main') as HTMLButtonElement;
    act(() => noise.click());
    expect(host.querySelector('[data-testid="permit-reason-basis"]')?.textContent).toContain('夜の騒音が 2.3 増える見込み');
    expect(store.getState().overlay).toBe('noise');
    expect(store.getState().focus?.at).toEqual({ x: 47.5, y: 37 });
    // ヒートマップの無い理由（電力）は、重ねた地図を変えない
    act(() => (reasons?.querySelector('[data-reason="dc-power"] .permit-reason-main') as HTMLButtonElement).click());
    expect(host.querySelector('[data-testid="permit-reason-basis"]')?.textContent).toBe('使う電力 3 MW に対し、今の電力の余りは 7.07 MW');
    expect(store.getState().overlay).toBe('noise');
  });

  it('反対率が 20% 以上の申請は、公聴会の段で待つ（看板・一覧・知らせ）。取り下げはできる', () => {
    const world = storeWith([dc()]).getState().world;
    expect(permitRows(world).open[0]?.waiting).toBe('公聴会を待っている。取り下げはできる');
    expect(sitesOf(world)[0]?.line).toBe('公聴会を待つ・反対 32%');
    expect(permitDetail(world, 'a1')?.canWithdraw).toBe(true);
    expect(stageNotices([dc({ stage: 'objection' })], world)).toEqual([{ text: 'データセンターの申請は反対が 32% 立ち、公聴会の段に入った', permitId: 'a1' }]);
  });

  it('囲いの前に反対する人の影（反対率に応じて 0〜6 人・札の色）。議会を待つ間と工事中には立たない', () => {
    const world = storeWith([
      dc(),
      dc({ id: 'a2', stage: 'objection', opposition: 9, target: { type: 'server', origin: { x: 40, y: 44 }, rotation: 0 } }),
      dc({ id: 'a3', stage: 'council', opposition: 12, target: { type: 'server', origin: { x: 30, y: 44 }, rotation: 0 } }),
      dc({ id: 'a4', stage: 'objection', opposition: 0, objections: [], target: { type: 'web', origin: { x: 34, y: 44 }, rotation: 0 } }),
    ]).getState().world;
    const crowd = Object.fromEntries(sitesOf(world).map((s) => [s.id, s.crowd]));
    expect(crowd.a1).toMatchObject({ tone: 'warn' });
    expect(crowd.a1?.spots).toHaveLength(2);
    // 入口（向き 0 は南）の縁の外に立つ
    expect(crowd.a1?.spots.every((p) => p.y === 38.3)).toBe(true);
    expect(crowd.a2).toMatchObject({ tone: 'calm' });
    expect(crowd.a2?.spots).toHaveLength(1);
    expect(crowd.a3).toBeUndefined();
    expect(crowd.a4).toBeUndefined();
  });
});
