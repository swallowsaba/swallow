import * as React from 'react';
import { Camera, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  selectHistoryRows,
  selectSnapshots,
  useEditorStore,
} from '@/features/editor';

export function HistoryPanel(): React.JSX.Element {
  const rows = useEditorStore(selectHistoryRows);
  const snapshots = useEditorStore(selectSnapshots);
  const jumpToHistory = useEditorStore((s) => s.jumpToHistory);
  const addSnapshot = useEditorStore((s) => s.addSnapshot);
  const restoreSnapshot = useEditorStore((s) => s.restoreSnapshot);
  const removeSnapshot = useEditorStore((s) => s.removeSnapshot);
  const hasImage = useEditorStore((s) => s.image !== null);

  if (!hasImage) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-xs text-muted-foreground">
        Open an image to see its history.
      </div>
    );
  }

  // newest first
  const ordered = [...rows].reverse();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 px-3 py-2">
        <Camera className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Snapshots
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto h-6 px-2 text-[11px]"
          onClick={() => {
            addSnapshot(`Snapshot ${String(snapshots.length + 1)}`);
          }}
        >
          Add
        </Button>
      </div>

      <div className="max-h-40 overflow-y-auto px-1">
        {snapshots.length === 0 ? (
          <div className="px-3 pb-2 text-[11px] text-muted-foreground">No snapshots yet.</div>
        ) : (
          snapshots.map((snap) => (
            <div key={snap.id} className="group flex items-center gap-1 rounded px-2 py-1 hover:bg-accent">
              <button
                type="button"
                className="flex-1 truncate text-left text-sm"
                onClick={() => {
                  restoreSnapshot(snap.id);
                }}
                title={`Restore "${snap.name}"`}
              >
                {snap.name}
              </button>
              <button
                type="button"
                aria-label="Delete snapshot"
                onClick={() => {
                  removeSnapshot(snap.id);
                }}
                className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
              >
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      <Separator />

      <div className="flex items-center gap-2 px-3 py-2">
        <Clock className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          History
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        {ordered.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => {
              jumpToHistory(row.id);
            }}
            className={cn(
              'block w-full truncate rounded px-2 py-1 text-left text-sm',
              row.active ? 'bg-primary/15 font-medium text-foreground' : 'hover:bg-accent',
            )}
          >
            {row.label}
          </button>
        ))}
      </div>
    </div>
  );
}
