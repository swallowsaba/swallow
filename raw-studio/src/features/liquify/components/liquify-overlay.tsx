import * as React from 'react';
import type { WarpOp } from '@/types';
import { computeFitScale, type Size } from '@/features/viewer/model/viewport';
import { useEditorStore } from '@/features/editor';
import { defaultPushOp, radialOp } from '../model/warp-field';
import { useLiquifyUiStore } from '../model/liquify-ui-store';

interface Props {
  croppedSize: Size;
  container: Size;
}

interface Placement {
  originX: number;
  originY: number;
  dispW: number;
  dispH: number;
}

/**
 * Captures liquify strokes on the stage. Every tool accumulates small ops as the
 * pointer moves (push = drag-direction dabs; bloat/pinch = radial dabs), shown
 * live via the warp preview and committed as one history step on release.
 */
export function LiquifyOverlay({ croppedSize, container }: Props): React.JSX.Element {
  const tool = useLiquifyUiStore((s) => s.tool);
  const size = useLiquifyUiStore((s) => s.size);
  const strength = useLiquifyUiStore((s) => s.strength);
  const setWarpPreview = useEditorStore((s) => s.setWarpPreview);
  const commitWarp = useEditorStore((s) => s.commitWarp);

  const rootRef = React.useRef<HTMLDivElement>(null);
  const opsRef = React.useRef<WarpOp[]>([]);
  const lastRef = React.useRef<{ x: number; y: number } | null>(null);
  const [cursor, setCursor] = React.useState<{ x: number; y: number } | null>(null);

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

  const toNorm = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = rootRef.current?.getBoundingClientRect();
    const lx = clientX - (rect?.left ?? 0) - placement.originX;
    const ly = clientY - (rect?.top ?? 0) - placement.originY;
    const x = placement.dispW === 0 ? 0 : lx / placement.dispW;
    const y = placement.dispH === 0 ? 0 : ly / placement.dispH;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  const dab = (x: number, y: number) => {
    const prev = lastRef.current;
    if (tool === 'push') {
      if (prev) {
        const dx = x - prev.x;
        const dy = y - prev.y;
        if (dx !== 0 || dy !== 0) {
          opsRef.current.push(defaultPushOp(x, y, dx, dy, size, strength));
        }
      }
    } else {
      // Radial dabs accumulate gently so a hold/drag deepens the effect.
      opsRef.current.push(radialOp(tool, x, y, size, strength * 0.15));
    }
    lastRef.current = { x, y };
    setWarpPreview(opsRef.current.slice());
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    opsRef.current = [];
    lastRef.current = null;
    const { x, y } = toNorm(e.clientX, e.clientY);
    setCursor({ x, y });
    dab(x, y);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const { x, y } = toNorm(e.clientX, e.clientY);
    setCursor({ x, y });
    if (lastRef.current === null && opsRef.current.length === 0) return; // not dragging
    if (e.buttons === 0) return;
    dab(x, y);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    const ops = opsRef.current;
    opsRef.current = [];
    lastRef.current = null;
    if (ops.length > 0) {
      commitWarp(
        ops,
        tool === 'push' ? 'Liquify push' : tool === 'bloat' ? 'Liquify bloat' : 'Liquify pinch',
      );
    }
  };

  const cursorPx = cursor
    ? {
        left: placement.originX + cursor.x * placement.dispW,
        top: placement.originY + cursor.y * placement.dispH,
        d: size * Math.min(placement.dispW, placement.dispH) * 2,
      }
    : null;

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 touch-none"
      style={{ cursor: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => {
        setCursor(null);
      }}
    >
      {cursorPx ? (
        <div
          className="pointer-events-none absolute rounded-full border-2 border-white/80 shadow"
          style={{
            left: cursorPx.left,
            top: cursorPx.top,
            width: cursorPx.d,
            height: cursorPx.d,
            transform: 'translate(-50%, -50%)',
            boxShadow: '0 0 0 1px rgba(0,0,0,0.4)',
          }}
        />
      ) : null}
    </div>
  );
}
