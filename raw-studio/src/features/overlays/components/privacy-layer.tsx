import * as React from 'react';
import type { PrivacyOverlay } from '@/types';
import { computeFitScale, type Size } from '@/features/viewer/model/viewport';
import { useEditorStore, useRenderEdit } from '@/features/editor';
import { useOverlayUiStore } from '../model/overlay-ui-store';

interface Props {
  croppedSize: Size;
  container: Size;
  interactive: boolean;
}

interface Placement {
  originX: number;
  originY: number;
  dispW: number;
  dispH: number;
}

/**
 * Renders privacy regions as HTML boxes over the stage so `backdrop-filter` can
 * live-preview the blur/mosaic against the WebGL canvas underneath (SVG can't).
 * The real mosaic/blur is baked at export; the preview is a close approximation.
 * Drag to move; size/strength come from the panel.
 */
export function PrivacyLayer({ croppedSize, container, interactive }: Props): React.JSX.Element | null {
  const edit = useRenderEdit();
  const activeOverlayId = useOverlayUiStore((s) => s.activeOverlayId);
  const editOverlay = useOverlayUiStore((s) => s.editOverlay);
  const setOverlayPreview = useEditorStore((s) => s.setOverlayPreview);
  const commitOverlayMove = useEditorStore((s) => s.commitOverlayMove);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const dragRef = React.useRef<string | null>(null);

  const placement: Placement = React.useMemo(() => {
    const scale = computeFitScale(croppedSize, container, 0);
    const dispW = croppedSize.width * scale;
    const dispH = croppedSize.height * scale;
    return {
      originX: (container.width - dispW) / 2,
      originY: (container.height - dispH) / 2,
      dispW,
      dispH,
    };
  }, [croppedSize, container]);

  const regions = edit?.overlays.filter((o): o is PrivacyOverlay => o.kind === 'privacy') ?? [];
  if (regions.length === 0) return null;

  const toNorm = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = rootRef.current?.getBoundingClientRect();
    const lx = clientX - (rect?.left ?? 0) - placement.originX;
    const ly = clientY - (rect?.top ?? 0) - placement.originY;
    return {
      x: placement.dispW === 0 ? 0 : Math.max(0, Math.min(1, lx / placement.dispW)),
      y: placement.dispH === 0 ? 0 : Math.max(0, Math.min(1, ly / placement.dispH)),
    };
  };

  const onDown = (id: string) => (e: React.PointerEvent) => {
    if (!interactive) return;
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    editOverlay(id);
    dragRef.current = id;
  };
  const onMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const { x, y } = toNorm(e.clientX, e.clientY);
    setOverlayPreview({ id: dragRef.current, x, y });
  };
  const onUp = (e: React.PointerEvent) => {
    const id = dragRef.current;
    dragRef.current = null;
    if (!id) return;
    const { x, y } = toNorm(e.clientX, e.clientY);
    commitOverlayMove(id, x, y, 'Move privacy region');
  };

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      style={{ pointerEvents: 'none' }}
      onPointerMove={interactive ? onMove : undefined}
      onPointerUp={interactive ? onUp : undefined}
    >
      {regions.map((o) => {
        const w = o.w * placement.dispW;
        const h = o.h * placement.dispH;
        const left = placement.originX + o.x * placement.dispW - w / 2;
        const top = placement.originY + o.y * placement.dispH - h / 2;
        const minDim = Math.max(1, Math.min(w, h));
        const active = interactive && o.id === activeOverlayId;
        const blurPx =
          o.style === 'pixelate'
            ? Math.max(3, minDim * (0.06 + o.strength * 0.22))
            : Math.max(2, minDim * (0.04 + o.strength * 0.15));
        const style: React.CSSProperties = {
          position: 'absolute',
          left,
          top,
          width: w,
          height: h,
          pointerEvents: interactive ? 'auto' : 'none',
          cursor: interactive ? 'move' : 'default',
          boxSizing: 'border-box',
          ...(active ? { outline: '2px solid rgb(232,68,68)' } : {}),
          ...(o.style === 'block'
            ? { background: o.color }
            : {
                backdropFilter: `blur(${String(Math.round(blurPx))}px)`,
                WebkitBackdropFilter: `blur(${String(Math.round(blurPx))}px)`,
              }),
        };
        return <div key={o.id} style={style} onPointerDown={onDown(o.id)} />;
      })}
    </div>
  );
}
