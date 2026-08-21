import * as React from 'react';
import type { Mask } from '@/types';
import { rasterizeMaskAlpha } from '../model/mask-alpha';

const W = 40;
const H = 28;

/**
 * A small preview of a mask's coverage, so the list is scannable at a glance
 * (radial vs linear vs a hand-painted or AI shape) the way Lightroom's mask
 * list is. Rasterizes the mask's alpha at thumbnail size — cheap, and it uses
 * the same pure coverage math as the real render.
 */
export function MaskThumbnail({ mask }: { mask: Mask }): React.JSX.Element {
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // The mask is defined in the cropped image's normalized space, so a fixed
    // thumbnail aspect is fine — it shows the shape, not the framing.
    const alpha = rasterizeMaskAlpha({ ...mask, enabled: true }, W, H);
    const img = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const a = alpha[i] ?? 0;
      img.data[i * 4] = a;
      img.data[i * 4 + 1] = a;
      img.data[i * 4 + 2] = a;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, [mask]);

  return (
    <canvas
      ref={canvasRef}
      width={W}
      height={H}
      className="shrink-0 rounded-sm border border-border bg-black"
      style={{ width: W, height: H }}
      aria-hidden="true"
    />
  );
}
