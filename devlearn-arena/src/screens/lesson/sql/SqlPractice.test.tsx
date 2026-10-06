import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Practice } from '@/content/schema';
import type { PracticeAttempt, PracticeSession } from '@/game/types';
import { PracticeStage } from '../PracticeStage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// SQL の実戦は端末を使わない。端末の部品は jsdom で読み込めないので空にする
vi.mock('@xterm/xterm', () => ({ Terminal: class {} }));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class {} }));

/**
 * ブラウザ内 SQL の実戦（docs/ui-design.md 7.1: SQL の入力欄と、結果の表。書いて「実行」）。
 * 書いた SQL がブラウザ内の SQLite で動き、結果の表が出て、DB の状態で手順が進む。SQLite の誤りは調べる小窓になる
 */

let root: Root | null = null;
let host: HTMLElement;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
});

const practice: Practice = {
  mode: 'sql',
  purpose: '東京の会員の名前を取り出し、3 番を大阪へ移す',
  environment: 'sql-sqlite',
  setup: { sql: "CREATE TABLE members (id INTEGER PRIMARY KEY, name TEXT, city TEXT); INSERT INTO members VALUES (1, '青木', '東京'), (2, '石田', '大阪'), (3, '上野', '東京');" },
  steps: [
    {
      id: 'move', purpose: '3 番を大阪へ', check: { kind: 'sql', query: 'SELECT city FROM members WHERE id = 3', equals: '大阪' },
      afterward: '3 番が大阪になった', hints: ['a', 'b', "`UPDATE members SET city = '大阪' WHERE id = 3` を実行する。"],
    },
  ],
};

/** DB が開くまで待つ（SQLite の本体を読む） */
async function mount(saved?: PracticeSession) {
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
  await vi.waitFor(() => {
    if (($('[data-testid="sql-input"]') as HTMLTextAreaElement).disabled) throw new Error('DB がまだ開いていない');
  });
  return { sessions, finished };
}

const $ = (sel: string): HTMLElement => {
  const el = host.querySelector<HTMLElement>(sel);
  if (!el) throw new Error(`${sel} が無い`);
  return el;
};

function runSql(sql: string): void {
  const input = $('[data-testid="sql-input"]') as HTMLTextAreaElement;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(input, sql);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  act(() => $('[data-testid="sql-run"]').click());
}

describe('ブラウザ内 SQL の実戦', () => {
  it('開くと表の形（表の名前と列）を示す。SELECT の結果は表で出て、DB は変わらないので手順は進まない', async () => {
    await mount();
    expect($('[data-testid="sql-tables"]').textContent).toContain('members（id, name, city）');
    runSql("SELECT name FROM members WHERE city = '東京'");
    const table = $('[data-testid="sql-result"]');
    expect([...table.querySelectorAll('td')].map((td) => td.textContent)).toEqual(['青木', '上野']);
    expect(host.textContent).toContain('2 行');
    expect($('[data-step="move"]').dataset.done).toBe('false');
  });

  it('行を変える文は変わった行の数を示し、DB の状態で手順が進む', async () => {
    const { sessions } = await mount();
    runSql("UPDATE members SET city = '大阪' WHERE id = 3");
    expect(host.textContent).toContain('1 行が変わった');
    expect($('[data-step="move"]').dataset.done).toBe('true');
    expect(host.textContent).toContain('達成した');
    expect(sessions.at(-1)?.stepIndex).toBe(1);
  });

  it('SQLite の誤りは、そのままの文と、エラー → 内容 → 原因候補 → ヒントの小窓で出す', async () => {
    await mount();
    runSql("UPDATE members SET town = '大阪' WHERE id = 3");
    expect($('[data-testid="sql-log"]').textContent).toContain('no such column: town');
    expect($('[data-testid="practice-error"]').textContent).toContain('考えられる理由');
    expect($('[data-step="move"]').dataset.done).toBe('false');
  });

  it('取り出すだけの手順は、SQL で調べて答える欄に答える。違えば「合っていない」と知らせる', async () => {
    const read: Practice = { ...practice, steps: [{ id: 'tokyo', purpose: '東京の人数を答える', check: { kind: 'answer', equals: '2' }, afterward: '2 人', hints: ['a', 'b', '`c` と答える。'] }] };
    host = document.createElement('div');
    document.body.append(host);
    const right = document.createElement('div');
    host.append(right);
    root = createRoot(host.appendChild(document.createElement('div')));
    act(() => root?.render(
      <PracticeStage practice={read} sessionId="t" saved={undefined} onSave={() => undefined} onFinish={() => undefined} onTerm={() => undefined} right={right} action={null} onBack={() => undefined} />,
    ));
    await vi.waitFor(() => {
      if (($('[data-testid="sql-input"]') as HTMLTextAreaElement).disabled) throw new Error('DB がまだ開いていない');
    });
    const answer = (text: string): void => {
      const input = $('[data-testid="practice-answer"] input') as HTMLInputElement;
      act(() => {
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, text);
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => input.form?.requestSubmit());
    };
    expect($('[data-testid="practice-answer"]').textContent).toContain('SQL で調べて答える');
    answer('3');
    expect($('[data-testid="practice-error"]').textContent).toContain('考えられる理由');
    answer('2');
    expect($('[data-step="tokyo"]').dataset.done).toBe('true');
  });

  it('保存した所から開き直すと、実行した文を初めから実行し直し、DB と記録と進みが戻る。初めに戻すと DB も戻る', async () => {
    const first = await mount();
    runSql("UPDATE members SET city = '大阪' WHERE id = 3");
    const saved = first.sessions.at(-1);
    act(() => root?.unmount());
    host.remove();
    await mount(saved);
    expect($('[data-step="move"]').dataset.done).toBe('true');
    expect($('[data-testid="sql-log"]').textContent).toContain("UPDATE members SET city = '大阪' WHERE id = 3");
    runSql('SELECT city FROM members WHERE id = 3');
    expect([...host.querySelectorAll('[data-testid="sql-result"] td')].at(-1)?.textContent).toBe('大阪');
    act(() => $('[data-testid="practice-reset"]').click());
    await vi.waitFor(() => {
      if (($('[data-testid="sql-input"]') as HTMLTextAreaElement).disabled) throw new Error('DB がまだ開いていない');
    });
    expect($('[data-step="move"]').dataset.done).toBe('false');
    runSql('SELECT city FROM members WHERE id = 3');
    expect([...host.querySelectorAll('[data-testid="sql-result"] td')].at(-1)?.textContent).toBe('東京');
  });
});
