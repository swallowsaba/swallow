import { useId, type ReactNode } from 'react';
import { lookup, segment, type Concept } from '@/engines/lesson/glossary';

interface TermProps {
  /** 用語集の語（別名でもよい） */
  term: string;
  /** 画面に出す文字。省けば term をそのまま出す */
  children?: ReactNode;
}

/**
 * 専門用語に点線の下線を引き、マウスを乗せる（キーボードなら焦点を当てる）と平易な説明を出す。
 * 説明は用語集（intro.concepts と同じ辞書）から引くので、どの画面でも同じ説明になる。
 * 用語集に無い語は、ただの文字として出す。
 */
export function Term({ term, children }: TermProps) {
  const concept = lookup(term);
  if (concept === undefined) return <>{children ?? term}</>;
  return <TermLabel concept={concept}>{children ?? term}</TermLabel>;
}

function TermLabel({ concept, children }: { concept: Concept; children: ReactNode }) {
  const id = useId();
  return (
    <span className="group relative inline">
      <span
        tabIndex={0}
        aria-describedby={id}
        className="cursor-help underline decoration-[var(--gold-dark)] decoration-dotted decoration-2 underline-offset-4 outline-none focus-visible:bg-[var(--gold)]/30"
      >
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-0 z-50 mb-1 w-max max-w-[18rem] border-2 border-wood-dark bg-cream px-3 py-2 text-left text-xs font-normal leading-relaxed text-ink opacity-0 shadow-md transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        <span className="block font-extrabold">{concept.term}</span>
        {concept.plain}
      </span>
    </span>
  );
}

/**
 * 文章の中の専門用語に、自動で <Term> を付けて出す。
 * 同じ語は最初の1回だけ下線を引く。
 */
export function Glossed({ text }: { text: string }) {
  return (
    <>
      {segment(text).map((part, i) =>
        part.concept ? (
          <TermLabel key={i} concept={part.concept}>
            {part.text}
          </TermLabel>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}
