interface MeterProps {
  ratio: number;
  label: string;
  /** 数値の読み上げ用 */
  valueText: string;
}

export function Meter({ ratio, label, valueText }: MeterProps) {
  const pct = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  return (
    <div
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      aria-valuetext={valueText}
      className="h-1.5 w-full bg-line"
    >
      <div className="h-full bg-accent transition-[width] duration-500" style={{ width: `${String(pct)}%` }} />
    </div>
  );
}
