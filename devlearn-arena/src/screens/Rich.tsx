import { wordOf } from '@/content/glossary';
import { parseRich } from '@/content/rich';
import './Rich.css';

/**
 * 本文（用語の印は語に、`...` は等幅に）。
 * onTerm を渡すと用語は押せる語になり（下線）、押した語の要素も渡す（小窓をその近くに開くため）
 */
export function Rich({ text, onTerm }: { text: string; onTerm?: ((id: string, el: HTMLElement) => void) | undefined }) {
  return (
    <>
      {parseRich(text).map((p, i) => {
        if (p.kind === 'text') return <span key={i}>{p.text}</span>;
        if (p.kind === 'code') return <code key={i} className="rich-code">{p.text}</code>;
        return onTerm ? (
          <button key={i} type="button" className="rich-term" data-term={p.id} onClick={(e) => onTerm(p.id, e.currentTarget)}>{wordOf(p.id)}</button>
        ) : (
          <span key={i} className="rich-term">{wordOf(p.id)}</span>
        );
      })}
    </>
  );
}
