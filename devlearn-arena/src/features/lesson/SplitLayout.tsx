import type { ReactNode } from 'react';

interface Props {
  terminalLabel: string;
  visualLabel: string;
  terminal: ReactNode;
  visual: ReactNode;
}

/**
 * 左：ターミナル / 右：ライブ図解。
 * P1 以降で中身が入る。ここで枠と比率を固定しておく（狭い画面では縦積み）。
 */
export function SplitLayout({ terminalLabel, visualLabel, terminal, visual }: Props) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <section aria-label={terminalLabel} className="flex min-h-[320px] flex-col border border-wood-dark bg-[var(--wood-dark)]">
        <h2 className="border-b border-wood-dark px-3 py-1.5 font-mono text-[11px] text-ink-soft">
          {terminalLabel}
        </h2>
        <div className="flex-1">{terminal}</div>
      </section>
      <section aria-label={visualLabel} className="flex min-h-[320px] flex-col border border-wood-dark bg-cream">
        <h2 className="border-b border-wood-dark px-3 py-1.5 font-mono text-[11px] text-ink-soft">
          {visualLabel}
        </h2>
        <div className="flex-1">{visual}</div>
      </section>
    </div>
  );
}
