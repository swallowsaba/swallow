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
  readonly kind: 'segmentation' | 'inpaint' | 'landmark' | 'denoise';
  /** Only for kind:'inpaint' — the second input's tensor name (the mask). */
  readonly maskInputName?: string;
  /** For models that accept a variable (dynamic) H/W instead of a fixed square.
   *  Input must be a multiple of `sizeMultiple` on each side. */
  readonly dynamicSize?: boolean;
  readonly sizeMultiple?: number;
  /** Max working edge for dynamic models (keeps memory/time bounded). */
  readonly maxEdge?: number;
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
  'scunet-denoise': {
    id: 'scunet-denoise',
    label: 'AI Denoise (SCUNet)',
    // Single-file ONNX export (no external .data), MIT-licensed. Verify the I/O
    // contract against the model card before relying on it: input `image`
    // float32[1,3,H,W] plain /255 (no ImageNet norm), H/W multiples of 8; output
    // same shape, 0..1. It's a blind real-photo denoiser (Swin-Conv-UNet).
    url: 'https://huggingface.co/deepghs/image_restoration/resolve/refs%2Fpr%2F1/SCUNet-PSNR.onnx',
    license: 'MIT (SCUNet, Zhang et al. 2022)',
    approxSizeMb: 91,
    inputSize: 0, // unused for dynamic models
    inputName: 'image',
    outputName: 'output',
    normalization: { mean: [0, 0, 0], std: [1, 1, 1] },
    kind: 'denoise',
    dynamicSize: true,
    sizeMultiple: 8,
    maxEdge: 1024,
  },
};

export function getModel(id: string): ModelDef | undefined {
  return MODELS[id];
}

/**
 * Pick the denoise model for a device class. PC uses the full SCUNet; mobile
 * currently uses the same model but is driven at a much smaller working size by
 * the caller (see maxEdgeForDevice), which keeps it responsive. This is the
 * single extension point: when a dedicated lightweight mobile model is verified,
 * register it and return its id here for `mobile === true`.
 */
export function getDenoiseModelId(_mobile: boolean): string {
  return 'scunet-denoise';
}
