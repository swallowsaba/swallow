import type { EditState } from '@/types';
import { croppedImageSize } from '@/features/viewer/model/crop-math';
import { EXTENSION, type ExportOptions } from './export-options';
import { renderExport } from './export-renderer';
import { expandFilename } from './filename';
import { computeExportSize } from './resize';

export interface ExportResult {
  blob: Blob;
  filename: string;
}

/** Render + encode an edited image and compute its output filename. */
export async function exportImage(
  bitmap: ImageBitmap,
  edit: EditState,
  sourceName: string,
  seq: number,
  options: ExportOptions,
): Promise<ExportResult> {
  const blob = await renderExport(bitmap, edit, options);
  const cropped = croppedImageSize({ width: bitmap.width, height: bitmap.height }, edit.geometry.crop);
  const size = computeExportSize(cropped, options.resize);
  const baseName = sourceName.replace(/\.[^.]+$/, '');
  const filename = expandFilename(options.filenameTemplate, {
    name: baseName,
    seq,
    width: size.width,
    height: size.height,
    date: new Date(),
    ext: EXTENSION[options.format],
  });
  return { blob, filename };
}

/** Trigger a browser download for a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
