import * as React from 'react';
import { Download, Loader2 } from 'lucide-react';
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

  const [open, setOpen] = React.useState(false);
  const [options, setOptions] = React.useState(DEFAULT_EXPORT_OPTIONS);
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

          {error ? <div className="text-xs text-destructive">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); }}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              void runExport();
            }}
            disabled={disabled || busy}
          >
            {busy ? <Loader2 className="animate-spin" /> : <Download />}
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
