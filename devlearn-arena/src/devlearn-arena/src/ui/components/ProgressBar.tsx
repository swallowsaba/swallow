interface ProgressBarProps {
  ratio: number;
  label: string;
  valueText: string;
  size?: 'sm' | 'md' | 'lg';
}

const heights = { sm: 'h-1.5', md: 'h-3', lg: 'h-5' };

export function ProgressBar({ ratio, label, valueText, size = 'md' }: ProgressBarProps) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <div
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      aria-valuetext={valueText}
      className={`w-full border border-wood-dark bg-[var(--wood-dark)] ${heights[size]}`}
    >
      <div
        className="h-full bg-gold transition-[width] duration-700"
        style={{ width: `${String(pct)}%`, boxShadow: '0 0 24px -4px var(--gold-dark)' }}
      />
    </div>
  );
}
