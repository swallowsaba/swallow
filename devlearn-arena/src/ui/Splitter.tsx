import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

interface Props {
  /** 'vertical' は左右を分ける縦の仕切り、'horizontal' は上下を分ける横の仕切り */
  orientation: 'vertical' | 'horizontal';
  /** 手前側が占める割合(%) */
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label: string;
}

const STEP = 2;

/**
 * つまんで動かせる仕切り。
 * ドラッグだけでなく矢印キーでも動かせるようにする（細かい調整とキーボード操作のため）。
 */
export function Splitter({ orientation, value, onChange, min = 25, max = 80, label }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const vertical = orientation === 'vertical';

  const clamp = useCallback(
    (n: number) => Math.max(min, Math.min(max, n)),
    [min, max],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const parent = ref.current?.parentElement;
      if (!parent) return;
      event.currentTarget.setPointerCapture(event.pointerId);

      const move = (e: PointerEvent): void => {
        const rect = parent.getBoundingClientRect();
        const ratio = vertical
          ? ((e.clientX - rect.left) / rect.width) * 100
          : ((e.clientY - rect.top) / rect.height) * 100;
        onChange(clamp(Math.round(ratio)));
      };
      const up = (): void => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    },
    [vertical, onChange, clamp],
  );

  return (
    <div
      ref={ref}
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={Math.round(value)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={(e) => {
        const back = vertical ? 'ArrowLeft' : 'ArrowUp';
        const forward = vertical ? 'ArrowRight' : 'ArrowDown';
        if (e.key === back) {
          e.preventDefault();
          onChange(clamp(value - STEP));
        } else if (e.key === forward) {
          e.preventDefault();
          onChange(clamp(value + STEP));
        }
      }}
      className={`group flex shrink-0 items-center justify-center bg-[var(--wood)] ${
        vertical ? 'w-2.5 cursor-col-resize' : 'h-2.5 cursor-row-resize'
      }`}
      title={`${label}（ドラッグ、または矢印キーで調整）`}
    >
      <span
        aria-hidden
        className={`bg-[var(--cream-dark)] transition-colors group-hover:bg-gold ${
          vertical ? 'h-10 w-0.5' : 'h-0.5 w-10'
        }`}
      />
    </div>
  );
}
