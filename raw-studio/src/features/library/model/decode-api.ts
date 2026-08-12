import type { RawMetadata } from './raw-decoder';

export interface DecodedImageResult {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  imageClass: 'raw' | 'native';
  format: string | null;
  raw: RawMetadata | null;
}

/** The interface exposed by the decode worker (wrapped by Comlink). */
export interface DecodeApi {
  decode(buffer: ArrayBuffer, fileName: string): Promise<DecodedImageResult>;
}
