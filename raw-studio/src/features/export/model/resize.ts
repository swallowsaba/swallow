import type { ResizeOptions } from './export-options';

export interface Size {
  width: number;
  height: number;
}

/** Compute the output size for a resize option, preserving aspect ratio. */
export function computeExportSize(src: Size, resize: ResizeOptions): Size {
  const clamp = (n: number) => Math.max(1, Math.round(n));
  if (src.width <= 0 || src.height <= 0) return { width: 1, height: 1 };

  switch (resize.mode) {
    case 'none':
      return { width: src.width, height: src.height };
    case 'longEdge': {
      const long = Math.max(src.width, src.height);
      const scale = resize.value / long;
      return { width: clamp(src.width * scale), height: clamp(src.height * scale) };
    }
    case 'width': {
      const scale = resize.value / src.width;
      return { width: clamp(resize.value), height: clamp(src.height * scale) };
    }
    case 'height': {
      const scale = resize.value / src.height;
      return { width: clamp(src.width * scale), height: clamp(resize.value) };
    }
    case 'percent': {
      const scale = resize.value / 100;
      return { width: clamp(src.width * scale), height: clamp(src.height * scale) };
    }
  }
}
