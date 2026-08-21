import * as React from 'react';
import type { CurvePoint, RgbChannel } from '@/types';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import { cn } from '@/lib/utils';
import { useT } from '@/i18n';
import {
  addPoint,
  evalCurve,
  findPoint,
  IDENTITY_CURVE,
  isIdentityCurve,
  movePoint,
  removePoint,
} from '../model/tone-curve';

const W = 232;
const H = 160;
const PAD = 8;
const IW = W - PAD * 2;
const IH = H - PAD * 2;

const toSvgX = (x: number): number => PAD + x * IW;
const toSvgY = (y: number): number => PAD + (1 - y) * IH;

const CHANNELS: readonly { key: RgbChannel; stroke: string; dot: string }[] = [
  { key: 'rgb', stroke: 'rgb(230,230,230)', dot: 'rgb(80,140,255)' },
  { key: 'red', stroke: 'rgb(255,90,90)', dot: 'rgb(255,90,90)' },
  { key: 'green', stroke: 'rgb(80,210,120)', dot: 'rgb(80,210,120)' },
  { key: 'blue', stroke: 'rgb(90,140,255)', dot: 'rgb(90,140,255)' },
];

/**
 * Free-form tone curves per channel (master RGB + red/green/blue): click to add
 * points, drag to shape, double-click a point to remove it. Writes
 * `toneCurves[channel]`; the renderer applies all four via a 256-entry LUT, so
 * edits show live and bake into the export.
 */
export function ToneCurveEditor(): React.JSX.Element | null {
  const edit = useEditorStore(selectCurrentEdit);
  const setPreview = useEditorStore((s) => s.setPreview);
  const commitAdjustments = useEditorStore((s) => s.commitAdjustments);
  const t = useT();
  const svgRef = React.useRef<SVGSVGElement>(null);
  const dragIndexRef = React.useRef<number | null>(null);
  const [channel, setChannel] = React.useState<RgbChannel>('rgb');

  const stored = edit?.adjustments.toneCurves[channel] ?? IDENTITY_CURVE;
  const [working, setWorking] = React.useState<readonly CurvePoint[]>(stored);
  const draggingRef = React.useRef(false);

  // Keep in sync with the store (channel switch or external change) when idle.
  React.useEffect(() => {
    if (!draggingRef.current) setWorking(stored);
  }, [stored]);

  if (!edit) return null;

  const chan = CHANNELS.find((c) => c.key === channel) ?? CHANNELS[0]!;

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
    setPreview({ toneCurves: { [channel]: pts } });
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
    commitAdjustments({ toneCurves: { [channel]: working } }, t('curve.editLabel'));
  };
  const onDoubleClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const { x, y } = toNorm(e.clientX, e.clientY);
    const idx = findPoint(working, x, y, 0.05);
    if (idx <= 0 || idx >= working.length - 1) return;
    const pts = removePoint(working, idx);
    setWorking(pts);
    commitAdjustments({ toneCurves: { [channel]: pts } }, t('curve.removeLabel'));
  };

  const reset = () => {
    setWorking(IDENTITY_CURVE);
    commitAdjustments({ toneCurves: { [channel]: IDENTITY_CURVE } }, t('curve.resetLabel'));
  };

  // Sample the curve as a smooth polyline.
  const line: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const x = i / 48;
    line.push(`${toSvgX(x).toFixed(1)},${toSvgY(evalCurve(working, x)).toFixed(1)}`);
  }

  return (
    <div className="flex flex-col gap-1.5 p-3">
      <div className="flex items-center justify-between">
        <div className="flex overflow-hidden rounded border border-border">
          {CHANNELS.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => {
                setChannel(c.key);
              }}
              className={cn(
                'px-2 py-0.5 text-[10px] font-medium',
                channel === c.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              {t(`curve.channel.${c.key}`)}
            </button>
          ))}
        </div>
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
          <React.Fragment key={g}>
            <line x1={toSvgX(g)} y1={PAD} x2={toSvgX(g)} y2={H - PAD} stroke="rgba(255,255,255,0.07)" />
            <line x1={PAD} y1={toSvgY(g)} x2={W - PAD} y2={toSvgY(g)} stroke="rgba(255,255,255,0.07)" />
          </React.Fragment>
        ))}
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={PAD} stroke="rgba(255,255,255,0.12)" />
        <polyline points={line.join(' ')} fill="none" stroke={chan.stroke} strokeWidth={1.5} />
        {working.map((p, i) => (
          <circle
            key={i}
            cx={toSvgX(p.x)}
            cy={toSvgY(p.y)}
            r={4}
            fill="#fff"
            stroke={chan.dot}
            strokeWidth={2}
          />
        ))}
      </svg>
      <p className="text-[10px] leading-tight text-muted-foreground">{t('curve.hint')}</p>
    </div>
  );
}
