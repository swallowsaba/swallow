import type {
  DecodedPixels,
  RawDecodeResult,
  RawDecoder,
  RawMetadata,
} from './raw-decoder';

/**
 * Adapter for the `libraw-wasm` package (LibRaw compiled to WebAssembly).
 *
 * API used (from the package's documented interface):
 *   const raw = new LibRaw();
 *   await raw.open(new Uint8Array(buffer), options);  // options matter — see below
 *   const meta  = await raw.metadata();     // { width, height, make, ... }
 *   const image = await raw.imageData();     // decoded pixels (RGB or RGBA)
 *
 * NOTE: `imageData()` may return either a typed array of pixels or an object
 * with { data, width, height, colors/channels }. This adapter handles both and
 * normalizes to RGBA. Because the WASM package cannot run in the build sandbox,
 * this is the one spot to sanity-check against a real RAW on first run; the
 * normalization below is written defensively to minimize the chance of needing
 * changes.
 */

interface LibRawInstance {
  open(bytes: Uint8Array, options?: unknown): Promise<void>;
  metadata(fullOutput?: boolean): Promise<Record<string, unknown>>;
  imageData(): Promise<unknown>;
  close?: () => Promise<void> | void;
}

type LibRawCtor = new () => LibRawInstance;

function num(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** Try several plausible key names on an object (naming conventions for
 *  fields not clearly documented by the library vary between wrappers). */
function firstStr(obj: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const k of keys) {
    const v = str(obj[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}
function firstNum(obj: Record<string, unknown>, keys: readonly string[]): number | undefined {
  for (const k of keys) {
    const v = num(obj[k]);
    if (v !== undefined) return v;
  }
  return undefined;
}

/** GPS coordinates aren't consistently named across LibRaw JS wrappers;
 *  check a few likely shapes (flat fields, or a nested gps/gpsdata object). */
function readGps(meta: Record<string, unknown>): { lat?: number; lon?: number } {
  const flatLat = firstNum(meta, ['gpsLatitude', 'gps_latitude', 'latitude']);
  const flatLon = firstNum(meta, ['gpsLongitude', 'gps_longitude', 'longitude']);
  if (flatLat !== undefined && flatLon !== undefined) return { lat: flatLat, lon: flatLon };

  for (const key of ['gps', 'gpsdata', 'gpsData', 'parsed_gps', 'parsedGps']) {
    const nested = meta[key];
    if (nested && typeof nested === 'object') {
      const n = nested as Record<string, unknown>;
      const lat = firstNum(n, ['latitude', 'lat']);
      const lon = firstNum(n, ['longitude', 'lon', 'lng']);
      if (lat !== undefined && lon !== undefined) return { lat, lon };
    }
  }
  return {};
}

/** Convert whatever `imageData()` returns into normalized RGBA pixels. */
function toRgba(image: unknown, meta: Record<string, unknown>): DecodedPixels {
  const metaW = num(meta.width) ?? 0;
  const metaH = num(meta.height) ?? 0;

  // Case 1: object { data, width, height, colors? }
  if (image && typeof image === 'object' && 'data' in image) {
    const obj = image as { data: ArrayLike<number>; width?: number; height?: number; colors?: number };
    const width = num(obj.width) ?? metaW;
    const height = num(obj.height) ?? metaH;
    const channels = num(obj.colors) ?? (obj.data.length === width * height * 4 ? 4 : 3);
    return packRgba(obj.data, width, height, channels);
  }

  // Case 2: a bare typed array of pixels; infer channels from length.
  if (image && typeof (image as ArrayLike<number>).length === 'number') {
    const arr = image as ArrayLike<number>;
    const width = metaW;
    const height = metaH;
    const channels = width * height > 0 && arr.length === width * height * 4 ? 4 : 3;
    return packRgba(arr, width, height, channels);
  }

  throw new Error('LibRaw imageData() returned an unrecognized shape.');
}

function packRgba(
  src: ArrayLike<number>,
  width: number,
  height: number,
  channels: number,
): DecodedPixels {
  if (width <= 0 || height <= 0) {
    throw new Error('LibRaw returned an image with zero dimensions.');
  }
  const out = new Uint8ClampedArray(width * height * 4);
  if (channels === 4) {
    for (let i = 0; i < out.length; i++) out[i] = src[i] ?? 0;
  } else {
    // RGB -> RGBA
    const pixelCount = width * height;
    for (let p = 0; p < pixelCount; p++) {
      out[p * 4] = src[p * 3] ?? 0;
      out[p * 4 + 1] = src[p * 3 + 1] ?? 0;
      out[p * 4 + 2] = src[p * 3 + 2] ?? 0;
      out[p * 4 + 3] = 255;
    }
  }
  return { data: out, width, height };
}

function toMetadata(meta: Record<string, unknown>): RawMetadata {
  const make = str(meta.make);
  const model = str(meta.model);
  const lens = firstStr(meta, ['lens', 'Lens', 'lens_info', 'lensInfo', 'lensModel']);
  const iso = num(meta.iso);
  const shutter = num(meta.shutter);
  const aperture = num(meta.aperture);
  const focalLength = num(meta.focal_len);
  const timestamp = num(meta.timestamp);
  const gps = readGps(meta);
  return {
    width: num(meta.width) ?? 0,
    height: num(meta.height) ?? 0,
    ...(make !== undefined ? { make } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(lens !== undefined ? { lens } : {}),
    ...(iso !== undefined ? { iso } : {}),
    ...(shutter !== undefined ? { shutter } : {}),
    ...(aperture !== undefined ? { aperture } : {}),
    ...(focalLength !== undefined ? { focalLength } : {}),
    ...(timestamp !== undefined ? { timestamp } : {}),
    ...(gps.lat !== undefined ? { gpsLatitude: gps.lat } : {}),
    ...(gps.lon !== undefined ? { gpsLongitude: gps.lon } : {}),
  };
}

/**
 * Processing options passed to LibRaw. These matter a lot: with no options,
 * libraw-wasm defaults to `useCameraWb: false`, which ignores the white balance
 * the camera recorded and develops at LibRaw's built-in daylight balance. On
 * Sony ARW (and most sensors) that lands well off-neutral — greens and whites
 * come out yellow/olive. `useCameraWb: true` is the "as shot" balance every
 * other viewer (and the camera's own embedded JPEG) shows.
 */
const DEVELOP_OPTIONS = {
  /** -w : develop with the camera's recorded WB ("as shot"), not daylight. */
  useCameraWb: true,
  /** -o 1 : output in sRGB, matching the canvas/monitor pipeline. */
  outputColor: 1,
  /** 8-bit RGB out; the pipeline works on Uint8 RGBA. */
  outputBps: 8,
} as const;

export class LibRawAdapter implements RawDecoder {
  async decode(buffer: ArrayBuffer): Promise<RawDecodeResult> {
    // Dynamic import so the (large) WASM only loads inside the worker on demand.
    const mod = (await import('libraw-wasm')) as unknown as { default: LibRawCtor };
    const LibRaw = mod.default;
    const raw = new LibRaw();
    try {
      await raw.open(new Uint8Array(buffer), DEVELOP_OPTIONS);
      const meta = await raw.metadata();
      const image = await raw.imageData();
      return { pixels: toRgba(image, meta), metadata: toMetadata(meta) };
    } finally {
      await raw.close?.();
    }
  }
}
