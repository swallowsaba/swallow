import * as React from 'react';
import { Copy, Star, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Preset } from '@/types';

export interface PresetItemProps {
  preset: Preset;
  disabled: boolean;
  onPreview: (preset: Preset) => void;
  onClearPreview: () => void;
  onApply: (preset: Preset) => void;
  onToggleFavorite: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, name: string) => void;
}

export function PresetItem(props: PresetItemProps): React.JSX.Element {
  const { preset, disabled } = props;
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(preset.name);

  const commitRename = () => {
    setEditing(false);
    if (draft.trim() && draft !== preset.name) props.onRename(preset.id, draft);
    else setDraft(preset.name);
  };

  return (
    <div
      className={cn(
        'group flex items-center gap-1 rounded px-2 py-1 text-sm',
        disabled ? 'opacity-60' : 'hover:bg-accent',
      )}
      onMouseEnter={() => {
        if (!disabled) props.onPreview(preset);
      }}
      onMouseLeave={props.onClearPreview}
    >
      <button
        type="button"
        aria-label={preset.favorite ? 'Unfavorite' : 'Favorite'}
        onClick={() => {
          props.onToggleFavorite(preset.id);
        }}
        className={cn(
          'shrink-0 transition-colors',
          preset.favorite ? 'text-yellow-400' : 'text-muted-foreground hover:text-foreground',
        )}
      >
        <Star className="size-3.5" fill={preset.favorite ? 'currentColor' : 'none'} />
      </button>

      {editing ? (
        <input
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
          }}
          onBlur={commitRename}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitRename();
            if (e.key === 'Escape') {
              setDraft(preset.name);
              setEditing(false);
            }
          }}
          className="h-6 flex-1 rounded border border-input bg-transparent px-1 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            props.onApply(preset);
          }}
          onDoubleClick={() => {
            if (!preset.builtin) setEditing(true);
          }}
          className="flex-1 truncate text-left"
          title={disabled ? 'Open an image first' : `Apply "${preset.name}"`}
        >
          {preset.name}
        </button>
      )}

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
        <button
          type="button"
          aria-label="Duplicate"
          onClick={() => {
            props.onDuplicate(preset.id);
          }}
          className="text-muted-foreground hover:text-foreground"
        >
          <Copy className="size-3.5" />
        </button>
        {!preset.builtin ? (
          <button
            type="button"
            aria-label="Delete"
            onClick={() => {
              props.onRemove(preset.id);
            }}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
