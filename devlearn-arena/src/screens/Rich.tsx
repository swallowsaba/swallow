import { wordOf } from '@/content/glossary';
import { parseRich } from '@/content/rich';
import './Rich.css';

/** 本文（用語の印は語に、`...` は等幅に） */
export function Rich({ text, onTerm }: { text: string; onTerm?: (id: string) => void }) {
  return (
    <>
      {parseRich(text).map((p, i) => {
        if (p.kind === 'text') return <span key={i}>{p.text}</span>;
        if (p.kind === 'code') return <code key={i} className="rich-code">{p.text}</code>;
        return onTerm ? (
          <button key={i} type="button" className="rich-term" onClick={() => onTerm(p.id)}>{wordOf(p.id)}</button>
        ) : (
          <span key={i} className="rich-term">{wordOf(p.id)}</span>
        );
      })}
    </>
  );
}
