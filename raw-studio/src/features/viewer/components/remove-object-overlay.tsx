import * as React from 'react';
import { computeFitScale, type Size } from '../model/viewport';
import { useViewerStore } from '../model/viewer-store';
import { inpaint } from '@/features/ai/model/inpaint';
import { downloadBlob } from '@/features/export/model/export';
import { useT } from '@/i18n';

interface Props {
  imageSize: Size;
  container: Size;
}

/**
 * Remove-object overlay — the PAINT SURFACE ONLY. All buttons/sliders now live
 * in the right-panel RemovePanel; this component just hosts the mask canvas the
 * user paints on and executes commands the panel dispatches through the viewer
 * store. Nothing floats on top of the image except a one-line hint, so controls
 * never overlap or block the photo.
 */
export function RemoveObjectOverlay({ imageSize, container }: Props): React.JSX.Element {
  const bitmap = useViewerStore((s) => s.bitmap);
  const setRemoveMode = useViewerStore((s) => s.setRemoveMode);
  const brushPct = useViewerStore((s) => s.removeBrushPct);
  const subMode = useViewerStore((s) => s.removeSubMode);
  const setHasPaintStore = useViewerStore((s) => s.setRemoveHasPaint);
  const setBusyStore = useViewerStore((s) => s.setRemoveBusy);
  const setStatusStore = useViewerStore((s) => s.setRemoveStatus);
  const setHasPreviewStore = useViewerStore((s) => s.setRemoveHasPreview);
  const command = useViewerStore((s) => s.removeCommand);
  const t = useT();

  const maskCanvasRef = React.useRef<HTMLCanvasElement>(null);
  const drawingRef = React.useRef(false);
  const lastPointRef = React.useRef<{ x: number; y: number } | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const previewBlobRef = React.useRef<Blob | null>(null);

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

  React.useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const brushRadiusPx = (brushPct / 100) * Math.max(imageSize.width, imageSize.height);

  const toImageCoords = (clientX: number, clientY: number, rect: DOMRect) => {
    // rect already includes the (originX, originY) offset since the div is
    // positioned there, so we only go to div-local coords (no double offset).
    return { x: (clientX - rect.left) / fitScale, y: (clientY - rect.top) / fitScale };
  };

  const paintAt = (x: number, y: number, from: { x: number; y: number } | null) => {
    const ctx = maskCanvasRef.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = ctx.strokeStyle = 'rgba(255,60,60,1)';
    ctx.lineWidth = brushRadiusPx * 2;
    ctx.lineCap = ctx.lineJoin = 'round';
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
    setHasPaintStore(true);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (previewUrl) return;
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

  const clearMask = React.useCallback(() => {
    const canvas = maskCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasPaintStore(false);
  }, [setHasPaintStore]);

  const autoDetect = React.useCallback(async () => {
    if (!bitmap) return;
    setBusyStore(true);
    setStatusStore(t('remove.autoWorking'));
    try {
      const { suggestMeshMask } = await import('@/features/ai/model/suggest-mask');
      const suggested = await suggestMeshMask(bitmap);
      const ctx = maskCanvasRef.current?.getContext('2d');
      if (ctx) {
        ctx.drawImage(suggested, 0, 0);
        setHasPaintStore(true);
        setStatusStore(t('remove.autoDetected'));
      }
    } catch (err) {
      setStatusStore(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusyStore(false);
    }
  }, [bitmap, setBusyStore, setStatusStore, setHasPaintStore, t]);

  const runInpaint = React.useCallback(async () => {
    const canvas = maskCanvasRef.current;
    if (!bitmap || !canvas) return;
    setBusyStore(true);
    setStatusStore(t('remove.filling'));
    try {
      const maskOffscreen = new OffscreenCanvas(imageSize.width, imageSize.height);
      const mctx = maskOffscreen.getContext('2d');
      if (!mctx) throw new Error('2D context unavailable.');
      mctx.drawImage(canvas, 0, 0);
      const blob = await inpaint('lama-inpaint', bitmap, maskOffscreen, (received, total) => {
        const mb = (received / 1_000_000).toFixed(0);
        const totalMb = total ? (total / 1_000_000).toFixed(0) : '?';
        setStatusStore(`${mb}/${totalMb} MB…`);
      });
      previewBlobRef.current = blob;
      setPreviewUrl(URL.createObjectURL(blob));
      setHasPreviewStore(true);
      setStatusStore(null);
    } catch (err) {
      setStatusStore(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setBusyStore(false);
    }
  }, [bitmap, imageSize.width, imageSize.height, setBusyStore, setStatusStore, setHasPreviewStore, t]);

  const download = React.useCallback(() => {
    if (previewBlobRef.current) downloadBlob(previewBlobRef.current, 'object-removed.jpg');
    setRemoveMode(false);
  }, [setRemoveMode]);

  const redo = React.useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    previewBlobRef.current = null;
    setHasPreviewStore(false);
    clearMask();
  }, [setHasPreviewStore, clearMask]);

  const lastCmdId = React.useRef(0);
  React.useEffect(() => {
    if (!command || command.id === lastCmdId.current) return;
    lastCmdId.current = command.id;
    switch (command.name) {
      case 'remove':
        if (previewUrl) void download();
        else void runInpaint();
        break;
      case 'redo':
        redo();
        break;
      case 'autoDetect':
        void autoDetect();
        break;
      case 'clear':
        clearMask();
        break;
    }
  }, [command, previewUrl, download, runInpaint, redo, autoDetect, clearMask]);

  return (
    <div className="absolute inset-0">
      <div className="pointer-events-none absolute left-1/2 top-4 z-10 -translate-x-1/2">
        <div className="rounded-full border bg-background/95 px-4 py-1.5 text-sm text-foreground shadow-lg backdrop-blur">
          {previewUrl
            ? t('remove.previewReady')
            : subMode === 'manual'
              ? t('remove.hintManual')
              : t('remove.hintAuto')}
        </div>
      </div>

      <div
        className="absolute touch-none"
        style={{
          left: originX,
          top: originY,
          width: dispW,
          height: dispH,
          cursor: previewUrl ? 'default' : 'crosshair',
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <canvas
          ref={maskCanvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full opacity-50"
          style={{ display: previewUrl ? 'none' : 'block' }}
        />
        {previewUrl ? (
          <img
            src={previewUrl}
            alt="preview"
            className="pointer-events-none absolute inset-0 h-full w-full object-contain"
          />
        ) : null}
      </div>
    </div>
  );
}
