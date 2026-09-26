import { allMissions } from '@/engines/lesson/registry';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { INFO_VIEWS } from '@/city3d/overlay';
import { useStore } from '@/store';
import { click, mount } from '@/visual/mountForTest';
import ParkPage from '../ParkPage';

// 学びの流れの体験から確かめまでを済ませた状態で開く。ここで見たいのは操作の段の画面
const PAST_FLOW = allMissions().map((m) => m.id);

/**
 * 右下の情報表示。選ぶと街の上に色が重なり、もう一度押すと外れる。
 */

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
  act(() => {
    useStore.setState((s) => ({ settings: { ...s.settings, motion: 'reduced' } }));
  });
});

beforeEach(() => {
  act(() => {
    useStore.setState({
      facilitiesBuilt: [], introsRead: PAST_FLOW, lessons: {},
      missionProgress: {}, missionState: {}, lastMissionId: null, growth: {}, designs: {},
    });
  });
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

describe('情報表示の切り替え', () => {
  it('右下に 4 つ並ぶ', () => {
    const view = openWork();
    const ids = [...view.querySelectorAll('[data-testid="info-views"] [data-view]')].map((el) =>
      el.getAttribute('data-view'),
    );
    expect(ids).toEqual([...INFO_VIEWS]);
  });

  it('何も選んでいなければ、街に何も重ねない', () => {
    const view = openWork();
    expect(view.querySelector('[data-testid="city-stage"]')?.getAttribute('data-view')).toBeNull();
  });

  it('選ぶと街に重なる。もう一度押すと外れる', () => {
    const view = openWork();
    click(view, '[data-testid="info-views"] [data-view="bus"]');
    expect(view.querySelector('[data-testid="city-stage"]')?.getAttribute('data-view')).toBe('bus');
    expect(view.querySelector('[data-testid="info-views"] [data-view="bus"]')?.getAttribute('aria-pressed')).toBe('true');
    click(view, '[data-testid="info-views"] [data-view="bus"]');
    expect(view.querySelector('[data-testid="city-stage"]')?.getAttribute('data-view')).toBeNull();
  });

  it('別のものを選ぶと、そちらに切り替わる', () => {
    const view = openWork();
    click(view, '[data-testid="info-views"] [data-view="residents"]');
    click(view, '[data-testid="info-views"] [data-view="lineage"]');
    expect(view.querySelector('[data-testid="city-stage"]')?.getAttribute('data-view')).toBe('lineage');
    expect(view.querySelector('[data-testid="info-views"] [data-view="residents"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('情報表示を出している間も、端末は生きている', () => {
    const view = openWork();
    click(view, '[data-testid="info-views"] [data-view="traffic"]');
    const host = view.querySelector('[data-testid="terminal"]');
    expect(host).not.toBeNull();
    expect(host?.hasAttribute('disabled')).toBe(false);
  });
});
