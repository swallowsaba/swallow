import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { allMissions } from '@/engines/lesson/registry';
import { useStore } from '@/store';
import { mount } from '@/visual/mountForTest';
import { clampDock, DOCK_MIN, loadLayout, saveLayout } from './hud/layoutPrefs';
import { SIZE } from './hud/theme';
import ParkPage from './ParkPage';

/**
 * 端末と街の間の仕切り（REWORK 3-3）。
 * ドラッグで端末の幅を変えられる。幅は保存する。最小 320px、最大は画面の 60%。
 */

const PAST_FLOW = allMissions().map((m) => m.id);

beforeAll(() => {
  if (typeof window.matchMedia !== 'function') {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }));
  }
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  // jsdom にはポインタの捕捉が無い。ドラッグの間だけ使うので、何もしないものを置く
  if (typeof Element.prototype.setPointerCapture !== 'function') {
    Element.prototype.setPointerCapture = () => undefined;
    Element.prototype.releasePointerCapture = () => undefined;
  }
});

beforeEach(() => {
  window.localStorage.clear();
  window.innerWidth = 1600;
  act(() => {
    useStore.setState({ introsRead: PAST_FLOW, missionProgress: {}, missionState: {}, lessons: {}, growth: {} });
  });
});

afterEach(() => {
  window.localStorage.clear();
});

function openWork() {
  return mount(
    <MemoryRouter initialEntries={['/world/git?mission=git%2F01%2Fobjects']}>
      <Routes>
        <Route path="/world/:trackId" element={<ParkPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

  view.querySelector<HTMLElement>('[data-testid="arena"]')?.style.getPropertyValue('--dock') ?? '';
  (view.querySelector('[data-testid="arena"]'))?.style.getPropertyValue('--dock') ?? '';

function drag(view: Element, toX: number): void {
  const divider = view.querySelector('[data-testid="dock-divider"]');
  if (divider === null) throw new Error('仕切りが無い');
  act(() => {
    divider.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: SIZE.dock }));
  });
  act(() => {
    divider.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: toX }));
  });
  act(() => {
    divider.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, clientX: toX }));
  });
}

describe('端末の幅の決まり', () => {
  it('最小 320px', () => {
    expect(clampDock(100, 1600)).toBe(DOCK_MIN);
  });

  it('最大は画面の 60%', () => {
    expect(clampDock(1500, 1600)).toBe(960);
  });

  it('その間なら、そのまま', () => {
    expect(clampDock(600, 1600)).toBe(600);
  });

  it('画面が狭くても、最小は守る', () => {
    expect(clampDock(500, 400)).toBe(DOCK_MIN);
  });
});

describe('仕切り', () => {
  it('端末と街の間に、縦の仕切りがある', () => {
    const view = openWork();
    const divider = view.querySelector('[data-testid="dock-divider"]');
    expect(divider?.getAttribute('role')).toBe('separator');
    expect(divider?.getAttribute('aria-orientation')).toBe('vertical');
  });

  it('ドラッグすると端末の幅が変わり、放すと保存される', () => {
    const view = openWork();
    expect(dockOf(view)).toBe(`${String(SIZE.dock)}px`);
    drag(view, 620);
    expect(dockOf(view)).toBe('620px');
    expect(loadLayout().dock).toBe(620);
  });

  it('下限より細く、上限より太くはならない', () => {
    const view = openWork();
    drag(view, 50);
    expect(dockOf(view)).toBe(`${String(DOCK_MIN)}px`);
    drag(view, 1500);
    expect(dockOf(view)).toBe('960px');
  });

  it('矢印キーでも動かせる', () => {
    const view = openWork();
    const divider = view.querySelector('[data-testid="dock-divider"]');
    act(() => {
      divider?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(dockOf(view)).toBe(`${String(SIZE.dock + 24)}px`);
  });

  it('開き直すと、保存した幅で出る', () => {
    saveLayout({ dock: 520 });
    const view = openWork();
    expect(dockOf(view)).toBe('520px');
  });

  it('端末の右に並ぶ札も、端末の幅に合わせて動く', () => {
    const view = openWork();
    const card = view.querySelector<HTMLElement>('[data-testid="task-card"]');
    expect(card?.style.left).toBe('calc(var(--dock, 440px) + 16px)');
  });
});
