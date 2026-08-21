/**
 * Pure mapping from the grain UI (amount 0..100, size 0..100) to the shader's
 * noise amplitude and cell frequency. Kept here so the mapping is unit-tested;
 * the actual per-pixel noise is generated in the GLSL fragment shader.
 */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Max noise amplitude in tonal units (0..~0.12) for amount 0..100. */
export function grainAmplitude(amount: number): number {
  return (clamp(amount, 0, 100) / 100) * 0.12;
}

/**
 * Grain cell frequency: how many grain cells span the image. Larger UI "size"
 * means coarser grain (fewer, bigger cells), so frequency goes down as size
 * goes up. Ranges ~600 (fine) down to ~90 (coarse).
 */
export function grainFrequency(size: number): number {
  const s = clamp(size, 0, 100) / 100;
  return 600 - s * 510;
}

/** True when grain does nothing, so the shader can skip it. */
export function isGrainNeutral(amount: number): boolean {
  return clamp(amount, 0, 100) <= 0;
}
