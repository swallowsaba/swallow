/**
 * Suggest noise-reduction amounts from a photo's ISO. High ISO means more
 * sensor noise (both luminance grain and chroma blotches), so the suggested
 * strength rises with ISO. Pure and unit-tested; the UI reads the shot's ISO
 * and applies the result to the Detail sliders.
 *
 * Rough mapping (typical for modern sensors):
 *   <= ISO 200   : none needed
 *      ISO 800   : light
 *      ISO 3200  : moderate
 *   >= ISO 12800 : strong (capped)
 */

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Luminance + chroma NR amounts (0..100) suggested for the given ISO. */
export function suggestDenoiseFromIso(iso: number | undefined): {
  noiseReduction: number;
  colorNoiseReduction: number;
} {
  if (iso === undefined || !Number.isFinite(iso) || iso <= 200) {
    return { noiseReduction: 0, colorNoiseReduction: 0 };
  }
  // log2 steps above ISO 200; each stop adds noise.
  const stops = Math.log2(clamp(iso, 200, 51200) / 200); // 0 at 200 .. 8 at 51200
  // Luminance NR ramps to ~70 by ISO 12800 (6 stops), chroma a bit stronger.
  const noiseReduction = Math.round(clamp(stops * 11, 0, 80));
  const colorNoiseReduction = Math.round(clamp(stops * 13 + 8, 0, 90));
  return { noiseReduction, colorNoiseReduction };
}
