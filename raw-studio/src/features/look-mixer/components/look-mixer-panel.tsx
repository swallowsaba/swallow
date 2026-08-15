import * as React from 'react';
import { Check, Grid2x2, Minus, RotateCcw } from 'lucide-react';
import type { Adjustments } from '@/types';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Toggle } from '@/components/ui/toggle';
import {
  selectCurrentEdit,
  selectSnapshots,
  useEditorStore,
} from '@/features/editor';
import { usePresetStore } from '@/features/presets';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import {
  bilinearWeights,
  blendAdjustments,
  lerpAdjustments,
  type BlendEntry,
} from '../model/blend-edit';
import {
  lookKey,
  resolveLook,
  type LookInputs,
  type LookRef,
  type ResolvedLook,
} from '../model/look-source';
import { useMixerStore, type CornerSlot } from '../model/mixer-store';

const CORNER_LABELS = ['↖', '↗', '↙', '↘'] as const;

export function LookMixerPanel(): React.JSX.Element {
  const edit = useEditorStore(selectCurrentEdit);
  const snapshots = useEditorStore(selectSnapshots);
  const presets = usePresetStore((s) => s.presets);
  const setPreview = useEditorStore((s) => s.setPreview);
  const clearPreview = useEditorStore((s) => s.clearPreview);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);
  const t = useT();

  const mode = useMixerStore((s) => s.mode);
  const setMode = useMixerStore((s) => s.setMode);
  const a = useMixerStore((s) => s.a);
  const b = useMixerStore((s) => s.b);
  const tVal = useMixerStore((s) => s.t);
  const setA = useMixerStore((s) => s.setA);
  const setB = useMixerStore((s) => s.setB);
  const setT = useMixerStore((s) => s.setT);
  const corners = useMixerStore((s) => s.corners);
  const setCorner = useMixerStore((s) => s.setCorner);
  const padX = useMixerStore((s) => s.padX);
  const padY = useMixerStore((s) => s.padY);
  const setPad = useMixerStore((s) => s.setPad);
  const resetMixer = useMixerStore((s) => s.reset);
  const settleToCurrent = useMixerStore((s) => s.settleToCurrent);

  const current = edit?.adjustments ?? null;

  // Everything the mixer can resolve a look against.
  const inputs: LookInputs | null = React.useMemo(() => {
    if (!current) return null;
    return {
      current,
      snapshots: snapshots.map((s) => ({
        id: s.id,
        name: s.name,
        adjustments: s.state.adjustments,
      })),
      presets: presets.map((p) => ({ id: p.id, name: p.name, adjustments: p.adjustments })),
    };
  }, [current, snapshots, presets]);

  // The pickable looks, and a key→ref lookup for the <select> controls.
  const optionsList: readonly LookRef[] = React.useMemo(() => {
    const base: LookRef[] = [{ kind: 'current' }, { kind: 'neutral' }];
    for (const s of snapshots) base.push({ kind: 'snapshot', id: s.id, name: s.name });
    for (const p of presets) base.push({ kind: 'preset', id: p.id, name: p.name });
    return base;
  }, [snapshots, presets]);

  // Compute the blended adjustments for the current controls.
  const blended: Adjustments | null = React.useMemo(() => {
    if (!inputs || !current) return null;
    if (mode === '1d') {
      const ra = resolveLook(a, inputs);
      const rb = resolveLook(b, inputs);
      const from = ra?.adjustments ?? current;
      const to = rb?.adjustments ?? current;
      return lerpAdjustments(from, to, tVal);
    }
    const weights = bilinearWeights(padX, padY);
    const entries: BlendEntry[] = [];
    corners.forEach((ref, i) => {
      if (!ref) return;
      const resolved = resolveLook(ref, inputs);
      if (resolved) entries.push({ adjustments: resolved.adjustments, weight: weights[i] ?? 0 });
    });
    if (entries.length === 0) return current;
    return blendAdjustments(entries);
  }, [inputs, current, mode, a, b, tVal, corners, padX, padY]);

  // Drive the live preview; clear it when leaving the mixer.
  React.useEffect(() => {
    if (blended) setPreview(blended);
    return () => {
      clearPreview();
    };
  }, [blended, setPreview, clearPreview]);

  if (!current || !inputs) {
    return (
      <div className="grid place-items-center p-8 text-center text-xs text-muted-foreground">
        {t('common.openImagePrompt')}
      </div>
    );
  }

  const apply = () => {
    if (blended) commitAdjustments(blended, t('mix.applyLabel'));
    clearPreview();
    // Collapse to a no-op blend so the just-committed look stays on screen
    // instead of the preview re-blending against the new current edit.
    settleToCurrent();
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      <p className="text-xs leading-relaxed text-muted-foreground">{t('mix.intro')}</p>

      <div className="flex gap-2">
        <Toggle
          size="sm"
          pressed={mode === '1d'}
          onPressedChange={() => {
            setMode('1d');
          }}
          className="h-7 flex-1 gap-1 text-[11px]"
        >
          <Minus className="size-3" /> {t('mix.blend2')}
        </Toggle>
        <Toggle
          size="sm"
          pressed={mode === '2d'}
          onPressedChange={() => {
            setMode('2d');
          }}
          className="h-7 flex-1 gap-1 text-[11px]"
        >
          <Grid2x2 className="size-3" /> {t('mix.blend4')}
        </Toggle>
      </div>

      {mode === '1d' ? (
        <div className="flex flex-col gap-2.5">
          <LookSelect
            label="A"
            value={a}
            options={optionsList}
            inputs={inputs}
            onChange={(ref) => {
              if (ref) setA(ref);
            }}
          />
          <LookSelect
            label="B"
            value={b}
            options={optionsList}
            inputs={inputs}
            onChange={(ref) => {
              if (ref) setB(ref);
            }}
          />
          <div className="flex items-center gap-2 pt-1">
            <span className="w-4 text-center text-[11px] text-muted-foreground">A</span>
            <Slider
              value={[tVal * 100]}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) => {
                const next = v[0];
                if (next !== undefined) setT(next / 100);
              }}
              className="flex-1"
            />
            <span className="w-4 text-center text-[11px] text-muted-foreground">B</span>
          </div>
          <p className="text-center text-[11px] tabular-nums text-muted-foreground">
            {Math.round((1 - tVal) * 100)}% / {Math.round(tVal * 100)}%
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <div className="grid grid-cols-2 gap-2">
            {([0, 1, 2, 3] as CornerSlot[]).map((slot) => (
              <LookSelect
                key={slot}
                label={CORNER_LABELS[slot]}
                value={corners[slot]}
                options={optionsList}
                inputs={inputs}
                allowEmpty
                onChange={(ref) => {
                  setCorner(slot, ref);
                }}
              />
            ))}
          </div>
          <BlendPad x={padX} y={padY} corners={corners} inputs={inputs} onChange={setPad} />
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button size="sm" className="flex-1 gap-1" onClick={apply}>
          <Check className="size-3.5" /> {t('mix.apply')}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1"
          onClick={() => {
            resetMixer();
            clearPreview();
          }}
        >
          <RotateCcw className="size-3.5" /> {t('mix.reset')}
        </Button>
      </div>
    </div>
  );
}

function labelForRef(ref: LookRef | null, inputs: LookInputs): string {
  if (!ref) return '—';
  return resolveLook(ref, inputs)?.label ?? '—';
}

function LookSelect({
  label,
  value,
  options,
  inputs,
  onChange,
  allowEmpty = false,
}: {
  label: string;
  value: LookRef | null;
  options: readonly LookRef[];
  inputs: LookInputs;
  onChange: (ref: LookRef | null) => void;
  allowEmpty?: boolean;
}): React.JSX.Element {
  const optionByKey = React.useMemo(() => {
    const m = new Map<string, LookRef>();
    for (const ref of options) m.set(lookKey(ref), ref);
    return m;
  }, [options]);

  return (
    <label className="flex items-center gap-2 text-xs">
      <span className="w-4 shrink-0 text-center text-muted-foreground">{label}</span>
      <select
        value={value ? lookKey(value) : '__empty'}
        onChange={(e) => {
          if (e.target.value === '__empty') onChange(null);
          else onChange(optionByKey.get(e.target.value) ?? null);
        }}
        className="h-7 min-w-0 flex-1 rounded border border-input bg-transparent px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        {allowEmpty ? <option value="__empty">—</option> : null}
        {options.map((ref) => {
          const key = lookKey(ref);
          return (
            <option key={key} value={key}>
              {labelForRef(ref, inputs)}
            </option>
          );
        })}
      </select>
    </label>
  );
}

function BlendPad({
  x,
  y,
  corners,
  inputs,
  onChange,
}: {
  x: number;
  y: number;
  corners: readonly (LookRef | null)[];
  inputs: LookInputs;
  onChange: (x: number, y: number) => void;
}): React.JSX.Element {
  const ref = React.useRef<HTMLDivElement>(null);
  const dragging = React.useRef(false);

  const toUnit = (clientX: number, clientY: number) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return;
    onChange((clientX - rect.left) / rect.width, (clientY - rect.top) / rect.height);
  };

  const cornerName = (i: number): string => {
    const c = corners[i];
    if (!c) return '';
    const r: ResolvedLook | null = resolveLook(c, inputs);
    return r?.label ?? '';
  };

  return (
    <div
      ref={ref}
      className="relative aspect-square w-full touch-none rounded border border-border bg-muted/30"
      onPointerDown={(e) => {
        dragging.current = true;
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        toUnit(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => {
        if (dragging.current) toUnit(e.clientX, e.clientY);
      }}
      onPointerUp={(e) => {
        dragging.current = false;
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }}
    >
      <span className="pointer-events-none absolute left-1 top-1 max-w-[45%] truncate text-[10px] text-muted-foreground">
        {cornerName(0)}
      </span>
      <span className="pointer-events-none absolute right-1 top-1 max-w-[45%] truncate text-right text-[10px] text-muted-foreground">
        {cornerName(1)}
      </span>
      <span className="pointer-events-none absolute bottom-1 left-1 max-w-[45%] truncate text-[10px] text-muted-foreground">
        {cornerName(2)}
      </span>
      <span className="pointer-events-none absolute bottom-1 right-1 max-w-[45%] truncate text-right text-[10px] text-muted-foreground">
        {cornerName(3)}
      </span>
      <div
        className={cn(
          'pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow',
        )}
        style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      />
    </div>
  );
}
