import * as React from 'react';
import { Wand2, Sparkles, Loader2, RotateCcw, X, Brush, ScanLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { useViewerStore } from '@/features/viewer';
import { useT } from '@/i18n';

/**
 * Remove-object controls, living in the RIGHT PANEL (not floating on the image).
 * The canvas where the user paints stays in the viewer overlay, but every
 * button/slider is here so nothing overlaps the photo and everything is
 * reliably clickable. Buttons fire commands through the viewer store; the
 * overlay executes them against its canvas.
 */
export function RemovePanel(): React.JSX.Element {
  const t = useT();
  const subMode = useViewerStore((s) => s.removeSubMode);
  const setSubMode = useViewerStore((s) => s.setRemoveSubMode);
  const brushPct = useViewerStore((s) => s.removeBrushPct);
  const setBrushPct = useViewerStore((s) => s.setRemoveBrushPct);
  const hasPaint = useViewerStore((s) => s.removeHasPaint);
  const busy = useViewerStore((s) => s.removeBusy);
  const status = useViewerStore((s) => s.removeStatus);
  const hasPreview = useViewerStore((s) => s.removeHasPreview);
  const dispatch = useViewerStore((s) => s.dispatchRemoveCommand);
  const setRemoveMode = useViewerStore((s) => s.setRemoveMode);

  return (
    <div className="flex flex-col gap-3 p-3">
      <div className="text-sm font-semibold text-foreground">{t('remove.panelTitle')}</div>

      {/* Manual / Auto sub-mode selector. */}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => {
            setSubMode('manual');
          }}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md border p-2 text-xs font-medium transition-colors ${
            subMode === 'manual'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-accent'
          }`}
        >
          <Brush className="size-3.5" />
          {t('remove.tabManual')}
        </button>
        <button
          type="button"
          onClick={() => {
            setSubMode('auto');
          }}
          className={`flex flex-1 items-center justify-center gap-1 rounded-md border p-2 text-xs font-medium transition-colors ${
            subMode === 'auto'
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border text-muted-foreground hover:bg-accent'
          }`}
        >
          <ScanLine className="size-3.5" />
          {t('remove.tabAuto')}
        </button>
      </div>

      {/* Instructions for the active sub-mode. */}
      <div className="rounded-md bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">
        {subMode === 'manual' ? t('remove.manualHelp') : t('remove.autoHelp')}
      </div>

      {/* Auto: detect button. After detecting, the user can still paint to edit. */}
      {subMode === 'auto' ? (
        <Button
          variant="outline"
          size="sm"
          disabled={busy || hasPreview}
          onClick={() => {
            dispatch('autoDetect');
          }}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ScanLine className="size-3.5" />}
          {t('remove.detect')}
        </Button>
      ) : null}

      {/* Brush size — used to paint (manual) or to edit an auto mask. */}
      {!hasPreview ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>{t('remove.brush')}</span>
            <span>{brushPct}%</span>
          </div>
          <Slider
            min={1}
            max={20}
            step={1}
            value={[brushPct]}
            onValueChange={(v) => {
              if (v[0] != null) setBrushPct(v[0]);
            }}
          />
          <button
            type="button"
            onClick={() => {
              dispatch('clear');
            }}
            className="self-start text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            {t('remove.clearMask')}
          </button>
        </div>
      ) : null}

      {status ? <div className="text-[11px] text-muted-foreground">{status}</div> : null}

      {/* Primary action: Remove (runs inpaint on whatever is painted). */}
      {!hasPreview ? (
        <Button
          size="sm"
          disabled={busy || !hasPaint}
          onClick={() => {
            dispatch('remove');
          }}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Wand2 className="size-3.5" />}
          {t('remove.doRemove')}
        </Button>
      ) : (
        <div className="flex flex-col gap-1.5">
          <div className="text-[11px] text-muted-foreground">{t('remove.previewReady')}</div>
          <Button
            size="sm"
            onClick={() => {
              dispatch('remove'); // in preview state, 'remove' cmd = download+finish
            }}
          >
            <Sparkles className="size-3.5" />
            {t('remove.download')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              dispatch('redo');
            }}
          >
            <RotateCcw className="size-3.5" />
            {t('remove.redo')}
          </Button>
        </div>
      )}

      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          setRemoveMode(false);
        }}
      >
        <X className="size-3.5" />
        {t('remove.close')}
      </Button>
    </div>
  );
}
