/**
 * Pure mapping from a keyboard event to an editor action. Kept free of DOM and
 * React so it can be unit-tested directly; the hook that listens for real events
 * simply calls this.
 */

export type ShortcutAction = 'undo' | 'redo';

export interface KeyEventLike {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
}

/**
 * Resolve an editor action from a key event, or null if the combo is not a
 * shortcut. Uses Cmd on macOS / Ctrl elsewhere transparently (either modifier
 * is accepted). Redo is Shift+Z or Ctrl+Y (Windows convention).
 */
export function resolveShortcut(event: KeyEventLike): ShortcutAction | null {
  const hasModifier = event.metaKey || event.ctrlKey;
  if (!hasModifier) return null;

  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? 'redo' : 'undo';
  if (key === 'y') return 'redo';
  return null;
}
