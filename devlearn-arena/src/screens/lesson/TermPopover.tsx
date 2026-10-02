import { useEffect, useRef } from 'react';
import { termOf, wordOf } from '@/content/glossary';
import { Icon } from '@/ui/icons/Icon';
import { Rich } from '../Rich';

/**
 * 用語の小窓（docs/ui-design.md 7 章・docs/learning-design.md 9 章）。本文の用語を押すと、その近くに開く。
 * 簡単な説明・なぜ重要か・関連する技術（押すとその用語に切り替わる）。用語集でも同じ説明が見られる。
 */
export function TermPopover({ termId, at, onTerm, onClose, onGlossary }: {
  termId: string;
  /** 開く位置（レッスン画面の中の画素。押した語の左下） */
  at: { x: number; y: number };
  onTerm: (id: string) => void;
  onClose: () => void;
  onGlossary: (id: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const term = termOf(termId);

  // 開いたら小窓に焦点を移す（Esc で閉じ、押した語に戻れるように）
  useEffect(() => {
    ref.current?.focus();
  }, [termId]);

  if (!term) return null;
  return (
    <div
      ref={ref}
      className="term-pop"
      role="dialog"
      aria-label={`用語: ${term.word}`}
      tabIndex={-1}
      data-testid="term-popover"
      style={{ left: at.x, top: at.y }}
    >
      <header className="term-pop-head">
        <h2 className="term-pop-word">{term.word}</h2>
        {term.reading ? <span className="term-pop-reading">{term.reading}</span> : null}
        <button type="button" className="term-pop-close" aria-label="閉じる" onClick={onClose}><Icon name="close" size={14} /></button>
      </header>
      <p className="term-pop-text"><Rich text={term.plain} /></p>
      <h3 className="term-pop-heading">なぜ重要か</h3>
      <p className="term-pop-text is-sub"><Rich text={term.why} /></p>
      {term.related.length > 0 ? (
        <>
          <h3 className="term-pop-heading">関連する技術・用語</h3>
          <p className="term-pop-related">
            {term.related.map((r) => (
              <button key={r} type="button" className="term-pop-chip" onClick={() => onTerm(r)}>{wordOf(r)}</button>
            ))}
          </p>
        </>
      ) : null}
      <button type="button" className="term-pop-more" onClick={() => onGlossary(termId)}>
        <Icon name="glossary" size={14} />用語集で開く
      </button>
    </div>
  );
}
