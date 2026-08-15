export { TextPanel } from './components/text-panel';
export { TextOverlayLayer } from './components/text-overlay-layer';
export { useOverlayUiStore } from './model/overlay-ui-store';
export type { OverlayUiState } from './model/overlay-ui-store';
export {
  addOverlay,
  defaultTextOverlay,
  defaultEmojiOverlay,
  defaultFrameOverlay,
  fontString,
  getOverlay,
  moveOverlay,
  removeOverlay,
  reorderOverlay,
  resolveTextLayout,
  resolveEmojiLayout,
  resolveFrameGeometry,
  updateOverlay,
} from './model/overlay-ops';
export type { TextLayout, EmojiLayout, FrameGeometry, OverlayPatch } from './model/overlay-ops';
export { drawOverlays } from './model/overlay-draw';
