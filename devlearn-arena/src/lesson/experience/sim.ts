import type { ExperienceKind } from '@/engines/lesson/types';
import { TOWNS, thingOf, type Town } from './towns';

/**
 * 体験の遊びの中身。仕組みが「無い」町を、学習者が手で回して困るための模型。
 *
 * 頼みごと（chore）が次々に来て、学習者は町の物を押して片付ける。
 * 来る間隔はだんだん縮み、片付けが追いつかなくなると溜まっていく。
 * その「手が追いつかない」を体で知ってから、次の段で仕組みが現れる。
 *
 * 押し方は 3 通りだけ:
 * - search … 当たりがどれか見た目では分からない。1 つずつ押して探す
 * - carry  … 押す順が決まっている。順に押して運ぶ
 * - place  … 空きのある所ならどこでもよい。満員や停電の所には入れられない
 *
 * ここは React にも時計にも触れない純粋な計算。同じ操作からは必ず同じ結果になる。
 */

export type ChoreMode = 'search' | 'carry' | 'place';

export interface ChoreSeed {
  text: string;
  mode: ChoreMode;
  /** search: 当たり（どれでもよい） / carry: 押す順 / place: 受け入れてよい先 */
  targets: readonly string[];
  /** この秒数のうちに片付けないと取りこぼしになる（上書きされる・忘れられる） */
  expires?: number;
  /** 片付けても、途中で消えてもう一度頼まれる */
  lost?: boolean;
}

export interface Chore extends ChoreSeed {
  id: number;
  /** carry で、いま何番目まで押したか */
  at: number;
  /** 来た時刻（秒） */
  born: number;
}

/** 決まった時刻に起きる出来事。停電したビルは受け入れず、中の住人が外へ出てくる */
export interface TownEvent {
  at: number;
  kind: 'dark';
  target: string;
  /** 出てきた住人を移す頼みごとの文 */
  text: string;
}

export interface Scenario {
  kind: ExperienceKind;
  /** 遊ぶ長さ（秒） */
  seconds: number;
  /** これより前には終わらない（溜まっていても） */
  minSeconds: number;
  /** これだけ溜まったら「手が追いつかない」として終える */
  backlog: number;
  /** n 番目（0 始まり）の頼みごと。いまの町の様子を見て決めてよい */
  chore: (n: number, state: PlayState) => ChoreSeed;
  /** n 番目が来てから、次が来るまでの秒数 */
  gap: (n: number) => number;
  /** search で外れを押したときの一言 */
  miss: (chore: Chore, id: string, state: PlayState) => string;
  events?: readonly TownEvent[];
}

export type Tone = 'ok' | 'miss' | 'alert';

export interface PlayState {
  /** 始めてからの秒数 */
  t: number;
  /** これまでに来た頼みごとの数 */
  spawned: number;
  /** 次の頼みごとが来る時刻 */
  nextAt: number;
  /** 溜まっている頼みごと。先頭がいま取りかかるもの */
  queue: readonly Chore[];
  /** 片付けた数 */
  done: number;
  /** 取りこぼした数（待ちきれずに帰った・上書きされた・忘れられた） */
  missed: number;
  /** 外れを押した数 */
  wasted: number;
  /** 物ごとの、いま入っている数 */
  fill: Readonly<Record<string, number>>;
  /** 停電している物 */
  dark: readonly string[];
  /** 起きた出来事の数 */
  fired: number;
  /** 直前に押した結果の一言 */
  note: { text: string; tone: Tone } | null;
  /** 直前に押した物と、その当たり外れ。絵で一瞬光らせる */
  flash: { id: string; tone: Tone; serial: number; at: number } | null;
  /** 終わったか。time=時間切れ swamped=溜まりすぎ */
  over: null | 'time' | 'swamped';
  /** 学習者が押した回数。遊んだかどうかの目安 */
  presses: number;
}

/** 最初の頼みごとが来るまでの秒数。町を見回す間を置く */
const FIRST_AT = 1.2;

export function startPlay(scenario: Scenario, town: Town = TOWNS[scenario.kind]): PlayState {
  const fill: Record<string, number> = {};
  for (const thing of town.things) if (thing.room !== undefined) fill[thing.id] = thing.holds ?? 0;
  return {
    t: 0,
    spawned: 0,
    nextAt: FIRST_AT,
    queue: [],
    done: 0,
    missed: 0,
    wasted: 0,
    fill,
    dark: [],
    fired: 0,
    note: null,
    flash: null,
    over: null,
    presses: 0,
  };
}

function labelOf(kind: ExperienceKind, id: string): string {
  return thingOf(kind, id)?.label ?? id;
}

/** 頼みごとを 1 つ足す。溜まりすぎていれば、来た人は待ちきれずに帰る（取りこぼし） */
function arrive(state: PlayState, seed: ChoreSeed, scenario: Scenario, front = false): PlayState {
  const chore: Chore = { ...seed, id: state.spawned, at: 0, born: state.t };
  const spawned = state.spawned + 1;
  if (state.queue.length >= scenario.backlog + 2) {
    return { ...state, spawned, missed: state.missed + 1, note: { text: '待ちきれずに帰ってしまった', tone: 'alert' } };
  }
  return { ...state, spawned, queue: front ? [chore, ...state.queue] : [...state.queue, chore] };
}

/** 時間を dt 秒進める。出来事を起こし、頼みごとを呼び、期限切れを取りこぼしにする */
export function tick(state: PlayState, dt: number, scenario: Scenario): PlayState {
  if (state.over !== null) return state;
  let next: PlayState = { ...state, t: state.t + dt };

  // 出来事（停電など）
  const events = scenario.events ?? [];
  while (next.fired < events.length) {
    const event = events[next.fired];
    if (event === undefined || event.at > next.t) break;
    next = { ...next, fired: next.fired + 1 };
    if (event.kind === 'dark') {
      const inside = next.fill[event.target] ?? 0;
      next = {
        ...next,
        dark: [...next.dark, event.target],
        fill: { ...next.fill, [event.target]: 0 },
        note: { text: `${labelOf(scenario.kind, event.target)}が停電した。中の住人が外へ出てきた`, tone: 'alert' },
      };
      for (let i = 0; i < inside; i += 1) {
        // 行き先の候補は全部のビル。停電したビルを押せば「停電している」と返す
        next = arrive(next, { text: event.text, mode: 'place', targets: Object.keys(next.fill) }, scenario, true);
      }
    }
  }

  // 頼みごとが来る
  while (next.t >= next.nextAt && next.t < scenario.seconds) {
    const n = next.spawned;
    next = arrive(next, scenario.chore(n, next), scenario);
    next = { ...next, nextAt: next.nextAt + scenario.gap(n) };
  }

  // 期限切れ（上書きされた・忘れられた）
  const expired = next.queue.filter((c) => c.expires !== undefined && next.t - c.born >= c.expires);
  if (expired.length > 0) {
    next = {
      ...next,
      queue: next.queue.filter((c) => !expired.includes(c)),
      missed: next.missed + expired.length,
      note: { text: '間に合わず、書き足しが消えてしまった', tone: 'alert' },
    };
  }

  // 終わり
  if (next.t >= scenario.seconds) return { ...next, over: 'time' };
  if (next.t >= scenario.minSeconds && next.queue.length >= scenario.backlog) return { ...next, over: 'swamped' };
  return next;
}

/** 片付けた。途中で消える荷なら、同じ運びをもう一度頼まれる */
function complete(state: PlayState, chore: Chore, scenario: Scenario, id: string, text: string): PlayState {
  let next: PlayState = {
    ...state,
    queue: state.queue.slice(1),
    done: state.done + 1,
    note: { text, tone: 'ok' },
    flash: { id, tone: 'ok', serial: state.presses, at: state.t },
  };
  if (chore.lost === true) {
    next = arrive(
      next,
      { text: `届かなかった。もう一度: ${chore.text}`, mode: chore.mode, targets: chore.targets },
      scenario,
    );
    next = { ...next, note: { text: '運んだが、途中で消えてしまったらしい', tone: 'alert' } };
  }
  return next;
}

function wrong(state: PlayState, id: string, text: string): PlayState {
  return { ...state, wasted: state.wasted + 1, note: { text, tone: 'miss' }, flash: { id, tone: 'miss', serial: state.presses, at: state.t } };
}

/** 町の物を押した */
export function press(state: PlayState, id: string, scenario: Scenario): PlayState {
  if (state.over !== null) return state;
  const pressed: PlayState = { ...state, presses: state.presses + 1 };
  const chore = pressed.queue[0];
  if (chore === undefined) return { ...pressed, note: { text: 'いまは頼まれごとが無い', tone: 'miss' } };
  const label = labelOf(scenario.kind, id);

  if (chore.mode === 'search') {
    if (chore.targets.includes(id)) return complete(pressed, chore, scenario, id, `${label}で合っていた`);
    return wrong(pressed, id, scenario.miss(chore, id, pressed));
  }

  if (chore.mode === 'carry') {
    const want = chore.targets[chore.at];
    if (id !== want) return wrong(pressed, id, `順番が違う。次は${labelOf(scenario.kind, want ?? '')}`);
    const at = chore.at + 1;
    if (at >= chore.targets.length) return complete(pressed, chore, scenario, id, '運び終えた');
    const moved: Chore = { ...chore, at };
    const nextLabel = labelOf(scenario.kind, chore.targets[at] ?? '');
    return {
      ...pressed,
      queue: [moved, ...pressed.queue.slice(1)],
      note: { text: `受け取った。次は${nextLabel}へ`, tone: 'ok' },
      flash: { id, tone: 'ok', serial: pressed.presses, at: pressed.t },
    };
  }

  // place
  if (!chore.targets.includes(id)) return wrong(pressed, id, `${label}には入れられない`);
  if (pressed.dark.includes(id)) return wrong(pressed, id, `${label}は停電している`);
  const room = thingOf(scenario.kind, id)?.room ?? 0;
  const inside = pressed.fill[id] ?? 0;
  if (inside >= room) return wrong(pressed, id, `${label}はもう満員`);
  return complete({ ...pressed, fill: { ...pressed.fill, [id]: inside + 1 } }, chore, scenario, id, `${label}に入った`);
}

/** 押せる物か。いまの頼みごとで、当たりの見込みがある物だけを光らせるのに使う（carry と place だけ） */
export function hintsOf(state: PlayState, scenario: Scenario): readonly string[] {
  const chore = state.queue[0];
  if (chore === undefined) return [];
  if (chore.mode === 'carry') return chore.targets[chore.at] === undefined ? [] : [chore.targets[chore.at] ?? ''];
  if (chore.mode === 'place') {
    return chore.targets.filter((id) => {
      const room = thingOf(scenario.kind, id)?.room ?? 0;
      return !state.dark.includes(id) && (state.fill[id] ?? 0) < room;
    });
  }
  // search は当たりが見えないのが困りごとなので、光らせない
  return [];
}

/** 遊び終えたときの数字。振り返りと登場の段の頭に出す */
export interface PlaySummary {
  done: number;
  missed: number;
  wasted: number;
  left: number;
  seconds: number;
}

export function summaryOf(state: PlayState): PlaySummary {
  return { done: state.done, missed: state.missed, wasted: state.wasted, left: state.queue.length, seconds: Math.round(state.t) };
}
