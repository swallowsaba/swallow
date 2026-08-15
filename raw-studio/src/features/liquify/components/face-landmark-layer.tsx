import * as React from 'react';
import { computeFitScale, type Size } from '@/features/viewer/model/viewport';
import { LANDMARK_POINTS, type LandmarkPoint } from '../model/face-reshape';
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

const EYE_POINTS: ReadonlySet<LandmarkPoint> = new Set(['leftEye', 'rightEye']);

/**
 * Draws the estimated face landmarks as draggable handles so the auto estimate
 * can be nudged onto the real eyes/jaw. Dragging updates the shared landmark
 * state; the panel re-derives the warp preview from it.
 */
export function FaceLandmarkLayer({ croppedSize, container }: Props): React.JSX.Element | null {
  const landmarks = useLiquifyUiStore((s) => s.faceLandmarks);
  const moveFaceLandmark = useLiquifyUiStore((s) => s.moveFaceLandmark);
  const rootRef = React.useRef<SVGSVGElement>(null);
  const dragRef = React.useRef<LandmarkPoint | null>(null);

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

  if (!landmarks) return null;

  const toNorm = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = rootRef.current?.getBoundingClientRect();
    const lx = clientX - (rect?.left ?? 0) - placement.originX;
    const ly = clientY - (rect?.top ?? 0) - placement.originY;
    return {
      x: placement.dispW === 0 ? 0 : lx / placement.dispW,
      y: placement.dispH === 0 ? 0 : ly / placement.dispH,
    };
  };

  const onDown = (id: LandmarkPoint) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    dragRef.current = id;
  };
  const onMove = (e: React.PointerEvent) => {
    const id = dragRef.current;
    if (!id) return;
    const { x, y } = toNorm(e.clientX, e.clientY);
    moveFaceLandmark(id, x, y);
  };
  const onUp = () => {
    dragRef.current = null;
  };

  const sx = (nx: number) => placement.originX + nx * placement.dispW;
  const sy = (ny: number) => placement.originY + ny * placement.dispH;

  return (
    <svg
      ref={rootRef}
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: 'none' }}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      {LANDMARK_POINTS.map((id) => {
        const p = landmarks[id];
        const isEye = EYE_POINTS.has(id);
        return (
          <g key={id} style={{ pointerEvents: 'auto', cursor: 'grab' }} onPointerDown={onDown(id)}>
            <circle
              cx={sx(p.x)}
              cy={sy(p.y)}
              r={isEye ? 10 : 8}
              fill={isEye ? 'rgba(80,160,255,0.35)' : 'rgba(232,68,68,0.3)'}
              stroke={isEye ? 'rgb(80,160,255)' : 'rgb(232,68,68)'}
              strokeWidth={2}
            />
            <circle cx={sx(p.x)} cy={sy(p.y)} r={2} fill="#fff" />
          </g>
        );
      })}
    </svg>
  );
}
