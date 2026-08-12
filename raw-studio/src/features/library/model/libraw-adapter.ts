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
 *   await raw.open(new Uint8Array(buffer), options?);
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
  const iso = num(meta.iso);
  const shutter = num(meta.shutter);
  const aperture = num(meta.aperture);
  const focalLength = num(meta.focal_len);
  const timestamp = num(meta.timestamp);
  return {
    width: num(meta.width) ?? 0,
    height: num(meta.height) ?? 0,
    ...(make !== undefined ? { make } : {}),
    ...(model !== undefined ? { model } : {}),
    ...(iso !== undefined ? { iso } : {}),
    ...(shutter !== undefined ? { shutter } : {}),
    ...(aperture !== undefined ? { aperture } : {}),
    ...(focalLength !== undefined ? { focalLength } : {}),
    ...(timestamp !== undefined ? { timestamp } : {}),
  };
}

export class LibRawAdapter implements RawDecoder {
  async decode(buffer: ArrayBuffer): Promise<RawDecodeResult> {
    // Dynamic import so the (large) WASM only loads inside the worker on demand.
    const mod = (await import('libraw-wasm')) as unknown as { default: LibRawCtor };
    const LibRaw = mod.default;
    const raw = new LibRaw();
    try {
      await raw.open(new Uint8Array(buffer));
      const meta = await raw.metadata();
      const image = await raw.imageData();
      return { pixels: toRgba(image, meta), metadata: toMetadata(meta) };
    } finally {
      await raw.close?.();
    }
  }
}
