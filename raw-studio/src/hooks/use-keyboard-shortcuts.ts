import { useEffect } from 'react';
import { resolveShortcut, useEditorStore } from '@/features/editor';
import { useViewerStore } from '@/features/viewer';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

const ZOOM_STEP = 1.25;

/** Global editor shortcuts. Mount once near the app root. */
export function useKeyboardShortcuts(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const action = resolveShortcut(event);
      if (!action) return;

      const editor = useEditorStore.getState();
      const viewer = useViewerStore.getState();

      switch (action) {
        case 'undo':
          editor.undo();
          break;
        case 'redo':
          editor.redo();
          break;
        case 'zoomIn':
          viewer.setCustomScale(viewer.scale * ZOOM_STEP);
          break;
        case 'zoomOut':
          viewer.setCustomScale(viewer.scale / ZOOM_STEP);
          break;
        case 'zoomFit':
          viewer.resetView();
          break;
        case 'zoomActual':
          viewer.setCustomScale(1);
          break;
        case 'toggleBefore':
          viewer.setShowBefore(!viewer.showBefore);
          if (!viewer.showBefore) viewer.setCompareSplit(null);
          break;
        case 'toggleCompare':
          viewer.setCompareSplit(viewer.compareSplit === null ? 0.5 : null);
          if (viewer.compareSplit === null) viewer.setShowBefore(false);
          break;
        case 'copySettings':
          editor.copyAdjustments();
          break;
        case 'pasteSettings':
          editor.pasteAdjustments();
          break;
      }
      event.preventDefault();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, []);
}
