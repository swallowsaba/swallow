/**
 * Adjustment parameter model.
 *
 * Every value here is a plain, serializable number/enum so that a full set of
 * adjustments can be stored in IndexedDB, exported to JSON as a preset, and
 * diffed for history — the core of non-destructive editing. Nothing in this
 * file references pixels; it only describes *what* to do to them.
 */
/** The eight color bands used by the HSL / color mixer panel. */
export const HSL_BANDS = [
    'red',
    'orange',
    'yellow',
    'green',
    'aqua',
    'blue',
    'purple',
    'magenta',
];
