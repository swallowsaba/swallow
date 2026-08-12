import type { Adjustments } from './adjustments';
import type { Geometry } from './geometry';
import type { Mask } from './mask';

/**
 * The complete non-destructive edit for a single image.
 *
 * This is the one object that everything revolves around: the render pipeline
 * reads it to produce pixels, the history stack snapshots it, presets are
 * partial overlays onto it, and IndexedDB persists it. The original image is
 * never modified — only this description of what to do to it.
 */
export interface EditState {
  /** Links to the {@link SourceImageMeta} this edit belongs to. */
  readonly imageId: string;
  readonly adjustments: Adjustments;
  readonly geometry: Geometry;
  readonly masks: readonly Mask[];
  /** Epoch millis of the last modification. */
  readonly updatedAt: number;
}
