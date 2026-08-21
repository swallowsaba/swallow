import type { Adjustments, BasicAdjustments, DetailAdjustments, LocalAdjustments } from '@/types';
import {
  toAdjustmentUniforms,
  type AdjustmentUniforms,
} from '@/features/adjustments/model/adjustment-math';
import {
  toAdvancedUniforms,
  type AdvancedUniforms,
} from '@/features/adjustments/model/advanced-math';

/**
 * A mask carries a small subset of adjustments that override the global stack
 * only inside its coverage. To render that override the compositing pass needs
 * a full uniform set: we merge the mask's local fields onto the current global
 * adjustments, then reuse the exact same uniform builders the main pipeline
 * uses — so a mask's exposure/contrast/clarity behave identically to the
 * global sliders, just confined to the mask.
 */

/** Detail fields a mask is allowed to touch (see LocalAdjustments). */
const LOCAL_DETAIL_KEYS = [
  'clarity',
  'texture',
  'sharpenAmount',
  'noiseReduction',
] as const satisfies readonly (keyof DetailAdjustments)[];

type LocalDetailKey = (typeof LOCAL_DETAIL_KEYS)[number];

function isLocalDetailKey(key: string): key is LocalDetailKey {
  return (LOCAL_DETAIL_KEYS as readonly string[]).includes(key);
}

/** Split a flat LocalAdjustments patch into its basic and detail parts. */
export function splitLocalAdjustments(local: LocalAdjustments): {
  basic: Partial<BasicAdjustments>;
  detail: Partial<DetailAdjustments>;
} {
  const basic: Partial<BasicAdjustments> = {};
  const detail: Partial<DetailAdjustments> = {};
  for (const [key, value] of Object.entries(local)) {
    if (typeof value !== 'number') continue;
    if (isLocalDetailKey(key)) {
      (detail as Record<string, number>)[key] = value;
    } else {
      (basic as Record<string, number>)[key] = value;
    }
  }
  return { basic, detail };
}

/** Produce a full Adjustments stack with the mask's local overrides applied. */
export function mergeLocalIntoAdjustments(
  global: Adjustments,
  local: LocalAdjustments,
): Adjustments {
  const { basic, detail } = splitLocalAdjustments(local);
  return {
    ...global,
    basic: { ...global.basic, ...basic },
    detail: { ...global.detail, ...detail },
    // A mask's own RGB curve overrides the global one within the layer. It flows
    // through toAdvancedUniforms -> the curve LUT, so the mask composite applies
    // it with no shader change.
    ...(local.toneCurve
      ? { toneCurves: { ...global.toneCurves, rgb: local.toneCurve } }
      : {}),
  };
}

export interface LayerUniforms {
  readonly uniforms: AdjustmentUniforms;
  readonly advanced: AdvancedUniforms;
}

/** The uniform pair for a single mask layer, ready to hand to the renderer. */
export function layerUniforms(global: Adjustments, local: LocalAdjustments): LayerUniforms {
  const merged = mergeLocalIntoAdjustments(global, local);
  return {
    uniforms: toAdjustmentUniforms(merged.basic),
    advanced: toAdvancedUniforms(merged),
  };
}
