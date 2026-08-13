import { createDefaultEditState } from '@/features/adjustments/model/defaults';
import { useEditorStore } from '@/features/editor';
import { useViewerStore } from '@/features/viewer/model/viewer-store';
import type { SourceImageKind, SourceImageMeta } from '@/types';
import { createId } from '@/utils';
import {
  getSourceKey,
  rememberSource,
  restoreEdit,
  sourceKeyForFile,
} from '@/features/persistence';
import { LruCache, createLimiter } from '@/features/perf';
import { decodeFile } from './decode-client';
import { createThumbnailBlob } from './thumbnail';
import { useLibraryStore } from './library-store';

/**
 * Full decoded bitmaps kept out of the store (not serializable), bounded by an
 * LRU so a long session can't exhaust memory. Evicted bitmaps are closed.
 */
const bitmapCache = new LruCache<ImageBitmap>({
  max: 16,
  onEvict: (bitmap) => {
    bitmap.close();
  },
});

/** Cap concurrent decodes so importing many files stays responsive. */
const decodeLimit = createLimiter(3);

function toKind(format: string | null, imageClass: 'raw' | 'native'): SourceImageKind {
  if (imageClass === 'raw') return 'raw';
  switch (format) {
    case 'png':
      return 'png';
    case 'webp':
      return 'webp';
    case 'avif':
      return 'avif';
    default:
      return 'jpeg';
  }
}

/** Make a decoded image the active one in the editor and viewer. */
export async function activateItem(id: string): Promise<void> {
  const bitmap = bitmapCache.get(id);
  const item = useLibraryStore.getState().items.find((it) => it.id === id);
  if (!bitmap || !item) return;

  const sourceKey = getSourceKey(id);
  const persisted = sourceKey ? await restoreEdit(sourceKey) : null;

  const meta: SourceImageMeta = {
    id,
    fileName: item.fileName,
    kind: item.kind as SourceImageKind,
    byteSize: item.byteSize,
    dimensions: { width: item.width, height: item.height },
    colorSpace: 'srgb',
    exifOrientation: 1,
    importedAt: Date.now(),
    ...(item.raw
      ? {
          camera: {
            ...(item.raw.make !== undefined ? { make: item.raw.make } : {}),
            ...(item.raw.model !== undefined ? { model: item.raw.model } : {}),
            ...(item.raw.iso !== undefined ? { iso: item.raw.iso } : {}),
            ...(item.raw.shutter !== undefined ? { shutter: item.raw.shutter } : {}),
            ...(item.raw.aperture !== undefined ? { aperture: item.raw.aperture } : {}),
            ...(item.raw.focalLength !== undefined
              ? { focalLength: item.raw.focalLength }
              : {}),
            ...(item.raw.timestamp !== undefined ? { capturedAt: item.raw.timestamp } : {}),
          },
        }
      : {}),
  };
  useEditorStore.getState().loadImage(meta, persisted?.editState ?? createDefaultEditState(id));
  useViewerStore.getState().loadBitmap(bitmap, { width: bitmap.width, height: bitmap.height });
  useLibraryStore.getState().select(id);
}

/** Import one file: decode off-thread, build a thumbnail, and register it. */
async function importOne(file: File): Promise<void> {
  const id = createId('img');
  const library = useLibraryStore.getState();
  library.addPending(id, file.name);
  rememberSource(id, sourceKeyForFile(file));
  try {
    const result = await decodeFile(file);
    bitmapCache.set(id, result.bitmap);
    const thumbBlob = await createThumbnailBlob(result.bitmap);
    const thumbUrl = URL.createObjectURL(thumbBlob);
    const wasEmpty = useLibraryStore.getState().activeId === null;
    useLibraryStore.getState().setReady(id, {
      kind: toKind(result.format, result.imageClass),
      width: result.width,
      height: result.height,
      thumbUrl,
      byteSize: file.size,
      raw: result.raw,
    });
    if (wasEmpty) await activateItem(id);
  } catch (error) {
    useLibraryStore.getState().setError(id, error instanceof Error ? error.message : 'Decode failed');
  }
}

/** Import many files, decoding them concurrently. */
export async function importFiles(files: readonly File[]): Promise<void> {
  await Promise.all(files.map((file) => decodeLimit(() => importOne(file))));
}
