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

### Fixed
- **RAW files developed with a yellow/green cast.** The LibRaw decoder was opened
  with no processing options, and libraw-wasm defaults to `useCameraWb: false` —
  so the camera's recorded ("as shot") white balance was ignored and files were
  developed at LibRaw's built-in daylight balance. On Sony ARW that lands well
  off-neutral: greens go olive and whites go cream. Now opened with
  `useCameraWb: true` plus explicit sRGB / 8-bit output, matching what the
  camera's own embedded preview (and Explorer) shows.

### Fixed
- **Dehaze now works in both directions.** The shader clamped the amount to >= 0,
  so negative dehaze (adding atmospheric haze / softening) did nothing. It's now
  bidirectional — positive clears haze, negative adds a veil — with contrast
  floored and the black-lift clamped so strong negative values flatten to haze
  instead of solarizing. Pure, unit-tested transform mirrored in the shader.

### Added
- **Named & renamable snapshots.** Snapshots can now be given a name when saved
  (type it and press Add/Enter) and renamed later by double-clicking — instead of
  the auto "Snapshot N". Pure, unit-tested rename op (trims, ignores blanks,
  no-ops unknown ids).

- **More keyboard shortcuts.** Beyond undo/redo: Ctrl/Cmd +/- to zoom, Ctrl/Cmd+0
  to fit, Ctrl/Cmd+1 for actual pixels, Ctrl/Cmd+C / +V to copy and paste
  settings, and un-modified \\ for before/after and X for split compare. Pure,
  unit-tested key resolution; the global hook now dispatches each action.

- **Post-crop vignette.** A proper effects vignette in the Detail panel — amount
  (darken or brighten the corners), midpoint, roundness and feather — applied in
  the cropped image space, separate from the lens-correction vignette. Renders in
  the shader and bakes into the export; skipped at amount 0. Pure, unit-tested
  falloff math mirrored in the shader.

- **Export multiple sizes at once.** In the export dialog, pick any set of
  presets and export the current image to all of them in one go — each written
  with a size suffix so files don't overwrite each other (e.g. photo_1080px.jpg,
  photo_3840px.jpg). Pure, unit-tested filename/collision logic; the render reuses
  the single-image export path per preset.

- **Film grain.** A grain amount and size in the Detail panel add film-like
  luminance-weighted noise (strongest in the midtones), rendered in the shader
  and baked into the export. Skipped entirely at amount 0, so existing edits are
  unchanged. Pure, unit-tested UI->shader parameter mapping (amplitude and cell
  frequency).

- **Selective paste settings.** The paste control now has a caret that opens a
  group picker — paste only Basic, Tone curves, HSL, Color grading, Detail or
  Lens instead of everything. Groups the copied image doesn't actually carry are
  marked "(none)". Built on the same unit-tested group selection.

- **Export presets.** The export dialog now has one-tap presets — Original,
  Instagram square/portrait, Story, X post, 4K, Web (small, WebP) and Print PNG —
  that set format, quality and long-edge size together; the matching chip
  highlights and your filename template and watermark are kept. Pure and
  unit-tested.

- **Copy / paste settings between images.** Copy the current image's adjustments
  and paste them onto another — the classic Lightroom pair. Paste lights up once
  something is copied. Pure, unit-tested group selection (basic / tone curves /
  HSL / color grading / detail / lens) under the hood, applied through the normal
  history-aware commit so it's undoable.

- **RGB balance readout on the histogram.** The mean level of each channel now
  shows as a percentage (R / G / B) beneath the histogram — a quick read on
  colour balance: equal values mean neutral, a high R with a low B means a warm
  cast. Pure and unit-tested (count-weighted mean of the channel bins).

- **Per-mask tone curve.** A selected mask now has its own RGB tone curve in the
  local adjustments, alongside the local sliders — point-based, same editing as
  the global curve. It flows through the layer's curve LUT, so it renders within
  the mask and bakes into the export with no shader change. (A mask's curve
  overrides the global RGB curve within that layer.)

- **Mask thumbnails.** Each mask in the list now shows a small preview of its
  coverage — radial, linear, brushed or AI shape — so the list is scannable at a
  glance instead of reading names. Rendered from the same pure coverage math as
  the real render, at thumbnail size.

- **Shooting info under the histogram.** ISO, focal length, aperture and shutter
  (plus the camera body) now show beneath the histogram, read from the RAW
  metadata already captured at import. Pure, unit-tested formatters — shutter
  renders as 1/4000 or 2.5\", aperture drops the decimal on whole stops, and any
  field the file doesn't carry is simply omitted.

- **Color grading (Lightroom-style).** The Color tab now has a hue/saturation
  wheel per tonal zone — shadows, midtones, highlights and global — with
  luminance per wheel plus shared blending and balance. Drag on the wheel or use
  the sliders; the grade renders live and bakes into the export. Pure,
  unit-tested grading math mirrored line-for-line in the shader, and skipped
  entirely when every wheel is neutral. (The data model existed but had no UI or
  shader pass until now.)

- **Before/after split compare.** A toggle in the viewer controls splits the
  image down a draggable divider: original on the left, current edit on the
  right. Both halves are drawn from the same quad (scissored in the renderer) so
  they line up exactly. Mutually exclusive with the whole-image before toggle;
  shows a notice while masks/liquify route through the multi-pass path.

- **AI mask refinement — expand / contract.** AI subject (raster) masks can now be
  grown or shrunk by a couple of pixels to fix hair edges or pull in from a
  haloed border, alongside the existing feather and invert-area controls. Pure,
  unit-tested morphology (separable dilate/erode).

- **Per-channel tone curves + faithful GPU LUT.** The tone curve editor now has
  RGB / R / G / B channels, and the renderer applies all four through a 256-entry
  lookup-table texture (per-channel first, then master) — so multi-point curves
  render exactly (not a 3-point approximation) and bake into the export. Identity
  curves are a no-op, so existing edits are unchanged.

- **Tone curve editor (RGB).** A point-based master curve in the Tone tab: click
  to add points, drag to shape, double-click to remove. Writes the standard
  `toneCurves.rgb`, so edits render live through the existing pipeline. Pure,
  unit-tested curve math (eval, point add/move/remove, 256-LUT builder ready for
  a future faithful per-channel GPU pass).

- **Histogram with drag-to-adjust.** A live RGB + luma histogram sits above the
  adjustment tabs (pro mode). Drag left/right across its five tonal zones —
  Blacks, Shadows, Exposure, Highlights, Whites — to change the matching Basic
  slider directly, Lightroom-style. Pure, unit-tested histogram/zone math; the
  display is computed from the source image (live-developed readback can come
  later).

- **13 more built-in presets** (26 total) — Golden Hour, Teal & Orange, Bright &
  Airy, Matte Fade, Cool Blue, Warm Sunset, Vivid Pop, Soft Pastel, Autumn,
  Winter, Dramatic B&W, Clean, and Noir — tasteful Basic-group starting points.
- **Privacy (mosaic / blur / block).** Redact faces, plates or personal info with
  a movable region: pixelate, blur, or a solid block, with adjustable strength
  and size. The real mosaic/blur is baked into the export (so shared images are
  actually redacted); the on-canvas preview approximates it with a CSS filter.
  - Pure, unit-tested geometry (`resolvePrivacyRect`, `mosaicCellPx`,
    `blurRadiusPx`) shared by preview and export; the export downscale+upscale
    mosaic/blur reads back the drawn pixels after the image.
  - Lives in the Decorate tab beside text/stickers/frames; undoable and persisted.
- **Face reshape — pluggable real-landmark pipeline.** Detection now runs a
  registered facial-landmark model on the face crop when one is available,
  decodes its output into the landmark set, and uses it only if it passes a
  plausibility check — otherwise it keeps the proportion estimate. The panel
  shows which source was used, and the handles still let you fine-tune either.
  - Pure, unit-tested decode/mapping/validation (`landmark-decode`): read points
    from a flat model output (xy/yx, normalized or pixel), map face-crop coords
    into image space, reject implausible faces, and choose model-vs-estimate.
  - A reusable `runModelRaw` in the AI layer runs any single-in/single-out model
    on a square RGBA and returns the raw tensor (segmentation now shares it).
  - No landmark model ships by default: exact tensor names and point indices
    must be verified against a model card, so shipping guessed values (which
    would silently misalign the reshape) is avoided. Enabling one is a small
    registry + layout addition; the whole decode pipeline is ready and tested.
- **Stickers & frames** — the overlay system now also does emoji stickers and
  decorative frames, for SNS-ready composites. Emoji stickers use the platform
  emoji font (license-free) and drag/rotate/scale like text. Frames come in two
  styles — a stroked `border` (inset + corner radius) and a solid `matte` that
  mats the image down to a rounded inner window. Both are undoable, persisted and
  baked into the export.
  - Pure, unit-tested layout/geometry (`resolveEmojiLayout`,
    `resolveFrameGeometry`) shared by the SVG preview and the canvas export, plus
    a kind-safe overlay patch so text/emoji/frame edits share one update path.
- **Face reshape — manual refinement of the auto estimate.** After auto-detect,
  the estimated eye/jaw landmarks show as draggable handles on the preview;
  dragging them re-derives the warp live (moving an eye also rescales its bloat
  radius by the inter-eye distance). Pure, unit-tested point movement and
  hit-testing, so "auto rough-in, then hand-perfect" is one flow.
- **Face reshape (auto)** — one click detects the subject and reshapes the face:
  bigger eyes and a slimmer jawline, tunable with two sliders, previewed live and
  applied as liquify warp ops (so it's undoable and baked into the export).
  - Pure, unit-tested reshape core (`face-reshape`): a compact landmark schema,
    proportion-based landmark estimation from a face box, a subject-mask →
    face-box heuristic, and `proposeFaceReshape` turning intensities into warp
    ops (eye bloats + inward jaw pushes).
  - Landmarks come from the existing on-device subject segmentation plus
    portrait-proportion estimation — approximate (not a true facial-landmark
    model), best on centered frontal portraits, and designed so a real landmark
    model can drop in behind the same interface later.
- **Liquify (manual warp)** — reshape parts of the photo by hand: `push` along a
  drag, `bloat` to magnify (e.g. bigger eyes) and `pinch` to slim (e.g. a
  narrower jawline), with brush size and strength. Strokes are undoable and
  persisted, and are **baked into the export** so what you see is what you get.
  - Pure, unit-tested warp math (`warp-field`): an inverse displacement field
    summed from soft-falloff ops, rasterized into an 8-bit displacement map; the
    GPU present pass offsets sampling by the decoded displacement.
  - The renderer gains one warp-present pass reusing the mask FBO pipeline, so
    liquify composes with adjustments, local masks and text overlays. Export now
    routes through the same masked/warped path (this also fixes local masks not
    being baked into exports before).
- **Text overlays** — add text on the photo for SNS-style posts. Font, weight,
  italic, color, **outline (stroke)**, shadow, alignment, rotation, size and
  opacity; drag on the preview to position it. Overlays live in `EditState`
  (undoable, persisted) and are **baked into the exported image** on the 2D
  canvas after the WebGL develop pass, so what you see is what you export.
  - Pure, unit-tested transitions and layout math (`overlay-ops`): add / update /
    move (clamped) / remove / reorder, plus a shared layout resolver so the
    on-screen SVG preview and the canvas export baker size and place text
    identically (font size as a fraction of the shorter edge).
  - No renderer change — overlays are an SVG layer over the stage and a
    2D-canvas draw at export time.
  - Old saved edits without an `overlays` field migrate to an empty list.
- **Auto Local** — one click analyzes the image and drops a *set* of corrective
  region masks (sky, shadows, blown highlights), each with sensible local
  adjustments. Ordinary auto tools only nudge the whole frame; proposing
  separate region masks is the differentiator, and it reuses the raster-mask
  machinery so the renderer is untouched.
  - Pure, unit-tested region detection (`auto-local`): sky (bright, low-sat,
    blue, top-weighted), shadows (dark), and highlights (near-blown), each a
    soft coverage buffer, with coverage gating so near-empty or whole-frame
    detections are skipped (those belong to global adjustments).
  - Runs synchronously on a downscaled, crop-aware sample — no model or network.
- **AI subject masks**. A new `raster` mask kind holds a pixel-precise coverage
  bitmap; the Masks panel's "Select subject with AI" runs the existing on-device
  U²-Net segmentation and turns the result into a local-adjustment mask.
  - Reuses the existing `segment()` / model pipeline — no new model or network
    path. The result is mapped into the cropped image's normalized space, stored
    at a bounded resolution (≤256px long edge) as base64, and rides along in
    `EditState` like every other mask (undoable, persisted).
  - Pure, unit-tested raster helpers (`raster-mask`): a dependency-free base64
    codec (works in browser/worker/Node), bilinear sampling, resampling with
    invert and box-blur feather, and crop-space mapping.
  - The renderer is unchanged: a raster mask rasterizes to the same coverage
    buffer every mask produces, so it composites through the existing path.
  - Feather and invert controls on the mask, plus the usual per-mask local
    adjustment sliders.
- **Look Mixer** — a genuinely new tool that other editors don't offer: blend
  *continuously* across entire develops. Because a develop is just serializable
  numbers, any set of looks can be weight-averaged into a new valid develop.
  - Pure, unit-tested blending (`blend-edit`): weighted average of every numeric
    field across basic/detail/lens/HSL/color-grading, plus tone-curve output
    blended on the dominant look's grid; booleans resolve to the dominant look.
    Includes `lerpAdjustments` (2-way) and `bilinearWeights` (4-way pad).
  - `look-source` resolves snapshots, presets (merged onto the current base),
    the current edit, or a neutral reset into full adjustment stacks so they mix
    uniformly.
  - A Mix panel with a 2-way A↔B slider and a 4-way 2D pad; the blend previews
    live through the existing preview pipeline (no renderer changes) and Apply
    commits it as one normal, undoable adjustment step.
  - **Compare view**: an A/B compare toggle flips the viewport between the two
    endpoints in place (any two looks, not just before/after), and a parametric
    "A → B differences" readout lists exactly which controls differ and by how
    much — a develop diff only a numeric-EditState editor can show.
- **Local-adjustment masks** (brush, radial, graduated). Each mask carries its
  own subset of light/color/clarity adjustments that apply only inside it. The
  data model already existed on `EditState`; this adds the rest:
  - Pure, unit-tested coverage math (`mask-alpha`): elliptical radial falloff
    with rotation/feather/invert, graduated linear ramps, and brush stroke
    stamping with pressure/flow/feather and erase strokes — rasterized to an
    8-bit coverage buffer.
  - Pure `EditState` transitions (`mask-ops`) wired through the editor store, so
    every add/paint/move/adjust/reorder/delete is one undo step and persists via
    the existing IndexedDB path (masks ride along inside `editState`).
  - GPU multi-pass compositing in the WebGL2 renderer: the global result renders
    to an offscreen buffer, then each mask's adjusted variant is folded in by its
    coverage (`mix(dst, src, alpha)`) with ping-pong framebuffers, presented with
    the view transform. The single-pass path is used unchanged when there are no
    masks (no regression to the common case).
  - On-canvas overlay with drag handles (radial/linear) and painting (brush), a
    faint coverage tint, plus a Masks panel and per-mask local sliders. Reuses
    the tested adjustment uniform builders, so a mask's exposure/clarity behaves
    exactly like the global sliders, confined to the mask.
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

## [Unreleased]

### Fixed
- Build failure: `inpaint.ts` passed a `Uint8ClampedArray` straight to
  `new ImageData(...)`, which newer TypeScript rejects (it now types
  `Uint8ClampedArray` as possibly `SharedArrayBuffer`-backed, which the
  `ImageData` constructor doesn't accept) — the same issue fixed in
  `decode.worker.ts` back in an earlier round, missed here since this file
  didn't exist yet. Copies into a fresh `Uint8ClampedArray` first, same fix.

### Fixed (critical)
- **HSL color bands corrupting adjacent fields.** `mergeAdjustments`/
  `mergePreview` shallow-merged each HSL band, so editing just one field (e.g.
  saturation) silently erased that band's hue and luminance. The corrupted
  value fed the shader as NaN, which is why touching the red/orange band
  could darken the whole image and made other controls appear to stop
  responding. Now merges per-band (and per color-grading wheel) correctly.
  Added regression tests.
- **Shadows/Highlights sliders always snapping back to 0.** The Tone tab's
  shadow point sat at x=0 (the curve's absolute floor) and the highlight
  point at x=1 (the absolute ceiling) — there was no room to move a negative
  shadows delta or a positive highlights delta, so they always clamped
  straight back to neutral. Shadow/highlight points now sit at interior
  x=0.25/0.75 anchors (black/white points themselves stay fixed), matching
  how parametric tone curves normally work. Fixed in both the TypeScript
  math and the mirrored GLSL shader code; added 8 regression tests.
- Fixed a build-breaking `exactOptionalPropertyTypes` violation in the
  Beginner panel (explicit `undefined` assignment); switched to the same
  `delete`-based pattern already used elsewhere.

### Added
- Fisheye toggle in the Lens panel: switches the Distortion slider from a
  subtle barrel/pincushion correction curve to a much stronger spherical
  bulge.
- Japanese translations for the Tone, Color, Detail, Lens, Presets, and
  History panels (previously only the toolbar/tabs/Basic panel were
  translated).

## [Unreleased]

### Fixed (critical)
- **Sharpen/Clarity/Noise-Reduction comparing against the wrong reference,
  causing unwanted color/brightness shifts.** The "local blur" these effects
  use as a reference was sampled from the raw, unedited texture, while the
  pixel being compared against it (`s`) had already gone through exposure,
  white balance, tone curve, and color adjustments. Any of those edits made
  the two wildly different in a way that had nothing to do with local detail:
  Sharpen/Clarity effectively added a large, roughly uniform push instead of
  enhancing edges, and Noise Reduction pulled the image back toward its
  unedited raw colors instead of smoothing grain — matching reports that
  these controls "didn't work" and shifted colors unexpectedly. Fixed by
  extracting the tonal/color pipeline into a shared `basePipeline()` and
  running it for the blur's neighbor samples too, so the comparison is
  apples-to-apples (edited vs. locally-smoothed-edited). This does increase
  per-pixel GPU cost (5x the shared pipeline instead of 1x); unverified in
  this environment whether that's noticeable on lower-end hardware.

## [Unreleased]

### Fixed
- AI segmentation ("Detect subject / background") failed with "using ceil()
  in shape computation is not yet supported for MaxPool" — a known gap in
  onnxruntime-web's WebGPU execution provider (it doesn't yet support
  MaxPool's ceil_mode, which the u2netp model uses). Switched to the WASM
  execution provider only, which has full op coverage. Segmentation is a
  one-shot action rather than a live preview, so the extra latency is an
  acceptable trade for correctness; unverified in this environment whether
  it's noticeably slower.
- Detail tab's Clarity sometimes had almost no visible effect. Its
  extremes-taper (meant to avoid clipping near pure black/white) fell off
  *linearly across the entire tonal range*, so ordinary tones far from exact
  middle gray (e.g. luma 0.25 or 0.75 — common in real photos) were already
  running at reduced strength. Narrowed the taper to only the outer ~12% of
  the range near true black/white; Clarity is now full-strength across the
  rest. Also gave Texture a slightly stronger multiplier for better
  visibility. Added a regression test.

## [Unreleased]

### Fixed
- Noise Reduction (Luminance/Color) had little to no visible effect. It was
  reusing the same 1-texel-radius blur built for Sharpen/Clarity's edge
  detection, which is far too narrow to meaningfully smooth photographic
  grain. Added a separate, wider 8-sample blur (radius scales with the
  texel size, independent of the sharpen radius) used only for noise
  reduction, so raising the sliders now visibly smooths detail. Skipped
  when both noise-reduction sliders are at 0, so images that don't use it
  pay no extra cost.

## [Unreleased]

### Fixed
- Noise Reduction acted like a plain blur (smoothed real edges/detail as much
  as actual grain). Made it edge-aware: the effect now scales down wherever a
  pixel differs a lot from its local neighborhood (much more likely to be a
  genuine edge than noise), and stays at full strength in flat, low-detail
  areas where noise actually shows up. Color noise reduction stays a bit more
  effective near edges than luminance smoothing, matching how real denoise
  tools behave. Added regression tests.
- Color Mixer (HSL) sliders felt unpredictable: adjacent bands are only
  30-40deg apart, but each slider's influence extended 60deg in both
  directions, so moving "Red" visibly nudged "Orange" pixels too. Narrowed
  the falloff radius to 20deg so each band stays mostly independent while
  still blending smoothly rather than cutting off hard. Added a regression
  test.
- AI inference: the input tensor name is now read from the loaded model
  itself instead of a hardcoded guess, so a mismatched name in the model
  registry can no longer cause a hard "missing input" failure.

### Added
- Remove Object (AI inpainting): paint a brush mask over anything you want
  removed (a net, a passerby, a stray object) and the AI fills it in based on
  the surrounding image, using the LaMa model (Apache-2.0, ~200 MB,
  downloaded and cached on first use — see the model card at
  huggingface.co/sapienkit/LaMa-ONNX for its exact documented I/O contract).
  Access it from the crop/eraser icon in the viewer's bottom toolbar.
  Produces a downloaded result rather than a live non-destructive edit (same
  reasoning as Beginner Mode's Blur Background). The model only sees a fixed
  512x512 view of the whole photo, so the filled area is correspondingly
  softer than the untouched surrounding pixels on a large image — a known,
  disclosed limitation of this v1, most noticeable removing small/thin
  objects on high-resolution photos.

## [Unreleased]

### Fixed
- Noise Reduction (Luminance) still felt weak/inconsistent after the earlier
  edge-aware fix: the threshold (0.02-0.12 local difference) was too tight —
  real photographic noise easily falls in that exact range, so the gate was
  suppressing smoothing almost everywhere it was actually needed. Widened to
  0.06-0.30 so typical noise stays fully smoothable and only much larger
  jumps (genuine edges) are protected. Updated tests accordingly.
- Texture still had very little visible effect; increased its strength
  multiplier further (0.45 → 0.8).
- AI inference: input tensor name is read from the loaded model itself
  (already fixed last round); this round also makes segmentation's status
  text clearer about download progress.

### Changed
- Renamed Detail's "Color" noise-reduction slider to "Color Noise" and
  rewrote its help text to describe the visible symptom (colored speckles in
  shadows) rather than just the technical term — several people found the
  original label unclear.
- Basic/Tone/Color/Lens/Beginner sliders now range −300..300 (previously
  −100..100) for stronger effects; Detail's Clarity/Texture/Dehaze and
  Sharpen Amount likewise. Noise Reduction's two sliders stay at 0..100 —
  their blend formula already saturates at 100, so a wider range there would
  do nothing beyond just being misleading.
- AI tab rewritten with clearer, translated explanations of what each tool
  does (previously unclear what "Detect subject/background" was for on its
  own) and a shortcut to Remove Object.
- Remove Object no longer downloads automatically after "Apply" — it now
  shows a preview first, with separate "Redo" and "Download" actions, so
  nothing is saved until explicitly requested.

### Added
- Photo info now includes the lens model and GPS coordinates when a RAW file
  has them (read defensively, since the exact field names aren't fully
  documented by the decoder library), a "View on map" link, and an opt-in
  "Look up place name" button (queries OpenStreetMap's free Nominatim
  service — the one place in the app that sends anything external, and only
  when explicitly clicked).

## [Unreleased]

### Fixed
- Background Blur (Beginner Mode) barely visibly blurred anything. The blur
  radius was a fixed 14 CSS pixels regardless of photo size — on a
  4000px-wide photo that's under 0.4% of the width, effectively invisible.
  Radius now scales with the image's resolution. Added tests.

### Added
- Camera/lens metadata (make, model, lens, ISO, shutter, aperture, focal
  length, capture date, GPS) is now read from JPEG and other non-RAW formats
  too via EXIF (previously RAW-only, via LibRaw). Uses the `exifr` library.
- Photo Info panel: lens model row; GPS section with a "View on map" link and
  an opt-in "Look up place name" button (queries OpenStreetMap's free
  Nominatim service — the only place in the app that sends anything
  external, and only on click).
- Export dialog: a Share button (Web Share API) alongside Export, for
  handing the finished photo to the OS share sheet — Instagram, Messages,
  Files, etc. on supported devices (mainly mobile). There's no public API for
  a website to post directly into a specific app like Instagram; this is the
  standard, actually-available mechanism browsers offer for "send this photo
  to another app."

## [Unreleased]

### Added
- GIF tab: create an animated GIF from 2+ photos in your library. Pick images
  (numbered in tap order), reorder them, set the per-frame delay and output
  size, then generate and download. Uses `gifenc` (mattdesl, MIT) — a small,
  well-documented pure-JS encoder — rather than a hand-rolled GIF/LZW
  implementation, since getting that byte format exactly right without a
  browser to test against would be too risky. Mixed-size source photos are
  cropped to fill a shared canvas size (like CSS `object-fit: cover`), and
  the color palette is quantized once from the first frame and reused for
  the rest. Output is capped at a configurable long-edge size (default
  480px) since GIFs get large fast.

## [Unreleased]

### Added
- Collage tab: combine 2+ photos into a single grid image (2 side by side, 4
  in a 2×2 grid, etc — arranged automatically from how many you pick), with
  an optional caption (9 anchor positions, adjustable size and color).
  Unlike the GIF tab, this doesn't depend on an external library — it's
  pure Canvas 2D compositing, and the grid/cover-fit/text-position math is
  fully unit-tested (18 tests) since nothing here needs a real browser to
  verify.

## [Unreleased]

### Added
- Portrait Smooth (AI panel): reuses the existing subject-segmentation model
  to gently soften texture within the detected subject only — background
  stays untouched. Deliberately scoped to NOT reshape any facial features or
  alter identity (no eye/face-contour warping); that's a separate, larger
  feature that would need a dedicated face-landmark model (Google's official
  MediaPipe Face Landmarker looks like the right fit — investigated, not yet
  integrated) to precisely target individual features like eyes or teeth.

## [Unreleased]

### Added
- Remove Object: a "Suggest area" button that finds dense, regular fine-edge
  patterns (like a net or chain-link fence) and pre-fills the brush mask, for
  the person to review and refine before applying. This is classical Sobel
  edge detection + auto-thresholding + dilation (no AI model — there's no
  reliable free model specifically trained to recognize nets/fences, and a
  wrong automatic mask silently erasing the wrong thing would be worse than
  no suggestion). The person stays in control: it always starts as an
  editable suggestion, never applies on its own. Pure detection math is
  unit-tested against synthetic flat/striped pixel data (12 tests).

## [Unreleased]

### Added
- White Balance Picker (eyedropper): click any spot in the photo that should
  be neutral gray or white — the same "gray point" tool found in Lightroom
  and Camera Raw — and it computes and applies the exact temperature/tint
  correction that neutralizes that sample. Solved by inverting the shader's
  own white-balance formula in linear light for accuracy. Directly addresses
  "photo looks yellowish, restore normal color" with a precise, one-click
  tool rather than only the existing gray-world Auto WB. Available from the
  eyedropper icon in the viewer's toolbar. Verified with round-trip tests:
  applying the computed correction to the original sample actually
  neutralizes it (9 tests).

## [Unreleased]

### Added
- AI Auto Grade (AI panel): one click applies the same corrective
  exposure/white-balance/contrast analysis as the plain Auto button, plus a
  curated, deterministic "editorial" style overlay (gently lifted shadows,
  soft highlight rolloff, slightly less overall saturation traded for more
  vibrance) evoking the restrained, matte-but-rich look common in edited
  photo books. Applied as a normal, fully undoable adjustment (not a
  separate download) — no machine-learned style transfer is involved, since
  there's no verified free model for "make this look like a photographer's
  book" and a black-box reinterpretation of every photo would be
  unpredictable. The style recipe is fixed and documented; only the
  corrective portion adapts to each photo's own statistics. 5 tests.

## [Unreleased]

### Fixed
- Final audit pass: found that Clarity's midtone-protection curve and the
  Noise Reduction edge-detection curve used a plain linear ramp on the CPU
  side while the shader used GLSL's `smoothstep()` (a smooth cubic curve,
  not linear) for the same formula. Both curves shared the same two
  endpoints, so this wasn't a functional break, but it meant the CPU tests
  weren't actually verifying the shader's real intermediate behavior. Fixed
  the CPU functions to implement the same cubic formula smoothstep() uses,
  restoring an exact mirror between the tested code and the shader.

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
