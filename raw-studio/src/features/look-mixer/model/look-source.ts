import type { Adjustments, PresetAdjustments } from '@/types';
import { mergeAdjustments } from '@/features/editor/model/apply';
import { createDefaultAdjustments } from '@/features/adjustments/model/defaults';

/**
 * A "look" the mixer can blend. Every kind resolves to a full {@link Adjustments}
 * stack so the blend math treats them uniformly:
 *  - `current`  — the image's present adjustments (the starting point)
 *  - `neutral`  — a fully reset develop (blend toward "no edit")
 *  - `snapshot` — a saved full edit state
 *  - `preset`   — a partial preset, resolved onto the current base
 */
export type LookRef =
  | { readonly kind: 'current' }
  | { readonly kind: 'neutral' }
  | { readonly kind: 'snapshot'; readonly id: string; readonly name: string }
  | { readonly kind: 'preset'; readonly id: string; readonly name: string };

export interface ResolvedLook {
  readonly ref: LookRef;
  readonly label: string;
  readonly adjustments: Adjustments;
}

export interface LookInputs {
  /** The image's current adjustments — the base presets resolve onto. */
  readonly current: Adjustments;
  readonly snapshots: readonly { id: string; name: string; adjustments: Adjustments }[];
  readonly presets: readonly { id: string; name: string; adjustments: PresetAdjustments }[];
}

/** Resolve a look reference to a concrete adjustment stack, or null if a
 *  referenced snapshot/preset no longer exists. */
export function resolveLook(ref: LookRef, inputs: LookInputs): ResolvedLook | null {
  switch (ref.kind) {
    case 'current':
      return { ref, label: 'Current', adjustments: inputs.current };
    case 'neutral':
      return { ref, label: 'Neutral', adjustments: createDefaultAdjustments() };
    case 'snapshot': {
      const snap = inputs.snapshots.find((s) => s.id === ref.id);
      if (!snap) return null;
      return { ref, label: snap.name, adjustments: snap.adjustments };
    }
    case 'preset': {
      const preset = inputs.presets.find((p) => p.id === ref.id);
      if (!preset) return null;
      return {
        ref,
        label: preset.name,
        adjustments: mergeAdjustments(inputs.current, preset.adjustments),
      };
    }
    default: {
      const _never: never = ref;
      return _never;
    }
  }
}

/** Stable key for a look reference (for React keys / dedup). */
export function lookKey(ref: LookRef): string {
  switch (ref.kind) {
    case 'current':
      return 'current';
    case 'neutral':
      return 'neutral';
    case 'snapshot':
      return `snapshot:${ref.id}`;
    case 'preset':
      return `preset:${ref.id}`;
    default: {
      const _never: never = ref;
      return _never;
    }
  }
}
