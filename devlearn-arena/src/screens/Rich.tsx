import { termOf, wordOf } from '@/content/glossary';
import { parseRich } from '@/content/rich';
import { useSettings } from './settingsContext';
import './Rich.css';

const KANJI = /[々一-鿿]/;

/** 用語の語。ふりがなの設定が入っていれば、漢字の用語に読みを添える（docs/learning-design.md 8 章） */
function Word({ id, furigana }: { id: string; furigana: boolean }) {
  const word = wordOf(id);
  const reading = termOf(id)?.reading;
  if (!furigana || !reading || !KANJI.test(word)) return <>{word}</>;
  return <ruby>{word}<rt>{reading}</rt></ruby>;
}

/**
 * 本文（用語の印は語に、`...` は等幅に。複数の行の `...` は行を保った塊に）。
 * onTerm を渡すと用語は押せる語になり（下線）、押した語の要素も渡す（小窓をその近くに開くため）
 */
export function Rich({ text, onTerm }: { text: string; onTerm?: ((id: string, el: HTMLElement) => void) | undefined }) {
  const { furigana } = useSettings();
  return (
    <>
      {parseRich(text).map((p, i) => {
        if (p.kind === 'text') return <span key={i}>{p.text}</span>;
        // 複数の行にまたがる物（ヒアドキュメントで書くスクリプト）は、行を保った塊にする
        if (p.kind === 'code') return <code key={i} className={p.text.includes('\n') ? 'rich-code is-block' : 'rich-code'}>{p.text}</code>;
        return onTerm ? (
          <button key={i} type="button" className="rich-term" data-term={p.id} onClick={(e) => onTerm(p.id, e.currentTarget)}><Word id={p.id} furigana={furigana} /></button>
        ) : (
          <span key={i} className="rich-term" data-term={p.id}><Word id={p.id} furigana={furigana} /></span>
        );
      })}
    </>
  );
}
