import * as React from 'react';
import type { CurvePoint } from '@/types';
import { useT } from '@/i18n';
import {
  addPoint,
  evalCurve,
  findPoint,
  IDENTITY_CURVE,
  isIdentityCurve,
  movePoint,
  removePoint,
} from '@/features/adjustments/model/tone-curve';

const W = 216;
const H = 150;
const PAD = 8;
const IW = W - PAD * 2;
const IH = H - PAD * 2;
const toSvgX = (x: number): number => PAD + x * IW;
const toSvgY = (y: number): number => PAD + (1 - y) * IH;

/**
 * A mask's local RGB tone curve. Same point editing as the global curve, but
 * reads/writes the selected mask's `adjustments.toneCurve` through the mask
 * preview/commit callbacks. The curve renders within the mask because
 * mergeLocalIntoAdjustments feeds it to the layer's curve LUT.
 */
export function MaskToneCurve({
  curve,
  onPreview,
  onCommit,
}: {
  curve: readonly CurvePoint[] | undefined;
  onPreview: (pts: readonly CurvePoint[]) => void;
  onCommit: (pts: readonly CurvePoint[]) => void;
}): React.JSX.Element {
  const t = useT();
  const svgRef = React.useRef<SVGSVGElement>(null);
  const dragIndexRef = React.useRef<number | null>(null);
  const draggingRef = React.useRef(false);
  const stored = curve ?? IDENTITY_CURVE;
  const [working, setWorking] = React.useState<readonly CurvePoint[]>(stored);

  React.useEffect(() => {
    if (!draggingRef.current) setWorking(stored);
  }, [stored]);

  const toNorm = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { x: 0, y: 0 };
    const sx = ((clientX - rect.left) / rect.width) * W;
    const sy = ((clientY - rect.top) / rect.height) * H;
    return {
      x: Math.max(0, Math.min(1, (sx - PAD) / IW)),
      y: Math.max(0, Math.min(1, 1 - (sy - PAD) / IH)),
    };
  };

  const push = (pts: readonly CurvePoint[]): void => {
    setWorking(pts);
    onPreview(pts);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const { x, y } = toNorm(e.clientX, e.clientY);
    let idx = findPoint(working, x, y, 0.05);
    let pts = working;
    if (idx === -1) {
      pts = addPoint(working, x, y);
      idx = findPoint(pts, x, y, 0.06);
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    draggingRef.current = true;
    dragIndexRef.current = idx;
    push(pts);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const idx = dragIndexRef.current;
    if (idx === null) return;
    const { x, y } = toNorm(e.clientX, e.clientY);
    push(movePoint(working, idx, x, y));
  };
  const onPointerUp = () => {
    if (dragIndexRef.current === null) return;
    dragIndexRef.current = null;
    draggingRef.current = false;
    onCommit(working);
  };
  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const { x, y } = toNorm(e.clientX, e.clientY);
    const idx = findPoint(working, x, y, 0.05);
    if (idx <= 0 || idx >= working.length - 1) return;
    const pts = removePoint(working, idx);
    setWorking(pts);
    onCommit(pts);
  };
  const reset = () => {
    setWorking(IDENTITY_CURVE);
    onCommit(IDENTITY_CURVE);
  };

  const line: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const x = i / 48;
    line.push(`${toSvgX(x).toFixed(1)},${toSvgY(evalCurve(working, x)).toFixed(1)}`);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground">{t('curve.maskTitle')}</span>
        {!isIdentityCurve(working) ? (
          <button
            type="button"
            onClick={reset}
            className="text-[11px] text-muted-foreground hover:text-foreground"
          >
            {t('curve.reset')}
          </button>
        ) : null}
      </div>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        className="w-full touch-none rounded-md bg-black/50"
        style={{ aspectRatio: `${String(W)} / ${String(H)}` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
      >
        {[0.25, 0.5, 0.75].map((g) => (
          <line
            key={g}
            x1={toSvgX(g)}
            y1={PAD}
            x2={toSvgX(g)}
            y2={H - PAD}
            stroke="rgba(255,255,255,0.07)"
          />
        ))}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={PAD} stroke="rgba(255,255,255,0.12)" />
        <polyline points={line.join(' ')} fill="none" stroke="rgb(230,230,230)" strokeWidth={1.5} />
        {working.map((p, i) => (
          <circle
            key={i}
            cx={toSvgX(p.x)}
            cy={toSvgY(p.y)}
            r={4}
            fill="#fff"
            stroke="rgb(80,140,255)"
            strokeWidth={2}
          />
        ))}
      </svg>
    </div>
  );
}
