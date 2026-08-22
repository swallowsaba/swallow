import type { ExportOptions } from './export-options';
import type { TranslationKey } from '@/i18n/translations';
import { DEFAULT_EXPORT_OPTIONS } from './export-options';

/**
 * Named export presets for common targets (social sizes, full quality, small
 * share). Each returns a full ExportOptions built from the current base so the
 * user's filename template and watermark are preserved. Pure and unit-tested;
 * the UI just lists these and applies the chosen one.
 */

export interface ExportPreset {
  readonly id: string;
  /** i18n key for the label. */
  readonly labelKey: TranslationKey;
  readonly format: ExportOptions['format'];
  readonly quality: number;
  readonly resize: ExportOptions['resize'];
}

export const EXPORT_PRESETS: readonly ExportPreset[] = [
  {
    id: 'original',
    labelKey: 'exportPreset.original',
    format: 'jpeg',
    quality: 95,
    resize: { mode: 'none', value: 0 },
  },
  {
    id: 'insta-square',
    labelKey: 'exportPreset.instaSquare',
    format: 'jpeg',
    quality: 90,
    resize: { mode: 'longEdge', value: 1080 },
  },
  {
    id: 'insta-portrait',
    labelKey: 'exportPreset.instaPortrait',
    format: 'jpeg',
    quality: 90,
    resize: { mode: 'longEdge', value: 1350 },
  },
  {
    id: 'story',
    labelKey: 'exportPreset.story',
    format: 'jpeg',
    quality: 90,
    resize: { mode: 'longEdge', value: 1920 },
  },
  {
    id: 'x-post',
    labelKey: 'exportPreset.xPost',
    format: 'jpeg',
    quality: 88,
    resize: { mode: 'longEdge', value: 1600 },
  },
  {
    id: '4k',
    labelKey: 'exportPreset.uhd4k',
    format: 'jpeg',
    quality: 92,
    resize: { mode: 'longEdge', value: 3840 },
  },
  {
    id: 'web-small',
    labelKey: 'exportPreset.webSmall',
    format: 'webp',
    quality: 80,
    resize: { mode: 'longEdge', value: 1280 },
  },
  {
    id: 'print-png',
    labelKey: 'exportPreset.printPng',
    format: 'png',
    quality: 100,
    resize: { mode: 'none', value: 0 },
  },
];

/** Build full ExportOptions from a preset, keeping the base's filename template
 *  and watermark. Falls back to the base when the id is unknown. */
export function applyExportPreset(
  base: ExportOptions,
  presetId: string,
): ExportOptions {
  const preset = EXPORT_PRESETS.find((p) => p.id === presetId);
  if (!preset) return base;
  return {
    ...base,
    format: preset.format,
    quality: preset.quality,
    resize: { ...preset.resize },
  };
}

/** The preset whose format/quality/resize matches these options, or null for a
 *  custom combination — used to highlight the active chip. */
export function matchExportPreset(options: ExportOptions): string | null {
  const found = EXPORT_PRESETS.find(
    (p) =>
      p.format === options.format &&
      p.quality === options.quality &&
      p.resize.mode === options.resize.mode &&
      p.resize.value === options.resize.value,
  );
  return found ? found.id : null;
}

export const DEFAULT_WITH_PRESET = (presetId: string): ExportOptions =>
  applyExportPreset(DEFAULT_EXPORT_OPTIONS, presetId);
