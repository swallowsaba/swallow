# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

### Fixed
- Build failure: `PresetAdjustments` (the type used by preset/preview/commit
  patches) was missing `toneCurves`, so the new Tone panel didn't type-check.
  Added the field.
- Found while fixing the above: `mergeAdjustments` (the commit-time merge)
  unconditionally discarded any `toneCurves` patch and kept the old curve —
  tone curve edits would have silently failed to save even after the type fix.
  Fixed the merge and added a regression test.
- Images (RAW and native formats alike) rendered upside down. Root cause:
  `UNPACK_FLIP_Y_WEBGL` behaves inconsistently across browsers when the
  texture source is an `ImageBitmap`. Fixed by uploading textures as-is and
  controlling orientation entirely via UV coordinates instead.
- Fixed two zustand selectors that built a new object/array on every call
  (`selectRenderEdit`, `selectHistoryRows`, `selectSnapshots`), which could
  trigger a React "Maximum update depth exceeded" crash (error #185). Replaced
  with memoized `useRenderEdit()` / `useHistoryRows()` hooks and a shared
  empty-array constant; `useShallow` where element identity is already stable.

### Added
- Tone, Color, Detail, and Lens tabs are now fully implemented (previously
  placeholders): 3-point tone curve, 8-band HSL color mixer, clarity/texture/
  dehaze/sharpen/noise-reduction, and lens distortion/vignette/chromatic
  aberration — all mirrored between tested TypeScript and the GLSL shader, and
  applied consistently in both the live preview and full-resolution export.
- Japanese/English UI toggle (toolbar button) covering the toolbar, both tab
  bars, and the Basic panel; persisted like the theme setting.
- A "?" help mark next to adjustment controls in Basic/Tone/Color/Detail/Lens
  that shows an explanation on hover or tap.

## [Unreleased]

### Added
- Photo info popover (toolbar "i" button): filename, dimensions, file size,
  format, and camera EXIF-style data (make/model/ISO/shutter/aperture/focal
  length/captured date) for RAW files.
- Reset button: restores the current image's adjustments and geometry to
  their defaults as one undo step.
- Three more built-in presets: Night Sports, High Key, Moody (13 total).
- Beginner Mode: a simplified panel (Brighten / Vivid sliders, using the same
  non-destructive Basic adjustments as Pro mode) plus a one-shot "Blur
  Background" action (AI subject segmentation + background blur, downloaded
  as a separate file rather than a live slider — see background-blur.ts for
  why). Toggle between Beginner/Pro from the right panel.
- Crop tool: drag-resize crop rectangle with corner handles, aspect-ratio
  presets including 16:9 and 9:16 (phone portrait). Crop is applied
  consistently in the live viewer (fit/fill/pan account for the cropped
  size) and in full-resolution export.

### Fixed
- `LibraryItem`/`SourceImageMeta` were dropping the RAW decoder's camera
  metadata and the real file size; both are now captured and surfaced in the
  new info popover.

## [1.0.0] - 2026-08-12

### Added
- Phase 14: 1.0 release. Completed README (features, architecture, quickstart),
  DEPLOYMENT.md (checklist + Swallow subfolder setup).
- ONNX Runtime Web wasm/mjs assets are copied to `dist/ort/` and loaded from the
  base path — the AI models work on GitHub Pages.
- Production checklist for base path, `.nojekyll`, COI isolation, and SPA
  fallback.

This release completes the 14-phase build: a fully client-side RAW developer
that reads RAW/JPEG, develops on the GPU, applies AI/auto corrections and
presets, edits non-destructively with persistent history, and exports — all in
the browser, deployable to GitHub Pages with no server.

## [0.13.0-phase13]

### Added
- Phase 13: test infrastructure. Vitest config (Node env, v8 coverage) running
  15 committed unit-test files (77 tests) across history, editor, adjustments,
  viewer, RAW format detection, presets, persistence, AI, export, and perf.
- Playwright config + E2E smoke tests (app shell loads, drop target and tabs
  render).
- CI workflow (typecheck + lint + unit tests + build + E2E) on push/PR, and a
  test gate before the Pages deploy.
- npm scripts: test, test:watch, test:coverage, e2e, e2e:install.

## [0.12.0-phase12]

### Added
- Phase 12: performance. Pure, tested utilities — LRU cache, rAF render
  coalescer, async concurrency limiter, and virtual-window range math.
- Bounded LRU bitmap cache (evicted bitmaps are closed) caps memory on long
  sessions; imports now decode at most 3 files at once.
- Viewer renders are coalesced to one draw per animation frame, so dragging
  sliders stays smooth on large images.
- Filmstrip is virtualized (only on-screen thumbnails render).
- Vite manual chunks split React / onnxruntime-web / libraw-wasm for a smaller
  initial load.

## [0.11.0-phase11]

### Added
- Phase 11: export. Toolbar Export dialog renders the edited image at full (or
  resized) resolution through the same WebGL pipeline and saves it.
- Formats JPEG / PNG / WebP / AVIF with a quality control; resize by long edge /
  width / height / percent; filename templates ({name} {date} {seq:3} {w} {h});
  optional text watermark with position + opacity.
- Pure, tested filename expansion and resize math; type-checked full-res
  export renderer + watermark compositor.

## [0.10.0-phase10]

### Added
- Phase 10: AI. Classic "Auto" corrections (Auto / Tone / WB / Color) in the
  Basic panel — pure, unit-tested histogram/gray-world algorithms that feed the
  shader. New AI tab.
- ONNX Runtime Web infrastructure: model registry, Cache-Storage model loader
  with download progress, a Comlink inference worker, and tested tensor
  pre/post-processing (RGBA->NCHW, output->alpha mask).
- Subject/background segmentation wired end-to-end as the model template
  (downloads a ~5 MB Apache-2.0 model on first use, runs in-browser).

## [0.9.0-phase9]

### Added
- Phase 9: history UI + persistence. Left panel now has Library / History tabs.
- History panel: click any timeline step to jump there (tested `jumpTo`), plus
  snapshots (add / restore / delete).
- IndexedDB persistence via Dexie: user presets, per-file edit state + snapshots
  (keyed by a stable file signature), and UI settings survive reload.
- Pure, tested serialize/migrate for stored records; defensive repository that
  degrades gracefully when storage is unavailable.

### Changed
- Reopening the same file restores its saved edits; broke two barrel import
  cycles introduced by cross-store wiring.

## [0.8.0-phase8]

### Added
- Phase 8: presets. Ten built-in looks (Portrait, Landscape, Night, Vintage,
  Film, Cinematic, Street, Wedding, Travel, Black & White) as Basic overlays.
- Presets tab with search, favorites, categories, hover-to-preview + click-to-
  apply (one undo step), create-from-current, rename, duplicate, delete.
- Preset JSON export/import with validation.
- Pure, tested modules: preset apply, preset IO (serialize/parse), store CRUD.

### Changed
- Preview overlay now merges all adjustment groups (for full-preset previews).

## [0.7.0-phase7]

### Added
- Phase 7: GPU image development. The WebGL2 fragment shader now applies the full
  Basic pipeline — exposure, contrast, highlights/shadows, whites/blacks,
  brightness, temperature/tint, saturation, vibrance, gamma — in linear light.
- Pure `adjustment-math` module mirroring the shader, with unit tests (neutral =
  identity, exposure, contrast, saturation, white balance, gamma, clamping).
- Live preview: dragging a slider updates the render immediately via an
  uncommitted preview overlay; releasing writes exactly one undo step.
- Before/after toggle renders the image with neutral adjustments.

## [0.6.0-phase6]

### Added
- Phase 6: RAW decoding via a swappable `RawDecoder` interface with a LibRaw
  (libraw-wasm) adapter, running in a Comlink-driven Web Worker off the main
  thread. Supports CR2/CR3/ARW/NEF/RAF/RW2/ORF/PEF/DNG plus native formats.
- Pure, tested format detection from magic bytes + extension (incl. CR3 ISO-BMFF,
  CR2, RAF, RW2, ORF; generic-TIFF formats resolved by extension).
- Multi-file import pipeline: concurrent decode, thumbnail generation
  (OffscreenCanvas), a library store, library grid, and a live filmstrip.
- Selecting a thumbnail activates it in the editor + viewer instantly (bitmap
  cache), reusing the Phase 5 WebGL renderer.

### Changed
- Import now flows through the worker pipeline (RAW + native + multi-file);
  removed the main-thread native-only opener.

## [0.5.0-phase5]

### Added
- Phase 5: live WebGL2 image viewer in the center stage.
- Type-checked `WebGLImageRenderer` (textured quad with scale/pan/rotation),
  ready to move to a worker + OffscreenCanvas and gain adjustment shaders.
- Pure, tested viewport math (fit/fill, zoom presets, pan clamping, orientation).
- Zoom (wheel + presets), pan (drag), Fit/Fill, 90-degree rotate, before toggle.
- Drag-and-drop / file-picker import for browser-native formats (JPEG/PNG/WebP/
  AVIF), wiring decoded images into the editor and viewer stores.

## [0.4.0-phase4]

### Added
- Phase 4: Lightroom-style resizable layout (toolbar, library, viewer,
  filmstrip, adjustments) built on react-resizable-panels.
- Tabbed adjustments panel (Basic wired; Tone/Color/Detail/Lens placeholders).
- Full Basic panel: all 12 basic sliders wired to the store with live drag and
  one undo step per commit.
- UI store (theme, active tab, panel visibility); dark/light theme toggle
  persisted to localStorage.
- Keyboard shortcuts (Undo/Redo) via a tested pure resolver, ignored while
  typing in inputs.

## [0.3.0-phase3]

### Added
- Phase 3: hand-written shadcn/ui primitives (Button, Input, Label, Slider,
  Separator, Tabs, Tooltip, ScrollArea, Dialog, Toggle) — no CLI required.
- Composite `AdjustmentSlider` control (label + slider + numeric input + reset).
- Zustand editor store wiring adjustment/geometry commits to the history stack,
  with selectors for undo/redo availability and history labels.
- Interactive editor demo in App: live-drag sliders that commit one undo step
  on release, with working Undo/Redo and a history readout.

## [0.2.0-phase2]

### Added
- Phase 2: feature-first architecture skeleton.
- Core domain model in `src/types` (`Adjustments`, `EditState`, `Mask`,
  `Geometry`, `Preset`, history types).
- Default-adjustment factories and a pure, tested undo/redo/snapshot history
  stack.
- Community docs: CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, issue/PR templates.

## [0.1.0]

### Added
- Phase 1: project scaffold (Vite + React 19 + TypeScript strict + Tailwind /
  shadcn), GitHub Pages deploy workflow, COI service worker, capability check.
