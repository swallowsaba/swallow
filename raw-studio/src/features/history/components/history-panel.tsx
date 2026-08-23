import * as React from 'react';
import { Camera, Check, Clock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  selectSnapshots,
  useEditorStore,
  useHistoryRows,
} from '@/features/editor';
import { useT } from '@/i18n';

export function HistoryPanel(): React.JSX.Element {
  const t = useT();
  const rows = useHistoryRows();
  const snapshots = useEditorStore(selectSnapshots);
  const jumpToHistory = useEditorStore((s) => s.jumpToHistory);
  const addSnapshot = useEditorStore((s) => s.addSnapshot);
  const restoreSnapshot = useEditorStore((s) => s.restoreSnapshot);
  const removeSnapshot = useEditorStore((s) => s.removeSnapshot);
  const renameSnapshot = useEditorStore((s) => s.renameSnapshot);
  const hasImage = useEditorStore((s) => s.image !== null);

  const [newName, setNewName] = React.useState('');
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState('');

  const commitAdd = () => {
    const name = newName.trim() || `Snapshot ${String(snapshots.length + 1)}`;
    addSnapshot(name);
    setNewName('');
  };
  const commitRename = () => {
    if (editingId) renameSnapshot(editingId, editingName);
    setEditingId(null);
    setEditingName('');
  };

  if (!hasImage) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-xs text-muted-foreground">
        {t('history.openImagePrompt')}
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
          {t('history.snapshots')}
        </span>
      </div>

      <div className="flex gap-1 px-2 pb-1">
        <Input
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitAdd();
          }}
          placeholder={t('history.snapshotNamePlaceholder')}
          className="h-6 flex-1 text-[11px]"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={commitAdd}
        >
          {t('common.add')}
        </Button>
      </div>

      <div className="max-h-40 overflow-y-auto px-1">
        {snapshots.length === 0 ? (
          <div className="px-3 pb-2 text-[11px] text-muted-foreground">{t('history.noSnapshots')}</div>
        ) : (
          snapshots.map((snap) => (
            <div key={snap.id} className="group flex items-center gap-1 rounded px-2 py-1 hover:bg-accent">
              {editingId === snap.id ? (
                <>
                  <Input
                    autoFocus
                    value={editingName}
                    onChange={(e) => {
                      setEditingName(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      else if (e.key === 'Escape') {
                        setEditingId(null);
                      }
                    }}
                    onBlur={commitRename}
                    className="h-6 flex-1 text-[13px]"
                  />
                  <button
                    type="button"
                    aria-label={t('common.add')}
                    onClick={commitRename}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <Check className="size-3.5" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="flex-1 truncate text-left text-sm"
                    onClick={() => {
                      restoreSnapshot(snap.id);
                    }}
                    onDoubleClick={() => {
                      setEditingId(snap.id);
                      setEditingName(snap.name);
                    }}
                    title={`Restore "${snap.name}"`}
                  >
                    {snap.name}
                  </button>
                  <button
                    type="button"
                    aria-label={t('history.deleteSnapshot')}
                    onClick={() => {
                      removeSnapshot(snap.id);
                    }}
                    className="text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </>
              )}
            </div>
          ))
        )}
      </div>

      <Separator />

      <div className="flex items-center gap-2 px-3 py-2">
        <Clock className="size-3.5 text-muted-foreground" />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {t('history.title')}
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
