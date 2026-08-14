import type { PresetAdjustments } from '@/types';
import { curveFromToneSliders } from '@/features/adjustments/model/advanced-math';
import { autoColor, autoContrast, autoExposure, autoWhiteBalance } from './auto-adjust';
import type { ImageStats } from './image-stats';

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/**
 * "AI Auto Grade": one click applies (1) the same corrective auto-adjustments
 * as the plain Auto button — neutralizing exposure/white balance/contrast —
 * and (2) a curated, deterministic style overlay evoking the restrained,
 * slightly matte look common in edited photo books (gently lifted shadows,
 * soft highlight rolloff, a touch less overall saturation traded for more
 * vibrance so skin tones and key colors stay rich).
 *
 * This is NOT a machine-learned style transfer — there's no verified free
 * model for "make this look like a photographer's book", and a black box
 * that silently reinterprets every photo would be hard to trust or predict.
 * The style component here is a fixed, documented recipe; the "auto" part is
 * the same tested statistical correction already used elsewhere, so the
 * result stays predictable across very different source photos.
 */
export function computeAutoGrade(stats: ImageStats): PresetAdjustments {
  const exposureFix = autoExposure(stats);
  const wbFix = autoWhiteBalance(stats);
  const contrastFix = autoContrast(stats);
  const colorFix = autoColor(stats);

  const styleShadowLift = 8;
  const styleHighlightRolloff = -6;
  const styleSaturationDelta = -6;
  const styleVibranceDelta = 10;
  const styleContrastDelta = 4;

  return {
    basic: {
      ...exposureFix,
      ...wbFix,
      ...(contrastFix.whites !== undefined ? { whites: contrastFix.whites } : {}),
      ...(contrastFix.blacks !== undefined ? { blacks: contrastFix.blacks } : {}),
      contrast: clamp((contrastFix.contrast ?? 0) + styleContrastDelta, -300, 300),
      vibrance: clamp((colorFix.vibrance ?? 0) + styleVibranceDelta, -300, 300),
      saturation: clamp(styleSaturationDelta, -300, 300),
    },
    toneCurves: {
      rgb: curveFromToneSliders({
        shadows: styleShadowLift,
        midtones: 0,
        highlights: styleHighlightRolloff,
      }),
    },
  };
}
