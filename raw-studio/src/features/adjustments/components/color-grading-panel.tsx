import * as React from 'react';
import type { ColorWheel } from '@/types';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { AdjustmentSlider } from './adjustment-slider';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';
import { pointToWheel, wheelToPoint } from '../model/color-grading';

type Zone = 'shadows' | 'midtones' | 'highlights' | 'global';

const ZONES: readonly Zone[] = ['shadows', 'midtones', 'highlights', 'global'];

const SIZE = 180;
const R = SIZE / 2 - 10;

/**
 * Lightroom-style color grading: a hue/saturation wheel per tonal zone
 * (shadows / midtones / highlights / global) plus luminance, and the blending
 * and balance controls shared across zones.
 */
export function ColorGradingPanel(): React.JSX.Element | null {
  const edit = useEditorStore(selectCurrentEdit);
  const setPreview = useEditorStore((s) => s.setPreview);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);
  const t = useT();
  const [zone, setZone] = React.useState<Zone>('midtones');
  const svgRef = React.useRef<SVGSVGElement>(null);
  const draggingRef = React.useRef(false);

  if (!edit) return null;

  const grading = edit.adjustments.colorGrading;
  const wheel: ColorWheel = grading[zone];
  const point = wheelToPoint(wheel);
  const cx = SIZE / 2 + point.x * R;
  const cy = SIZE / 2 - point.y * R; // SVG y grows downward

  const write = (patch: Partial<ColorWheel>, commit: boolean): void => {
    const next = { colorGrading: { [zone]: { ...wheel, ...patch } } };
    if (commit) commitAdjustments(next, t('grading.editLabel'));
    else setPreview(next);
  };

  const toWheelValue = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const sx = ((clientX - rect.left) / rect.width) * SIZE;
    const sy = ((clientY - rect.top) / rect.height) * SIZE;
    return pointToWheel((sx - SIZE / 2) / R, -(sy - SIZE / 2) / R);
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    const v = toWheelValue(e.clientX, e.clientY);
    if (v) write(v, false);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    const v = toWheelValue(e.clientX, e.clientY);
    if (v) write(v, false);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const v = toWheelValue(e.clientX, e.clientY);
    if (v) write(v, true);
  };

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* zone selector */}
      <div className="flex overflow-hidden rounded border border-border">
        {ZONES.map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => {
              setZone(z);
            }}
            className={cn(
              'flex-1 py-1 text-[10px]',
              zone === z ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            {t(`grading.zone.${z}`)}
          </button>
        ))}
      </div>

      {/* hue / saturation wheel */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${String(SIZE)} ${String(SIZE)}`}
        className="mx-auto w-[180px] touch-none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        <defs>
          <radialGradient id="cg-fade">
            <stop offset="0%" stopColor="#808080" stopOpacity="1" />
            <stop offset="100%" stopColor="#808080" stopOpacity="0" />
          </radialGradient>
        </defs>
        {/* hue ring drawn as 60 wedges */}
        {Array.from({ length: 60 }, (_, i) => {
          const a0 = (i * 6 * Math.PI) / 180;
          const a1 = ((i + 1) * 6 * Math.PI) / 180;
          const x0 = SIZE / 2 + Math.cos(a0) * R;
          const y0 = SIZE / 2 - Math.sin(a0) * R;
          const x1 = SIZE / 2 + Math.cos(a1) * R;
          const y1 = SIZE / 2 - Math.sin(a1) * R;
          return (
            <path
              key={i}
              d={`M ${String(SIZE / 2)} ${String(SIZE / 2)} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${String(R)} ${String(R)} 0 0 0 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`}
              fill={`hsl(${String(i * 6)}, 100%, 50%)`}
            />
          );
        })}
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="url(#cg-fade)" />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth={1}
        />
        {/* handle */}
        <circle cx={cx} cy={cy} r={7} fill="none" stroke="#fff" strokeWidth={2} />
        <circle cx={cx} cy={cy} r={2} fill="#fff" />
      </svg>

      <AdjustmentSlider
        label={t('grading.hue')}
        value={wheel.hue}
        min={0}
        max={360}
        step={1}
        defaultValue={0}
        onChange={(v) => {
          write({ hue: v }, false);
        }}
        onCommit={(v) => {
          write({ hue: v }, true);
        }}
      />
      <AdjustmentSlider
        label={t('grading.saturation')}
        value={wheel.saturation}
        min={0}
        max={100}
        step={1}
        defaultValue={0}
        onChange={(v) => {
          write({ saturation: v }, false);
        }}
        onCommit={(v) => {
          write({ saturation: v }, true);
        }}
      />
      <AdjustmentSlider
        label={t('grading.luminance')}
        value={wheel.luminance}
        min={-100}
        max={100}
        step={1}
        defaultValue={0}
        onChange={(v) => {
          write({ luminance: v }, false);
        }}
        onCommit={(v) => {
          write({ luminance: v }, true);
        }}
      />

      <div className="border-t border-border pt-3">
        <AdjustmentSlider
          label={t('grading.blending')}
          value={grading.blending}
          min={0}
          max={100}
          step={1}
          defaultValue={50}
          onChange={(v) => {
            setPreview({ colorGrading: { blending: v } });
          }}
          onCommit={(v) => {
            commitAdjustments({ colorGrading: { blending: v } }, t('grading.editLabel'));
          }}
        />
        <AdjustmentSlider
          label={t('grading.balance')}
          value={grading.balance}
          min={-100}
          max={100}
          step={1}
          defaultValue={0}
          onChange={(v) => {
            setPreview({ colorGrading: { balance: v } });
          }}
          onCommit={(v) => {
            commitAdjustments({ colorGrading: { balance: v } }, t('grading.editLabel'));
          }}
        />
      </div>
    </div>
  );
}
