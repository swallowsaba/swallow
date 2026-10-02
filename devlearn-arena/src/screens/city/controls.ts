import type { CityRenderer } from '@/city/render/CityRenderer';

/**
 * 都市画面の操作（docs/ui-design.md 4 章）。
 * 移動: 右ドラッグ・画面端・W A S D・矢印 / 拡大縮小: ホイール・+ − / 回転: 中ボタン・Q E
 */
const PAN_SPEED = 720; // 画素 / 秒
const EDGE = 8;
const PAN_KEYS = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];

export function attachControls(canvas: HTMLCanvasElement, renderer: CityRenderer, isActive: () => boolean = () => true): () => void {
  const held = new Set<string>();
  let drag: { x: number; y: number } | null = null;
  let pointer: { x: number; y: number } | null = null;
  let last = performance.now();
  let raf = 0;

  const onKeyDown = (e: KeyboardEvent): void => {
    if (!isActive()) return;
    if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (PAN_KEYS.includes(k)) {
      held.add(k);
      e.preventDefault();
    } else if (k === 'q') renderer.rotateBy(-1);
    else if (k === 'e') renderer.rotateBy(1);
    else if (k === '+' || k === '=' || k === ';') renderer.zoomBy(1);
    else if (k === '-') renderer.zoomBy(-1);
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    held.delete(e.key.toLowerCase());
  };
  const onBlur = (): void => held.clear();

  const onPointerDown = (e: PointerEvent): void => {
    if (e.button === 2) {
      drag = { x: e.clientX, y: e.clientY };
      canvas.setPointerCapture(e.pointerId);
    } else if (e.button === 1) {
      e.preventDefault();
      renderer.rotateBy(e.shiftKey ? -1 : 1);
    }
  };
  const onPointerMove = (e: PointerEvent): void => {
    pointer = { x: e.clientX, y: e.clientY };
    if (drag) {
      renderer.panBy(e.clientX - drag.x, e.clientY - drag.y);
      drag = { x: e.clientX, y: e.clientY };
    }
  };
  const onPointerUp = (e: PointerEvent): void => {
    if (e.button === 2) drag = null;
  };
  const onPointerLeave = (): void => {
    pointer = null;
  };
  const onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    renderer.zoomBy(e.deltaY < 0 ? 1 : -1, { sx: e.clientX - rect.left, sy: e.clientY - rect.top });
  };
  const onContextMenu = (e: Event): void => e.preventDefault();

  const step = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let dx = 0;
    let dy = 0;
    if (held.has('a') || held.has('arrowleft')) dx += 1;
    if (held.has('d') || held.has('arrowright')) dx -= 1;
    if (held.has('w') || held.has('arrowup')) dy += 1;
    if (held.has('s') || held.has('arrowdown')) dy -= 1;
    if (pointer && !drag) {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (pointer.x <= EDGE) dx += 1;
      if (pointer.x >= w - EDGE) dx -= 1;
      if (pointer.y >= h - EDGE) dy -= 1;
    }
    if (dx !== 0 || dy !== 0) renderer.panBy(dx * PAN_SPEED * dt, dy * PAN_SPEED * dt);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerLeave);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  return () => {
    cancelAnimationFrame(raf);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerLeave);
    canvas.removeEventListener('wheel', onWheel);
    canvas.removeEventListener('contextmenu', onContextMenu);
  };
}
