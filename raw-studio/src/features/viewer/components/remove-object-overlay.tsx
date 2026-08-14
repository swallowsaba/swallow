import * as React from 'react';
import { Check, Eraser, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { computeFitScale, type Size } from '../model/viewport';
import { useViewerStore } from '../model/viewer-store';
import { MODELS } from '@/features/ai/model/model-registry';
import { inpaint } from '@/features/ai/model/inpaint';
import { downloadBlob } from '@/features/export/model/export';
import { useT } from '@/i18n';

interface Props {
  imageSize: Size;
  container: Size;
}

/** Overlay for painting a "remove this" mask over the full image, then
 *  running AI inpainting and downloading the result. Rotation is not
 *  accounted for in this overlay's own placement math (a scoped
 *  simplification, same as the crop overlay). */
export function RemoveObjectOverlay({ imageSize, container }: Props): React.JSX.Element {
  const bitmap = useViewerStore((s) => s.bitmap);
  const setRemoveMode = useViewerStore((s) => s.setRemoveMode);
  const t = useT();

  const maskCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawingRef = React.useRef(false);
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null);
  const [brushPct, setBrushPct] = React.useState(4); // % of the image's long edge
  const [busy, setBusy] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);
  const [hasPaint, setHasPaint] = React.useState(false);

  const model = MODELS['lama-inpaint'];

  const fitScale = computeFitScale(imageSize, container, 0);
  const dispW = imageSize.width * fitScale;
  const dispH = imageSize.height * fitScale;
  const originX = (container.width - dispW) / 2;
  const originY = (container.height - dispH) / 2;

  React.useEffect(() => {
    const canvas = maskCanvasRef.current;
    if (!canvas) return;
    canvas.width = imageSize.width;
    canvas.height = imageSize.height;
  }, [imageSize.width, imageSize.height]);

  const brushRadiusPx = (brushPct / 100) * Math.max(imageSize.width, imageSize.height);

  const toImageCoords = (clientX: number, clientY: number, rect: DOMRect) => {
    const screenX = clientX - rect.left - originX;
    const screenY = clientY - rect.top - originY;
    return { x: screenX / fitScale, y: screenY / fitScale };
  };

  const paintAt = (x: number, y: number, from: { x: number; y: number } | null) => {
    const canvas = maskCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = ctx.strokeStyle = 'rgba(255,60,60,1)';
    ctx.lineWidth = brushRadiusPx * 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (from) {
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(x, y);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, brushRadiusPx, 0, Math.PI * 2);
      ctx.fill();
    }
    setHasPaint(true);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const p = toImageCoords(e.clientX, e.clientY, rect);
    drawingRef.current = true;
    lastPointRef.current = p;
    paintAt(p.x, p.y, null);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drawingRef.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const p = toImageCoords(e.clientX, e.clientY, rect);
    paintAt(p.x, p.y, lastPointRef.current);
    lastPointRef.current = p;
  };
  const onPointerUp = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const clearMask = () => {
    const canvas = maskCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasPaint(false);
  };

  const cancel = () => {
    setRemoveMode(false);
  };

  const apply = async () => {
    const canvas = maskCanvasRef.current;
    if (!bitmap || !canvas || !hasPaint) return;
    setBusy(true);
    setStatus('Preparing model…');
    try {
      const maskOffscreen = new OffscreenCanvas(canvas.width, canvas.height);
      const mctx = maskOffscreen.getContext('2d');
      if (!mctx) throw new Error('2D context unavailable.');
      mctx.drawImage(canvas, 0, 0);

      const blob = await inpaint('lama-inpaint', bitmap, maskOffscreen, (received, total) => {
        const mb = (received / 1_000_000).toFixed(0);
        const totalMb = total ? (total / 1_000_000).toFixed(0) : '?';
        setStatus(`Downloading model ${mb}/${totalMb} MB…`);
      });
      setStatus('Filling…');
      downloadBlob(blob, 'object-removed.jpg');
      setStatus('Saved.');
      setRemoveMode(false);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0">
      <div
        className="absolute cursor-crosshair touch-none"
        style={{ left: originX, top: originY, width: dispW, height: dispH }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <canvas
          ref={maskCanvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-50"
        />
      </div>

      <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="flex w-72 items-center gap-2 rounded-lg border bg-background/95 px-3 py-2 shadow-md backdrop-blur">
          <span className="text-[11px] text-muted-foreground">{t('remove.brush')}</span>
          <Slider
            min={1}
            max={15}
            step={0.5}
            value={[brushPct]}
            onValueChange={(v) => {
              const n = v[0];
              if (n !== undefined) setBrushPct(n);
            }}
            className="flex-1"
          />
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={clearMask}>
            <Eraser className="size-3.5" />
          </Button>
        </div>

        <div className="rounded bg-background/95 px-2 py-1 text-[11px] text-muted-foreground shadow">
          {status ?? `${t('remove.help')} (${model?.approxSizeMb ?? 200} MB, ${model?.license ?? ''})`}
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={cancel} className="h-7 gap-1 px-3 text-xs">
            <X className="size-3.5" />
            {t('common.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={() => {
              void apply();
            }}
            disabled={!hasPaint || busy}
            className="h-7 gap-1 px-3 text-xs"
          >
            {busy ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Check className="size-3.5" />
            )}
            {t('remove.apply')}
          </Button>
        </div>
      </div>
    </div>
  );
}
