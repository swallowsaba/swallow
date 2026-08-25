/**
 * Sizing math for the AI denoise pass (pure, unit-tested).
 *
 * SCUNet accepts a dynamic H x W but each side must be a multiple of 8, and we
 * cap the working edge so a huge photo doesn't blow up memory / time in the
 * browser. PC and mobile get different caps (mobile is much tighter). The image
 * is processed at the working size, then the result is scaled back to the
 * original dimensions by the caller.
 */

export interface WorkSize {
  readonly width: number;
  readonly height: number;
}

/** Round down to the nearest multiple of `m` (min `m`). */
export function floorToMultiple(v: number, m: number): number {
  const r = Math.floor(v / m) * m;
  return r < m ? m : r;
}

/**
 * Compute the working size for denoise: fit the image within `maxEdge` on its
 * longer side (never upscale), then round each side down to a multiple of `m`.
 */
export function denoiseWorkSize(
  width: number,
  height: number,
  maxEdge: number,
  m = 8,
): WorkSize {
  const longer = Math.max(width, height);
  const scale = longer > maxEdge ? maxEdge / longer : 1;
  const w = floorToMultiple(Math.round(width * scale), m);
  const h = floorToMultiple(Math.round(height * scale), m);
  return { width: w, height: h };
}

/** Max working edge by device class. Mobile is capped hard to stay responsive
 *  and within memory limits; desktop can afford a larger pass. */
export function maxEdgeForDevice(isMobile: boolean, modelMaxEdge: number): number {
  const cap = isMobile ? 640 : modelMaxEdge;
  return Math.min(cap, modelMaxEdge);
}
