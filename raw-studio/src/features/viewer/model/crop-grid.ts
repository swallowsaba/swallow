/**
 * Pure generator for crop composition-guide lines. Returns line segments in the
 * crop rect's own normalized space (0..1 on each axis), so the overlay can scale
 * them to pixels. Kept pure and unit-tested; the component only renders.
 */

export type CropGrid = 'none' | 'thirds' | 'golden' | 'grid' | 'diagonal';

export const CROP_GRIDS: readonly CropGrid[] = ['none', 'thirds', 'golden', 'grid', 'diagonal'];

export interface GridLine {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

// Golden-ratio split positions (phi): the small part is 1/phi^2 ≈ 0.382.
const PHI_LOW = 0.381966011250105;
const PHI_HIGH = 1 - PHI_LOW;

function verticals(xs: readonly number[]): GridLine[] {
  return xs.map((x) => ({ x1: x, y1: 0, x2: x, y2: 1 }));
}
function horizontals(ys: readonly number[]): GridLine[] {
  return ys.map((y) => ({ x1: 0, y1: y, x2: 1, y2: y }));
}

/** The guide lines for a grid kind, in normalized crop space. */
export function cropGridLines(kind: CropGrid): GridLine[] {
  switch (kind) {
    case 'none':
      return [];
    case 'thirds':
      return [...verticals([1 / 3, 2 / 3]), ...horizontals([1 / 3, 2 / 3])];
    case 'golden':
      return [...verticals([PHI_LOW, PHI_HIGH]), ...horizontals([PHI_LOW, PHI_HIGH])];
    case 'grid':
      return [
        ...verticals([0.25, 0.5, 0.75]),
        ...horizontals([0.25, 0.5, 0.75]),
      ];
    case 'diagonal':
      return [
        { x1: 0, y1: 0, x2: 1, y2: 1 },
        { x1: 1, y1: 0, x2: 0, y2: 1 },
      ];
    default:
      return [];
  }
}
