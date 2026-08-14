import type { RawMetadata } from './raw-decoder';

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Read camera/lens/shooting/GPS metadata from a JPEG (or other
 * exifr-supported: PNG, WebP, HEIC, AVIF) file. RAW files get this from
 * LibRaw instead (libraw-adapter.ts) — this fills the same gap for non-RAW
 * photos, which previously showed no camera info at all.
 *
 * Defensive: `exifr`'s tag object shape isn't pinned down here to one exact
 * type, since exact field presence varies by camera/exporter; unknown or
 * missing tags are simply omitted rather than causing an error.
 */
export async function readImageExif(file: File): Promise<RawMetadata | null> {
  try {
    const exifr = await import('exifr');
    const tags = (await exifr.parse(file, { gps: true })) as Record<string, unknown> | undefined;
    if (!tags) return null;

    const make = str(tags.Make);
    const model = str(tags.Model);
    const lens = str(tags.LensModel) ?? str(tags.Lens);
    const iso = num(tags.ISO);
    // ExposureTime is already in seconds (e.g. 0.004 for 1/250s).
    const shutter = num(tags.ExposureTime);
    const aperture = num(tags.FNumber);
    const focalLength = num(tags.FocalLength);
    const dateObj = tags.DateTimeOriginal;
    const timestamp =
      dateObj instanceof Date && !Number.isNaN(dateObj.getTime())
        ? Math.floor(dateObj.getTime() / 1000)
        : undefined;
    // exifr converts GPS to decimal degrees on tags.latitude/longitude
    // directly (see its "gps: true" option), so no DMS conversion needed.
    const gpsLatitude = num(tags.latitude);
    const gpsLongitude = num(tags.longitude);

    const hasAnything =
      make !== undefined ||
      model !== undefined ||
      lens !== undefined ||
      iso !== undefined ||
      shutter !== undefined ||
      aperture !== undefined ||
      focalLength !== undefined ||
      timestamp !== undefined ||
      gpsLatitude !== undefined;
    if (!hasAnything) return null;

    return {
      width: num(tags.ImageWidth) ?? num(tags.ExifImageWidth) ?? 0,
      height: num(tags.ImageHeight) ?? num(tags.ExifImageHeight) ?? 0,
      ...(make !== undefined ? { make } : {}),
      ...(model !== undefined ? { model } : {}),
      ...(lens !== undefined ? { lens } : {}),
      ...(iso !== undefined ? { iso } : {}),
      ...(shutter !== undefined ? { shutter } : {}),
      ...(aperture !== undefined ? { aperture } : {}),
      ...(focalLength !== undefined ? { focalLength } : {}),
      ...(timestamp !== undefined ? { timestamp } : {}),
      ...(gpsLatitude !== undefined ? { gpsLatitude } : {}),
      ...(gpsLongitude !== undefined ? { gpsLongitude } : {}),
    };
  } catch {
    // No EXIF data, unsupported format, or a corrupt/stripped file — treat
    // the same as "no metadata" rather than failing the import.
    return null;
  }
}
