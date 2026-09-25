import { useState } from 'react';
import { segmentTerms, type Term } from '@/content/glossary';
import { useT } from '@/i18n/useT';
import { MiniDiagram } from './MiniDiagram';
import { HUD } from './theme';

/**
 * 用語に下線を引いて、その場で説明を出す（REWORK 5-2 / 5-3）。
 *
 * 学習者は用語を 1 つも知らない前提。だから札の文章の中で、
 * 辞書に載っている語には下線を引き、マウスを乗せると
 * 「言い換え・街での例え・小さな図解」が浮かぶ。
 * 「なぜ」を押さなくても、目の前で読める所に置く。
 */

/** 浮かぶ説明。語の真下に出す */
function Tip({ term }: { term: Term }) {
  const t = useT();
  return (
    <span
      role="tooltip"
      data-testid={`term-tip-${term.term}`}
      className="absolute left-0 top-full z-50 mt-1 block w-64 rounded-md p-2.5 text-left"
      style={{
        background: HUD.panel,
        border: `1px solid ${HUD.lineStrong}`,
        boxShadow: HUD.shadow,
        backdropFilter: 'blur(8px)',
      }}
    >
      <span className="block text-[13px] font-bold" style={{ color: HUD.text }}>
        {term.term}
      </span>
      <span className="mt-1 block text-[12px] leading-relaxed" style={{ color: HUD.soft }}>
        {term.plain}
      </span>
      <span className="mt-1.5 block text-[12px] leading-relaxed" style={{ color: HUD.accentText }}>
        {t('term.analogy', { text: term.analogy })}
      </span>
      <span className="mt-1.5 block">
        <MiniDiagram id={term.diagram} />
      </span>
    </span>
  );
}

/** 下線付きの語 1 つ */
function Marked({ term, text, tip }: { term: Term; text: string; tip: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className="relative inline-block"
      data-term={term.term}
      onMouseEnter={() => {
        setOpen(true);
      }}
      onMouseLeave={() => {
        setOpen(false);
      }}
      onFocus={() => {
        setOpen(true);
      }}
      onBlur={() => {
        setOpen(false);
      }}
      tabIndex={0}
      style={{
        textDecoration: 'underline',
        textDecorationStyle: 'dotted',
        textUnderlineOffset: '3px',
        textDecorationColor: HUD.accent,
        cursor: 'help',
      }}
    >
      {text}
      {tip && open ? <Tip term={term} /> : null}
    </span>
  );
}

/**
 * 文章を出す。辞書に載っている語だけに下線が付く。
 * `tip` を false にすると下線だけを引く（切り詰められる行では、浮かぶ説明が隠れてしまうため）。
 */
export function TermText({ text, tip = true }: { text: string; tip?: boolean }) {
  return (
    <>
      {segmentTerms(text).map((piece, i) =>
        piece.term === undefined ? (
          <span key={`${String(i)}-plain`}>{piece.text}</span>
        ) : (
          <Marked key={`${String(i)}-${piece.term.term}`} term={piece.term} text={piece.text} tip={tip} />
        ),
      )}
    </>
  );
}
