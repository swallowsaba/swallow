import * as React from 'react';
import { WebGLImageRenderer, type MaskLayer } from '../model/webgl-renderer';
import {
  clampOffset,
  clampScale,
  computeFillScale,
  computeFitScale,
  type Point,
  type Size,
} from '../model/viewport';
import { croppedImageSize, FULL_CROP } from '../model/crop-math';
import { useViewerStore } from '../model/viewer-store';
import { ViewerControls } from './viewer-controls';
import { CropOverlay } from './crop-overlay';
import { RemoveObjectOverlay } from './remove-object-overlay';
import { WhiteBalancePickerOverlay } from './white-balance-picker-overlay';
import { MaskOverlay } from '@/features/masks/components/mask-overlay';
import { useMaskUiStore } from '@/features/masks/model/mask-ui-store';
import { activeMasks } from '@/features/masks/model/mask-ops';
import { rasterizeMaskAlpha } from '@/features/masks/model/mask-alpha';
import { layerUniforms } from '@/features/masks/model/mask-adjust';
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
  const cropMode = useViewerStore((s) => s.cropMode);
  const removeMode = useViewerStore((s) => s.removeMode);
  const wbPickMode = useViewerStore((s) => s.wbPickMode);
  const maskMode = useMaskUiStore((s) => s.maskMode);

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

  // The crop rect (normalized to the source image) and the effective size it
  // implies. Fit/fill/pan math all use the cropped size, since a cropped
  // image should behave like a smaller image for viewport purposes. While
  // actively cropping, show the full frame so the user can reposition freely.
  // Computed before the mask memos so rasterization can size to the cropped
  // aspect.
  const crop =
    cropMode || removeMode || wbPickMode
      ? FULL_CROP
      : (renderEdit?.geometry.crop ?? FULL_CROP);
  const croppedSize = imageSize ? croppedImageSize(imageSize, crop) : null;
  const croppedW = croppedSize?.width ?? null;
  const croppedH = croppedSize?.height ?? null;

  // Active masks (enabled + non-empty). `applyAdjustments` keeps the same masks
  // array reference, so `masks` (and the rasterization below) stay referentially
  // stable during a global slider drag and are NOT recomputed every frame — only
  // editing a mask changes the array.
  const masks = renderEdit?.masks;
  const adjustments = renderEdit?.adjustments;
  const activeMaskList = React.useMemo(
    () => (showBefore || !masks ? [] : activeMasks(masks)),
    [showBefore, masks],
  );

  // Rasterize each active mask's coverage once, keyed on the mask set and the
  // cropped size — the costly part, deliberately decoupled from adjustments.
  const maskAlphas = React.useMemo(() => {
    if (activeMaskList.length === 0 || croppedW === null || croppedH === null) return [];
    const longEdge = 1024;
    const aspect = croppedW / croppedH;
    const aw = aspect >= 1 ? longEdge : Math.max(1, Math.round(longEdge * aspect));
    const ah = aspect >= 1 ? Math.max(1, Math.round(longEdge / aspect)) : longEdge;
    return activeMaskList.map((mask) => ({
      alpha: rasterizeMaskAlpha(mask, aw, ah),
      alphaWidth: aw,
      alphaHeight: ah,
    }));
  }, [activeMaskList, croppedW, croppedH]);

  // Pair each coverage buffer with uniforms for (global + local) adjustments.
  // Cheap, so it can track adjustment changes every frame without re-rasterizing.
  const maskLayers = React.useMemo<readonly MaskLayer[]>(() => {
    if (!adjustments || maskAlphas.length === 0) return [];
    const layers: MaskLayer[] = [];
    activeMaskList.forEach((mask, i) => {
      const a = maskAlphas[i];
      if (!a) return;
      const { uniforms: u, advanced } = layerUniforms(adjustments, mask.adjustments);
      layers.push({
        uniforms: u,
        advanced,
        alpha: a.alpha,
        alphaWidth: a.alphaWidth,
        alphaHeight: a.alphaHeight,
      });
    });
    return layers;
  }, [activeMaskList, maskAlphas, adjustments]);

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
    croppedSize && container.width > 0
      ? clampScale(effectiveScale(mode, scale, croppedSize, container, rotationDeg))
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
    crop,
    imageSize,
    maskLayers,
  });
  paramsRef.current = {
    drawScale,
    offset,
    rotationDeg,
    container,
    uniforms,
    advancedUniforms,
    crop,
    imageSize,
    maskLayers,
  };

  const schedulerRef = React.useRef<RafScheduler | null>(null);
  if (!schedulerRef.current) {
    schedulerRef.current = createRafScheduler(() => {
      const renderer = rendererRef.current;
      const p = paramsRef.current;
      if (!renderer || !p.imageSize) return;
      const dpr = window.devicePixelRatio || 1;
      const viewTransform = { scale: p.drawScale, offset: p.offset, rotationDeg: p.rotationDeg };
      if (p.maskLayers.length > 0) {
        renderer.renderWithMasks(
          viewTransform,
          p.container,
          dpr,
          { uniforms: p.uniforms, advanced: p.advancedUniforms },
          p.crop,
          p.maskLayers,
        );
      } else {
        renderer.render(
          viewTransform,
          p.container,
          dpr,
          p.uniforms,
          p.advancedUniforms,
          p.crop,
        );
      }
    });
  }

  // Request a coalesced render whenever inputs change.
  React.useEffect(() => {
    schedulerRef.current?.schedule();
  }, [
    imageSize,
    drawScale,
    offset,
    rotationDeg,
    container,
    uniforms,
    advancedUniforms,
    crop,
    maskLayers,
  ]);

  React.useEffect(() => {
    return () => {
      schedulerRef.current?.cancel();
    };
  }, []);

  // Panning.
  const dragRef = React.useRef<{ start: Point; origin: Point } | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if (!croppedSize) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { start: { x: e.clientX, y: e.clientY }, origin: offset };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || !croppedSize) return;
    const next: Point = {
      x: drag.origin.x + (e.clientX - drag.start.x),
      y: drag.origin.y + (e.clientY - drag.start.y),
    };
    const scaled: Size = {
      width: croppedSize.width * drawScale,
      height: croppedSize.height * drawScale,
    };
    setOffset(clampOffset(next, scaled, container));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Wheel zoom (Ctrl/trackpad pinch or plain wheel).
  const onWheel = (e: React.WheelEvent) => {
    if (!croppedSize) return;
    const factor = Math.exp(-e.deltaY * 0.0015);
    setCustomScale(clampScale(drawScale * factor));
  };

  // Any full-frame editing overlay locks pan/zoom so screen↔image mapping the
  // overlays rely on stays a simple fit placement.
  const interactionLocked = cropMode || removeMode || wbPickMode || maskMode;

  const setMode = useViewerStore((s) => s.setMode);
  // On entering mask mode, snap to a stable fit view so the overlay's
  // fit-based coordinate mapping lines up with what's on screen.
  React.useEffect(() => {
    if (maskMode) {
      setMode('fit');
      setOffset({ x: 0, y: 0 });
    }
  }, [maskMode, setMode, setOffset]);

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden bg-black/30"
      onWheel={interactionLocked ? undefined : onWheel}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full touch-none"
        style={{
          cursor: interactionLocked ? 'default' : dragRef.current ? 'grabbing' : 'grab',
        }}
        onPointerDown={interactionLocked ? undefined : onPointerDown}
        onPointerMove={interactionLocked ? undefined : onPointerMove}
        onPointerUp={interactionLocked ? undefined : onPointerUp}
      />
      {imageSize && cropMode ? (
        <CropOverlay imageSize={imageSize} container={container} rotationDeg={rotationDeg} />
      ) : null}
      {imageSize && removeMode ? (
        <RemoveObjectOverlay imageSize={imageSize} container={container} />
      ) : null}
      {imageSize && wbPickMode ? (
        <WhiteBalancePickerOverlay imageSize={imageSize} container={container} />
      ) : null}
      {imageSize && maskMode && croppedSize ? (
        <MaskOverlay croppedSize={croppedSize} container={container} />
      ) : null}
      {imageSize && !interactionLocked ? <ViewerControls effectiveScale={drawScale} /> : null}
    </div>
  );
}
