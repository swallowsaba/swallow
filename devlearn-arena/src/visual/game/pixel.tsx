import { memo, type ReactElement } from 'react';
import { pixelRuns, spriteSize, type Palette, type PixelMap } from './sprites';

/** ドット絵を SVG の四角で描く。絵のデータは sprites.ts にある */

interface SpriteProps {
  map: PixelMap;
  palette: Palette;
  /** 1ドットの大きさ(px) */
  scale?: number;
  x?: number;
  y?: number;
  /** 左右反転 */
  flip?: boolean;
}

/** ドット絵を1枚描く。位置は左上 */
export const Sprite = memo(function Sprite({ map, palette, scale = 3, x = 0, y = 0, flip = false }: SpriteProps) {
  const { w } = spriteSize(map);
  const runs = pixelRuns(map, palette);
  const transform = flip
    ? `translate(${String(x + w * scale)} ${String(y)}) scale(${String(-scale)} ${String(scale)})`
    : `translate(${String(x)} ${String(y)}) scale(${String(scale)})`;
  return (
    <g transform={transform} shapeRendering="crispEdges" aria-hidden>
      {runs.map((r): ReactElement => (
        <rect key={`${String(r.x)},${String(r.y)}`} x={r.x} y={r.y} width={r.w} height={1} fill={r.color} />
      ))}
    </g>
  );
});
