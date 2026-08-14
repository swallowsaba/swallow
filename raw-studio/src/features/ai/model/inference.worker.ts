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
    /** Optional second input (e.g. an inpainting mask) and its tensor name. */
    maskInputName?: string,
    maskData?: Float32Array,
  ): Promise<Float32Array>;
}

const api: InferenceApi = {
  async load(id, modelBytes) {
    if (loadedFor === id && session) return;
    // WebGPU intentionally excluded: onnxruntime-web's WebGPU execution
    // provider doesn't yet support MaxPool with ceil_mode (which u2netp
    // uses), producing a hard runtime error ("using ceil() in shape
    // computation is not yet supported for MaxPool"). WASM has full op
    // coverage. Segmentation is a one-shot action rather than a live
    // preview, so the extra latency is a reasonable trade for correctness.
    session = await ort.InferenceSession.create(modelBytes, {
      executionProviders: ['wasm'],
    });
    loadedFor = id;
  },

  async run(id, inputName, outputName, data, size, maskInputName, maskData) {
    if (!session || loadedFor !== id) {
      throw new Error('Model not loaded.');
    }
    const tensor = new ort.Tensor('float32', data, [1, 3, size, size]);
    // Prefer the session's own reported input name over the one in
    // model-registry.ts: community ONNX exports can use a different name
    // than expected, and onnxruntime-web throws a hard "missing input"
    // error if the feeds object doesn't match exactly. Segmentation models
    // like this one only have a single input, so this is safe. Models with
    // a second (mask) input keep the configured name for that one, since we
    // can't as reliably guess "which of the two names is the mask".
    const actualInputName = session.inputNames[0] ?? inputName;
    const feeds: Record<string, ort.Tensor> = { [actualInputName]: tensor };
    if (maskInputName && maskData) {
      feeds[maskInputName] = new ort.Tensor('float32', maskData, [1, 1, size, size]);
    }
    const results = await session.run(feeds);
    const output = results[outputName] ?? Object.values(results)[0];
    if (!output) throw new Error('Model produced no output.');
    const out = output.data as Float32Array;
    return Comlink.transfer(out, [out.buffer]);
  },
};

Comlink.expose(api);
