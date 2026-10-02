import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach } from 'vitest';

/**
 * 図の部品を jsdom の上に描いて、押したり中身を読んだりするための道具。テストからだけ使う。
 */

// React の act() を jsdom の上で使う
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: { root: Root; host: HTMLDivElement }[] = [];

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => {
      root.unmount();
    });
    host.remove();
  }
});

export function mount(element: React.ReactElement): HTMLDivElement {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  act(() => {
    root.render(element);
  });
  return host;
}

/** 描き直す。前の状態を持ったまま次の状態を渡すときに使う */
export function rerender(host: HTMLDivElement, element: React.ReactElement): void {
  const entry = mounted.find((m) => m.host === host);
  act(() => {
    entry?.root.render(element);
  });
}

export function click(container: Element, selector: string): void {
  const target = container.querySelector(selector);
  if (!target) throw new Error(`見つかりません: ${selector}`);
  act(() => {
    target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
