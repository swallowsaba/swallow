import type { ReactNode } from 'react';

interface TagProps {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'muted';
}

/** 分類を示す小さなラベル。色だけに意味を持たせない（文字も必ず入れる）。 */
export function Tag({ children, tone = 'default' }: TagProps) {
  const toneClass =
    tone === 'accent'
      ? 'text-accent border-accent/50'
      : tone === 'muted'
        ? 'text-muted border-line'
        : 'text-ink border-line';
  return (
    <span className={`border px-1.5 py-0.5 font-mono text-[11px] leading-none ${toneClass}`}>
      {children}
    </span>
  );
}
