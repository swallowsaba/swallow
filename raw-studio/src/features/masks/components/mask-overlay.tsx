import * as React from 'react';
import type { BrushMaskData, LinearMaskData, MaskStrokePoint, RadialMaskData } from '@/types';
import type { Size } from '@/features/viewer/model/viewport';
import { useActiveMask, useEditorStore } from '@/features/editor';
import { useMaskUiStore } from '../model/mask-ui-store';
import {
  dragLinear,
  dragRadial,
  fitPlacement,
  normToScreen,
  pickLinearHandle,
  pickRadialHandle,
  radialHandlePoints,
  screenToNorm,
  type LinearHandle,
  type Placement,
  type RadialHandle,
} from '../model/mask-overlay-math';
import { rasterizeMaskAlpha } from '../model/mask-alpha';

interface Props {
  croppedSize: Size;
  container: Size;
}

const HANDLE_TOLERANCE = 0.035; // normalized hit radius for grabbing handles

/**
 * Interactive overlay for editing the active mask directly on the image. Radial
 * and linear masks expose drag handles; brush masks paint strokes. Live drags
 * update a render-only preview; the change is committed to history on release,
 * so a whole drag or stroke is a single undo step. A faint red tint shows the
 * current coverage.
 */
export function MaskOverlay({ croppedSize, container }: Props): React.JSX.Element | null {
  const activeMaskId = useMaskUiStore((s) => s.activeMaskId);
  const brushTool = useMaskUiStore((s) => s.brushTool);
  const mask = useActiveMask(activeMaskId);
  const setMaskPreview = useEditorStore((s) => s.setMaskPreview);
  const clearMaskPreview = useEditorStore((s) => s.clearMaskPreview);
  const commitMaskGeometry = useEditorStore((s) => s.commitMaskGeometry);

  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<
    | { kind: 'radial'; handle: RadialHandle }
    | { kind: 'linear'; handle: LinearHandle; lastX: number; lastY: number }
    | { kind: 'brush'; points: MaskStrokePoint[] }
    | null
  >(null);

  const placement: Placement = React.useMemo(
    () => fitPlacement(croppedSize, container),
    [croppedSize, container],
  );

  // Paint a faint coverage tint for the active mask.
  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dispW = Math.max(1, Math.round(placement.dispW));
    const dispH = Math.max(1, Math.round(placement.dispH));
    const rw = Math.min(320, dispW);
    const rh = Math.max(1, Math.round((rw * dispH) / dispW));
    canvas.width = rw;
    canvas.height = rh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, rw, rh);
    if (!mask) return;
    const alpha = rasterizeMaskAlpha(mask, rw, rh);
    const img = ctx.createImageData(rw, rh);
    for (let i = 0; i < alpha.length; i++) {
      const a = alpha[i] ?? 0;
      img.data[i * 4] = 232; // red tint
      img.data[i * 4 + 1] = 68;
      img.data[i * 4 + 2] = 68;
      img.data[i * 4 + 3] = Math.round(a * 0.4); // subtle
    }
    ctx.putImageData(img, 0, 0);
  }, [mask, placement]);

  if (!mask || !activeMaskId) return null;

  const localPoint = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = rootRef.current?.getBoundingClientRect();
    const lx = e.clientX - (rect?.left ?? 0);
    const ly = e.clientY - (rect?.top ?? 0);
    return screenToNorm(lx, ly, placement);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const { x, y } = localPoint(e);
    const geom = mask.geometry;
    if (geom.kind === 'radial') {
      const handle = pickRadialHandle(geom, x, y, HANDLE_TOLERANCE) ?? 'center';
      dragRef.current = { kind: 'radial', handle };
    } else if (geom.kind === 'linear') {
      const handle = pickLinearHandle(geom, x, y, HANDLE_TOLERANCE) ?? 'line';
      dragRef.current = { kind: 'linear', handle, lastX: x, lastY: y };
    } else {
      const pressure = e.pressure > 0 ? e.pressure : 1;
      dragRef.current = { kind: 'brush', points: [{ x, y, pressure }] };
      previewBrush(geom, [{ x, y, pressure }]);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { x, y } = localPoint(e);
    const geom = mask.geometry;
    if (drag.kind === 'radial' && geom.kind === 'radial') {
      const next = dragRadial(geom, drag.handle, x, y);
      setMaskPreview({ id: activeMaskId, geometry: next });
    } else if (drag.kind === 'linear' && geom.kind === 'linear') {
      const next = dragLinear(geom, drag.handle, x, y, x - drag.lastX, y - drag.lastY);
      drag.lastX = x;
      drag.lastY = y;
      setMaskPreview({ id: activeMaskId, geometry: next });
    } else if (drag.kind === 'brush' && geom.kind === 'brush') {
      const pressure = e.pressure > 0 ? e.pressure : 1;
      drag.points.push({ x, y, pressure });
      previewBrush(geom, drag.points);
    }
  };

  const previewBrush = (geom: BrushMaskData, points: MaskStrokePoint[]) => {
    const next: BrushMaskData =
      brushTool === 'erase'
        ? { ...geom, erase: [...geom.erase, points] }
        : { ...geom, strokes: [...geom.strokes, points] };
    setMaskPreview({ id: activeMaskId, geometry: next });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    if (!drag) return;
    const geom = mask.geometry;
    if (drag.kind === 'radial' && geom.kind === 'radial') {
      const { x, y } = localPoint(e);
      commitMaskGeometry(activeMaskId, dragRadial(geom, drag.handle, x, y), 'Adjust radial mask');
    } else if (drag.kind === 'linear' && geom.kind === 'linear') {
      const { x, y } = localPoint(e);
      const next = dragLinear(geom, drag.handle, x, y, 0, 0);
      commitMaskGeometry(activeMaskId, next, 'Adjust linear mask');
    } else if (drag.kind === 'brush' && geom.kind === 'brush' && drag.points.length > 0) {
      const next: BrushMaskData =
        brushTool === 'erase'
          ? { ...geom, erase: [...geom.erase, drag.points] }
          : { ...geom, strokes: [...geom.strokes, drag.points] };
      commitMaskGeometry(
        activeMaskId,
        next,
        brushTool === 'erase' ? 'Erase mask' : 'Paint mask',
      );
    } else {
      clearMaskPreview();
    }
  };

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 touch-none"
      style={{ cursor: mask.geometry.kind === 'brush' ? 'crosshair' : 'default' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute"
        style={{
          left: placement.originX,
          top: placement.originY,
          width: placement.dispW,
          height: placement.dispH,
        }}
      />
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        {mask.geometry.kind === 'radial' ? (
          <RadialHandles geom={mask.geometry} placement={placement} />
        ) : null}
        {mask.geometry.kind === 'linear' ? (
          <LinearHandles geom={mask.geometry} placement={placement} />
        ) : null}
      </svg>
    </div>
  );
}

function RadialHandles({
  geom,
  placement,
}: {
  geom: RadialMaskData;
  placement: Placement;
}): React.JSX.Element {
  const center = normToScreen(geom.centerX, geom.centerY, placement);
  const pts = radialHandlePoints(geom);
  const rx = geom.radiusX * placement.dispW;
  const ry = geom.radiusY * placement.dispH;
  return (
    <g stroke="rgb(232,68,68)" strokeWidth={1.5} fill="none">
      <ellipse
        cx={center.left}
        cy={center.top}
        rx={rx}
        ry={ry}
        transform={`rotate(${geom.rotation} ${center.left} ${center.top})`}
        strokeDasharray="4 3"
      />
      {(['center', 'edgeX', 'edgeY', 'rotate'] as RadialHandle[]).map((h) => {
        const p = normToScreen(pts[h].x, pts[h].y, placement);
        return (
          <circle key={h} cx={p.left} cy={p.top} r={5} fill="white" stroke="rgb(232,68,68)" />
        );
      })}
    </g>
  );
}

function LinearHandles({
  geom,
  placement,
}: {
  geom: LinearMaskData;
  placement: Placement;
}): React.JSX.Element {
  const start = normToScreen(geom.startX, geom.startY, placement);
  const end = normToScreen(geom.endX, geom.endY, placement);
  return (
    <g stroke="rgb(232,68,68)" strokeWidth={1.5}>
      <line x1={start.left} y1={start.top} x2={end.left} y2={end.top} strokeDasharray="4 3" />
      <circle cx={start.left} cy={start.top} r={6} fill="white" />
      <circle cx={end.left} cy={end.top} r={6} fill="rgb(232,68,68)" />
    </g>
  );
}
