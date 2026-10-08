import { useEffect, useRef } from 'react';

/**
 * キーボードで段を進める（docs/ui-design.md 4 章）。Enter で「次へ」、Backspace で「戻る」。
 * 押すのは、段が置いた「次へ」「戻る」のボタンそのもの（押せない時は進まない。進み方は段ごとのまま）。
 * 文字を打つ欄（端末・入力欄・編集欄）にいる間は、その欄が優先。キーボードで選んだボタンの上の Enter は、そのボタンのもの。
 */

/** 文字を打つ欄か（仮想端末の xterm は、隠れた textarea で文字を受ける） */
function isTyping(el: Element): boolean {
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  return el.closest('input, textarea, select, [contenteditable="true"], .xterm') !== null;
}

/** Tab などキーボードで焦点を当てた、押せる物か（マウスで押した後の焦点は数えない） */
function isKeyboardFocusedControl(el: Element): boolean {
  if (el.closest('button, a[href], [role="button"], [role="separator"], [tabindex]') === null) return false;
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
}

/** このキーで押すボタンの印。押さないなら null */
export function stepKeyOf(e: KeyboardEvent): '.lesson-next' | '.lesson-back' | null {
  if (e.defaultPrevented || e.repeat || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return null;
  if (e.key !== 'Enter' && e.key !== 'Backspace') return null;
  const target = e.target instanceof Element ? e.target : null;
  if (target && isTyping(target)) return null;
  if (e.key === 'Enter' && target && isKeyboardFocusedControl(target)) return null;
  return e.key === 'Enter' ? '.lesson-next' : '.lesson-back';
}

/** actions（段がボタンを置く欄）のボタンを、Enter・Backspace で押す。enabled が false の間は何もしない */
export function useStepKeys(actions: HTMLElement | null, enabled = true): void {
  const on = useRef(enabled);
  on.current = enabled;
  useEffect(() => {
    if (!actions) return;
    const onKey = (e: KeyboardEvent): void => {
      if (!on.current) return;
      const sel = stepKeyOf(e);
      if (!sel) return;
      const button = actions.querySelector<HTMLButtonElement>(sel);
      if (!button || button.disabled) return;
      e.preventDefault();
      button.click();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [actions]);
}
