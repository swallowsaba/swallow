import * as React from 'react';
import { HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface HelpMarkProps {
  /** The explanation text shown in the popover. */
  text: string;
  className?: string;
}

/**
 * A small "?" affordance that shows an explanation on hover (desktop) or tap
 * (touch/mobile, where hover doesn't exist). Self-contained — no dependency on
 * the Radix tooltip's hover-only behavior — so it works the same way for mouse
 * and touch input.
 */
export function HelpMark({ text, className }: HelpMarkProps): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('keydown', onEscape);
    };
  }, [open]);

  return (
    <span ref={rootRef} className={cn('relative inline-flex shrink-0', className)}>
      <button
        type="button"
        aria-label="Help"
        aria-expanded={open}
        onMouseEnter={() => {
          setOpen(true);
        }}
        onMouseLeave={() => {
          setOpen(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="text-muted-foreground/70 transition-colors hover:text-foreground"
      >
        <HelpCircle className="size-3.5" />
      </button>
      {open ? (
        <span
          role="tooltip"
          className="pointer-events-none absolute right-0 top-full z-50 mt-1 w-48 rounded-md border border-border bg-popover px-2.5 py-1.5 text-[11px] leading-snug text-popover-foreground shadow-md"
        >
          {text}
        </span>
      ) : null}
    </span>
  );
}
