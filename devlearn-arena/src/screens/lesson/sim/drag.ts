import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/**
 * 実戦の画面の操作のドラッグ（REWORK-PRACTICE.txt 原則 3: ドラッグして置く・つなぐ・並べ替える）。
 *
 * - 物を押さえて動かし、放した所の受け口（data-drop の付いた要素）に落とす。受け口は「種類:ID」の文字（slot:box など）
 * - 少し（4px）動かすまでは始めない（押しただけでは何も起きない）
 * - キーボードでは、物の上で Enter か Space で持ち上げ、受け口の上で Enter か Space で置く。Esc でやめる
 *   （マウスで押しただけでは持ち上げない。マウスの操作はドラッグだけ）
 */

export interface DragNow<P> {
  payload: P;
  /** 押さえた所と今の所（画面の座標） */
  startX: number;
  startY: number;
  x: number;
  y: number;
  /** 今、上にある受け口（無ければ null） */
  over: string | null;
}

/** 画面の座標の下にある受け口の名前 */
export function dropAt(x: number, y: number): string | null {
  const el = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(x, y) : null;
  return el?.closest('[data-drop]')?.getAttribute('data-drop') ?? null;
}

const START = 4;

export function useDrag<P>(onDrop: (payload: P, target: string | null) => void) {
  const [now, setNow] = useState<DragNow<P> | null>(null);
  const [held, setHeld] = useState<P | null>(null);
  const drop = useRef(onDrop);
  drop.current = onDrop;
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);

  /** 物の onPointerDown に渡す */
  const begin = (e: PointerEvent, payload: P): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    cleanup.current?.();
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const move = (ev: globalThis.PointerEvent): void => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < START) return;
      moved = true;
      setNow({ payload, startX, startY, x: ev.clientX, y: ev.clientY, over: dropAt(ev.clientX, ev.clientY) });
    };
    const up = (ev: globalThis.PointerEvent): void => {
      stop();
      setNow(null);
      if (moved) drop.current(payload, dropAt(ev.clientX, ev.clientY));
    };
    const cancel = (): void => {
      stop();
      setNow(null);
    };
    const stop = (): void => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      cleanup.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    cleanup.current = stop;
  };

  /** 物の onKeyDown に渡す（Enter・Space で持ち上げる。もう一度で下ろす） */
  const lift = (e: KeyboardEvent, payload: P): void => {
    if (e.key === 'Escape') {
      setHeld(null);
      return;
    }
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    setHeld((h) => (h === null ? payload : null));
  };

  /** 受け口の onKeyDown に渡す（持ち上げた物を、ここへ置く） */
  const place = (e: KeyboardEvent, target: string): void => {
    if (e.key === 'Escape') {
      setHeld(null);
      return;
    }
    if (held === null || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    e.stopPropagation();
    const p = held;
    setHeld(null);
    drop.current(p, target);
  };

  return { now, held, begin, lift, place, cancelHeld: () => setHeld(null) };
}
