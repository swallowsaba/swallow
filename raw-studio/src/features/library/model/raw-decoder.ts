/**
 * Decoder abstraction. The rest of the app depends only on this interface, so
 * the concrete WASM library (libraw-wasm today, ssssota/libraw.wasm or another
 * tomorrow) can be swapped without touching the pipeline.
 */

export interface DecodedPixels {
  /** RGBA, 8-bit, row-major, length = width * height * 4. */
  readonly data: Uint8ClampedArray;
  readonly width: number;
  readonly height: number;
}

export interface RawMetadata {
  readonly width: number;
  readonly height: number;
  readonly make?: string;
  readonly model?: string;
  readonly lens?: string;
  readonly iso?: number;
  readonly shutter?: number;
  readonly aperture?: number;
  readonly focalLength?: number;
  readonly timestamp?: number;
  readonly gpsLatitude?: number;
  readonly gpsLongitude?: number;
}

export interface RawDecodeResult {
  readonly pixels: DecodedPixels;
  readonly metadata: RawMetadata;
}

export interface RawDecoder {
  /** Decode a full RAW file to RGBA pixels + metadata. */
  decode(buffer: ArrayBuffer): Promise<RawDecodeResult>;
}
