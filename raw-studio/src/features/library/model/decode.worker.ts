import * as Comlink from 'comlink';
import type { DecodeApi, DecodedImageResult } from './decode-api';
import { detectFormat } from './raw-format';
import { LibRawAdapter } from './libraw-adapter';

const rawDecoder = new LibRawAdapter();

const api: DecodeApi = {
  async decode(buffer, fileName): Promise<DecodedImageResult> {
    const header = new Uint8Array(buffer.slice(0, 32));
    const info = detectFormat(fileName, header);

    if (info.imageClass === 'native') {
      const bitmap = await createImageBitmap(new Blob([buffer]));
      const result: DecodedImageResult = {
        bitmap,
        width: bitmap.width,
        height: bitmap.height,
        imageClass: 'native',
        format: info.format,
        raw: null,
      };
      return Comlink.transfer(result, [bitmap]);
    }

    if (info.imageClass === 'raw') {
      const { pixels, metadata } = await rawDecoder.decode(buffer);
      const imageData = new ImageData(pixels.data, pixels.width, pixels.height);
      const bitmap = await createImageBitmap(imageData);
      const result: DecodedImageResult = {
        bitmap,
        width: pixels.width,
        height: pixels.height,
        imageClass: 'raw',
        format: info.format,
        raw: metadata,
      };
      return Comlink.transfer(result, [bitmap]);
    }

    throw new Error(
      `Unsupported file "${fileName}". Supported: JPEG/PNG/WebP/AVIF and RAW formats.`,
    );
  },
};

Comlink.expose(api);
