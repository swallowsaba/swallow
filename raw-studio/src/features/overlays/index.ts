export { TextPanel } from './components/text-panel';
export { TextOverlayLayer } from './components/text-overlay-layer';
export { PrivacyLayer } from './components/privacy-layer';
export { useOverlayUiStore } from './model/overlay-ui-store';
export type { OverlayUiState } from './model/overlay-ui-store';
export {
  addOverlay,
  defaultTextOverlay,
  defaultEmojiOverlay,
  defaultFrameOverlay,
  defaultPrivacyOverlay,
  fontString,
  getOverlay,
  moveOverlay,
  removeOverlay,
  reorderOverlay,
  resolveTextLayout,
  resolveEmojiLayout,
  resolveFrameGeometry,
  resolvePrivacyRect,
  mosaicCellPx,
  blurRadiusPx,
  updateOverlay,
} from './model/overlay-ops';
export type {
  TextLayout,
  EmojiLayout,
  FrameGeometry,
  RectPx,
  OverlayPatch,
} from './model/overlay-ops';
export { drawOverlays } from './model/overlay-draw';
