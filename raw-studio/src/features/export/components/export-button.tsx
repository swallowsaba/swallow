import * as React from 'react';
import { Download, Loader2, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { useViewerStore } from '@/features/viewer';
import {
  DEFAULT_EXPORT_OPTIONS,
  type ExportFormat,
  type ResizeMode,
} from '../model/export-options';
import { downloadBlob, exportImage } from '../model/export';
import { useT } from '@/i18n';
import { EXPORT_PRESETS, applyExportPreset, matchExportPreset } from '../model/export-presets';
import { batchOptionsFor, dedupePresetIds } from '../model/batch-export';

const FORMATS: readonly ExportFormat[] = ['jpeg', 'png', 'webp', 'avif'];
const RESIZE_MODES: readonly { value: ResizeMode; label: string }[] = [
  { value: 'none', label: 'Original' },
  { value: 'longEdge', label: 'Long edge' },
  { value: 'width', label: 'Width' },
  { value: 'height', label: 'Height' },
  { value: 'percent', label: 'Percent' },
];

export function ExportButton(): React.JSX.Element {
  const bitmap = useViewerStore((s) => s.bitmap);
  const edit = useEditorStore(selectCurrentEdit);
  const image = useEditorStore((s) => s.image);
  const t = useT();

  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState(DEFAULT_EXPORT_OPTIONS);
  const [batchIds, setBatchIds] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const disabled = !bitmap || !edit;

  const runExport = async () => {
    if (!bitmap || !edit || !image) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, filename } = await exportImage(bitmap, edit, image.fileName, 1, options);
      downloadBlob(blob, filename);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  const runBatchExport = async () => {
    if (!bitmap || !edit || !image || batchIds.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      let seq = 1;
      for (const id of dedupePresetIds(batchIds)) {
        const preset = EXPORT_PRESETS.find((p) => p.id === id);
        if (!preset) continue;
        const opts = batchOptionsFor(options, preset);
        const { blob, filename } = await exportImage(bitmap, edit, image.fileName, seq, opts);
        downloadBlob(blob, filename);
        seq += 1;
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  // Web Share API: hands the exported image to the OS share sheet (Instagram,
  // Messages, Files, etc. on supported devices — mainly mobile browsers).
  // There's no public API to post directly into a specific app like
  // Instagram from a website; this is the standard, actually-available way
  // browsers offer "send this image to another app".
  const canShareFiles =
    typeof navigator !== 'undefined' &&
    'share' in navigator &&
    typeof navigator.canShare === 'function';

  const runShare = async () => {
    if (!bitmap || !edit || !image) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, filename } = await exportImage(bitmap, edit, image.fileName, 1, options);
      const file = new File([blob], filename, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        setOpen(false);
      } else {
        downloadBlob(blob, filename);
        setOpen(false);
      }
    } catch (err) {
      // AbortError happens when the person just cancels the share sheet —
      // not a real failure, so don't show it as an error.
      if (err instanceof Error && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Share failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Export" disabled={disabled}>
              <Download />
            </Button>
          </DialogTrigger>
        </TooltipTrigger>
        <TooltipContent>Export…</TooltipContent>
      </Tooltip>

      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Export image</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 text-sm">
          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">{t('exportPreset.title')}</div>
            <div className="flex flex-wrap gap-1">
              {EXPORT_PRESETS.map((p) => {
                const active = matchExportPreset(options) === p.id;
                return (
                  <Button
                    key={p.id}
                    variant={active ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      setOptions((o) => applyExportPreset(o, p.id));
                    }}
                  >
                    {t(p.labelKey)}
                  </Button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Format</div>
            <div className="flex gap-1">
              {FORMATS.map((f) => (
                <Button
                  key={f}
                  variant={options.format === f ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 uppercase"
                  onClick={() => {
                    setOptions((o) => ({ ...o, format: f }));
                  }}
                >
                  {f}
                </Button>
              ))}
            </div>
          </div>

          {options.format !== 'png' ? (
            <div>
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>Quality</span>
                <span className="tabular-nums">{options.quality}</span>
              </div>
              <Slider
                min={1}
                max={100}
                value={[options.quality]}
                onValueChange={(v) => {
                  const q = v[0];
                  if (q !== undefined) setOptions((o) => ({ ...o, quality: q }));
                }}
              />
            </div>
          ) : null}

          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">Resize</div>
            <div className="flex items-center gap-2">
              <select
                value={options.resize.mode}
                onChange={(e) => {
                  setOptions((o) => ({
                    ...o,
                    resize: { ...o.resize, mode: e.target.value as ResizeMode },
                  }));
                }}
                className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-sm"
              >
                {RESIZE_MODES.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              {options.resize.mode !== 'none' ? (
                <Input
                  type="number"
                  value={options.resize.value}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (!Number.isNaN(n)) {
                      setOptions((o) => ({ ...o, resize: { ...o.resize, value: n } }));
                    }
                  }}
                  className="h-8 w-24"
                />
              ) : null}
            </div>
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              Filename template
            </div>
            <Input
              value={options.filenameTemplate}
              onChange={(e) => {
                setOptions((o) => ({ ...o, filenameTemplate: e.target.value }));
              }}
            />
            <div className="mt-1 text-[10px] text-muted-foreground">
              Tokens: {'{name} {date} {time} {seq} {seq:3} {w} {h}'}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={options.watermark.enabled}
                onChange={(e) => {
                  setOptions((o) => ({
                    ...o,
                    watermark: { ...o.watermark, enabled: e.target.checked },
                  }));
                }}
              />
              Watermark
            </label>
            {options.watermark.enabled ? (
              <Input
                value={options.watermark.text}
                onChange={(e) => {
                  setOptions((o) => ({
                    ...o,
                    watermark: { ...o.watermark, text: e.target.value },
                  }));
                }}
                className="mt-1 h-8"
                placeholder="Watermark text"
              />
            ) : null}
          </div>

          <div>
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              {t('batchExport.title')}
            </div>
            <div className="flex flex-wrap gap-1">
              {EXPORT_PRESETS.map((p) => {
                const on = batchIds.includes(p.id);
                return (
                  <Button
                    key={p.id}
                    variant={on ? 'default' : 'outline'}
                    size="sm"
                    className="h-7 px-2 text-[11px]"
                    onClick={() => {
                      setBatchIds((prev) =>
                        prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id],
                      );
                    }}
                  >
                    {t(p.labelKey)}
                  </Button>
                );
              })}
            </div>
            {batchIds.length > 0 ? (
              <Button
                variant="secondary"
                size="sm"
                className="mt-1.5 h-7 w-full gap-1 text-[11px]"
                disabled={disabled || busy}
                onClick={() => {
                  void runBatchExport();
                }}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Download />}
                {t('batchExport.run')} ({batchIds.length})
              </Button>
            ) : null}
          </div>

          {error ? <div className="text-xs text-destructive">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); }}>
            {t('common.cancel')}
          </Button>
          {canShareFiles ? (
            <Button
              variant="outline"
              onClick={() => {
                void runShare();
              }}
              disabled={disabled || busy}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Share2 />}
              {t('export.share')}
            </Button>
          ) : null}
          <Button
            onClick={() => {
              void runExport();
            }}
            disabled={disabled || busy}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
            {t('export.button')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
