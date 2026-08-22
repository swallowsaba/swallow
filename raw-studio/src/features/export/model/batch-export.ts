import type { ExportOptions } from './export-options';
import type { ExportPreset } from './export-presets';
import { applyExportPreset } from './export-presets';

/**
 * Helpers for exporting one image at several presets at once. The heavy lifting
 * (render + download) reuses the single-image export path per preset; this
 * module just builds the per-preset options and a suffix that keeps filenames
 * from colliding. Pure and unit-tested.
 */

/** A short, filename-safe suffix identifying a preset's output size. */
export function presetSuffix(preset: ExportPreset): string {
  if (preset.resize.mode === 'none') return preset.id;
  if (preset.resize.mode === 'longEdge') return `${String(preset.resize.value)}px`;
  if (preset.resize.mode === 'percent') return `${String(preset.resize.value)}pct`;
  return preset.id;
}

/**
 * Ensure a filename template carries a per-preset marker so batch outputs don't
 * overwrite each other. If the template already varies by size ({w}/{h}) it's
 * left alone; otherwise the suffix is inserted before the extension token, or
 * appended.
 */
export function batchFilenameTemplate(template: string, suffix: string): string {
  if (template.includes('{w}') || template.includes('{h}')) return template;
  if (template.includes('{ext}')) {
    return template.replace('{ext}', `_${suffix}.{ext}`).replace('._', '_'); // avoid ".._"
  }
  return `${template}_${suffix}`;
}

/** Build the ExportOptions for one preset in a batch, with a collision-safe
 *  filename template derived from the base options. */
export function batchOptionsFor(base: ExportOptions, preset: ExportPreset): ExportOptions {
  const applied = applyExportPreset(base, preset.id);
  return {
    ...applied,
    filenameTemplate: batchFilenameTemplate(base.filenameTemplate, presetSuffix(preset)),
  };
}

/** De-duplicate a selection of preset ids, preserving order. */
export function dedupePresetIds(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}
