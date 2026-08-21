/**
 * Liquify (manual warp) operations. Each op displaces pixels within a soft
 * radius around a point: `push` shifts them along a drag vector, `bloat`
 * magnifies outward from the center (e.g. bigger eyes), and `pinch` pulls inward
 * (e.g. a slimmer jawline). A stroke appends many small `push` ops.
 *
 * Coordinates are normalized 0..1 in the cropped image's space. `radius` is a
 * fraction of the shorter edge. `strength` is 0..1. `dx`/`dy` are the push
 * vector (normalized), 0 for bloat/pinch. Warps are stored in EditState so they
 * are undoable and persisted, and applied as a displacement map at present time.
 */
export {};
