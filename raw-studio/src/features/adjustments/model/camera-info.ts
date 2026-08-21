import type { CameraMeta } from '@/types';

/**
 * Pure formatters for the shooting info strip under the histogram (ISO, focal
 * length, aperture, shutter). Camera metadata is stored in raw numeric form, so
 * the display formatting lives here where it can be unit-tested.
 */

/** ISO 1600 -> "ISO 1600"; missing/invalid -> null. */
export function formatIso(iso: number | undefined): string | null {
  if (iso === undefined || !Number.isFinite(iso) || iso <= 0) return null;
  return `ISO ${String(Math.round(iso))}`;
}

/** 600 -> "600 mm"; missing -> null. */
export function formatFocalLength(mm: number | undefined): string | null {
  if (mm === undefined || !Number.isFinite(mm) || mm <= 0) return null;
  return `${String(Math.round(mm))} mm`;
}

/** 4 -> "f/4"; 3.5 -> "f/3.5"; missing -> null. */
export function formatAperture(f: number | undefined): string | null {
  if (f === undefined || !Number.isFinite(f) || f <= 0) return null;
  const rounded = Math.round(f * 10) / 10;
  return `f/${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}`;
}

/**
 * Shutter speed in seconds -> a photographer-friendly string:
 * 0.00025 -> "1/4000", 0.5 -> "1/2", 2 -> "2\"", 1 -> "1\"".
 */
export function formatShutter(seconds: number | undefined): string | null {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds >= 1) {
    const rounded = Math.round(seconds * 10) / 10;
    return `${Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)}"`;
  }
  const denominator = Math.round(1 / seconds);
  return `1/${String(denominator)}`;
}

/** The camera body, e.g. "SONY ILCE-7M4"; missing -> null. */
export function formatCamera(meta: CameraMeta | undefined): string | null {
  if (!meta) return null;
  const parts = [meta.make, meta.model].filter((p): p is string => !!p && p.length > 0);
  if (parts.length === 0) return null;
  // Many bodies repeat the make inside the model ("SONY" + "SONY ILCE-7M4").
  if (parts.length === 2 && parts[1]!.toUpperCase().startsWith(parts[0]!.toUpperCase())) {
    return parts[1]!;
  }
  return parts.join(' ');
}

/** The four exposure facts, in display order, skipping any that are missing. */
export function exposureSummary(meta: CameraMeta | undefined): string[] {
  if (!meta) return [];
  return [
    formatIso(meta.iso),
    formatFocalLength(meta.focalLength),
    formatAperture(meta.aperture),
    formatShutter(meta.shutter),
  ].filter((s): s is string => s !== null);
}
