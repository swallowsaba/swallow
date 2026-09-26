import { describe, expect, it } from 'vitest';
import type { ExperienceTwist } from '@/engines/lesson/types';
import { SCENARIOS } from './scenarios';
import { hintsOf, press, startPlay, tick, type PlayState, type Scenario } from './sim';
import { TOWNS } from './towns';

/**
 * 体験の遊び（REWORK 1-2）。仕組みが無い町を手で回すと、だんだん追いつかなくなる。
 */

/** 何もせずに秒数だけ進める */
function wait(state: PlayState, seconds: number, scenario: Scenario, step = 0.25): PlayState {
  let next = state;
  for (let t = 0; t < seconds && next.over === null; t += step) next = tick(next, step, scenario);
  return next;
}

/**
 * 正しい物だけを押し続ける、手の速い人。1 手に reaction 秒かかる。
 * search は当たりを知らないので、1 つずつ順に試す（実際の学習者と同じく探す）。
 */
function diligent(scenario: Scenario, reaction: number): PlayState {
  let state = startPlay(scenario);
  const things = TOWNS[scenario.kind].things.filter((t) => t.facility !== true).map((t) => t.id);
  let tried = 0;
  while (state.over === null) {
    state = tick(state, reaction, scenario);
    const chore = state.queue[0];
    if (chore === undefined) continue;
    if (chore.mode === 'search') {
      state = press(state, things[tried % things.length] ?? '', scenario);
      tried += 1;
    } else {
      const hint = hintsOf(state, scenario)[0];
      if (hint !== undefined) state = press(state, hint, scenario);
    }
  }
  return state;
}

describe('住人を手でビルへ案内する（Kubernetes の体験）', () => {
  const scenario = SCENARIOS.arrivals;

  it('空きのあるビルを押すと住人が入り、待合所から 1 人減る', () => {
    let state = wait(startPlay(scenario), 2, scenario);
    expect(state.queue).toHaveLength(1);
    state = press(state, 't3', scenario);
    expect(state.done).toBe(1);
    expect(state.fill['t3']).toBe(1);
    expect(state.queue).toHaveLength(0);
  });

  it('満員のビルには入れられず、外れとして数える', () => {
    let state = startPlay(scenario);
    state = { ...state, fill: { ...state.fill, t1: 3 } };
    state = wait(state, 2, scenario);
    state = press(state, 't1', scenario);
    expect(state.done).toBe(0);
    expect(state.wasted).toBe(1);
    expect(state.note?.text).toContain('満員');
  });

  it('停電したビルの住人は外へ出てきて、移す頼みごとが先頭に並ぶ', () => {
    let state = wait(startPlay(scenario), 23, scenario);
    expect(state.dark).toContain('t2');
    expect(state.fill['t2']).toBe(0);
    expect(state.queue[0]?.text).toContain('停電');
    state = press(state, 't2', scenario);
    expect(state.note?.text).toContain('停電');
  });

  it('何もしないと、30 秒を過ぎたところで溜まりすぎて終わる', () => {
    const state = wait(startPlay(scenario), 90, scenario);
    expect(state.over).toBe('swamped');
    expect(state.t).toBeGreaterThanOrEqual(30);
    expect(state.t).toBeLessThanOrEqual(90);
  });

  it('手の速い人でも、終わるころには追いつけていない（取りこぼしか、溜まりが残る）', () => {
    const state = diligent(scenario, 1.6);
    expect(state.done).toBeGreaterThan(5);
    expect(state.missed + state.queue.length).toBeGreaterThan(0);
  });
});

describe('どのひねりも 30〜90 秒で終わり、手では追いつかない', () => {
  for (const twist of Object.keys(SCENARIOS) as ExperienceTwist[]) {
    it(twist, () => {
      const scenario = SCENARIOS[twist];
      const state = diligent(scenario, 1.5);
      expect(state.over).not.toBeNull();
      expect(state.t).toBeGreaterThanOrEqual(30);
      expect(state.t).toBeLessThanOrEqual(90);
      // 何かしらは片付けられる（遊べる）が、何かしらはこぼれるか残る（困る）
      expect(state.done).toBeGreaterThan(0);
      expect(state.missed + state.queue.length + state.wasted).toBeGreaterThan(0);
    });
  }
});

describe('押し方', () => {
  it('運ぶ頼みごとは、順番を間違えると外れになり、正しい順なら運び終わる', () => {
    const scenario = SCENARIOS.relay;
    let state = wait(startPlay(scenario), 2, scenario);
    const [from, to] = state.queue[0]?.targets ?? [];
    state = press(state, to ?? '', scenario);
    expect(state.wasted).toBe(1);
    state = press(state, from ?? '', scenario);
    state = press(state, to ?? '', scenario);
    expect(state.done).toBe(1);
  });

  it('探す頼みごとは当たりを光らせない。外れを押すと、そこに何があったかを言う', () => {
    const scenario = SCENARIOS.lost;
    let state = wait(startPlay(scenario), 2, scenario);
    expect(hintsOf(state, scenario)).toEqual([]);
    const target = state.queue[0]?.targets[0];
    const other = ['h1', 'h2', 'h3'].find((id) => id !== target) ?? 'h1';
    state = press(state, other, scenario);
    expect(state.note?.tone).toBe('miss');
    expect(state.note?.text).toContain('待っていたのは');
  });

  it('期限のある書き足しは、放っておくと上書きされて取りこぼしになる', () => {
    const scenario = SCENARIOS.overwrite;
    const state = wait(startPlay(scenario), 17, scenario);
    expect(state.missed).toBeGreaterThan(0);
  });

  it('途中で消える荷車は、運び終えてももう一度頼まれる', () => {
    const scenario = SCENARIOS.resend;
    let state = startPlay(scenario);
    // 2 つ目（n=1）が消える荷車
    state = wait(state, 1.3, scenario);
    for (const id of state.queue[0]?.targets ?? []) state = press(state, id, scenario);
    state = wait(state, 5, scenario);
    const lost = state.queue.find((c) => c.lost === true);
    expect(lost).toBeDefined();
    for (const id of lost?.targets ?? []) state = press(tick(state, 0, scenario), id, scenario);
    expect(state.queue.some((c) => c.text.startsWith('届かなかった'))).toBe(true);
  });
});
