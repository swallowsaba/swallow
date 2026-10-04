import { describe, expect, it } from 'vitest';
import { applyStatement, createSim, exprProblems, holds, isSettled, orderStatement, shownPanels, type SimEnvironmentId } from './sim';
import type { SimState } from './types';

/** 文を順に与える。誤りがあれば、その文を返す */
function run(state: SimState, lines: string[]): { state: SimState; errors: string[] } {
  const errors: string[] = [];
  let s = state;
  for (const l of lines) {
    const r = applyStatement(s, l);
    if (r.error) errors.push(r.error);
    s = r.state;
  }
  return { state: s, errors };
}

const sim = (env: SimEnvironmentId, setup: unknown): SimState => createSim(env, setup);

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

  it('つないだ線で、順のつながり（path）と届くか（reach）が変わる', () => {
    const { state, errors } = run(sim('sim-connect', computer), ['connect 入力 処理', 'connect 処理 出力']);
    expect(errors).toEqual([]);
    expect(holds(state, 'path 入力>処理>出力')).toBe(true);
    expect(holds(state, 'link 処理 入力')).toBe(true); // 向きの無い線
    expect(holds(state, 'reach 入力 出力')).toBe(true);
    expect(holds(state, 'link 入力 出力')).toBe(false);
    expect(holds(state, '!link 入力 出力 && path 入力>処理>出力')).toBe(true);
  });

  it('止まった機器は、動かすまでたどれない', () => {
    const { state } = run(sim('sim-connect', computer), ['connect 処理 記憶']);
    expect(holds(state, 'link 処理 記憶')).toBe(true);
    expect(holds(state, 'reach 処理 記憶')).toBe(false);
    const started = run(state, ['start 記憶']).state;
    expect(holds(started, 'reach 処理 記憶')).toBe(true);
    expect(holds(started, 'up 記憶')).toBe(true);
  });

  it('切った線は消える。誤った操作は状態を変えずにエラーの文を返す', () => {
    const s0 = run(sim('sim-connect', computer), ['connect 入力 処理']).state;
    expect(holds(run(s0, ['cut 処理 入力']).state, 'link 入力 処理')).toBe(false);
    for (const [line, said] of [
      ['connect 入力 出力', 'キーボードと画面を直に'],
      ['connect 入力 処理', 'もうつながっている'],
      ['connect 入力 マウス', '「マウス」という部品は無い'],
      ['cut 出力 記憶', 'つながっていない'],
      ['start 処理', 'もう動いている'],
      ['put 入力 処理', '使えない操作: put'],
      ['connect 入力', '書き方'],
    ] as const) {
      const r = applyStatement(s0, line);
      expect(r.error, line).toContain(said);
      expect(r.state).toBe(s0);
    }
  });

  it('向きのある線は、向きに沿ってだけたどる', () => {
    const s = run(sim('sim-connect', { ...computer, directed: true }), ['connect 入力 処理']).state;
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
      { id: 'manual', label: '手で写す', minutes: 10, extra: true },
    ],
  };

  it('空白で次の段、, で同じ段。順・依存・時間・全て並べたかを判定する', () => {
    const s = run(sim('sim-order', pipeline), ['order build,lint unit deploy']).state;
    expect(holds(s, 'seq build<unit<deploy')).toBe(true);
    expect(holds(s, 'with build lint')).toBe(true);
    expect(holds(s, 'deps && placed && !has manual')).toBe(true);
    expect(holds(s, 'time<=9')).toBe(true); // 4 + 3 + 2
    expect(holds(s, 'time<=8')).toBe(false);
    expect(holds(s, 'stages=3')).toBe(true);
  });

  it('先に要る物が前の段に無ければ deps を満たさない', () => {
    const s = run(sim('sim-order', pipeline), ['order build,unit lint deploy']).state;
    expect(holds(s, 'deps')).toBe(false);
    expect(holds(s, 'placed')).toBe(true);
  });

  it('並べ直すと前の並びは消える。札の誤り・2 回・並行できない並びはエラー', () => {
    const s0 = sim('sim-order', pipeline);
    expect(holds(run(s0, ['order build unit', 'order lint']).state, 'has build')).toBe(false);
    expect(applyStatement(s0, 'order build build').error).toContain('2 回並べた');
    expect(applyStatement(s0, 'order build test').error).toContain('「test」という札は無い');
    const serial = sim('sim-order', { ...pipeline, parallel: false });
    expect(applyStatement(serial, 'order build,lint').error).toContain('同じ段に 2 つは並べられない');
  });

  it('並びを操作の文に戻せる。初めの並びから始められる', () => {
    expect(orderStatement([['build', 'lint'], [], ['unit']])).toBe('order build,lint unit');
    const s = sim('sim-order', { ...pipeline, initial: 'unit build' });
    expect(holds(s, 'seq unit<build')).toBe(true);
  });
});

describe('割り振る（sim-assign）', () => {
  const desk = {
    slots: [
      { id: '机', label: '作業机（メモリ）', capacity: 2, unit: '枚' },
      { id: '倉庫', label: '倉庫（ストレージ）' },
    ],
    items: [
      { id: '資料A', label: '今使う資料', size: 1, time: { 机: 1, 倉庫: 5 } },
      { id: '資料B', label: '今使う資料', size: 1, time: { 机: 1, 倉庫: 5 } },
      { id: '図面', label: '大きな図面', size: 2, time: { 机: 1, 倉庫: 1 } },
      { id: '読む', label: '読む権限', multi: true },
    ],
  };

  it('入れた枠・数・容量・時間・全て入れたかを判定する', () => {
    const s = run(sim('sim-assign', desk), ['put 資料A 机', 'put 資料B 机', 'put 図面 倉庫', 'put 読む 机', 'put 読む 倉庫']).state;
    expect(holds(s, 'in 資料A=机 図面=倉庫')).toBe(true);
    expect(holds(s, 'count 机=3 && count 倉庫<=2')).toBe(true);
    expect(holds(s, 'fits && placed')).toBe(true);
    expect(holds(s, 'time<=3')).toBe(true); // 1 + 1 + 1
  });

  it('容量を超える・別の枠に入っている札を入れる・無い札や枠は、エラーで状態を変えない', () => {
    const s = run(sim('sim-assign', desk), ['put 資料A 机', 'put 資料B 机']).state;
    expect(applyStatement(s, 'put 図面 机').error).toContain('入りきらない（容量 2枚、入れると 4枚）');
    expect(applyStatement(s, 'put 資料A 倉庫').error).toContain('もう「机」に入っている');
    expect(applyStatement(s, 'put 資料C 机').error).toContain('「資料C」という札は無い');
    expect(applyStatement(s, 'put 図面 棚').error).toContain('「棚」という枠は無い');
    expect(applyStatement(s, 'take 図面').error).toContain('どの枠にも入っていない');
  });

  it('出すと枠が空き、別の枠へ入れ直せる', () => {
    const s = run(sim('sim-assign', desk), ['put 資料A 机', 'take 資料A', 'put 資料A 倉庫']).state;
    expect(holds(s, 'in 資料A=倉庫 && !in 資料A=机')).toBe(true);
  });
});

describe('設定する（sim-config）', () => {
  const setup = {
    fields: [
      { id: '文字コード', label: '読む文字コード', options: ['Shift_JIS', 'UTF-8', 'EUC-JP'], value: 'Shift_JIS' },
      { id: 'pc1', label: 'PC1 のアドレス' },
    ],
    tables: [{ id: 'rules', label: '規則', columns: [{ id: 'action', label: '動作', options: ['allow', 'deny'] }, { id: 'port', label: 'ポート' }] }],
  };

  it('欄の値と表の行を判定する。選べる値は大小を問わず、決めた綴りで入る', () => {
    const s = run(sim('sim-config', setup), ['set 文字コード utf-8', 'set pc1 192.168.10.11/24', 'add rules action=ALLOW port=80', 'add rules action=deny port=22']).state;
    expect(holds(s, 'field 文字コード=UTF-8 pc1=192.168.10.11/24')).toBe(true);
    expect(s.type === 'config' && s.fields['文字コード']).toBe('UTF-8');
    expect(holds(s, 'row rules action=allow port=80 && rows rules=2')).toBe(true);
    const deleted = run(s, ['del rules 1']).state;
    expect(holds(deleted, 'row rules port=80')).toBe(false);
  });

  it('選べない値・無い欄・無い列・番号の誤りはエラー', () => {
    const s = sim('sim-config', setup);
    expect(applyStatement(s, 'set 文字コード ASCII').error).toContain('選べない（選べる値: Shift_JIS・UTF-8・EUC-JP）');
    expect(applyStatement(s, 'set mtu 1500').error).toContain('「mtu」という欄は無い');
    expect(applyStatement(s, 'add rules from=any').error).toContain('列=値 の形');
    expect(applyStatement(s, 'del rules 1').error).toContain('行の番号');
  });
});

describe('読み取って答える（sim-read）', () => {
  const setup = {
    panels: [{ kind: 'kv', title: 'サーバの情報', rows: [['OS', 'Linux 6.8'], ['配布物', 'Ubuntu 24.04']] }],
    questions: [{ id: 'os', prompt: 'OS は', options: ['Linux', 'Windows'] }, { id: '版', prompt: '配布物の版' }],
  };

  it('答えを判定する。答え直すと新しい答えになる', () => {
    const s = run(sim('sim-read', setup), ['answer os windows', 'answer os linux', 'answer 版 24.04']).state;
    expect(holds(s, 'answered os=Linux 版=24.04')).toBe(true);
    expect(applyStatement(s, 'answer os macOS').error).toContain('選べない');
  });
});

describe('setup と式の誤りは内容の誤りとして見つかる', () => {
  it('無い ID を指す setup・型の違う setup は作れない', () => {
    expect(() => createSim('sim-connect', { nodes: [{ id: 'a', label: 'A', x: 0, y: 0 }, { id: 'b', label: 'B', x: 1, y: 1 }], links: [['a', 'c']] })).toThrow('c が無い');
    expect(() => createSim('sim-read', { questions: [] })).toThrow();
    expect(() => createSim('sim-paint', {})).toThrow('知らない模擬環境');
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
    expect(isSettled(run(order, ['order a b']).state)).toBe(true);
    const read = createSim('sim-read', { panels: [{ kind: 'text', title: 't', body: 'b' }], questions: [{ id: 'q', prompt: 'p' }, { id: 'r', prompt: 'p' }] });
    expect(isSettled(run(read, ['answer q 1']).state)).toBe(false);
    expect(isSettled(run(read, ['answer q 1', 'answer r 2']).state)).toBe(true);
    const connect = createSim('sim-connect', { nodes: [{ id: 'a', label: 'A', x: 0, y: 0 }, { id: 'b', label: 'B', x: 9, y: 9 }] });
    expect(isSettled(run(connect, ['connect a b']).state)).toBe(false);
  });
});

describe('荷物を送る・結果を見せる情報・設定の出来上がり', () => {
  const route = {
    nodes: [
      { id: 'pc', label: 'パソコン', x: 5, y: 50 },
      { id: 'router', label: 'ルータ', x: 30, y: 50 },
      { id: 'isp', label: 'プロバイダ', x: 55, y: 50, down: true },
      { id: 'server', label: 'サーバ', x: 90, y: 50 },
    ],
    links: [['pc', 'router'], ['isp', 'server']],
    sends: [{ from: 'pc', to: 'server', label: 'パソコンからサーバへ送る' }],
    panels: [{ kind: 'text', title: 'サーバの返事', body: 'ようこそ', when: 'sent pc server' }],
  };

  it('届かなければ、どこまで届いたかをエラーの文で返す。届けば sent を満たし、返事の情報が出る', () => {
    const s0 = createSim('sim-connect', route);
    expect(applyStatement(s0, 'send pc server').error).toBe('届かない: 「pc」から届くのは 「router」まで。「server」へ進めない');
    const fixed = run(s0, ['connect router isp', 'start isp', 'send pc server']);
    expect(fixed.errors).toEqual([]);
    expect(holds(fixed.state, 'sent pc server')).toBe(true);
    expect(shownPanels(fixed.state).map((p) => p.title)).toEqual(['サーバの返事']);
    expect(shownPanels(s0)).toEqual([]);
    // 線を外すと、前に届いた記録は消える（今の網で確かめ直す）。線を足す・機器を動かすだけなら、届いた道は残るので消えない
    expect(holds(run(fixed.state, ['cut router isp']).state, 'sent pc server')).toBe(false);
    expect(holds(run(fixed.state, ['connect pc server']).state, 'sent pc server')).toBe(true);
  });

  it('情報の when の式の誤りは内容の誤り', () => {
    expect(() => createSim('sim-connect', { ...route, panels: [{ kind: 'text', title: 't', body: 'b', when: 'sent pc moon' }] })).toThrow('when');
  });

  it('設定する: 全ての欄を初めの値から変えたら出来上がり', () => {
    const s = createSim('sim-config', { fields: [{ id: 'enc', label: '文字コード', options: ['Shift_JIS', 'UTF-8'], value: 'Shift_JIS' }] });
    expect(isSettled(s)).toBe(false);
    expect(isSettled(run(s, ['set enc UTF-8']).state)).toBe(true);
  });
});
