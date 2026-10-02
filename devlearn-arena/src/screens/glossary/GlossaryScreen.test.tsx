import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { entryOf } from '@/content/catalog';
import { TERMS, termOf, wordOf } from '@/content/glossary';
import { GlossaryScreen } from './GlossaryScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

function open(termId?: string) {
  const onClose = vi.fn();
  const onTerm = vi.fn();
  const onLesson = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<GlossaryScreen termId={termId} onClose={onClose} onTerm={onTerm} onLesson={onLesson} />));
  return { host, onClose, onTerm, onLesson };
}

const $ = <T extends Element = HTMLElement>(host: HTMLElement, sel: string): T => {
  const el = host.querySelector<T>(sel);
  if (!el) throw new Error(`見つからない: ${sel}`);
  return el;
};
const click = (el: Element): void => act(() => (el as HTMLElement).click());
const listed = (host: HTMLElement): string[] => [...host.querySelectorAll<HTMLElement>('.glossary-item')].map((b) => b.dataset.term ?? '');
const word = (host: HTMLElement): string => $(host, '.glossary-word').firstChild?.textContent ?? '';

describe('用語集（docs/learning-design.md 9 章）', () => {
  it('全ての用語を並べ、選んだ用語の簡単な説明・なぜ重要か・関連する用語・関係するレッスンを出す', () => {
    const { host } = open('path');
    expect(listed(host)).toHaveLength(TERMS.length);
    const t = termOf('path');
    expect(word(host)).toBe(t?.word);
    const text = $(host, '[data-testid="glossary-term"]').textContent ?? '';
    for (const h of ['簡単な説明', 'なぜ重要か', '関連する用語', '関係するレッスン']) expect(text).toContain(h);
    expect([...host.querySelectorAll('.glossary-related .lib-chip')].map((b) => b.textContent)).toEqual(t?.related.map(wordOf));
    expect([...host.querySelectorAll('.glossary-lessons .entry-link-title')].map((b) => b.textContent)).toEqual(t?.lessons.map((id) => entryOf(id)?.title));
  });

  it('関連する用語を押すとその用語へ移り、選んだ用語を道すじに写す', () => {
    const { host, onTerm } = open('path');
    const first = termOf('path')?.related[0] ?? '';
    click($(host, '.glossary-related .lib-chip'));
    expect(word(host)).toBe(termOf(first)?.word);
    expect(onTerm).toHaveBeenLastCalledWith(first);
  });

  it('関係するレッスンを押すと、そのレッスンの入口の札へ', () => {
    const { host, onLesson } = open('path');
    click($(host, '.glossary-lessons .entry-link'));
    expect(onLesson).toHaveBeenLastCalledWith(termOf('path')?.lessons[0]);
  });

  it('言葉・読み・説明で探せる。当たらなければ案内を出す', () => {
    const { host } = open();
    const input = $<HTMLInputElement>(host, '[data-testid="glossary-search"]');
    const search = (v: string): void => act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const withReading = TERMS.find((t) => t.reading);
    search(withReading?.reading ?? '');
    expect(listed(host)).toContain(withReading?.id);
    search('ありえない言葉xyz');
    expect(listed(host)).toEqual([]);
    expect($(host, '.lib-none').textContent).toContain('当てはまる用語が無い');
  });

  it('Esc で都市へ戻る', () => {
    const { onClose } = open();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
