import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Figure } from './Figure';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** jsdom は SVG の大きさを測れないので、描いた物の箱を図の座標で返す（本物の getBBox と同じ形） */
const BOXES: Record<string, DOMRect> = {
  // net-b03-cidr の「/24 の境」: 細い点線（幅 4）と、上の「/24」の字だけ
  path: { x: 460, y: 70, width: 0, height: 106 } as DOMRect,
  text: { x: 442, y: 44, width: 36, height: 18 } as DOMRect,
};

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = function (this: SVGElement) {
    return BOXES[this.tagName.toLowerCase()] ?? ({ x: 0, y: 0, width: 0, height: 0 } as DOMRect);
  };
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host.remove();
  delete (SVGElement.prototype as unknown as { getBBox?: unknown }).getBBox;
});

function show(onPick?: (part: string) => void): void {
  act(() => {
    root = createRoot(host);
    root.render(<Figure id="net-b03-cidr" onPick={onPick} />);
  });
}

describe('図の部分を押す（理解の「図を押す」。docs/progress/verify-all.md の net.b.03）', () => {
  it('細い線と字だけの部分は、線と字のそれぞれの周り（24×24 以上）を押しても選べる', () => {
    const onPick = vi.fn();
    show(onPick);
    const hits = [...host.querySelectorAll<SVGRectElement>('[data-part="boundary"] > rect.figure-hit')];
    const box = (r: Element): (string | null)[] => ['x', 'y', 'width', 'height'].map((a) => r.getAttribute(a));
    // 線（幅 0）は真ん中を中心に幅 24 まで広げ、字（36×18）は高さを 24 まで広げる
    expect(hits.map(box)).toEqual([['448', '70', '24', '106'], ['442', '41', '36', '24']]);
    // 部分の絵の下（最初の子）に敷く
    expect(hits[0]?.parentElement?.firstElementChild).toBe(hits[0]);
    for (const hit of hits) {
      act(() => {
        hit.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    }
    expect(onPick.mock.calls).toEqual([['boundary'], ['boundary']]);
  });

  it('押せる面（24×24 以上の四角）を持つ部分には足さない。押さない図（解説）にも足さない', () => {
    show(vi.fn());
    expect(host.querySelector('[data-part="network"] > rect.figure-hit')).toBeNull();
    act(() => root?.unmount());
    root = null;
    show();
    expect(host.querySelector('rect.figure-hit')).toBeNull();
  });
});
