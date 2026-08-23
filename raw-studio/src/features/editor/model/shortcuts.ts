/**
 * Pure mapping from a keyboard event to an editor action. Kept free of DOM and
 * React so it can be unit-tested directly; the hook that listens for real events
 * simply calls this.
 */

export type ShortcutAction =
  | 'undo'
  | 'redo'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomFit'
  | 'zoomActual'
  | 'toggleBefore'
  | 'toggleCompare'
  | 'copySettings'
  | 'pasteSettings';

export interface KeyEventLike {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
}

/**
 * Resolve an editor action from a key event, or null if the combo is not a
 * shortcut. Cmd (macOS) and Ctrl are accepted interchangeably. Modifier combos:
 *   Ctrl/Cmd+Z undo, Shift+Ctrl/Cmd+Z or Ctrl+Y redo,
 *   Ctrl/Cmd +/- zoom, Ctrl/Cmd+0 fit, Ctrl/Cmd+1 actual pixels,
 *   Ctrl/Cmd+C/V copy/paste settings.
 * Un-modified single keys: \\ before/after, X split compare.
 */
export function resolveShortcut(event: KeyEventLike): ShortcutAction | null {
  const hasModifier = event.metaKey || event.ctrlKey;
  const key = event.key.toLowerCase();

  if (hasModifier) {
    if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
    if (key === 'y') return 'redo';
    if (key === '=' || key === '+') return 'zoomIn';
    if (key === '-' || key === '_') return 'zoomOut';
    if (key === '0') return 'zoomFit';
    if (key === '1') return 'zoomActual';
    if (key === 'c') return 'copySettings';
    if (key === 'v') return 'pasteSettings';
    return null;
  }

  // Un-modified keys.
  if (key === '\\') return 'toggleBefore';
  if (key === 'x') return 'toggleCompare';
  return null;
}
