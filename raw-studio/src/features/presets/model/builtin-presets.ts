import type { Preset } from '@/types';

/**
 * The ten shipped presets. They intentionally use only the Basic group so they
 * visibly change the image with the Phase 7 shader pipeline (Tone/HSL/Color
 * grading rendering arrives in later phases). Values are chosen to be tasteful
 * starting points, not destructive looks.
 */

const AT = 0; // stable timestamp for built-ins (not user-created)

function preset(
  id: string,
  name: string,
  category: Preset['category'],
  basic: NonNullable<Preset['adjustments']['basic']>,
): Preset {
  return {
    id,
    name,
    category,
    favorite: false,
    builtin: true,
    createdAt: AT,
    updatedAt: AT,
    adjustments: { basic },
  };
}

export const BUILTIN_PRESETS: readonly Preset[] = [
  preset('builtin-portrait', 'Portrait', 'portrait', {
    exposure: 0.1,
    contrast: -10,
    highlights: -15,
    shadows: 20,
    whites: 5,
    blacks: 5,
    temperature: 8,
    tint: 3,
    vibrance: 12,
    saturation: -3,
  }),
  preset('builtin-landscape', 'Landscape', 'landscape', {
    contrast: 18,
    highlights: -20,
    shadows: 15,
    whites: 10,
    blacks: -8,
    temperature: -3,
    vibrance: 25,
    saturation: 5,
  }),
  preset('builtin-night', 'Night', 'night', {
    exposure: 0.3,
    contrast: 8,
    highlights: -25,
    shadows: 30,
    blacks: -10,
    temperature: -12,
    vibrance: 10,
  }),
  preset('builtin-vintage', 'Vintage', 'vintage', {
    contrast: -18,
    highlights: -10,
    blacks: 18,
    temperature: 10,
    tint: 6,
    saturation: -18,
    vibrance: 5,
  }),
  preset('builtin-film', 'Film', 'film', {
    contrast: 6,
    highlights: -12,
    blacks: 10,
    temperature: 4,
    saturation: -8,
    vibrance: 14,
  }),
  preset('builtin-cinematic', 'Cinematic', 'cinematic', {
    contrast: 14,
    highlights: -18,
    shadows: 12,
    blacks: 6,
    temperature: 6,
    tint: -4,
    saturation: -6,
    vibrance: 8,
  }),
  preset('builtin-street', 'Street', 'street', {
    contrast: 22,
    highlights: -10,
    shadows: -5,
    blacks: -12,
    saturation: -10,
    vibrance: 6,
  }),
  preset('builtin-wedding', 'Wedding', 'wedding', {
    exposure: 0.25,
    contrast: -12,
    highlights: -10,
    shadows: 18,
    whites: 12,
    blacks: 8,
    temperature: 5,
    vibrance: 8,
    saturation: -4,
  }),
  preset('builtin-travel', 'Travel', 'travel', {
    contrast: 12,
    highlights: -12,
    shadows: 12,
    whites: 6,
    temperature: 2,
    vibrance: 22,
    saturation: 8,
  }),
  preset('builtin-bw', 'Black & White', 'bw', {
    contrast: 14,
    highlights: -8,
    shadows: 6,
    whites: 6,
    blacks: -6,
    saturation: -100,
  }),
];
