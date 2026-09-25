import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '@/store';
import { click, mount } from '@/visual/mountForTest';
import ParkPage from './ParkPage';

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
      facilitiesBuilt: [], introsRead: [], lessons: {}, missionProgress: {},
      missionState: {}, lastMissionId: null, growth: {},
    });
  });
});

function openWorld(path = '/world/k8s') {
  return mount(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/world/:trackId" element={<ParkPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

const stage = (view: HTMLElement) => view.querySelector('[data-testid="city-stage"]');
const card = (view: HTMLElement) => view.querySelector('[data-testid="tour-card"]');
const title = (view: HTMLElement) => view.querySelector('[data-testid="tour-stop-title"]')?.textContent;

describe('案内ツアー', () => {
  it('街を開いたとき、ツアーを勧める。ただし端末も課題の札も生きている', () => {
    const view = openWorld();
    expect(view.querySelector('[data-testid="tour-invite"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="terminal"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="task-card"]')).not.toBeNull();
  });

  it('始めると、札が出て、街がその施設に寄る', () => {
    const view = openWorld();
    expect(card(view)).toBeNull();
    expect(stage(view)?.getAttribute('data-tour')).toBeNull();
    click(view, '[data-testid="tour-start"]');
    expect(title(view)).toBe('窓口（API サーバ）');
    expect(stage(view)?.getAttribute('data-tour')).not.toBeNull();
  });

  it('次へを押すと、次の施設へ進み、寄る先も変わる', () => {
    const view = openWorld();
    click(view, '[data-testid="tour-start"]');
    const first = stage(view)?.getAttribute('data-tour');
    click(view, '[data-testid="tour-next"]');
    expect(title(view)).toBe('台帳（etcd）');
    expect(stage(view)?.getAttribute('data-tour')).not.toBe(first);
  });

  it('前へで戻れる。最初の停留所では押せない', () => {
    const view = openWorld();
    click(view, '[data-testid="tour-start"]');
    expect(view.querySelector<HTMLButtonElement>('[data-testid="tour-prev"]')?.disabled).toBe(true);
    click(view, '[data-testid="tour-next"]');
    click(view, '[data-testid="tour-prev"]');
    expect(title(view)).toBe('窓口（API サーバ）');
  });

  it('いつでも抜けられる。抜けても端末は使える', () => {
    const view = openWorld();
    click(view, '[data-testid="tour-start"]');
    click(view, '[data-testid="tour-leave"]');
    expect(card(view)).toBeNull();
    expect(stage(view)?.getAttribute('data-tour')).toBeNull();
    expect(view.querySelector('[data-testid="terminal"]')).not.toBeNull();
  });

  it('勧めを断っても、あとから自分で始められる', () => {
    const view = openWorld();
    click(view, '[data-testid="tour-decline"]');
    expect(view.querySelector('[data-testid="tour-invite"]')).toBeNull();
    click(view, '[data-testid="tour-start"]');
    expect(card(view)).not.toBeNull();
  });
});
