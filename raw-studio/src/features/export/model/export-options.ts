/** Export configuration model. */

export type ExportFormat = 'jpeg' | 'png' | 'webp' | 'avif';
export type ResizeMode = 'none' | 'longEdge' | 'width' | 'height' | 'percent';
export type WatermarkPosition = 'tl' | 'tr' | 'bl' | 'br' | 'center';

export interface ResizeOptions {
  mode: ResizeMode;
  /** Pixels for longEdge/width/height; percent (1..100) for percent. */
  value: number;
}

export interface WatermarkOptions {
  enabled: boolean;
  text: string;
  position: WatermarkPosition;
  /** 0..100 */
  opacity: number;
  /** Font height as a percentage of the image's short edge (1..20). */
  sizePct: number;
}

export interface ExportOptions {
  format: ExportFormat;
  /** 0..100 (ignored for png). */
  quality: number;
  resize: ResizeOptions;
  /** Filename without extension; supports {name} {date} {time} {seq} {seq:N} {w} {h}. */
  filenameTemplate: string;
  watermark: WatermarkOptions;
}

export const MIME: Record<ExportFormat, string> = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  avif: 'image/avif',
};

export const EXTENSION: Record<ExportFormat, string> = {
  jpeg: 'jpg',
  png: 'png',
  webp: 'webp',
  avif: 'avif',
};

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: 'jpeg',
  quality: 90,
  resize: { mode: 'none', value: 2048 },
  filenameTemplate: '{name}_edited',
  watermark: { enabled: false, text: '© RAW Studio', position: 'br', opacity: 70, sizePct: 4 },
};
