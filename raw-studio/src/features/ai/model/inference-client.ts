import * as Comlink from 'comlink';
import type { InferenceApi } from './inference.worker';

let proxy: Comlink.Remote<InferenceApi> | null = null;

function getProxy(): Comlink.Remote<InferenceApi> {
  if (!proxy) {
    const worker = new Worker(new URL('./inference.worker.ts', import.meta.url), {
      type: 'module',
      name: 'ai-inference-worker',
    });
    proxy = Comlink.wrap<InferenceApi>(worker);
  }
  return proxy;
}

export async function loadModel(id: string, modelBytes: ArrayBuffer): Promise<void> {
  await getProxy().load(id, Comlink.transfer(modelBytes, [modelBytes]));
}

export async function runModel(
  id: string,
  inputName: string,
  outputName: string,
  data: Float32Array,
  size: number,
): Promise<Float32Array> {
  return getProxy().run(id, inputName, outputName, Comlink.transfer(data, [data.buffer]), size);
}
