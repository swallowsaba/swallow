import * as Comlink from 'comlink';
import type { DecodeApi, DecodedImageResult } from './decode-api';

let proxy: Comlink.Remote<DecodeApi> | null = null;

function getProxy(): Comlink.Remote<DecodeApi> {
  if (!proxy) {
    const worker = new Worker(new URL('./decode.worker.ts', import.meta.url), {
      type: 'module',
      name: 'raw-decode-worker',
    });
    proxy = Comlink.wrap<DecodeApi>(worker);
  }
  return proxy;
}

/** Decode any supported file off the main thread. Returns a bitmap + metadata. */
export async function decodeFile(file: File): Promise<DecodedImageResult> {
  const buffer = await file.arrayBuffer();
  // Transfer the buffer into the worker (zero-copy).
  return getProxy().decode(Comlink.transfer(buffer, [buffer]), file.name);
}
