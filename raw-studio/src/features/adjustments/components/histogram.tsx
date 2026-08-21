import * as React from 'react';
import type { BasicAdjustments } from '@/types';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { useViewerStore } from '@/features/viewer';
import { useT } from '@/i18n';
import { exposureSummary, formatCamera } from '../model/camera-info';
import {
  channelMeanPercent,
  computeChannelHistogram,
  histogramPolyline,
  peakCount,
  TONE_ZONES,
  zoneAt,
  zoneDragDelta,
  clampBasicField,
  type ChannelHistogram,
  type ToneZone,
} from '../model/histogram';

const W = 260;
const H = 90;

/** Downscale the bitmap and compute its channel histogram (source distribution). */
function useHistogram(bitmap: ImageBitmap | null): ChannelHistogram | null {
  const [hist, setHist] = React.useState<ChannelHistogram | null>(null);
  React.useEffect(() => {
    if (!bitmap) {
      setHist(null);
      return;
    }
    let cancelled = false;
    try {
      const maxEdge = 320;
      const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(bitmap, 0, 0, w, h);
      const { data } = ctx.getImageData(0, 0, w, h);
      if (!cancelled) setHist(computeChannelHistogram(data));
    } catch {
      if (!cancelled) setHist(null);
    }
    return () => {
      cancelled = true;
    };
  }, [bitmap]);
  return hist;
}

export function Histogram(): React.JSX.Element | null {
  const bitmap = useViewerStore((s) => s.bitmap);
  const edit = useEditorStore(selectCurrentEdit);
  const image = useEditorStore((s) => s.image);
  const setPreview = useEditorStore((s) => s.setPreview);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);
  const t = useT();
  const hist = useHistogram(bitmap);

  const dragRef = React.useRef<{
    field: keyof BasicAdjustments;
    zone: ToneZone;
    startX: number;
    base: number;
  } | null>(null);
  const svgRef = React.useRef<SVGSVGElement>(null);

  if (!edit || !hist) return null;

  const basic = edit.adjustments.basic;
  const cameraMeta = image?.camera;
  const exposure = exposureSummary(cameraMeta);
  const camera = formatCamera(cameraMeta);

  const localX = (clientX: number): number => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return ((clientX - rect.left) / rect.width) * W;
  };

  const onDown = (e: React.PointerEvent) => {
    const x = localX(e.clientX);
    const zone = zoneAt(x / W);
    const spec = TONE_ZONES.find((z) => z.zone === zone);
    if (!spec) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = {
      field: spec.field,
      zone,
      startX: e.clientX,
      base: (basic[spec.field] as number | undefined) ?? 0,
    };
  };
  const onMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const rect = svgRef.current?.getBoundingClientRect();
    const trackW = rect?.width ?? W;
    const delta = zoneDragDelta(d.zone, e.clientX - d.startX, trackW);
    const next = clampBasicField(d.field, d.base + delta);
    setPreview({ basic: { [d.field]: next } });
  };
  const onUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const current = (useEditorStore.getState().preview?.basic?.[d.field] as number | undefined) ?? d.base;
    commitAdjustments({ basic: { [d.field]: current } }, t('histogram.adjustLabel'));
  };

  const rMean = channelMeanPercent(hist.r);
  const gMean = channelMeanPercent(hist.g);
  const bMean = channelMeanPercent(hist.b);
  const rPeak = peakCount(hist.r);
  const gPeak = peakCount(hist.g);
  const bPeak = peakCount(hist.b);
  const lPeak = peakCount(hist.luma);
  const closed = (poly: string): string => `0,${String(H)} ${poly} ${String(W)},${String(H)}`;

  return (
    <div className="px-2 pt-2">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        className="h-[90px] w-full touch-none rounded-md bg-black/60"
        preserveAspectRatio="none"
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
      >
        {/* zone dividers */}
        {TONE_ZONES.slice(1).map((z) => (
          <line
            key={z.zone}
            x1={z.from * W}
            y1={0}
            x2={z.from * W}
            y2={H}
            stroke="rgba(255,255,255,0.08)"
            strokeWidth={1}
          />
        ))}
        {/* channels (screen-blended so overlaps read like Lightroom) */}
        <g style={{ mixBlendMode: 'screen' }}>
          <polygon points={closed(histogramPolyline(hist.r, W, H, rPeak))} fill="rgba(255,60,60,0.5)" />
          <polygon points={closed(histogramPolyline(hist.g, W, H, gPeak))} fill="rgba(60,220,90,0.5)" />
          <polygon points={closed(histogramPolyline(hist.b, W, H, bPeak))} fill="rgba(70,120,255,0.5)" />
        </g>
        <polyline
          points={histogramPolyline(hist.luma, W, H, lPeak)}
          fill="none"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={1}
        />
      </svg>
      <div className="mt-1 flex items-center gap-2 text-[10px]">
        <span style={{ color: 'rgb(255,120,120)' }}>R {rMean.toFixed(1)}</span>
        <span style={{ color: 'rgb(120,220,140)' }}>G {gMean.toFixed(1)}</span>
        <span style={{ color: 'rgb(130,160,255)' }}>B {bMean.toFixed(1)}</span>
        <span className="text-muted-foreground">%</span>
      </div>
      <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
        <span>{t('histogram.blacks')}</span>
        <span>{t('histogram.shadows')}</span>
        <span>{t('histogram.exposure')}</span>
        <span>{t('histogram.highlights')}</span>
        <span>{t('histogram.whites')}</span>
      </div>
      {exposure.length > 0 || camera ? (
        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
          {exposure.map((part) => (
            <span key={part}>{part}</span>
          ))}
          {camera ? <span className="opacity-70">{camera}</span> : null}
        </div>
      ) : null}
      <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">{t('histogram.hint')}</p>
    </div>
  );
}
