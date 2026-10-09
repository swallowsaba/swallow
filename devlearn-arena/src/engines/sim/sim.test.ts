import { describe, expect, it } from 'vitest';
import {
  actionNames, applyAction, connectProblem, createSim, describeAction, exprProblems, holds, isSettled, misplaced, orderStop, sendRoute, shownPanels,
  type SimEnvironmentId,
} from './sim';
import type { SimAction, SimState } from './types';

/** 操作を順に与える。誤りがあれば、その文を返す */
function run(state: SimState, actions: SimAction[]): { state: SimState; errors: string[] } {
  const errors: string[] = [];
  let s = state;
  for (const a of actions) {
    const r = applyAction(s, a);
    if (r.error) errors.push(r.error);
    s = r.state;
  }
  return { state: s, errors };
}

const sim = (env: SimEnvironmentId, setup: unknown): SimState => createSim(env, setup);
const link = (a: string, b: string): SimAction => ({ op: 'connect', a, b });
const cut = (a: string, b: string): SimAction => ({ op: 'cut', a, b });
const start = (node: string): SimAction => ({ op: 'start', node });
const send = (from: string, to: string): SimAction => ({ op: 'send', from, to });
const arrange = (...stages: string[][]): SimAction => ({ op: 'arrange', stages });
const put = (item: string, slot: string): SimAction => ({ op: 'put', item, slot });
const take = (item: string, slot?: string): SimAction => (slot === undefined ? { op: 'take', item } : { op: 'take', item, slot });
const answer = (question: string, value: string): SimAction => ({ op: 'answer', question, value });

describe('つなぐ（sim-connect）', () => {
  const computer = {
    nodes: [
      { id: '入力', label: 'キーボード', icon: 'keyboard', x: 10, y: 50 },
      { id: '処理', label: 'CPU', icon: 'cpu', x: 40, y: 50 },
      { id: '出力', label: '画面', icon: 'screen', x: 70, y: 50 },
      { id: '記憶', label: 'ストレージ', icon: 'disk', x: 40, y: 85, down: true },
    ],
    forbid: [{ a: '入力', b: '出力', message: 'キーボードと画面を直につないでも、計算はされない' }],
  };

  it('ドラッグで引いた線で、順のつながり（path）と届くか（reach）が変わる', () => {
    const { state, errors } = run(sim('sim-connect', computer), [link('入力', '処理'), link('処理', '出力')]);
    expect(errors).toEqual([]);
    expect(holds(state, 'path 入力>処理>出力')).toBe(true);
    expect(holds(state, 'link 処理 入力')).toBe(true); // 向きの無い線
    expect(holds(state, 'reach 入力 出力')).toBe(true);
    expect(holds(state, 'link 入力 出力')).toBe(false);
    expect(holds(state, '!link 入力 出力 && path 入力>処理>出力')).toBe(true);
  });

  it('止まった機器は、動かすまでたどれない', () => {
    const { state } = run(sim('sim-connect', computer), [link('処理', '記憶')]);
    expect(holds(state, 'link 処理 記憶')).toBe(true);
    expect(holds(state, 'reach 処理 記憶')).toBe(false);
    const started = run(state, [start('記憶')]).state;
    expect(holds(started, 'reach 処理 記憶')).toBe(true);
    expect(holds(started, 'up 記憶')).toBe(true);
  });

  it('外した線は消える。誤った操作は状態を変えずに、画面の名前でエラーの文を返す', () => {
    const s0 = run(sim('sim-connect', computer), [link('入力', '処理')]).state;
    expect(holds(run(s0, [cut('処理', '入力')]).state, 'link 入力 処理')).toBe(false);
    for (const [a, said] of [
      [link('入力', '出力'), 'キーボードと画面を直に'],
      [link('入力', '処理'), '「キーボード」と「CPU」は、もうつながっている'],
      [link('入力', 'マウス'), '「マウス」という部品は無い'],
      [cut('出力', '記憶'), 'つながっていない'],
      [start('処理'), '「CPU」は、もう動いている'],
      [put('入力', '処理'), 'この画面ではできない操作'],
    ] as const) {
      const r = applyAction(s0, a);
      expect(r.error, JSON.stringify(a)).toContain(said);
      expect(r.state).toBe(s0);
    }
  });

  it('線を引く前に、つなげない理由が分かる（ドラッグの途中で示す）', () => {
    const s0 = sim('sim-connect', computer);
    expect(connectProblem(s0 as Extract<SimState, { type: 'connect' }>, '入力', '出力')).toContain('計算はされない');
    expect(connectProblem(s0 as Extract<SimState, { type: 'connect' }>, '入力', '処理')).toBeNull();
    expect(connectProblem(s0 as Extract<SimState, { type: 'connect' }>, '入力', '入力')).toContain('同じ部品');
  });

  it('向きのある線は、向きに沿ってだけたどる', () => {
    const s = run(sim('sim-connect', { ...computer, directed: true }), [link('入力', '処理')]).state;
    expect(holds(s, 'reach 入力 処理')).toBe(true);
    expect(holds(s, 'reach 処理 入力')).toBe(false);
  });
});

describe('並べる（sim-order）', () => {
  const pipeline = {
    parallel: true,
    items: [
      { id: 'build', label: '組み立て', minutes: 4 },
      { id: 'lint', label: '書き方の検査', minutes: 1 },
      { id: 'unit', label: '単体テスト', minutes: 3, needs: ['build'] },
      { id: 'deploy', label: '配布', minutes: 2, needs: ['unit', 'lint'] },
      { id: 'manual', label: '手で写す', minutes: 10, extra: true, stop: '人の手で写す所で、流れが止まる' },
    ],
  };

  it('段の並びで、順・同じ段・依存・時間・全て並べたかを判定する', () => {
    const s = run(sim('sim-order', pipeline), [arrange(['build', 'lint'], ['unit'], ['deploy'])]).state;
    expect(holds(s, 'seq build<unit<deploy')).toBe(true);
    expect(holds(s, 'with build lint')).toBe(true);
    expect(holds(s, 'deps && placed && !has manual')).toBe(true);
    expect(holds(s, 'time<=9')).toBe(true); // 4 + 3 + 2
    expect(holds(s, 'time<=8')).toBe(false);
    expect(holds(s, 'stages=3')).toBe(true);
  });

  it('先に要る物が前の段に無ければ deps を満たさない', () => {
    const s = run(sim('sim-order', pipeline), [arrange(['build', 'unit'], ['lint'], ['deploy'])]).state;
    expect(holds(s, 'deps')).toBe(false);
    expect(holds(s, 'placed')).toBe(true);
  });

  it('並べ直すと前の並びは消える。札の誤り・2 回・並行できない並びはエラー。空の段は詰める', () => {
    const s0 = sim('sim-order', pipeline);
    expect(holds(run(s0, [arrange(['build'], ['unit']), arrange(['lint'])]).state, 'has build')).toBe(false);
    expect(applyAction(s0, arrange(['build'], ['build'])).error).toContain('「組み立て」を 2 回並べた');
    expect(applyAction(s0, arrange(['build'], ['test'])).error).toContain('「test」という札は無い');
    const serial = sim('sim-order', { ...pipeline, parallel: false });
    expect(applyAction(serial, arrange(['build', 'lint'])).error).toContain('同じ段に 2 つは並べられない');
    expect(run(s0, [arrange(['build'], [], ['unit'])]).errors).toEqual([]);
  });

  it('初めの並びから始められる', () => {
    const s = sim('sim-order', { ...pipeline, initial: [['unit'], ['build']] });
    expect(holds(s, 'seq unit<build')).toBe(true);
  });

  it('流した時に止まる所: 先に要る物が済んでいない段か、流れに入れると止まる札の段。理由は画面の名前で言う', () => {
    const s0 = sim('sim-order', pipeline) as Extract<SimState, { type: 'order' }>;
    const at = (...stages: string[][]) => orderStop(run(s0, [arrange(...stages)]).state as typeof s0);
    expect(at(['build', 'lint'], ['unit'], ['deploy'])).toBeNull();
    expect(at(['unit'], ['build'])).toEqual({ stage: 0, item: 'unit', reason: '「単体テスト」には、先に「組み立て」が要る（まだ後の段にある）' });
    expect(at(['build', 'unit'])?.reason).toContain('同じ段で、まだ終わっていない');
    expect(at(['build'], ['unit'], ['deploy'])?.reason).toContain('「書き方の検査」が要る（まだ流れに無い）');
    expect(at(['build'], ['manual'], ['unit'])).toEqual({ stage: 1, item: 'manual', reason: '人の手で写す所で、流れが止まる' });
  });
});

describe('置く（sim-assign）', () => {
  const desk = {
    slots: [
      { id: '机', label: '作業机（メモリ）', capacity: 2, unit: '枚' },
      { id: '倉庫', label: '倉庫（ストレージ）' },
    ],
    items: [
      { id: '資料A', label: '今使う資料', size: 1, time: { 机: 1, 倉庫: 5 } },
      { id: '資料B', label: '次に使う資料', size: 1, time: { 机: 1, 倉庫: 5 } },
      { id: '図面', label: '大きな図面', size: 2, time: { 机: 1, 倉庫: 1 }, refuse: { 机: '図面は大きすぎて、机に広げると仕事ができない' } },
      { id: '読む', label: '読む権限', multi: true },
    ],
  };

  it('入れた枠・数・容量・時間・全て入れたかを判定する', () => {
    const s = run(sim('sim-assign', desk), [put('資料A', '机'), put('資料B', '机'), put('図面', '倉庫'), put('読む', '机'), put('読む', '倉庫')]).state;
    expect(holds(s, 'in 資料A=机 図面=倉庫')).toBe(true);
    expect(holds(s, 'count 机=3 && count 倉庫<=2')).toBe(true);
    expect(holds(s, 'fits && placed')).toBe(true);
    expect(holds(s, 'time<=3')).toBe(true); // 1 + 1 + 1
  });

  it('容量を超える・入らない枠・無い札や枠は、エラーで状態を変えない', () => {
    const s = run(sim('sim-assign', { ...desk, items: desk.items.map((i) => (i.id === '図面' ? { ...i, refuse: undefined } : i)) }), [put('資料A', '机'), put('資料B', '机')]).state;
    expect(applyAction(s, put('図面', '机')).error).toContain('「作業机（メモリ）」に入りきらない（容量 2枚、入れると 4枚）');
    expect(applyAction(s, put('資料C', '机')).error).toContain('「資料C」という札は無い');
    expect(applyAction(s, put('図面', '棚')).error).toContain('「棚」という枠は無い');
    expect(applyAction(s, take('図面')).error).toContain('どの枠にも入っていない');
    expect(applyAction(sim('sim-assign', desk), put('図面', '机')).error).toBe('図面は大きすぎて、机に広げると仕事ができない');
  });

  it('別の枠に入っている札を置くと、その枠から移る（容量は移した後で数える）。置き場へ戻すと出る', () => {
    const s = run(sim('sim-assign', desk), [put('資料A', '机'), put('資料B', '机'), put('資料A', '倉庫')]);
    expect(s.errors).toEqual([]);
    expect(holds(s.state, 'in 資料A=倉庫 && !in 資料A=机 && count 机=1')).toBe(true);
    // 机がいっぱいでも、机の中の札を机の別の所に置き直すのではなく、倉庫から机へ戻すのは 1 枚分
    expect(run(s.state, [put('資料A', '机')]).errors).toEqual([]);
    expect(holds(run(s.state, [take('資料A')]).state, 'placed 資料A')).toBe(false);
  });

  it('動かせない札（keep）は、初めの枠から動かさず、その理由で断る', () => {
    const s = sim('sim-assign', {
      slots: [{ id: 'music', label: '音楽' }, { id: 'sheet', label: '表計算' }],
      items: [{ id: 'm1', label: 'メモリ 1 番', keep: 'メモリ 1 番は、もう音楽が使っている' }, { id: 'm2', label: 'メモリ 2 番' }],
      initial: { m1: 'music' },
    });
    expect(holds(s, 'in m1=music')).toBe(true);
    expect(applyAction(s, put('m1', 'sheet')).error).toBe('メモリ 1 番は、もう音楽が使っている');
    expect(applyAction(s, take('m1')).error).toBe('メモリ 1 番は、もう音楽が使っている');
    expect(applyAction(s, put('m2', 'sheet')).error).toBeNull();
  });

  it('置き違えた札: 達成条件の in の式のうち、違う枠にある札', () => {
    const s = run(sim('sim-assign', desk), [put('資料A', '倉庫'), put('資料B', '机')]).state as Extract<SimState, { type: 'assign' }>;
    expect(misplaced(s, 'in 資料A=机 資料B=机 && count 机<=2')).toEqual(['資料A']);
    expect(misplaced(s, 'in 図面=倉庫')).toEqual(['図面']);
  });
});

describe('読み取って答える（sim-read）', () => {
  const setup = {
    panels: [{ kind: 'kv', title: 'サーバの情報', rows: [['OS', 'Linux 6.8'], ['配布物', 'Ubuntu 24.04']] }],
    questions: [{ id: 'os', prompt: 'OS は', options: ['Linux', 'Windows'] }, { id: '版', prompt: '配布物の版', options: ['24.04', '6.8'] }],
  };

  it('押した答えで判定する。答え直すと新しい答えになる。選べない値は断る', () => {
    const s = run(sim('sim-read', setup), [answer('os', 'windows'), answer('os', 'linux'), answer('版', '24.04')]).state;
    expect(holds(s, 'answered os=Linux 版=24.04')).toBe(true);
    expect(s.type === 'read' && s.answers.os).toBe('Linux');
    expect(applyAction(s, answer('os', 'macOS')).error).toContain('選べない');
  });

  it('問いには、押して選ぶ答えが 2 つ以上要る（文を打つ欄は作らない）', () => {
    expect(() => sim('sim-read', { ...setup, questions: [{ id: 'q', prompt: '版は' }] })).toThrow();
    expect(() => sim('sim-read', { ...setup, questions: [{ id: 'q', prompt: '版は', options: ['1'] }] })).toThrow();
  });
});

describe('setup と式の誤りは内容の誤りとして見つかる', () => {
  it('無い ID を指す setup・型の違う setup は作れない', () => {
    expect(() => createSim('sim-connect', { nodes: [{ id: 'a', label: 'A', x: 0, y: 0 }, { id: 'b', label: 'B', x: 1, y: 1 }], links: [['a', 'c']] })).toThrow('c が無い');
    expect(() => createSim('sim-read', { questions: [] })).toThrow();
    expect(() => createSim('sim-paint', {})).toThrow('知らない模擬環境');
    expect(() => createSim('sim-assign', { slots: [{ id: 's', label: 'S' }], items: [{ id: 'i', label: 'I', refuse: { t: 'no' } }] })).toThrow('refuse');
  });

  it('式の形の誤り・無い ID を exprProblems が示し、holds は投げる', () => {
    const s = createSim('sim-order', { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] });
    expect(exprProblems(s, 'seq a<b')).toEqual([]);
    expect(exprProblems(s, 'seq a<c').join()).toContain('札 c が無い');
    expect(exprProblems(s, 'link a b').join()).toContain('並べるの式は');
    expect(() => holds(s, 'paint a')).toThrow();
  });
});

describe('出来上がり（isSettled）', () => {
  it('札を全て並べた・入れた・全ての問いに答えた時だけ出来上がり。紛れ込ませた札は数えない', () => {
    const order = createSim('sim-order', { items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'x', label: 'X', extra: true }] });
    expect(isSettled(order)).toBe(false);
    expect(isSettled(run(order, [arrange(['a'], ['b'])]).state)).toBe(true);
    const read = createSim('sim-read', { panels: [{ kind: 'text', title: 't', body: 'b' }], questions: [{ id: 'q', prompt: 'p', options: ['1', '2'] }, { id: 'r', prompt: 'p', options: ['1', '2'] }] });
    expect(isSettled(run(read, [answer('q', '1')]).state)).toBe(false);
    expect(isSettled(run(read, [answer('q', '1'), answer('r', '2')]).state)).toBe(true);
    const connect = createSim('sim-connect', { nodes: [{ id: 'a', label: 'A', x: 0, y: 0 }, { id: 'b', label: 'B', x: 9, y: 9 }] });
    expect(isSettled(run(connect, [link('a', 'b')]).state)).toBe(false);
  });
});

describe('荷物を送る・結果を見せる情報', () => {
  const route = {
    nodes: [
      { id: 'pc', label: 'パソコン', x: 5, y: 50 },
      { id: 'router', label: 'ルータ', x: 30, y: 50 },
      { id: 'printer', label: 'プリンタ', x: 5, y: 90 },
      { id: 'isp', label: 'プロバイダ', x: 55, y: 50, down: true },
      { id: 'server', label: 'サーバ', x: 90, y: 50 },
    ],
    links: [['pc', 'router'], ['pc', 'printer'], ['isp', 'server']],
    sends: [{ from: 'pc', to: 'server', label: 'ping サーバ' }],
    panels: [{ kind: 'text', title: 'サーバの返事', body: 'ようこそ', when: 'sent pc server' }],
  };

  it('届かなければ、どこまで届いたかを画面の名前でエラーの文で返す。届けば sent を満たし、返事の情報が出る', () => {
    const s0 = createSim('sim-connect', route);
    expect(applyAction(s0, send('pc', 'server')).error).toBe('届かない: 「パソコン」から届くのは 「ルータ」・「プリンタ」まで。「サーバ」へ進めない');
    const fixed = run(s0, [link('router', 'isp'), start('isp'), send('pc', 'server')]);
    expect(fixed.errors).toEqual([]);
    expect(holds(fixed.state, 'sent pc server')).toBe(true);
    expect(shownPanels(fixed.state).map((p) => p.title)).toEqual(['サーバの返事']);
    expect(shownPanels(s0)).toEqual([]);
    // 線を外すと、前に届いた記録は消える（今の網で確かめ直す）。線を足す・機器を動かすだけなら、届いた道は残るので消えない
    expect(holds(run(fixed.state, [cut('router', 'isp')]).state, 'sent pc server')).toBe(false);
    expect(holds(run(fixed.state, [link('pc', 'server')]).state, 'sent pc server')).toBe(true);
  });

  it('荷物の道すじ: 届けば宛先までの最も短い道、届かなければ、届く所のうち宛先に最も近い部品まで', () => {
    const s0 = createSim('sim-connect', route) as Extract<SimState, { type: 'connect' }>;
    expect(sendRoute(s0, 'pc', 'server')).toEqual({ path: ['pc', 'router'], arrived: false });
    const fixed = run(s0, [link('router', 'isp'), start('isp')]).state as typeof s0;
    expect(sendRoute(fixed, 'pc', 'server')).toEqual({ path: ['pc', 'router', 'isp', 'server'], arrived: true });
    // 止まった機器は通らない
    const down = run(s0, [link('router', 'isp')]).state as typeof s0;
    expect(sendRoute(down, 'pc', 'server')).toEqual({ path: ['pc', 'router'], arrived: false });
  });

  it('情報の when の式の誤りは内容の誤り', () => {
    expect(() => createSim('sim-connect', { ...route, panels: [{ kind: 'text', title: 't', body: 'b', when: 'sent pc moon' }] })).toThrow('when');
  });
});

describe('操作を画面の名前で言う（記録・エラーの小窓・最後のヒントの検証）', () => {
  it('describeAction は画面の名前で、actionNames は最後のヒントに書くべき名前を返す', () => {
    const a = sim('sim-assign', { slots: [{ id: 'box', label: '箱（イメージ）' }], items: [{ id: 'app', label: '予約のアプリ' }] });
    expect(describeAction(a, put('app', 'box'))).toBe('「予約のアプリ」を「箱（イメージ）」に入れた');
    expect(actionNames(a, put('app', 'box'))).toEqual(['予約のアプリ', '箱（イメージ）']);
    const o = sim('sim-order', { items: [{ id: 'a', label: '取る' }, { id: 'b', label: '組む' }] });
    expect(describeAction(o, arrange(['a'], ['b']))).toBe('上から 「取る」 → 「組む」 の順に並べた');
    const c = sim('sim-connect', { nodes: [{ id: 'pc', label: 'パソコン', x: 0, y: 0 }, { id: 'srv', label: 'サーバ', x: 9, y: 9 }], sends: [{ from: 'pc', to: 'srv', label: 'ping サーバ' }] });
    expect(describeAction(c, link('pc', 'srv'))).toBe('「パソコン」から「サーバ」へ線を引いた');
    expect(actionNames(c, send('pc', 'srv'))).toEqual(['ping サーバ']);
  });
});

describe('置く: 枠が埋まった時の文', () => {
  it('枠に full の文があれば、容量を超える時はその文で返す', () => {
    const s = sim('sim-assign', {
      slots: [{ id: 'p80', label: '80', capacity: 1, full: 'bind: 80 番は使用中（Address already in use）' }, { id: 'p22', label: '22', capacity: 1 }],
      items: [{ id: 'web', label: 'Web', size: 1 }, { id: 'ssh', label: 'SSH', size: 1 }],
    });
    const r = run(s, [put('web', 'p80'), put('ssh', 'p80')]);
    expect(r.errors).toEqual(['bind: 80 番は使用中（Address already in use）']);
    expect(holds(r.state, 'in web=p80')).toBe(true);
    expect(holds(r.state, 'in ssh=p80')).toBe(false);
  });
});

describe('設定する（sim-config。作り直しの間だけ残す型）', () => {
  const set = (field: string, value: string): SimAction => ({ op: 'set', field, value });
  const office = { fields: [{ id: 'pc1', label: '1 台目' }, { id: 'pc2', label: '2 台目' }, { id: 'start', label: '始め' }, { id: 'end', label: '終わり' }] };

  it('欄の値を判定する。条件（requires）を満たさない値は断る', () => {
    const s = sim('sim-config', {
      fields: [
        { id: '修正', label: '指摘への対応', options: ['まだ', '直した'], value: 'まだ' },
        { id: '取り込み', label: '取り込み', options: ['まだ', '取り込む'], value: 'まだ', requires: [{ value: '取り込む', expr: 'field 修正=直した', message: '取り込めない' }] },
      ],
    });
    expect(applyAction(s, set('取り込み', '取り込む')).error).toBe('取り込めない');
    expect(holds(run(s, [set('修正', '直した'), set('取り込み', '取り込む')]).state, 'field 取り込み=取り込む')).toBe(true);
  });

  it('samenet と pool', () => {
    const s = sim('sim-config', office);
    expect(holds(run(s, [set('pc1', '192.168.10.11/24'), set('pc2', '192.168.10.12/24')]).state, 'samenet 192.168.10.1/24 pc1 pc2')).toBe(true);
    expect(holds(run(s, [set('pc1', '192.168.10.11/24'), set('pc2', '192.168.20.12/24')]).state, 'samenet 192.168.10.1/24 pc1 pc2')).toBe(false);
    const expr = 'pool start end in=192.168.1.0/24 size>=5 avoid=192.168.1.1,192.168.1.10';
    expect(holds(run(s, [set('start', '192.168.1.100'), set('end', '192.168.1.150')]).state, expr)).toBe(true);
    expect(holds(run(s, [set('start', '192.168.1.5'), set('end', '192.168.1.50')]).state, expr)).toBe(false);
  });
});
