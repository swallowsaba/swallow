import type { ReactNode } from 'react';

type Tone = 'accent' | 'muted' | 'ok' | 'warn' | 'bad';

interface BadgeProps {
  children: ReactNode;
  tone?: Tone;
  size?: 'sm' | 'md';
}

const toneClass: Record<Tone, string> = {
  accent: 'border-accent/70 text-accent',
  muted: 'border-line text-muted',
  ok: 'border-[var(--c-ok)]/60 text-[var(--c-ok)]',
  warn: 'border-[var(--c-warn)]/60 text-[var(--c-warn)]',
  bad: 'border-[var(--c-bad)]/60 text-[var(--c-bad)]',
};

/** 種別ラベル。色だけに意味を持たせず、必ず文字を入れる。 */
export function Badge({ children, tone = 'muted', size = 'md' }: BadgeProps) {
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';
  return (
    <span
      className={`inline-flex items-center gap-1 border font-mono font-medium uppercase tracking-wide ${sizeClass} ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}
