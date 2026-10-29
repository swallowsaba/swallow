import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BuildMenu } from './BuildMenu';
import type { MenuGroup, Tool } from './cityStore';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

function show(menu: MenuGroup | null, landmarks: string[], setTool = vi.fn<(t: Tool) => void>()): HTMLElement {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(<BuildMenu state={{ stage: 1, menu, tool: { kind: 'none' }, openMenu: vi.fn(), setTool }} landmarks={landmarks} />));
  return host;
}

describe('建設メニューの記念碑（ミッションの報酬。docs/city-design.md 4 章）', () => {
  it('受け取った記念碑の数が公園の入口に出る。無ければ出ない', () => {
    expect(show(null, ['beacon', 'bell']).querySelector('[data-testid="build-badge-park"]')?.textContent).toBe('2');
    act(() => root?.unmount());
    expect(show(null, []).querySelector('[data-testid="build-badge-park"]')).toBeNull();
  });

  it('公園の引き出しに、受け取った記念碑が名前と絵で並び、押すとその記念碑を置く道具になる', () => {
    const setTool = vi.fn<(t: Tool) => void>();
    const host = show('park', ['beacon'], setTool);
    const item = host.querySelector<HTMLButtonElement>('[data-testid="build-monument-beacon"]');
    expect(item?.textContent).toContain('灯台の記念碑');
    expect(item?.querySelector('img')?.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    act(() => item?.click());
    expect(setTool).toHaveBeenCalledWith({ kind: 'facility', type: 'monument', landmark: 'beacon' });
  });

  it('施設の引き出しには記念碑を出さない', () => {
    expect(show('facility', ['beacon']).querySelector('[data-testid="build-monument-beacon"]')).toBeNull();
  });
});

describe('区画の引き出しの需要の棒（docs/ui-design.md 11.4）', () => {
  const host = (): HTMLElement => {
    const el = document.createElement('div');
    document.body.append(el);
    root = createRoot(el);
    const demand = { residential: [24, -46, -112], commercial: [30, -23], office: [20, 15, -15], industrial: [130, 4, -10] };
    act(() => root?.render(<BuildMenu state={{ stage: 1, menu: 'zone', tool: { kind: 'none' }, openMenu: vi.fn(), setTool: vi.fn() }} demand={demand} />));
    return el;
  };

  it('棒の数は −100〜+100 に収め、押すと項ごとの内訳（項の合計）を出す', () => {
    const el = host();
    const value = (k: string): string | null | undefined => el.querySelector(`[data-testid="demand-value-${k}"]`)?.textContent;
    expect(value('residential')).toBe('−100');
    expect(value('commercial')).toBe('+7');
    expect(value('office')).toBe('+20');
    expect(value('industrial')).toBe('+100');
    act(() => el.querySelector<HTMLButtonElement>('[data-testid="demand-residential"]')?.click());
    expect(el.querySelector('[data-testid="demand-pop"]')?.textContent).toContain('住宅−134');
  });
});
