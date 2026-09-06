import type { ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  /** 角を落とした板にする */
  cut?: boolean;
  glow?: boolean;
  className?: string;
}

export function Panel({ children, bevel = true, = false, className = '' }: PanelProps) {
  return (
    <div
      className={`border border-wood-dark bg-cream ${bevel ? 'cut' : ''} ${? 'glow' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
