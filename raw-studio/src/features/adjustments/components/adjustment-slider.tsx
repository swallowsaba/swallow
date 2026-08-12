import * as React from 'react';
import { RotateCcw } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

export interface AdjustmentSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** The neutral value the reset button returns to. */
  defaultValue?: number;
  /** Fired continuously while dragging (for a live preview). */
  onChange: (value: number) => void;
  /** Fired once when the drag ends (commit a history entry here). */
  onCommit?: (value: number) => void;
  className?: string;
}

/**
 * The core adjustment control: a labelled slider with an editable numeric field
 * and a reset affordance. Live drags call `onChange`; releasing calls `onCommit`
 * so the editor can record exactly one undo step per adjustment.
 */
export function AdjustmentSlider({
  label,
  value,
  min,
  max,
  step = 1,
  defaultValue = 0,
  onChange,
  onCommit,
  className,
}: AdjustmentSliderProps): React.JSX.Element {
  const clamp = React.useCallback(
    (n: number) => Math.min(max, Math.max(min, n)),
    [min, max],
  );

  const handleInput = (raw: string) => {
    const parsed = Number(raw);
    if (!Number.isNaN(parsed)) {
      const next = clamp(parsed);
      onChange(next);
      onCommit?.(next);
    }
  };

  const reset = () => {
    onChange(defaultValue);
    onCommit?.(defaultValue);
  };

  const isModified = value !== defaultValue;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onDoubleClick={reset}
          className={cn(
            'text-xs font-medium',
            isModified ? 'text-foreground' : 'text-muted-foreground',
          )}
          title="Double-click to reset"
        >
          {label}
        </button>
        <div className="flex items-center gap-1">
          <input
            type="number"
            value={value}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              handleInput(e.target.value);
            }}
            className="h-6 w-14 rounded border border-input bg-transparent px-1 text-right text-xs tabular-nums focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <button
            type="button"
            onClick={reset}
            disabled={!isModified}
            aria-label={`Reset ${label}`}
            className="text-muted-foreground transition-opacity hover:text-foreground disabled:opacity-0"
          >
            <RotateCcw className="size-3" />
          </button>
        </div>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(vals) => {
          const next = vals[0];
          if (next !== undefined) onChange(next);
        }}
        onValueCommit={(vals) => {
          const next = vals[0];
          if (next !== undefined) onCommit?.(next);
        }}
      />
    </div>
  );
}
