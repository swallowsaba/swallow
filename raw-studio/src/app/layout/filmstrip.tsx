import * as React from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { activateItem, useLibraryStore } from '@/features/library';
import { useVirtualWindow } from '@/features/perf';

const ITEM_W = 104; // 96px thumb + 8px gap

export function Filmstrip(): React.JSX.Element {
  const items = useLibraryStore((s) => s.items);
  const activeId = useLibraryStore((s) => s.activeId);
  const { ref, range } = useVirtualWindow(items.length, ITEM_W, { horizontal: true });

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center px-3 text-xs text-muted-foreground">Filmstrip</div>
    );
  }

  const visible = items.slice(range.start, range.end);
  const leadPad = range.start * ITEM_W;
  const tailPad = (items.length - range.end) * ITEM_W;

  return (
    <div ref={ref} className="h-full overflow-x-auto overflow-y-hidden">
      <div className="flex h-full items-center gap-2 p-2" style={{ paddingLeft: leadPad + 8, paddingRight: tailPad + 8 }}>
        {visible.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.status === 'ready') void activateItem(item.id);
            }}
            title={item.fileName}
            className={cn(
              'relative h-16 w-24 shrink-0 overflow-hidden rounded border bg-muted/30',
              item.id === activeId ? 'border-primary ring-1 ring-primary' : 'border-border',
            )}
          >
            {item.status === 'ready' && item.thumbUrl ? (
              <img
                src={item.thumbUrl}
                alt={item.fileName}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : item.status === 'error' ? (
              <span className="grid h-full w-full place-items-center text-destructive">
                <AlertCircle className="size-4" />
              </span>
            ) : (
              <span className="grid h-full w-full place-items-center text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
