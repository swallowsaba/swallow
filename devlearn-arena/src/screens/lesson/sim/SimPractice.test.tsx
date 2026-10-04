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
 * 画面で操作する模擬環境（docs/ui-design.md 7.1、docs/decisions.md D-16）。
 * 押した操作が操作の文になって模擬に届き、模擬の状態で手順が進む。文を入れても同じ。誤りは調べる小窓になる
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

function typeStatement(line: string): void {
  const input = $('[data-testid="sim-command"]') as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, line);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => input.form?.requestSubmit());
}

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
  },
  steps: [
    { id: 'in', purpose: '入力を処理へ', check: { kind: 'sim', expr: 'link 入力 処理' }, afterward: 'つながった', hints: ['向き', '入力から', '`connect 入力 処理` と入れる。'] },
    { id: 'out', purpose: '処理を出力へ', check: { kind: 'sim', expr: 'path 入力>処理>出力' }, afterward: '画面に出た', hints: ['向き', '処理から', '`connect 処理 出力` と入れる。'] },
  ],
};

describe('模擬環境（つなぐ）の実戦', () => {
  it('部品を 2 つ押すと線がつながり、操作の文が残り、手順が進む。文を入れても同じ', () => {
    const { sessions } = mount(connect);
    expect($('[data-testid="sim-console"]').dataset.sim).toBe('connect');
    click('[data-node="入力"]');
    click('[data-node="処理"]');
    expect($('[data-testid="sim-log"]').textContent).toContain('connect 入力 処理');
    expect($('[data-step="in"]').dataset.done).toBe('true');
    typeStatement('connect 処理 出力');
    expect($('[data-step="out"]').dataset.done).toBe('true');
    expect(host.textContent).toContain('達成した');
    // 途中の状態を保存している（中断して開き直すと続きから）
    expect(sessions.at(-1)?.stepIndex).toBe(2);
  });

  it('誤った操作は状態を変えず、エラー → 内容 → 原因候補 → ヒントの小窓を出す', () => {
    mount(connect);
    typeStatement('connect 入力 マウス');
    expect($('[data-testid="practice-error"]').textContent).toContain('考えられる理由');
    expect($('[data-testid="sim-log"]').textContent).toContain('「マウス」という部品は無い');
    expect($('[data-step="in"]').dataset.done).toBe('false');
  });

  it('保存した所から開き直すと、線と記録と進みが戻る。初めに戻すと線は消える', () => {
    const first = mount(connect);
    typeStatement('connect 入力 処理');
    const saved = first.sessions.at(-1);
    act(() => root?.unmount());
    host.remove();
    mount(connect, saved);
    expect($('[data-step="in"]').dataset.done).toBe('true');
    expect($('[data-testid="sim-log"]').textContent).toContain('connect 入力 処理');
    click('[data-testid="practice-reset"]');
    expect($('[data-step="in"]').dataset.done).toBe('false');
    expect(host.querySelectorAll('.sim-wire')).toHaveLength(0);
  });
});

describe('模擬環境（割り振る・読み取って答える）の実戦', () => {
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
      hints: ['a', 'b', '`put 資料 机` と `put 図面 倉庫` を入れる。'],
    }],
  };

  it('札を選んで枠を押すと入る。全て入れたのに合っていなければ「合っていない」と調べる小窓が出る', () => {
    mount(assign);
    click('[data-card="図面"]');
    click('[data-slot="机"]');
    expect($('[data-testid="sim-log"]').textContent).toContain('put 図面 机');
    click('[data-card="資料"]');
    click('[data-slot="倉庫"]');
    expect($('[data-testid="practice-error"]').dataset.guide).toBe('not-yet');
    // 枠の中の札を押すと置き場に戻る。入れ直すと達成
    click('.sim-slot [data-card="図面"]');
    click('.sim-slot [data-card="資料"]');
    click('[data-card="資料"]');
    click('[data-slot="机"]');
    click('[data-card="図面"]');
    click('[data-slot="倉庫"]');
    expect($('[data-step="sort"]').dataset.done).toBe('true');
  });

  it('容量を超える札は入らず、エラーの小窓が出る', () => {
    mount(assign);
    typeStatement('put 資料 机');
    typeStatement('put 図面 机');
    expect($('[data-testid="sim-log"]').textContent).toContain('入りきらない');
    expect(host.querySelector('[data-testid="practice-error"]')).not.toBeNull();
  });

  it('読み取って答える: 情報の表と問いが出て、選んだ答えで判定する', () => {
    mount({
      mode: 'simulation',
      purpose: '読む',
      environment: 'sim-read',
      setup: {
        panels: [{ kind: 'kv', title: 'サーバの情報', rows: [['OS', 'Linux 6.8']] }],
        questions: [{ id: 'os', prompt: 'OS は', options: ['Linux', 'Windows'] }],
      },
      steps: [{ id: 'os', purpose: '答える', check: { kind: 'sim', expr: 'answered os=Linux' }, afterward: '読めた', hints: ['a', 'b', '`answer os Linux` と入れる。'] }],
    });
    expect(host.textContent).toContain('Linux 6.8');
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.sim-option')].find((b) => b.textContent === 'Windows')?.click());
    expect($('[data-testid="practice-error"]').dataset.guide).toBe('not-yet');
    act(() => [...host.querySelectorAll<HTMLButtonElement>('.sim-option')].find((b) => b.textContent === 'Linux')?.click());
    expect($('[data-step="os"]').dataset.done).toBe('true');
  });
});
