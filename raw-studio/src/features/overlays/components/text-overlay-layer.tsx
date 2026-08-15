import * as React from 'react';
import type { EmojiOverlay, FrameOverlay, TextOverlay } from '@/types';
import { resolveFrameGeometry } from '../model/overlay-ops';
import { computeFitScale, type Size } from '@/features/viewer/model/viewport';
import { useEditorStore, useRenderEdit } from '@/features/editor';
import { useOverlayUiStore } from '../model/overlay-ui-store';

interface Props {
  croppedSize: Size;
  container: Size;
  /** When false the overlays are shown but not interactive (won't block pan). */
  interactive: boolean;
}

interface Placement {
  originX: number;
  originY: number;
  dispW: number;
  dispH: number;
}

/**
 * Renders text overlays on the stage and lets the active one be dragged. Uses a
 * rotation-agnostic fit placement (like the crop/mask overlays) so screen↔image
 * mapping is a simple scale. Outlines use SVG `paint-order: stroke` so the fill
 * sits on top of the stroke, matching the export baker.
 */
export function TextOverlayLayer({ croppedSize, container, interactive }: Props): React.JSX.Element | null {
  const edit = useRenderEdit();
  const activeOverlayId = useOverlayUiStore((s) => s.activeOverlayId);
  const editOverlay = useOverlayUiStore((s) => s.editOverlay);
  const setOverlayPreview = useEditorStore((s) => s.setOverlayPreview);
  const commitOverlayMove = useEditorStore((s) => s.commitOverlayMove);
  const rootRef = React.useRef<SVGSVGElement>(null);
  const dragRef = React.useRef<{ id: string } | null>(null);

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

  if (!edit || edit.overlays.length === 0) return null;

  const toNorm = (clientX: number, clientY: number): { x: number; y: number } => {
    const rect = rootRef.current?.getBoundingClientRect();
    const lx = clientX - (rect?.left ?? 0) - placement.originX;
    const ly = clientY - (rect?.top ?? 0) - placement.originY;
    const x = placement.dispW === 0 ? 0 : lx / placement.dispW;
    const y = placement.dispH === 0 ? 0 : ly / placement.dispH;
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
  };

  const onPointerDown = (id: string) => (e: React.PointerEvent) => {
    if (!interactive) return;
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    editOverlay(id);
    dragRef.current = { id };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const { x, y } = toNorm(e.clientX, e.clientY);
    setOverlayPreview({ id: drag.id, x, y });
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    const { x, y } = toNorm(e.clientX, e.clientY);
    commitOverlayMove(drag.id, x, y, 'Move text');
  };

  return (
    <svg
      ref={rootRef}
      className="absolute inset-0 h-full w-full"
      style={{ pointerEvents: 'none' }}
      onPointerMove={interactive ? onPointerMove : undefined}
      onPointerUp={interactive ? onPointerUp : undefined}
    >
      {edit.overlays.map((o) => {
        if (o.kind === 'text') {
          return (
            <TextNode
              key={o.id}
              overlay={o}
              placement={placement}
              active={interactive && o.id === activeOverlayId}
              interactive={interactive}
              onPointerDown={onPointerDown(o.id)}
            />
          );
        }
        if (o.kind === 'emoji') {
          return (
            <EmojiNode
              key={o.id}
              overlay={o}
              placement={placement}
              active={interactive && o.id === activeOverlayId}
              interactive={interactive}
              onPointerDown={onPointerDown(o.id)}
            />
          );
        }
        return <FrameNode key={o.id} overlay={o} placement={placement} />;
      })}
    </svg>
  );
}

function TextNode({
  overlay: o,
  placement,
  active,
  interactive,
  onPointerDown,
}: {
  overlay: TextOverlay;
  placement: Placement;
  active: boolean;
  interactive: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}): React.JSX.Element {
  const x = placement.originX + o.x * placement.dispW;
  const y = placement.originY + o.y * placement.dispH;
  const fontPx = Math.max(1, o.fontSize * Math.min(placement.dispW, placement.dispH));
  const strokePx = Math.max(0, o.strokeWidth) * fontPx;
  const lines = o.text.split('\n');
  const lineHeight = fontPx * 1.2;
  const anchor = o.align === 'left' ? 'start' : o.align === 'right' ? 'end' : 'middle';
  const startDy = -((lines.length - 1) * lineHeight) / 2;

  return (
    <g
      transform={`translate(${String(x)} ${String(y)}) rotate(${String(o.rotationDeg)})`}
      style={{
        pointerEvents: interactive ? 'auto' : 'none',
        cursor: interactive ? 'move' : 'default',
      }}
      onPointerDown={onPointerDown}
    >
      <text
        textAnchor={anchor}
        dominantBaseline="middle"
        fontFamily={o.fontFamily}
        fontSize={fontPx}
        fontWeight={o.fontWeight}
        fontStyle={o.italic ? 'italic' : 'normal'}
        fill={o.color}
        stroke={strokePx > 0 ? o.strokeColor : 'none'}
        strokeWidth={strokePx}
        strokeLinejoin="round"
        opacity={o.opacity}
        style={{
          paintOrder: 'stroke',
          userSelect: 'none',
          ...(o.shadow
            ? {
                filter: `drop-shadow(0 ${String(fontPx * 0.03)}px ${String(fontPx * 0.06)}px rgba(0,0,0,0.5))`,
              }
            : {}),
        }}
      >
        {lines.map((line, i) => (
          <tspan key={i} x={0} dy={i === 0 ? startDy : lineHeight}>
            {line.length > 0 ? line : ' '}
          </tspan>
        ))}
      </text>
      {active ? <circle cx={0} cy={0} r={Math.max(3, fontPx * 0.06)} fill="rgb(232,68,68)" /> : null}
    </g>
  );
}

function EmojiNode({
  overlay: o,
  placement,
  active,
  interactive,
  onPointerDown,
}: {
  overlay: EmojiOverlay;
  placement: Placement;
  active: boolean;
  interactive: boolean;
  onPointerDown: (e: React.PointerEvent) => void;
}): React.JSX.Element {
  const x = placement.originX + o.x * placement.dispW;
  const y = placement.originY + o.y * placement.dispH;
  const px = Math.max(1, o.size * Math.min(placement.dispW, placement.dispH));
  return (
    <g
      transform={`translate(${String(x)} ${String(y)}) rotate(${String(o.rotationDeg)})`}
      style={{
        pointerEvents: interactive ? 'auto' : 'none',
        cursor: interactive ? 'move' : 'default',
      }}
      onPointerDown={onPointerDown}
    >
      <text
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={px}
        opacity={o.opacity}
        style={{ userSelect: 'none' }}
      >
        {o.emoji}
      </text>
      {active ? <circle cx={0} cy={0} r={Math.max(3, px * 0.06)} fill="rgb(232,68,68)" /> : null}
    </g>
  );
}

function FrameNode({
  overlay: o,
  placement,
}: {
  overlay: FrameOverlay;
  placement: Placement;
}): React.JSX.Element {
  const g = resolveFrameGeometry(o, { width: placement.dispW, height: placement.dispH });
  const ox = placement.originX;
  const oy = placement.originY;
  if (o.style === 'border') {
    return (
      <rect
        x={ox + g.rx}
        y={oy + g.ry}
        width={g.rw}
        height={g.rh}
        rx={g.radiusPx}
        ry={g.radiusPx}
        fill="none"
        stroke={o.color}
        strokeWidth={g.thicknessPx}
        opacity={o.opacity}
        style={{ pointerEvents: 'none' }}
      />
    );
  }
  // Matte: fill the margin down to a rounded inner hole (even-odd path).
  const rr = Math.max(0, Math.min(g.radiusPx, g.rw / 2, g.rh / 2));
  const ix = ox + g.rx;
  const iy = oy + g.ry;
  const outer = `M ${String(ox)} ${String(oy)} H ${String(ox + placement.dispW)} V ${String(oy + placement.dispH)} H ${String(ox)} Z`;
  const inner =
    `M ${String(ix + rr)} ${String(iy)} ` +
    `H ${String(ix + g.rw - rr)} A ${String(rr)} ${String(rr)} 0 0 1 ${String(ix + g.rw)} ${String(iy + rr)} ` +
    `V ${String(iy + g.rh - rr)} A ${String(rr)} ${String(rr)} 0 0 1 ${String(ix + g.rw - rr)} ${String(iy + g.rh)} ` +
    `H ${String(ix + rr)} A ${String(rr)} ${String(rr)} 0 0 1 ${String(ix)} ${String(iy + g.rh - rr)} ` +
    `V ${String(iy + rr)} A ${String(rr)} ${String(rr)} 0 0 1 ${String(ix + rr)} ${String(iy)} Z`;
  return (
    <path
      d={`${outer} ${inner}`}
      fill={o.color}
      fillRule="evenodd"
      opacity={o.opacity}
      style={{ pointerEvents: 'none' }}
    />
  );
}
