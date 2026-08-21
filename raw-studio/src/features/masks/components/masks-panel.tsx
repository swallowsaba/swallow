import * as React from 'react';
import {
  ArrowDown,
  ArrowUp,
  Brush,
  Circle as CircleIcon,
  Eraser,
  FlipHorizontal2,
  Loader2,
  Minus,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import type {
  BrushMaskData,
  LocalAdjustments,
  Mask,
  MaskKind,
  RadialMaskData,
  RasterMaskData,
} from '@/types';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { HelpMark } from '@/components/ui/help-mark';
import { selectCurrentEdit, useActiveMask, useEditorStore } from '@/features/editor';
import { AdjustmentSlider } from '@/features/adjustments/components/adjustment-slider';
import { segment, MODELS } from '@/features/ai';
import { useViewerStore } from '@/features/viewer';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { createMask, createRasterMask, makeRasterMask, maskHasEffect } from '../model/mask-ops';
import { MaskThumbnail } from './mask-thumbnail';
import { MaskToneCurve } from './mask-tone-curve';
import {
  alphaToCroppedRaster,
  decodeRaster,
  dilateAlpha,
  encodeBase64,
  erodeAlpha,
} from '../model/raster-mask';
import { proposeAutoLocalMasks, type AutoRegionKind } from '../model/auto-local';
import { useMaskUiStore } from '../model/mask-ui-store';

const KIND_ICON: Record<MaskKind, React.ComponentType<{ className?: string }>> = {
  brush: Brush,
  radial: CircleIcon,
  linear: Minus,
  raster: Sparkles,
};

/** Local-adjustment sliders a mask can carry, mirroring the global ranges. */
const LOCAL_SLIDERS: readonly {
  key: keyof LocalAdjustments;
  label: string;
  min: number;
  max: number;
  step: number;
}[] = [
  { key: 'exposure', label: 'Exposure', min: -5, max: 5, step: 0.05 },
  { key: 'contrast', label: 'Contrast', min: -300, max: 300, step: 1 },
  { key: 'highlights', label: 'Highlights', min: -300, max: 300, step: 1 },
  { key: 'shadows', label: 'Shadows', min: -300, max: 300, step: 1 },
  { key: 'whites', label: 'Whites', min: -300, max: 300, step: 1 },
  { key: 'blacks', label: 'Blacks', min: -300, max: 300, step: 1 },
  { key: 'temperature', label: 'Temp', min: -100, max: 100, step: 1 },
  { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1 },
  { key: 'vibrance', label: 'Vibrance', min: -100, max: 100, step: 1 },
  { key: 'clarity', label: 'Clarity', min: -100, max: 100, step: 1 },
  { key: 'texture', label: 'Texture', min: -100, max: 100, step: 1 },
  { key: 'sharpenAmount', label: 'Sharpen', min: 0, max: 100, step: 1 },
  { key: 'noiseReduction', label: 'Noise', min: 0, max: 100, step: 1 },
];

export function MasksPanel(): React.JSX.Element {
  const edit = useEditorStore(selectCurrentEdit);
  const t = useT();

  const addMask = useEditorStore((s) => s.addMask);
  const setMaskEnabled = useEditorStore((s) => s.setMaskEnabled);
  const removeMask = useEditorStore((s) => s.removeMask);
  const reorderMask = useEditorStore((s) => s.reorderMask);

  const activeMaskId = useMaskUiStore((s) => s.activeMaskId);
  const editMask = useMaskUiStore((s) => s.editMask);
  const setMaskMode = useMaskUiStore((s) => s.setMaskMode);
  const exit = useMaskUiStore((s) => s.exit);

  const bitmap = useViewerStore((s) => s.bitmap);
  const [aiBusy, setAiBusy] = React.useState(false);
  const [aiError, setAiError] = React.useState<string | null>(null);
  const [autoNote, setAutoNote] = React.useState<string | null>(null);

  // Keep the on-canvas overlay active whenever this panel is showing and a mask
  // is selected; leave it when the panel unmounts.
  React.useEffect(() => {
    if (activeMaskId) setMaskMode(true);
    return () => {
      setMaskMode(false);
    };
  }, [activeMaskId, setMaskMode]);

  if (!edit) {
    return (
      <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
        {t('common.openImagePrompt')}
      </div>
    );
  }

  const masks = edit.masks;

  const add = (kind: MaskKind) => {
    const mask = createMask(kind, masks);
    addMask(mask, t('masks.addLabel'));
    editMask(mask.id);
  };

  const runAiSubject = async () => {
    const model = MODELS['u2netp-subject'];
    if (!bitmap || !model || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    try {
      const seg = await segment(model.id, bitmap);
      const crop = edit.geometry.crop;
      // Store at a bounded resolution matching the cropped pixel aspect.
      const cropPxW = Math.max(1, bitmap.width * crop.width);
      const cropPxH = Math.max(1, bitmap.height * crop.height);
      const aspect = cropPxW / cropPxH;
      const longEdge = 256;
      const outW = aspect >= 1 ? longEdge : Math.max(1, Math.round(longEdge * aspect));
      const outH = aspect >= 1 ? Math.max(1, Math.round(longEdge / aspect)) : longEdge;
      const alpha = alphaToCroppedRaster(seg.mask, seg.size, crop, outW, outH);
      const data = encodeBase64(alpha);
      const mask = createRasterMask(data, outW, outH, 'ai-subject', t('masks.aiSubject'), masks);
      addMask(mask, t('masks.aiSubjectLabel'));
      editMask(mask.id);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    } finally {
      setAiBusy(false);
    }
  };

  const regionName = (kind: AutoRegionKind): string =>
    kind === 'sky'
      ? t('masks.regionSky')
      : kind === 'shadows'
        ? t('masks.regionShadows')
        : t('masks.regionHighlights');

  const runAutoLocal = () => {
    if (!bitmap) return;
    setAutoNote(null);
    try {
      const crop = edit.geometry.crop;
      const sx = crop.x * bitmap.width;
      const sy = crop.y * bitmap.height;
      const sw = Math.max(1, crop.width * bitmap.width);
      const sh = Math.max(1, crop.height * bitmap.height);
      const longEdge = 256;
      const scale = Math.min(1, longEdge / Math.max(sw, sh));
      const w = Math.max(1, Math.round(sw * scale));
      const h = Math.max(1, Math.round(sh * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
      const rgba = ctx.getImageData(0, 0, w, h).data;
      const proposals = proposeAutoLocalMasks(rgba, w, h);
      if (proposals.length === 0) {
        setAutoNote(t('masks.autoNone'));
        return;
      }
      let firstId: string | null = null;
      for (const p of proposals) {
        const data = encodeBase64(p.alpha);
        const mask = makeRasterMask(
          regionName(p.kind),
          data,
          p.width,
          p.height,
          `auto-${p.kind}`,
          p.adjustments,
        );
        addMask(mask, t('masks.autoLabel'));
        if (!firstId) firstId = mask.id;
      }
      if (firstId) editMask(firstId);
    } catch (err) {
      setAutoNote(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {t('masks.intro')}
      </p>

      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => add('brush')}>
          <Brush className="size-3.5" /> {t('masks.brush')}
        </Button>
        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => add('radial')}>
          <CircleIcon className="size-3.5" /> {t('masks.radial')}
        </Button>
        <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => add('linear')}>
          <Minus className="size-3.5" /> {t('masks.linear')}
        </Button>
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1"
        disabled={!bitmap || aiBusy}
        onClick={() => {
          void runAiSubject();
        }}
      >
        {aiBusy ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <Sparkles className="size-3.5" />
        )}
        {aiBusy ? t('masks.aiWorking') : t('masks.aiSubjectBtn')}
      </Button>
      {aiError ? <p className="text-[11px] text-destructive">{aiError}</p> : null}

      <Button
        variant="outline"
        size="sm"
        className="w-full gap-1"
        disabled={!bitmap}
        onClick={() => {
          runAutoLocal();
        }}
      >
        <Wand2 className="size-3.5" /> {t('masks.autoLocalBtn')}
      </Button>
      {autoNote ? <p className="text-[11px] text-muted-foreground">{autoNote}</p> : null}

      {masks.length === 0 ? (
        <p className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
          {t('masks.empty')}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {masks.map((mask, i) => {
            const Icon = KIND_ICON[mask.geometry.kind];
            const active = mask.id === activeMaskId;
            return (
              <li
                key={mask.id}
                className={cn(
                  'flex items-center gap-1 rounded border px-2 py-1.5 text-xs',
                  active ? 'border-primary bg-primary/10' : 'border-border',
                )}
              >
                <input
                  type="checkbox"
                  checked={mask.enabled}
                  onChange={(e) => {
                    setMaskEnabled(mask.id, e.target.checked, t('masks.toggleLabel'));
                  }}
                  aria-label={t('masks.toggleLabel')}
                  className="size-3.5 accent-primary"
                />
                <button
                  type="button"
                  className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                  onClick={() => {
                    editMask(mask.id);
                  }}
                >
                  <MaskThumbnail mask={mask} />
                  <Icon className="size-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{mask.name}</span>
                  {!maskHasEffect(mask) ? (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {t('masks.noEffect')}
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  aria-label={t('masks.moveUp')}
                  disabled={i === masks.length - 1}
                  onClick={() => {
                    reorderMask(mask.id, 'up', t('masks.reorderLabel'));
                  }}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowUp className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={t('masks.moveDown')}
                  disabled={i === 0}
                  onClick={() => {
                    reorderMask(mask.id, 'down', t('masks.reorderLabel'));
                  }}
                  className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                >
                  <ArrowDown className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label={t('masks.delete')}
                  onClick={() => {
                    if (mask.id === activeMaskId) exit();
                    removeMask(mask.id, t('masks.deleteLabel'));
                  }}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ActiveMaskEditor />
    </div>
  );
}

function ActiveMaskEditor(): React.JSX.Element | null {
  const activeMaskId = useMaskUiStore((s) => s.activeMaskId);
  const mask = useActiveMask(activeMaskId);
  const t = useT();

  const setMaskPreview = useEditorStore((s) => s.setMaskPreview);
  const commitMaskAdjustments = useEditorStore((s) => s.commitMaskAdjustments);
  const commitMaskGeometry = useEditorStore((s) => s.commitMaskGeometry);
  const renameMask = useEditorStore((s) => s.renameMask);
  const invertMaskAdjustments = useEditorStore((s) => s.invertMaskAdjustments);

  if (!mask || !activeMaskId) return null;

  return (
    <div className="flex flex-col gap-3 border-t border-border pt-3">
      <div className="flex items-center gap-2">
        <input
          value={mask.name}
          onChange={(e) => {
            renameMask(activeMaskId, e.target.value, t('masks.renameLabel'));
          }}
          className="h-7 min-w-0 flex-1 rounded border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1 px-2 text-[11px]"
          onClick={() => {
            invertMaskAdjustments(activeMaskId, t('masks.invertLabel'));
          }}
          title={t('masks.invertHelp')}
        >
          <FlipHorizontal2 className="size-3" /> {t('masks.invert')}
        </Button>
      </div>

      {mask.geometry.kind === 'brush' ? <BrushControls mask={mask} /> : null}
      {mask.geometry.kind === 'radial' ? (
        <RadialControls
          mask={mask}
          onCommit={(geom) => {
            commitMaskGeometry(activeMaskId, geom, t('masks.editShapeLabel'));
          }}
        />
      ) : null}
      {mask.geometry.kind === 'raster' ? (
        <RasterControls
          mask={mask}
          onCommit={(geom) => {
            commitMaskGeometry(activeMaskId, geom, t('masks.editShapeLabel'));
          }}
          onPreview={(geom) => {
            setMaskPreview({ id: activeMaskId, geometry: geom });
          }}
        />
      ) : null}

      <div className="flex flex-col gap-2.5">
        <div className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          {t('masks.localAdjustments')}
          <HelpMark text={t('masks.localHelp')} />
        </div>
        {LOCAL_SLIDERS.map((s) => {
          const value = (mask.adjustments[s.key] as number | undefined) ?? 0;
          return (
            <AdjustmentSlider
              key={s.key}
              label={s.label}
              value={value}
              min={s.min}
              max={s.max}
              step={s.step}
              defaultValue={0}
              onChange={(v) => {
                setMaskPreview({ id: activeMaskId, adjustments: { [s.key]: v } });
              }}
              onCommit={(v) => {
                commitMaskAdjustments(activeMaskId, { [s.key]: v }, `Mask ${s.label}`);
              }}
            />
          );
        })}
        <MaskToneCurve
          curve={mask.adjustments.toneCurve}
          onPreview={(pts) => {
            setMaskPreview({ id: activeMaskId, adjustments: { toneCurve: pts } });
          }}
          onCommit={(pts) => {
            commitMaskAdjustments(activeMaskId, { toneCurve: pts }, t('curve.maskTitle'));
          }}
        />
      </div>
    </div>
  );
}

function BrushControls({ mask }: { mask: Mask }): React.JSX.Element {
  const geom = mask.geometry as BrushMaskData;
  const t = useT();
  const brushTool = useMaskUiStore((s) => s.brushTool);
  const setBrushTool = useMaskUiStore((s) => s.setBrushTool);
  const activeMaskId = useMaskUiStore((s) => s.activeMaskId);
  const commitMaskGeometry = useEditorStore((s) => s.commitMaskGeometry);
  const setMaskPreview = useEditorStore((s) => s.setMaskPreview);

  const update = (patch: Partial<BrushMaskData>, commit: boolean) => {
    if (!activeMaskId) return;
    const next = { ...geom, ...patch };
    if (commit) commitMaskGeometry(activeMaskId, next, t('masks.brushSettingsLabel'));
    else setMaskPreview({ id: activeMaskId, geometry: next });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex gap-2">
        <Toggle
          size="sm"
          pressed={brushTool === 'paint'}
          onPressedChange={() => {
            setBrushTool('paint');
          }}
          className="h-7 flex-1 gap-1 text-[11px]"
        >
          <Brush className="size-3" /> {t('masks.paint')}
        </Toggle>
        <Toggle
          size="sm"
          pressed={brushTool === 'erase'}
          onPressedChange={() => {
            setBrushTool('erase');
          }}
          className="h-7 flex-1 gap-1 text-[11px]"
        >
          <Eraser className="size-3" /> {t('masks.erase')}
        </Toggle>
      </div>
      <AdjustmentSlider
        label={t('masks.size')}
        value={Math.round(geom.size * 100)}
        min={1}
        max={100}
        step={1}
        defaultValue={12}
        onChange={(v) => {
          update({ size: v / 100 }, false);
        }}
        onCommit={(v) => {
          update({ size: v / 100 }, true);
        }}
      />
      <AdjustmentSlider
        label={t('masks.feather')}
        value={Math.round(geom.feather * 100)}
        min={0}
        max={100}
        step={1}
        defaultValue={50}
        onChange={(v) => {
          update({ feather: v / 100 }, false);
        }}
        onCommit={(v) => {
          update({ feather: v / 100 }, true);
        }}
      />
      <AdjustmentSlider
        label={t('masks.flow')}
        value={Math.round(geom.flow * 100)}
        min={1}
        max={100}
        step={1}
        defaultValue={100}
        onChange={(v) => {
          update({ flow: v / 100 }, false);
        }}
        onCommit={(v) => {
          update({ flow: v / 100 }, true);
        }}
      />
    </div>
  );
}

function RadialControls({
  mask,
  onCommit,
}: {
  mask: Mask;
  onCommit: (geom: RadialMaskData) => void;
}): React.JSX.Element {
  const geom = mask.geometry as RadialMaskData;
  const t = useT();
  const activeMaskId = useMaskUiStore((s) => s.activeMaskId);
  const setMaskPreview = useEditorStore((s) => s.setMaskPreview);

  return (
    <div className="flex flex-col gap-2.5">
      <AdjustmentSlider
        label={t('masks.feather')}
        value={Math.round(geom.feather * 100)}
        min={0}
        max={100}
        step={1}
        defaultValue={50}
        onChange={(v) => {
          if (activeMaskId) setMaskPreview({ id: activeMaskId, geometry: { ...geom, feather: v / 100 } });
        }}
        onCommit={(v) => {
          onCommit({ ...geom, feather: v / 100 });
        }}
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={geom.inverted}
          onChange={(e) => {
            onCommit({ ...geom, inverted: e.target.checked });
          }}
          className="size-3.5 accent-primary"
        />
        {t('masks.invertArea')}
        <HelpMark text={t('masks.invertAreaHelp')} />
      </label>
    </div>
  );
}

function RasterControls({
  mask,
  onCommit,
  onPreview,
}: {
  mask: Mask;
  onCommit: (geom: RasterMaskData) => void;
  onPreview: (geom: RasterMaskData) => void;
}): React.JSX.Element {
  const geom = mask.geometry as RasterMaskData;
  const t = useT();

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] text-muted-foreground">{t('masks.aiSubjectHint')}</p>
      <AdjustmentSlider
        label={t('masks.feather')}
        value={Math.round(geom.feather * 100)}
        min={0}
        max={100}
        step={1}
        defaultValue={0}
        onChange={(v) => {
          onPreview({ ...geom, feather: v / 100 });
        }}
        onCommit={(v) => {
          onCommit({ ...geom, feather: v / 100 });
        }}
      />
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={geom.invert}
          onChange={(e) => {
            onCommit({ ...geom, invert: e.target.checked });
          }}
          className="size-3.5 accent-primary"
        />
        {t('masks.invertArea')}
        <HelpMark text={t('masks.invertAreaHelp')} />
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded border border-border py-1 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => {
            const alpha = decodeRaster(geom.data);
            const next = dilateAlpha(alpha, geom.width, geom.height, 2);
            onCommit({ ...geom, data: encodeBase64(next) });
          }}
        >
          {t('masks.expand')}
        </button>
        <button
          type="button"
          className="flex-1 rounded border border-border py-1 text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => {
            const alpha = decodeRaster(geom.data);
            const next = erodeAlpha(alpha, geom.width, geom.height, 2);
            onCommit({ ...geom, data: encodeBase64(next) });
          }}
        >
          {t('masks.contract')}
        </button>
      </div>
      <p className="text-[10px] leading-tight text-muted-foreground">{t('masks.morphHint')}</p>
    </div>
  );
}
