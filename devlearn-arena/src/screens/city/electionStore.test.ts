import { describe, expect, it } from 'vitest';
import { directHost } from '@/sim/host';
import { grownVillage } from '@/sim/__fixtures__/cities';
import { TERM_DAYS, WARN_DAYS } from '@/sim/election';
import type { World } from '@/sim/types';
import { createCityStore } from './cityStore';

/**
 * 都市画面の選挙（docs/game-design.md 21 章・docs/ui-design.md 10.6・10.7）。
 * 8 週前の知らせ・選挙の日に結果の窓・落選したら道を選ぶまで時間が止まる・同じ都市で再び立つ・公約を選ぶ窓
 */

const GROWN = grownVillage(120);
const today = (w: World): number => Math.floor(w.city.day);
const beforeElection = (w: World, n: number): World => ({ ...w, politics: { ...w.politics, term: { ...w.politics.term, startDay: today(w) + n - TERM_DAYS + 1 } } });
const supported = (w: World, low: number, high: number): World => ({
  ...w,
  history: { ...w.history, breakdown: w.history.breakdown.map((b) => ({ ...b, layers: (b.layers ?? []).map((_, i) => (i < 6 ? low : high)) })) },
});
const storeOf = (w: World) => createCityStore(undefined, undefined, { world: w, host: directHost() });
/** 1 日ずつ進め、出た知らせを全て集める */
function run(store: ReturnType<typeof storeOf>, n: number): string[] {
  const seen: string[] = [];
  for (let i = 0; i < n; i += 1) {
    store.getState().tick(2 / store.getState().speed);
    const s = store.getState();
    for (const t of [s.notice, ...s.queue]) {
      const text = typeof t === 'string' ? t : t?.text;
      if (text && !seen.includes(text)) seen.push(text);
    }
  }
  return seen;
}

describe('選挙の日まで（21.1）', () => {
  it('8 週前に「選挙が近い」と知らせる（今の見込みの得票率を添え、押すと選挙の窓）', () => {
    const store = storeOf(beforeElection(GROWN.world, WARN_DAYS + 2));
    const seen = run(store, 3);
    const warn = seen.find((t) => t.startsWith('選挙まで 8 週'));
    expect(warn).toMatch(/今の見込みは得票率 \d+%/);
    const s = store.getState();
    const all = [s.notice, ...s.queue].filter((n) => typeof n !== 'string');
    expect(all.some((n) => n && typeof n !== 'string' && n.text === warn && n.window === 'election')).toBe(true);
    // 選挙の窓はまだ開かない（見込みは上の帯から開ける）
    expect(s.election).toBeNull();
  });

  it('見込みの窓は開いている間、都市の時間を止める。結果は選挙の後だけ開ける', () => {
    const store = storeOf(GROWN.world);
    store.getState().openElection('result');
    expect(store.getState().election).toBeNull();
    store.getState().openElection('preview');
    expect(store.getState().election).toBe('preview');
    const d0 = store.getState().city.day;
    store.getState().tick(10);
    expect(store.getState().city.day).toBe(d0);
    store.getState().leaveElection();
    store.getState().tick(2);
    expect(store.getState().city.day).toBe(d0 + 1);
  });
});

describe('選挙の日（21.1・21.2）', () => {
  it('当選: 結果の窓が開き、次の任期が始まる。時間は窓を閉じれば進む', () => {
    const store = storeOf(supported(beforeElection(GROWN.world, 1), 90, 90));
    const seen = run(store, 1);
    expect(seen).toContain(`1 期目の選挙: 得票率 ${String(Math.round(store.getState().world.politics.pastTerms[0]?.voteShare ?? 0))}%で当選した。押すと結果`);
    const s = store.getState();
    expect(s.election).toBe('result');
    expect(s.world.politics.term.no).toBe(2);
    expect(s.holds).not.toContain('defeat');
    s.leaveElection();
    const d0 = store.getState().city.day;
    store.getState().tick(2);
    expect(store.getState().city.day).toBe(d0 + 1);
  });

  it('落選: 結果の窓が開き、窓を閉じても、道を選ぶまで都市の時間は止まる', () => {
    const store = storeOf(supported(beforeElection(GROWN.world, 1), 20, 45));
    const seen = run(store, 1);
    expect(seen.some((t) => /^1 期目の選挙: 得票率 \d+%で落選した/.test(t))).toBe(true);
    expect(store.getState().election).toBe('result');
    expect(store.getState().holds).toContain('defeat');
    store.getState().leaveElection();
    const d0 = store.getState().city.day;
    store.getState().tick(20);
    expect(store.getState().city.day).toBe(d0);
    // 都市を変える命令は当たらない（学習の資金は当たる）
    const funds = store.getState().world.city.funds;
    store.getState().dispatch({ kind: 'zone', zone: 'residential', a: { x: 30, y: 30 }, b: { x: 31, y: 30 } });
    store.getState().dispatch({ kind: 'funds', amount: 50 });
    expect(store.getState().world.city.funds).toBe(funds + 50);
  });

  it('同じ都市で再び立つ: 時間が動き出し、任期の一覧と次の任期の公約を選ぶ窓が開く', () => {
    const store = storeOf(supported(beforeElection(GROWN.world, 1), 20, 45));
    run(store, 1);
    store.getState().rerun(1000);
    const s = store.getState();
    expect(s.world.politics.defeated).toBeUndefined();
    expect(s.world.politics.term.no).toBe(2);
    expect(s.holds).not.toContain('defeat');
    expect(s.election).toBe('term');
    expect([s.notice?.text, ...s.queue]).toContain('同じ都市で、2 期目に再び立った。政治資本は 10 に戻った');
  });

  it('保存から落選した都市を開いても、道を選ぶまで止まっている', () => {
    const lost: World = { ...GROWN.world, politics: { ...GROWN.world.politics, defeated: true } };
    const store = storeOf(lost);
    expect(store.getState().holds).toContain('defeat');
  });
});

describe('公約を選ぶ窓（21.4）', () => {
  it('公約を選んでいない任期なら 1 度だけ自分から開く。閉じたら、その任期はもう自分からは出さない', () => {
    const store = storeOf(GROWN.world);
    expect(store.getState().world.politics.term.pledges).toEqual([]);
    store.getState().askPledges();
    expect(store.getState().election).toBe('term');
    store.getState().leaveElection();
    store.getState().askPledges();
    expect(store.getState().election).toBeNull();
  });

  it('2 つ選ぶと窓が閉じ、立てた公約を知らせる。2 つでなければ選べず、窓は開いたまま', () => {
    const store = storeOf(GROWN.world);
    store.getState().askPledges();
    expect(store.getState().choosePledges(['pop-grow'], 0)).toBe(false);
    expect(store.getState().election).toBe('term');
    expect(store.getState().choosePledges(['pop-grow', 'it-two'], 0)).toBe(true);
    const s = store.getState();
    expect(s.world.politics.term.pledges.map((p) => p.pledgeId)).toEqual(['pop-grow', 'it-two']);
    expect(s.election).toBeNull();
    expect(s.notice?.text).toBe('1 期目の公約を立てた: 「人口を 2 割増やす」「IT 施設を 2 つ完成させる」。果たすと政治資本 +5');
    // 選んだ後は、もう開かない
    store.getState().askPledges();
    expect(store.getState().election).toBeNull();
  });

  it('公聴会・議会の窓が開いている間は割り込まない', () => {
    const store = storeOf(GROWN.world);
    store.setState({ hearingId: 'a1' });
    store.getState().askPledges();
    expect(store.getState().election).toBeNull();
  });
});
