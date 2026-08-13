import type {
  BasicAdjustments,
  ColorGrading,
  DetailAdjustments,
  HslAdjustments,
  LensCorrections,
  ToneCurves,
} from './adjustments';

/**
 * Presets are partial overlays onto an {@link EditState}'s adjustments. A
 * preset only carries the groups it wants to change, so applying "Black & White"
 * can touch saturation and HSL without disturbing the user's exposure.
 */

export type PresetCategory =
  | 'portrait'
  | 'landscape'
  | 'night'
  | 'vintage'
  | 'film'
  | 'cinematic'
  | 'street'
  | 'wedding'
  | 'travel'
  | 'bw'
  | 'user';

/** The adjustment groups a preset may override (all optional). */
export interface PresetAdjustments {
  readonly basic?: Partial<BasicAdjustments>;
  readonly toneCurves?: Partial<ToneCurves>;
  readonly detail?: Partial<DetailAdjustments>;
  readonly lens?: Partial<LensCorrections>;
  readonly hsl?: Partial<HslAdjustments>;
  readonly colorGrading?: Partial<ColorGrading>;
}

export interface Preset {
  readonly id: string;
  readonly name: string;
  readonly category: PresetCategory;
  readonly favorite: boolean;
  /** True for the ten shipped presets; false for user-created ones. */
  readonly builtin: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly adjustments: PresetAdjustments;
}

/** JSON envelope used when exporting/importing presets between installs. */
export interface PresetExport {
  readonly schema: 'raw-studio/preset';
  readonly version: 1;
  readonly presets: readonly Preset[];
}
