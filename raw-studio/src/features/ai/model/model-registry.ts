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
  readonly kind: 'segmentation';
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
};

export function getModel(id: string): ModelDef | undefined {
  return MODELS[id];
}
