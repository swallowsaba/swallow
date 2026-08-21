/**
 * Compositing overlays drawn on top of the developed image — text for now,
 * with room for stickers/shapes later. Overlays live in {@link EditState} like
 * masks, so they are undoable and persisted, and they are baked into the export
 * on a 2D canvas after the WebGL adjustment pass.
 *
 * Positions are normalized 0..1 in the CROPPED image's space (x,y = the text
 * anchor). Sizes are fractions so a text looks the same at preview and export
 * resolution: `fontSize` is a fraction of the cropped image's shorter edge and
 * `strokeWidth` is a fraction of the resolved font pixels.
 */
export {};
