import * as React from 'react';
import { Check, FlipHorizontal, FlipVertical, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { computeFitScale, type Size } from '../model/viewport';
import { clampCropRect, cropRectForAspect, aspectRatioValue, FULL_CROP } from '../model/crop-math';
import { useViewerStore } from '../model/viewer-store';
import { toggleFlip, isFlippedH, isFlippedV } from '../model/flip-ops';
import { CROP_GRIDS, cropGridLines, type CropGrid } from '../model/crop-grid';
import { selectCurrentEdit, useEditorStore } from '@/features/editor';
import type { AspectRatioLock, CropRect } from '@/types';
import { useT } from '@/i18n';

const ASPECTS: readonly { lock: AspectRatioLock; label: string }[] = [
  { lock: 'free', label: 'Free' },
  { lock: 'original', label: 'Original' },
  { lock: '1:1', label: '1:1' },
  { lock: '4:3', label: '4:3' },
  { lock: '3:2', label: '3:2' },
  { lock: '16:9', label: '16:9' },
  { lock: '9:16', label: '9:16 (Phone)' },
];

type Handle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

interface Props {
  imageSize: Size;
  container: Size;
  /** Rotation is not accounted for in the crop overlay's own placement math
   *  (a scoped simplification) — straighten/rotate before cropping for exact
   *  alignment. */
  rotationDeg: number;
}

/** Overlay shown while cropMode is active. Drag the body to move, corners to
 *  resize; aspect buttons snap to a centered rect of that ratio. */
export function CropOverlay({ imageSize, container }: Props): React.JSX.Element {
  const currentEdit = useEditorStore(selectCurrentEdit);
  const commitGeometry = useEditorStore((s) => s.commitGeometry);
  const setCropMode = useViewerStore((s) => s.setCropMode);
  const t = useT();

  const [rect, setRect] = React.useState<CropRect>(() => currentEdit?.geometry.crop ?? FULL_CROP);
  const [grid, setGrid] = React.useState<CropGrid>('thirds');
  const dragRef = React.useRef<{ handle: Handle; start: { x: number; y: number }; rect: CropRect } | null>(
    null,
  );

  // Full-image "fit" placement (rotation-agnostic) used to map normalized
  // crop coordinates to screen pixels.
  const fitScale = computeFitScale(imageSize, container, 0);
  const dispW = imageSize.width * fitScale;
  const dispH = imageSize.height * fitScale;
  const originX = (container.width - dispW) / 2;
  const originY = (container.height - dispH) / 2;

  const px = {
    left: originX + rect.x * dispW,
    top: originY + rect.y * dispH,
    width: rect.width * dispW,
    height: rect.height * dispH,
  };

  const onHandleDown = (handle: Handle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { handle, start: { x: e.clientX, y: e.clientY }, rect };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || dispW === 0 || dispH === 0) return;
    const dx = (e.clientX - drag.start.x) / dispW;
    const dy = (e.clientY - drag.start.y) / dispH;
    const r = drag.rect;
    let next: CropRect;
    switch (drag.handle) {
      case 'move':
        next = { ...r, x: r.x + dx, y: r.y + dy };
        break;
      case 'nw':
        next = { x: r.x + dx, y: r.y + dy, width: r.width - dx, height: r.height - dy };
        break;
      case 'ne':
        next = { x: r.x, y: r.y + dy, width: r.width + dx, height: r.height - dy };
        break;
      case 'sw':
        next = { x: r.x + dx, y: r.y, width: r.width - dx, height: r.height + dy };
        break;
      case 'se':
        next = { x: r.x, y: r.y, width: r.width + dx, height: r.height + dy };
        break;
    }
    setRect(clampCropRect(next));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  const applyAspect = (lock: AspectRatioLock) => {
    const imageAspect = imageSize.width / imageSize.height;
    const aspect = lock === 'original' ? imageAspect : aspectRatioValue(lock);
    setRect(cropRectForAspect(aspect, imageAspect));
  };

  const apply = () => {
    commitGeometry({ crop: rect }, t('crop.title'));
    setCropMode(false);
  };
  const cancel = () => {
    setCropMode(false);
  };

  const handleCls =
    'absolute size-3 rounded-full border-2 border-primary bg-background shadow';

  return (
    <div className="absolute inset-0">
      {/* Dim everything outside the crop rect. */}
      <div className="pointer-events-none absolute inset-0 bg-black/60" />
      <div
        className="absolute border border-white/80"
        style={{
          left: px.left,
          top: px.top,
          width: px.width,
          height: px.height,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
        }}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          className="absolute inset-0 cursor-move"
          onPointerDown={onHandleDown('move')}
        />
        {grid !== 'none' ? (
          <svg
            className="pointer-events-none absolute inset-0 size-full"
            viewBox="0 0 1 1"
            preserveAspectRatio="none"
          >
            {cropGridLines(grid).map((l, i) => (
              <line
                key={i}
                x1={l.x1}
                y1={l.y1}
                x2={l.x2}
                y2={l.y2}
                stroke="rgba(255,255,255,0.5)"
                strokeWidth={0.003}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
        ) : null}
        <div
          className={handleCls}
          style={{ left: -6, top: -6, cursor: 'nwse-resize' }}
          onPointerDown={onHandleDown('nw')}
        />
        <div
          className={handleCls}
          style={{ right: -6, top: -6, cursor: 'nesw-resize' }}
          onPointerDown={onHandleDown('ne')}
        />
        <div
          className={handleCls}
          style={{ left: -6, bottom: -6, cursor: 'nesw-resize' }}
          onPointerDown={onHandleDown('sw')}
        />
        <div
          className={handleCls}
          style={{ right: -6, bottom: -6, cursor: 'nwse-resize' }}
          onPointerDown={onHandleDown('se')}
        />
      </div>

      <div className="pointer-events-auto absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2">
        <div className="flex flex-wrap items-center justify-center gap-1 rounded-lg border bg-background/95 px-2 py-1.5 shadow-md backdrop-blur">
          {ASPECTS.map((a) => (
            <Button
              key={a.lock}
              variant="outline"
              size="sm"
              className="h-6 px-2 text-[11px]"
              onClick={() => {
                applyAspect(a.lock);
              }}
            >
              {a.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center gap-2 rounded-lg border bg-background/95 px-3 py-1.5 shadow-md backdrop-blur">
          <span className="text-[11px] text-muted-foreground">{t('crop.straighten')}</span>
          <Slider
            value={[currentEdit?.geometry.rotation ?? 0]}
            min={-45}
            max={45}
            step={0.1}
            className="w-32"
            onValueChange={(v) => {
              commitGeometry({ rotation: v[0] ?? 0 }, t('crop.straighten'));
            }}
          />
          <span className="w-8 text-right text-[11px] tabular-nums text-muted-foreground">
            {(currentEdit?.geometry.rotation ?? 0).toFixed(1)}
          </span>
          <Button
            variant={isFlippedH(currentEdit?.geometry.flip ?? 'none') ? 'default' : 'outline'}
            size="sm"
            className="h-6 px-2"
            aria-label={t('crop.flipH')}
            title={t('crop.flipH')}
            onClick={() => {
              commitGeometry(
                { flip: toggleFlip(currentEdit?.geometry.flip ?? 'none', 'horizontal') },
                t('crop.flipH'),
              );
            }}
          >
            <FlipHorizontal className="size-3.5" />
          </Button>
          <Button
            variant={isFlippedV(currentEdit?.geometry.flip ?? 'none') ? 'default' : 'outline'}
            size="sm"
            className="h-6 px-2"
            aria-label={t('crop.flipV')}
            title={t('crop.flipV')}
            onClick={() => {
              commitGeometry(
                { flip: toggleFlip(currentEdit?.geometry.flip ?? 'none', 'vertical') },
                t('crop.flipV'),
              );
            }}
          >
            <FlipVertical className="size-3.5" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-1 rounded-lg border bg-background/95 px-2 py-1 shadow-md backdrop-blur">
          <span className="mr-1 text-[10px] text-muted-foreground">{t('crop.grid')}</span>
          {CROP_GRIDS.map((g) => (
            <Button
              key={g}
              variant={grid === g ? 'default' : 'outline'}
              size="sm"
              className="h-6 px-2 text-[10px]"
              onClick={() => {
                setGrid(g);
              }}
            >
              {t(`crop.grid.${g}`)}
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={cancel} className="h-7 gap-1 px-3 text-xs">
            <X className="size-3.5" />
            {t('common.cancel')}
          </Button>
          <Button size="sm" onClick={apply} className="h-7 gap-1 px-3 text-xs">
            <Check className="size-3.5" />
            {t('common.apply')}
          </Button>
        </div>
      </div>
    </div>
  );
}
