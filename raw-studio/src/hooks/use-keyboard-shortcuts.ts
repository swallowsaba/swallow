import { useEffect } from 'react';
import { resolveShortcut, useEditorStore } from '@/features/editor';

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

/** Global editor shortcuts (undo/redo). Mount once near the app root. */
export function useKeyboardShortcuts(): void {
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const action = resolveShortcut(event);
      if (!action) return;
      event.preventDefault();
      if (action === 'undo') undo();
      else redo();
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [undo, redo]);
}
