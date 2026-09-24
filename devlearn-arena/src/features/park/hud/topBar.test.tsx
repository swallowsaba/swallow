import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CITIES } from '@/content/city';
import { useStore } from '@/store';
import { click, mount } from '@/visual/mountForTest';
import ParkPage from '../ParkPage';
import { SIZE } from './theme';

/**
 * 上の帯。`docs/design/hud-mockup.html` の並びに合わせる。
 * 左に市の名前と日付、中央に指標を 4 つ、右に段の進みと速度の操作。
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
      facilitiesBuilt: [], introsRead: [], lessons: {},
      missionProgress: {}, missionState: {}, lastMissionId: null, growth: {}, designs: {},
      profile: { xp: 0, streakDays: 0, lastActiveDay: null, activeDays: [], onboarded: true },
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

const metric = (view: HTMLElement, key: string): string =>
  view.querySelector(`[data-metric="${key}"]`)?.textContent ?? '';

describe('上の帯', () => {
  it('高さは 56px', () => {
    expect(openWork().querySelector('[data-testid="arena-bar"]')?.getAttribute('style')).toContain(
      `height: ${String(SIZE.topBar)}px`,
    );
  });

  it('左に市の名前と日付が出る', () => {
    const view = openWork();
    expect(view.querySelector('[data-testid="world-title"]')?.textContent).toBe(CITIES.git.name);
    expect(view.querySelector('[data-testid="city-clock"]')?.textContent).toContain('1');
  });

  it('中央に指標が 4 つ並ぶ。住人・経験値・健全度・建築権', () => {
    const view = openWork();
    const keys = [...view.querySelectorAll('[data-metric]')].map((el) => el.getAttribute('data-metric'));
    expect(keys).toEqual(['residents', 'xp', 'health', 'rights']);
  });

  it('指標は状態から導く。経験値と建築権は持ち回らない', () => {
    act(() => {
      useStore.setState((s) => ({
        profile: { ...s.profile, xp: 1240 },
        growth: { git: { houses: 1, floors: 4 } },
        designs: { git: [{ site: 'site:center:0:0', kind: 'house' }] },
      }));
    });
    const view = openWork();
    expect(metric(view, 'xp')).toContain('1,240');
    // 得た 5 から、置いた 1 を引いて 4
    expect(metric(view, 'rights')).toContain('4');
  });

  it('右に段の進みが出る', () => {
    const view = openWork();
    const bar = view.querySelector('[data-testid="milestone-bar"]');
    expect(view.querySelector('[data-testid="milestone"]')?.textContent).toContain(CITIES.git.facilities[0]?.name ?? '');
    expect(bar?.getAttribute('style')).toContain('width: 0%');
  });

  it('速度は 3 段。押すと切り替わり、止めると街が進まなくなる', () => {
    const view = openWork();
    expect([...view.querySelectorAll('[data-speed]')].some((el) => el.getAttribute('data-speed') === 'normal')).toBe(true);
    expect(view.querySelector('[data-testid="city-stage"]')?.getAttribute('data-speed')).toBe('normal');
    click(view, '[data-testid="speed"] [data-speed="pause"]');
    expect(view.querySelector('[data-testid="city-stage"]')?.getAttribute('data-speed')).toBe('pause');
    click(view, '[data-testid="speed"] [data-speed="fast"]');
    expect(view.querySelector('[data-testid="city-stage"]')?.getAttribute('data-speed')).toBe('fast');
  });
});
