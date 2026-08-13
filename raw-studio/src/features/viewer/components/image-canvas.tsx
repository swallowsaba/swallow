import * as React from 'react';
import { WebGLImageRenderer } from '../model/webgl-renderer';
import {
  clampOffset,
  clampScale,
  computeFillScale,
  computeFitScale,
  type Point,
  type Size,
} from '../model/viewport';
import { useViewerStore } from '../model/viewer-store';
import { ViewerControls } from './viewer-controls';
import { createRafScheduler, type RafScheduler } from '@/features/perf';
import {
  NEUTRAL_UNIFORMS,
  toAdjustmentUniforms,
} from '@/features/adjustments/model/adjustment-math';
import {
  NEUTRAL_ADVANCED,
  toAdvancedUniforms,
} from '@/features/adjustments/model/advanced-math';
import { useRenderEdit } from '@/features/editor';

/** Effective scale for the current mode + measured container. */
function effectiveScale(
  mode: string,
  customScale: number,
  image: Size,
  container: Size,
  rotationDeg: number,
): number {
  if (mode === 'fit') return computeFitScale(image, container, rotationDeg);
  if (mode === 'fill') return computeFillScale(image, container, rotationDeg);
  return customScale;
}

export function ImageCanvas(): React.JSX.Element {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rendererRef = React.useRef<WebGLImageRenderer | null>(null);
  const [container, setContainer] = React.useState<Size>({ width: 0, height: 0 });

  const bitmap = useViewerStore((s) => s.bitmap);
  const imageSize = useViewerStore((s) => s.imageSize);
  const mode = useViewerStore((s) => s.mode);
  const scale = useViewerStore((s) => s.scale);
  const offset = useViewerStore((s) => s.offset);
  const rotationDeg = useViewerStore((s) => s.rotationDeg);
  const setOffset = useViewerStore((s) => s.setOffset);
  const setCustomScale = useViewerStore((s) => s.setCustomScale);
  const showBefore = useViewerStore((s) => s.showBefore);

  // Adjustment uniforms from the current render state (present + live preview).
  const renderEdit = useRenderEdit();
  const uniforms = React.useMemo(
    () =>
      showBefore || !renderEdit
        ? NEUTRAL_UNIFORMS
        : toAdjustmentUniforms(renderEdit.adjustments.basic),
    [showBefore, renderEdit],
  );
  const advancedUniforms = React.useMemo(
    () =>
      showBefore || !renderEdit ? NEUTRAL_ADVANCED : toAdvancedUniforms(renderEdit.adjustments),
    [showBefore, renderEdit],
  );

  // Create the renderer once.
  React.useEffect(() => {
    if (!canvasRef.current) return;
    let renderer: WebGLImageRenderer | null = null;
    try {
      renderer = new WebGLImageRenderer(canvasRef.current);
      rendererRef.current = renderer;
    } catch (error) {
      console.error(error);
    }
    return () => {
      renderer?.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Track container size.
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setContainer({ width: rect.width, height: rect.height });
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Upload the bitmap when it changes.
  React.useEffect(() => {
    if (bitmap && rendererRef.current) rendererRef.current.setImage(bitmap);
  }, [bitmap]);

  const drawScale =
    imageSize && container.width > 0
      ? clampScale(effectiveScale(mode, scale, imageSize, container, rotationDeg))
      : 1;

  // Keep the latest render params in a ref so the rAF scheduler always draws the
  // newest state, coalescing rapid updates (slider drags) to one draw per frame.
  const paramsRef = React.useRef({
    drawScale,
    offset,
    rotationDeg,
    container,
    uniforms,
    advancedUniforms,
    imageSize,
  });
  paramsRef.current = {
    drawScale,
    offset,
    rotationDeg,
    container,
    uniforms,
    advancedUniforms,
    imageSize,
  };

  const schedulerRef = React.useRef<RafScheduler | null>(null);
  if (!schedulerRef.current) {
    schedulerRef.current = createRafScheduler(() => {
      const renderer = rendererRef.current;
      const p = paramsRef.current;
      if (!renderer || !p.imageSize) return;
      const dpr = window.devicePixelRatio || 1;
      renderer.render(
        { scale: p.drawScale, offset: p.offset, rotationDeg: p.rotationDeg },
        p.container,
        dpr,
        p.uniforms,
        p.advancedUniforms,
      );
    });
  }

  // Request a coalesced render whenever inputs change.
  React.useEffect(() => {
    schedulerRef.current?.schedule();
  }, [imageSize, drawScale, offset, rotationDeg, container, uniforms, advancedUniforms]);

  React.useEffect(() => {
    return () => {
      schedulerRef.current?.cancel();
    };
  }, []);

  // Panning.
  const dragRef = React.useRef<{ start: Point; origin: Point } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!imageSize) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { start: { x: e.clientX, y: e.clientY }, origin: offset };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !imageSize) return;
    const next: Point = {
      x: drag.origin.x + (e.clientX - drag.start.x),
      y: drag.origin.y + (e.clientY - drag.start.y),
    };
    const scaled: Size = {
      width: imageSize.width * drawScale,
      height: imageSize.height * drawScale,
    };
    setOffset(clampOffset(next, scaled, container));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Wheel zoom (Ctrl/trackpad pinch or plain wheel).
  const onWheel = (e: React.WheelEvent) => {
    if (!imageSize) return;
    const factor = Math.exp(-e.deltaY * 0.0015);
    setCustomScale(clampScale(drawScale * factor));
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-black/30"
      onWheel={onWheel}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{ cursor: dragRef.current ? 'grabbing' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
      {imageSize ? <ViewerControls effectiveScale={drawScale} /> : null}
    </div>
  );
}
