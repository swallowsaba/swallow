/**
 * Public type surface for the whole app. Import domain types from `@/types`
 * rather than reaching into individual files, so internal reorganization never
 * ripples outward.
 */
export type {
  ExifOrientation,
  ImageColorSpace,
  SourceImageKind,
  ImageDimensions,
  SourceImageMeta,
  CameraMeta,
} from './image';

export type {
  CurvePoint,
  RgbChannel,
  ToneCurves,
  HslBand,
  HslChannel,
  HslAdjustments,
  ColorWheel,
  ColorGrading,
  BasicAdjustments,
  DetailAdjustments,
  LensCorrections,
  Adjustments,
  LocalAdjustments,
} from './adjustments';
export { HSL_BANDS } from './adjustments';

export type {
  MaskKind,
  MaskStrokePoint,
  BrushMaskData,
  RadialMaskData,
  LinearMaskData,
  RasterMaskData,
  MaskGeometry,
  Mask,
} from './mask';

export type {
  FlipMode,
  CropRect,
  AspectRatioLock,
  OrientationStep,
  Geometry,
} from './geometry';

export type { EditState } from './edit-state';
export type { Overlay, TextOverlay, OverlayKind, TextAlign } from './overlay';
export type { WarpOp, WarpTool } from './warp';
export type { HistoryEntry, Snapshot, EditHistory } from './history';
export type {
  PresetCategory,
  PresetAdjustments,
  Preset,
  PresetExport,
} from './preset';
