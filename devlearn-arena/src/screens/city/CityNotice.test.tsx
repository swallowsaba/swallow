import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { SMALL_WINDOW_WIDTH, smallWindowRight } from '@/ui/smallWindowPlace';
import { CityNotice } from './CityOverlays';

/**
 * 知らせ（上の帯の下、右寄せ。docs/ui-design.md 3 章）は、情報パネルと小さな窓（10.0）の後ろに隠れない。
 * 市政の知らせ（「公聴会の段に入った」など）を見落とさないため、開いている窓の左に出す
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

function mount(node: React.ReactNode): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(node));
  return host;
}

const rightOf = (host: HTMLElement): number => Number.parseFloat((host.querySelector('.city-notices') as HTMLElement).style.right);

describe('知らせの置き場所', () => {
  it('窓が無ければ右端（情報パネルがあればその左）', () => {
    expect(rightOf(mount(<CityNotice text="x" paused={false} shifted={false} windows={0} />))).toBe(14);
    expect(rightOf(mount(<CityNotice text="x" paused={false} shifted windows={0} />))).toBe(388);
  });

  it('小さな窓が開いていれば、一番左の窓のさらに左に出る（窓の後ろに隠れない）', () => {
    for (const shifted of [false, true]) {
      for (const n of [1, 2, 3]) {
        const right = rightOf(mount(<CityNotice text="x" paused={false} shifted={shifted} windows={n} />));
        expect(right, `${String(n)} 枚`).toBeGreaterThanOrEqual(smallWindowRight(n - 1, shifted) + SMALL_WINDOW_WIDTH);
      }
    }
  });
});
