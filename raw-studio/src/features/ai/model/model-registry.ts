import type { Normalization } from './tensor';
import { IMAGENET_NORM } from './tensor';

export interface ModelDef {
  readonly id: string;
  readonly label: string;
  /** Absolute URL to the .onnx file (Hugging Face / CDN). */
  readonly url: string;
  readonly license: string;
  readonly approxSizeMb: number;
  /** Square input edge the model expects. */
  readonly inputSize: number;
  readonly inputName: string;
  readonly outputName: string;
  readonly normalization: Normalization;
  readonly kind: 'segmentation' | 'inpaint' | 'landmark';
  /** Only for kind:'inpaint' — the second input's tensor name (the mask). */
  readonly maskInputName?: string;
}

/**
 * Model catalog. Binaries are NOT bundled — they are fetched on first use and
 * cached (see model-cache). URLs point at community Hugging Face exports; verify
 * the exact repo/filename and I/O tensor names against the model card before
 * relying on them, since these can move.
 */
export const MODELS: Record<string, ModelDef> = {
  'u2netp-subject': {
    id: 'u2netp-subject',
    label: 'Subject / Background',
    url: 'https://huggingface.co/tomjackson2023/rembg/resolve/main/u2netp.onnx',
    license: 'Apache-2.0 (U^2-Net)',
    approxSizeMb: 4.7,
    inputSize: 320,
    inputName: 'input.1',
    outputName: '1959',
    normalization: IMAGENET_NORM,
    kind: 'segmentation',
  },
  'lama-inpaint': {
    id: 'lama-inpaint',
    label: 'Remove Object',
    url: 'https://huggingface.co/sapienkit/LaMa-ONNX/resolve/main/lama_fp32.onnx',
    license: 'Apache-2.0 (LaMa, trained on Places2 / CC-BY 4.0)',
    // Real 51M-parameter model, fp32 — much larger than the segmentation
    // model. Documented I/O contract (from the model card): inputs `image`
    // float32[1,3,512,512] (plain /255, no ImageNet mean/std) and `mask`
    // float32[1,1,512,512] (1=erase, 0=keep); output `output`
    // float32[1,3,512,512] already in 0..255 (no re-scaling needed).
    approxSizeMb: 200,
    inputSize: 512,
    inputName: 'image',
    maskInputName: 'mask',
    outputName: 'output',
    normalization: { mean: [0, 0, 0], std: [1, 1, 1] },
    kind: 'inpaint',
  },
};

export function getModel(id: string): ModelDef | undefined {
  return MODELS[id];
}
