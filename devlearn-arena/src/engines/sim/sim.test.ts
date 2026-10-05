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

describe('ネットワークの設定を判定する式（net の分野）', () => {
  const office = {
    fields: [
      { id: 'pc1', label: '1 台目' },
      { id: 'pc2', label: '2 台目' },
      { id: 'start', label: '配る範囲の始め' },
      { id: 'end', label: '配る範囲の終わり' },
    ],
  };

  it('samenet: 全てのアドレスが同じ網にあり、重ならず、網そのものと全体宛てのアドレスでない', () => {
    const s = sim('sim-config', office);
    const set = (a: string, b: string) => run(s, [`set pc1 ${a}`, `set pc2 ${b}`]).state;
    const ok = (st: SimState) => holds(st, 'samenet 192.168.10.1/24 pc1 pc2');
    expect(ok(set('192.168.10.11/24', '192.168.10.12/24'))).toBe(true);
    // 網の部分が違う・区切りが違う
    expect(ok(set('192.168.10.11/24', '192.168.20.12/24'))).toBe(false);
    expect(ok(set('192.168.10.11/24', '192.168.10.12/16'))).toBe(false);
    // 重なる（ルータとも）
    expect(ok(set('192.168.10.11/24', '192.168.10.11/24'))).toBe(false);
    expect(ok(set('192.168.10.1/24', '192.168.10.12/24'))).toBe(false);
    // 網そのもの・全体宛て・区切りが無い・読めない
    expect(ok(set('192.168.10.0/24', '192.168.10.12/24'))).toBe(false);
    expect(ok(set('192.168.10.255/24', '192.168.10.12/24'))).toBe(false);
    expect(ok(set('192.168.10.11', '192.168.10.12/24'))).toBe(false);
    expect(ok(set('192.168.10.300/24', '192.168.10.12/24'))).toBe(false);
    expect(ok(s)).toBe(false);
  });

  it('pool: 配る範囲が網の中にあり、数が足り、固定のアドレスと重ならない', () => {
    const s = sim('sim-config', office);
    const set = (a: string, b: string) => run(s, [`set start ${a}`, `set end ${b}`]).state;
    const expr = 'pool start end in=192.168.1.0/24 size>=5 avoid=192.168.1.1,192.168.1.10';
    expect(holds(set('192.168.1.100', '192.168.1.150'), expr)).toBe(true);
    expect(holds(set('192.168.1.100', '192.168.1.103'), expr)).toBe(false);
    expect(holds(set('192.168.1.5', '192.168.1.50'), expr)).toBe(false);
    expect(holds(set('192.168.1.150', '192.168.1.100'), expr)).toBe(false);
    expect(holds(set('192.168.2.100', '192.168.2.150'), expr)).toBe(false);
    expect(holds(set('192.168.1.0', '192.168.1.20'), expr)).toBe(false);
  });

  it('式の形の誤り（無い欄・読めない網）は内容の誤り', () => {
    const s = sim('sim-config', office);
    expect(exprProblems(s, 'samenet pc1 pc9')).not.toEqual([]);
    expect(exprProblems(s, 'samenet pc1')).not.toEqual([]);
    expect(exprProblems(s, 'pool start end in=10.0.0.0 size>=5')).not.toEqual([]);
    expect(exprProblems(s, 'pool start end in=10.0.0.0/8 size>=5')).toEqual([]);
  });
});

describe('割り振る: 枠が埋まった時の文', () => {
  it('枠に full の文があれば、容量を超える時はその文で返す', () => {
    const s = sim('sim-assign', {
      slots: [{ id: 'p80', label: '80', capacity: 1, full: 'bind: 80 番は使用中（Address already in use）' }, { id: 'p22', label: '22', capacity: 1 }],
      items: [{ id: 'web', label: 'Web', size: 1 }, { id: 'ssh', label: 'SSH', size: 1 }],
    });
    const r = run(s, ['put web p80', 'put ssh p80']);
    expect(r.errors).toEqual(['bind: 80 番は使用中（Address already in use）']);
    expect(holds(r.state, 'in web=p80')).toBe(true);
    expect(holds(r.state, 'in ssh=p80')).toBe(false);
  });
});

describe('設定する: 出来上がりの式（settle）', () => {
  it('settle があれば、その式を満たした時が出来上がり（表に行を足す設定でも、答えが合っていない時を知らせられる）', () => {
    const s = sim('sim-config', {
      tables: [{ id: 'r1', label: 'R1 の経路表', columns: [{ id: 'dest', label: '宛先' }, { id: 'via', label: '次' }], rows: [{ dest: '10.0.1.0/24', via: '直結' }] }],
      settle: 'rows r1>=2',
    });
    expect(isSettled(s)).toBe(false);
    expect(isSettled(run(s, ['add r1 dest=10.0.3.0/24 via=10.0.2.2']).state)).toBe(true);
  });

  it('settle の式の誤りは内容の誤り', () => {
    expect(() => sim('sim-config', { fields: [{ id: 'a', label: 'A' }], settle: 'rows nope>=1' })).toThrow(/settle/);
  });
});

describe('設定する: 値を選ぶ前に満たす条件（requires）', () => {
  const setup = {
    fields: [
      { id: '修正', label: '指摘への対応', options: ['まだ', '直した'], value: 'まだ' },
      {
        id: '取り込み', label: '取り込み', options: ['まだ', '取り込む'], value: 'まだ',
        requires: [{ value: '取り込む', expr: 'field 修正=直した', message: '取り込めない: 必須の検査が失敗している' }],
      },
    ],
  };

  it('条件を満たさない値は、その文で断り、状態を変えない。満たせば選べる', () => {
    const s = sim('sim-config', setup);
    const refused = applyStatement(s, 'set 取り込み 取り込む');
    expect(refused.error).toBe('取り込めない: 必須の検査が失敗している');
    expect(holds(refused.state, 'field 取り込み=まだ')).toBe(true);
    // 条件の無い値は、いつでも選べる
    expect(applyStatement(s, 'set 取り込み まだ').error).toBeNull();
    const fixed = run(s, ['set 修正 直した', 'set 取り込み 取り込む']);
    expect(fixed.errors).toEqual([]);
    expect(holds(fixed.state, 'field 取り込み=取り込む')).toBe(true);
  });

  it('条件の式の誤り・選べない値を指す条件は内容の誤り', () => {
    const bad = (requires: unknown) => () => sim('sim-config', { fields: [{ id: 'a', label: 'A', options: ['x', 'y'], requires }] });
    expect(bad([{ value: 'y', expr: 'field nope=1', message: 'no' }])).toThrow(/requires/);
    expect(bad([{ value: 'z', expr: 'field a=x', message: 'no' }])).toThrow(/requires/);
  });
});
