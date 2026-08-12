/**
 * Browser-native image decoding for Phase 5. RAW formats are handled by a WASM
 * decoder in Phase 6; here we only accept formats the browser can decode itself.
 */

export interface DecodedImage {
  readonly bitmap: ImageBitmap;
  readonly width: number;
  readonly height: number;
}

export const NATIVE_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
  'image/gif',
  'image/bmp',
] as const;

export function isNativelyDecodable(file: File): boolean {
  return (NATIVE_IMAGE_TYPES as readonly string[]).includes(file.type);
}

export async function decodeImageFile(file: File): Promise<DecodedImage> {
  if (!isNativelyDecodable(file)) {
    throw new Error(
      `Cannot decode "${file.name}" yet. RAW and other formats arrive in Phase 6.`,
    );
  }
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  return { bitmap, width: bitmap.width, height: bitmap.height };
}
