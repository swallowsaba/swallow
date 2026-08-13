import * as React from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Download, Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Preset, PresetCategory } from '@/types';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { selectFilteredPresets, usePresetStore } from '../model/preset-store';
import { PresetItem } from './preset-item';
import { useT } from '@/i18n';
import type { TranslationKey } from '@/i18n';

const CATEGORY_ORDER: readonly PresetCategory[] = [
  'user',
  'portrait',
  'landscape',
  'night',
  'vintage',
  'film',
  'cinematic',
  'street',
  'wedding',
  'travel',
  'bw',
];

const CATEGORY_KEY: Record<PresetCategory, TranslationKey> = {
  user: 'presets.category.user',
  portrait: 'presets.category.portrait',
  landscape: 'presets.category.landscape',
  night: 'presets.category.night',
  vintage: 'presets.category.vintage',
  film: 'presets.category.film',
  cinematic: 'presets.category.cinematic',
  street: 'presets.category.street',
  wedding: 'presets.category.wedding',
  travel: 'presets.category.travel',
  bw: 'presets.category.bw',
};

export function PresetsPanel(): React.JSX.Element {
  const t = useT();
  const query = usePresetStore((s) => s.query);
  const setQuery = usePresetStore((s) => s.setQuery);
  // selectFilteredPresets builds a new array on every call while a search
  // query is active. `filter()` keeps the same Preset object references
  // though, so a shallow comparison correctly treats "same elements" as
  // "unchanged" and avoids the useSyncExternalStore infinite-loop pitfall.
  const filtered = usePresetStore(useShallow(selectFilteredPresets));
  const toggleFavorite = usePresetStore((s) => s.toggleFavorite);
  const duplicate = usePresetStore((s) => s.duplicate);
  const remove = usePresetStore((s) => s.remove);
  const rename = usePresetStore((s) => s.rename);
  const createFromAdjustments = usePresetStore((s) => s.createFromAdjustments);
  const importJson = usePresetStore((s) => s.importJson);
  const exportJson = usePresetStore((s) => s.exportJson);

  const currentEdit = useEditorStore(selectCurrentEdit);
  const setPreview = useEditorStore((s) => s.setPreview);
  const clearPreview = useEditorStore((s) => s.clearPreview);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);

  const disabled = !currentEdit;
  const importRef = React.useRef<HTMLInputElement>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [newName, setNewName] = React.useState('');
  const [importMsg, setImportMsg] = React.useState<string | null>(null);

  const favorites = filtered.filter((p) => p.favorite);
  const byCategory = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: filtered.filter((p) => p.category === cat),
  })).filter((g) => g.items.length > 0);

  const handleApply = (preset: Preset) => {
    clearPreview();
    commitAdjustments(preset.adjustments, `Preset: ${preset.name}`);
  };
  const handlePreview = (preset: Preset) => {
    setPreview(preset.adjustments);
  };

  const itemProps = (preset: Preset) => ({
    preset,
    disabled,
    onPreview: handlePreview,
    onClearPreview: clearPreview,
    onApply: handleApply,
    onToggleFavorite: toggleFavorite,
    onDuplicate: duplicate,
    onRemove: remove,
    onRename: rename,
  });

  const handleCreate = () => {
    if (currentEdit) createFromAdjustments(newName, 'user', currentEdit.adjustments);
    setNewName('');
    setCreateOpen(false);
  };

  const handleExport = () => {
    const json = exportJson();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'raw-studio-presets.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (file: File) => {
    const text = await file.text();
    const { added, error } = importJson(text);
    setImportMsg(error ?? `Imported ${String(added)} preset${added === 1 ? '' : 's'}.`);
    window.setTimeout(() => {
      setImportMsg(null);
    }, 4000);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1 p-2">
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          placeholder={t('presets.searchPlaceholder')}
          className="h-7 text-xs"
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label={t('presets.createFromCurrent')}
          disabled={disabled}
          onClick={() => {
            setCreateOpen(true);
          }}
        >
          <Plus />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label={t('presets.import')}
          onClick={() => importRef.current?.click()}
        >
          <Upload />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0"
          aria-label={t('presets.export')}
          onClick={handleExport}
        >
          <Download />
        </Button>
      </div>

      {importMsg ? (
        <div className="px-3 pb-1 text-[11px] text-muted-foreground">{importMsg}</div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-1 pb-3">
        {favorites.length > 0 ? (
          <section className="mb-2">
            <h4 className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t('presets.favorites')}
            </h4>
            {favorites.map((p) => (
              <PresetItem key={`fav-${p.id}`} {...itemProps(p)} />
            ))}
          </section>
        ) : null}

        {byCategory.map((group) => (
          <section key={group.category} className="mb-2">
            <h4 className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t(CATEGORY_KEY[group.category])}
            </h4>
            {group.items.map((p) => (
              <PresetItem key={p.id} {...itemProps(p)} />
            ))}
          </section>
        ))}

        {filtered.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted-foreground">{t('presets.noMatch')}</div>
        ) : null}
      </div>

      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleImportFile(file);
          e.target.value = '';
        }}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('presets.createDialogTitle')}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
            }}
            placeholder={t('presets.namePlaceholder')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreate();
            }}
          />
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCreateOpen(false);
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleCreate} disabled={!newName.trim()}>
              {t('presets.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
