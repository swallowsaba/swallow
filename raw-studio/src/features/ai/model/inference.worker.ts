import * as Comlink from 'comlink';
import * as ort from 'onnxruntime-web';

// Serve ORT's .wasm/.mjs assets from <base>/ort/ (copied at build time).
// This is the ONNX equivalent of the COI service-worker fix: GitHub Pages can
// host the files, we just have to point the loader at them under the base path.
ort.env.wasm.wasmPaths = `${import.meta.env.BASE_URL}ort/`;

/**
 * Runs an ONNX segmentation model. Receives a preprocessed NCHW tensor and
 * returns the raw output as a Float32Array. Kept minimal; all image <-> tensor
 * conversion happens on the caller side using the tested pure helpers.
 */

let session: ort.InferenceSession | null = null;
let loadedFor: string | null = null;

export interface InferenceApi {
  load(id: string, modelBytes: ArrayBuffer): Promise<void>;
  run(
    id: string,
    inputName: string,
    outputName: string,
    data: Float32Array,
    size: number,
  ): Promise<Float32Array>;
}

const api: InferenceApi = {
  async load(id, modelBytes) {
    if (loadedFor === id && session) return;
    session = await ort.InferenceSession.create(modelBytes, {
      executionProviders: ['webgpu', 'wasm'],
    });
    loadedFor = id;
  },

  async run(id, inputName, outputName, data, size) {
    if (!session || loadedFor !== id) {
      throw new Error('Model not loaded.');
    }
    const tensor = new ort.Tensor('float32', data, [1, 3, size, size]);
    const feeds: Record<string, ort.Tensor> = { [inputName]: tensor };
    const results = await session.run(feeds);
    const output = results[outputName] ?? Object.values(results)[0];
    if (!output) throw new Error('Model produced no output.');
    const out = output.data as Float32Array;
    return Comlink.transfer(out, [out.buffer]);
  },
};

Comlink.expose(api);
