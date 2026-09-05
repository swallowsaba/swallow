import type { ReactNode } from 'react';

interface PanelProps {
  children: ReactNode;
  /** 角を落とした板にする */
  cut?: boolean;
  glow?: boolean;
  className?: string;
}

export function Panel({ children, cut = true, glow = false, className = '' }: PanelProps) {
  return (
    <div
      className={`border border-line bg-panel ${cut ? 'cut' : ''} ${glow ? 'glow' : ''} ${className}`}
    >
      {children}
    </div>
  );
}
