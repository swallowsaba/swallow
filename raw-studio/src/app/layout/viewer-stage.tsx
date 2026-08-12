import * as React from 'react';
import { DropZone, ImageCanvas, useViewerStore } from '@/features/viewer';

/** Center stage: the live WebGL canvas once an image is loaded, else a drop target. */
export function ViewerStage(): React.JSX.Element {
  const hasBitmap = useViewerStore((s) => s.bitmap !== null);
  return hasBitmap ? <ImageCanvas /> : <DropZone />;
}
