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
  maskInputName?: string,
  maskData?: Float32Array,
): Promise<Float32Array> {
  return getProxy().run(
    id,
    inputName,
    outputName,
    Comlink.transfer(data, [data.buffer]),
    size,
    maskInputName,
    maskData ? Comlink.transfer(maskData, [maskData.buffer]) : undefined,
  );
}

/** Run a single-input restoration model at an arbitrary width/height. */
export async function runModelDynamic(
  id: string,
  data: Float32Array,
  w: number,
  h: number,
): Promise<Float32Array> {
  return getProxy().runDynamic(id, Comlink.transfer(data, [data.buffer]), w, h);
}
