import * as React from 'react';
import { AlertCircle, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { activateItem } from '../model/import';
import { useLibraryStore } from '../model/library-store';

export function LibraryGrid(): React.JSX.Element {
  const items = useLibraryStore((s) => s.items);
  const activeId = useLibraryStore((s) => s.activeId);
  const remove = useLibraryStore((s) => s.remove);

  return (
    <div className="grid grid-cols-2 gap-2 p-2">
      {items.map((item) => (
        <div
          key={item.id}
          className={cn(
            'group relative aspect-square overflow-hidden rounded-md border bg-muted/30',
            item.id === activeId ? 'border-primary ring-1 ring-primary' : 'border-border',
          )}
        >
          <button
            type="button"
            className="h-full w-full"
            onClick={() => {
              if (item.status === 'ready') void activateItem(item.id);
            }}
            title={item.fileName}
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
                <AlertCircle className="size-5" />
              </span>
            ) : (
              <span className="grid h-full w-full place-items-center text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
              </span>
            )}
          </button>

          <span className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 text-[10px] text-white">
            {item.fileName}
          </span>

          <button
            type="button"
            onClick={() => {
              remove(item.id);
            }}
            aria-label="Remove"
            className="absolute right-1 top-1 hidden rounded bg-black/60 p-0.5 text-white group-hover:block"
          >
            <X className="size-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
