import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Practice } from '@/content/schema';
import type { PracticeAttempt, PracticeSession } from '@/game/types';
import { PracticeStage } from '../PracticeStage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// 模擬環境の実戦は端末を使わない。端末の部品は jsdom で読み込めないので空にする
vi.mock('@xterm/xterm', () => ({ Terminal: class {} }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {} }));

/**
 * 画面で操作する模擬環境（docs/ui-design.md 7.1、REWORK-PRACTICE.txt）。
 * ドラッグ（置く・つなぐ・並べ替える）が操作になって模擬に届き、模擬の状態で手順が進む。文を打つ欄は無い。
 * 入らない・つなげない操作は、その場が赤くなって理由が出て、調べる小窓にもなる
 */

let root: Root | null = null;
let host: HTMLElement;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

function mount(practice: Practice, saved?: PracticeSession) {
  host = document.createElement('div');
  document.body.append(host);
  const right = document.createElement('div');
  const action = document.createElement('div');
  host.append(right, action);
  const sessions: PracticeSession[] = [];
  const finished: Omit<PracticeAttempt, 'at'>[] = [];
  root = createRoot(host.appendChild(document.createElement('div')));
  act(() => root?.render(
    <PracticeStage
      practice={practice}
      sessionId="test"
      saved={saved}
      onSave={(s) => sessions.push(s)}
      onFinish={(a) => finished.push(a)}
      onTerm={() => undefined}
      right={right}
      action={action}
      onBack={() => undefined}
    />,
  ));
  return { right, action, sessions, finished };
}

const $ = (sel: string): HTMLElement => {
  const el = host.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`${sel} が無い`);
  return el;
};
const click = (sel: string): void => act(() => $(sel).click());

/** 物を押さえて、受け口まで動かして放す（放した所の下にある物は to） */
function drag(fromSel: string, toSel: string): void {
  const from = $(fromSel);
  const to = $(toSel);
  // jsdom は座標から要素を引けない。放した所の下にある物を、受け口 to にする
  const before = Object.getOwnPropertyDescriptor(document, 'elementFromPoint');
  Object.defineProperty(document, 'elementFromPoint', { value: () => to, configurable: true });
  // jsdom には PointerEvent が無いので、同じ名前の MouseEvent で送る（React と窓の受け手は名前で受ける）
  act(() => {
    from.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0, clientX: 10, clientY: 10 }));
  });
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 60, clientY: 60 }));
  });
  act(() => {
    window.dispatchEvent(new MouseEvent('pointerup', { clientX: 60, clientY: 60 }));
  });
  if (before) Object.defineProperty(document, 'elementFromPoint', before);
  else delete (document as { elementFromPoint?: unknown }).elementFromPoint;
}

const key = (sel: string, k: string): void => act(() => {
  $(sel).dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
});

const connect: Practice = {
  mode: 'simulation',
  purpose: '計算機を組む',
  environment: 'sim-connect',
  setup: {
    nodes: [
      { id: '入力', label: 'キーボード', icon: 'keyboard', x: 10, y: 50 },
      { id: '処理', label: 'CPU', icon: 'cpu', x: 50, y: 50 },
      { id: '出力', label: '画面', icon: 'screen', x: 90, y: 50 },
    ],
    forbid: [{ a: '入力', b: '出力', message: 'キーボードと画面を直につないでも、計算はされない' }],
    sends: [{ from: '入力', to: '出力', label: '「2+3」を打つ' }],
  },
  steps: [
    { id: 'in', purpose: '入力を処理へ', check: { kind: 'sim', expr: 'link 入力 処理' }, afterward: 'つながった', hints: ['向き', '入力から', '「キーボード」から「CPU」へドラッグする。'], actions: [{ op: 'connect', a: '入力', b: '処理' }] },
    { id: 'out', purpose: '処理を出力へ', check: { kind: 'sim', expr: 'path 入力>処理>出力' }, afterward: '画面に出た', hints: ['向き', '処理から', '「CPU」から「画面」へドラッグする。'], actions: [{ op: 'connect', a: '処理', b: '出力' }] },
  ],
};

describe('模擬環境（つなぐ）の実戦', () => {
  it('部品から部品へドラッグすると線がつながり、光の粒が流れ、手順が進む。文を打つ欄は無い', () => {
    const { sessions } = mount(connect);
    expect($('[data-testid="sim-console"]').dataset.sim).toBe('connect');
    expect(host.querySelector('[data-testid="sim-console"] input, [data-testid="sim-console"] textarea')).toBeNull();
    drag('[data-node="入力"]', '[data-node="処理"]');
    expect(host.querySelectorAll('.sim-wire')).toHaveLength(1);
    expect(host.querySelectorAll('.sim-particle').length).toBeGreaterThan(0);
    expect($('[data-step="in"]').dataset.done).toBe('true');
    drag('[data-node="処理"]', '[data-node="出力"]');
    expect($('[data-step="out"]').dataset.done).toBe('true');
    expect(host.textContent).toContain('達成した');
    // 途中の状態を保存している（中断して開き直すと続きから）
    expect(sessions.at(-1)?.stepIndex).toBe(2);
  });

  it('つなげない組み合わせは線が引けず、理由が出て、エラー → 内容 → 原因候補 → ヒントの小窓も出る', () => {
    mount(connect);
    drag('[data-node="入力"]', '[data-node="出力"]');
    expect(host.querySelectorAll('.sim-wire')).toHaveLength(0);
    expect($('.sim-note.is-bad').textContent).toContain('計算はされない');
    expect($('[data-testid="practice-error"]').textContent).toContain('考えられる理由');
    expect($('[data-step="in"]').dataset.done).toBe('false');
  });

  it('送るボタンを押すと荷物が進み、届かなければ止まった所が赤く示される', () => {
    mount(connect);
    drag('[data-node="入力"]', '[data-node="処理"]');
    click('[data-send="入力>出力"]');
    expect(host.querySelector('.sim-packet.is-stuck')).not.toBeNull();
    expect(host.querySelector('.sim-node.is-stuck')?.textContent).toContain('CPU');
    drag('[data-node="処理"]', '[data-node="出力"]');
    click('[data-send="入力>出力"]');
    expect(host.querySelector('.sim-node.is-arrived')?.textContent).toContain('画面');
    expect($('.sim-note.is-good').textContent).toContain('キーボード → CPU → 画面');
  });

  it('線を押すと外れる。キーボードでも、部品で Enter を押し、つなぐ先で Enter を押すとつながる', () => {
    mount(connect);
    key('[data-node="入力"]', 'Enter');
    key('[data-node="処理"]', 'Enter');
    expect(host.querySelectorAll('.sim-wire')).toHaveLength(1);
    act(() => {
      $('[data-wire="入力-処理"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(host.querySelectorAll('.sim-wire')).toHaveLength(0);
  });

  it('保存した所から開き直すと、線と進みが戻る。初めに戻すと線は消える', () => {
    const first = mount(connect);
    drag('[data-node="入力"]', '[data-node="処理"]');
    const saved = first.sessions.at(-1);
    act(() => root?.unmount());
    host.remove();
    mount(connect, saved);
    expect($('[data-step="in"]').dataset.done).toBe('true');
    expect(host.querySelectorAll('.sim-wire')).toHaveLength(1);
    expect(host.textContent).toContain('中断した所から続ける');
    click('[data-testid="practice-reset"]');
    expect($('[data-step="in"]').dataset.done).toBe('false');
    expect(host.querySelectorAll('.sim-wire')).toHaveLength(0);
  });
});

describe('模擬環境（置く・読み取って答える）の実戦', () => {
  const assign: Practice = {
    mode: 'simulation',
    purpose: '仕分ける',
    environment: 'sim-assign',
    setup: {
      slots: [{ id: '机', label: '作業机', capacity: 1 }, { id: '倉庫', label: '倉庫' }],
      items: [{ id: '資料', label: '今使う資料', size: 1 }, { id: '図面', label: '大きな図面', size: 1 }],
    },
    steps: [{
      id: 'sort', purpose: '仕分ける', check: { kind: 'sim', expr: 'in 資料=机 図面=倉庫' }, afterward: '片付いた',
      hints: ['a', 'b', '「今使う資料」を「作業机」へ、「大きな図面」を「倉庫」へドラッグする。'],
      actions: [{ op: 'put', item: '資料', slot: '机' }, { op: 'put', item: '図面', slot: '倉庫' }],
    }],
  };

  it('札を枠へドラッグすると入り、枠が光る。全て入れたのに合っていなければ、置き違えた札が赤くなり「合っていない」の小窓が出る', () => {
    mount(assign);
    drag('[data-card="図面"]', '[data-slot="机"]');
    expect($('[data-slot="机"]').className).toContain('is-took');
    expect($('[data-slot="机"]').textContent).toContain('1 / 1');
    drag('[data-card="資料"]', '[data-slot="倉庫"]');
    expect($('[data-testid="practice-error"]').dataset.guide).toBe('not-yet');
    expect(host.querySelectorAll('.sim-card.is-wrong')).toHaveLength(2);
    // 枠から別の枠へドラッグすると移る。置き場へドラッグすると戻る
    drag('.sim-slot [data-card="図面"]', '[data-slot="倉庫"]');
    drag('.sim-slot [data-card="資料"]', '.sim-pool');
    expect(host.querySelector('.sim-pool [data-card="資料"]')).not.toBeNull();
    drag('[data-card="資料"]', '[data-slot="机"]');
    expect($('[data-step="sort"]').dataset.done).toBe('true');
  });

  it('入らない札は、枠が赤く光って理由が 1 行出る。エラーの小窓も出る', () => {
    mount(assign);
    drag('[data-card="資料"]', '[data-slot="机"]');
    drag('[data-card="図面"]', '[data-slot="机"]');
    expect($('[data-slot="机"]').className).toContain('is-refused');
    expect($('.sim-slot-why').textContent).toContain('入りきらない');
    expect(host.querySelector('[data-testid="practice-error"]')).not.toBeNull();
  });

  it('キーボードでも、札で Enter を押して持ち上げ、枠で Enter を押すと入る', () => {
    mount(assign);
    key('[data-card="資料"]', 'Enter');
    key('[data-slot="机"]', 'Enter');
    expect(host.querySelector('.sim-slot [data-card="資料"]')).not.toBeNull();
  });

  it('読み取って答える: 情報の行を押すと大きく出る。押した答えで判定する', () => {
    mount({
      mode: 'simulation',
      purpose: '読む',
      environment: 'sim-read',
      setup: {
        panels: [{ kind: 'kv', title: 'サーバの情報', rows: [['OS', 'Linux 6.8'], ['配布物', 'Ubuntu']] }],
        questions: [{ id: 'os', prompt: 'OS は', options: ['Linux', 'Windows'] }],
      },
      steps: [{ id: 'os', purpose: '答える', check: { kind: 'sim', expr: 'answered os=Linux' }, afterward: '読めた', hints: ['a', 'b', '「OS は」に「Linux」を選ぶ。'], actions: [{ op: 'answer', question: 'os', value: 'Linux' }] }],
    });
    expect(host.querySelector('[data-testid="sim-zoom"]')).toBeNull();
    click('[data-part="0:0"]');
    expect($('[data-testid="sim-zoom"]').textContent).toContain('Linux 6.8');
    expect($('[data-part="0:0"]').className).toContain('is-focus');
    click('[data-part="0:0"]');
    expect(host.querySelector('[data-testid="sim-zoom"]')).toBeNull();
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.sim-option')].find((b) => b.textContent === 'Windows')?.click());
    expect($('[data-testid="practice-error"]').dataset.guide).toBe('not-yet');
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.sim-option')].find((b) => b.textContent === 'Linux')?.click());
    expect($('[data-step="os"]').dataset.done).toBe('true');
  });
});

describe('模擬環境（並べる）の実戦', () => {
  const order = (unit?: string): Practice => ({
    mode: 'simulation',
    purpose: '流れを組む',
    environment: 'sim-order',
    setup: {
      items: [{ id: 'code', label: '書く', minutes: 8 }, { id: 'check', label: '検査', minutes: 2, needs: ['code'] }],
      ...(unit === undefined ? {} : { unit }),
    },
    steps: [{
      id: 'flow', purpose: '並べる', check: { kind: 'sim', expr: 'seq code<check' }, afterward: '並んだ',
      hints: ['a', 'b', '上から「書く」「検査」の順にドラッグして並べる。'], actions: [{ op: 'arrange', stages: [['code'], ['check']] }],
    }],
  });

  it('札をドラッグして並べると上から流れ、順が違えば止まった段が赤くなって理由が出る。並べ替えると最後まで流れる', () => {
    mount(order());
    drag('[data-card="check"]', '[data-drop="end"]');
    expect($('[data-testid="sim-stages"]').className).toContain('is-run');
    expect($('[data-stage="0"]').className).toContain('is-stop');
    expect($('.sim-stage-why').textContent).toContain('「検査」には、先に「書く」が要る');
    // 置き場の札を、並んだ札の上に落とすと、その前に入る
    drag('[data-card="code"]', '[data-stage="0"]');
    expect(host.querySelector('.sim-stage.is-stop')).toBeNull();
    expect($('.sim-stage-done').textContent).toContain('最後まで流れた');
    expect($('[data-step="flow"]').dataset.done).toBe('true');
  });

  it('時間の単位を書けば、札と合計の時間をその単位で出す。書かなければ分', () => {
    mount(order('時間'));
    drag('[data-card="code"]', '[data-drop="end"]');
    drag('[data-card="check"]', '[data-drop="end"]');
    expect([...host.querySelectorAll('.sim-card-time')].map((e) => e.textContent)).toEqual(['8 時間', '2 時間']);
    expect($('.sim-stage-done').textContent).toContain('10 時間');
    act(() => root?.unmount());
    root = null;
    host.remove();
    mount(order());
    drag('[data-card="code"]', '[data-drop="end"]');
    drag('[data-card="check"]', '[data-drop="end"]');
    expect($('.sim-stage-done').textContent).toContain('10 分');
  });
});
