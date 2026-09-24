import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { createSession } from '@/engines/kernel/session';
import { layoutCity } from '@/city3d/model';
import { useStore } from '@/store';
import { click, mount } from '@/visual/mountForTest';
import { variantById } from './hud/buildTools';
import ParkPage from './ParkPage';

/**
 * 街は学習者が設計する（REWORK 3-2）。
 * 建築権を得て、建設メニューから選び、地面に置く。
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
    });
  });
});

/** 置き場所を 1 つ選ぶ。始めたばかりの街でも必ずある */
function someSite(): string {
  const session = createSession({ files: { '/home/learner': null } });
  const layout = layoutCity(buildCity({ vfs: session.state.vfs, unlocked: ['center'] }));
  const site = layout.sites.find((s) => s.buildable);
  expect(site).toBeDefined();
  return site?.id ?? '';
}

describe('置いたものが街に建つ', () => {
  it('区画に置いた種類の建物が、その区画に建つ', () => {
    const session = createSession({ files: { '/home/learner': null } });
    const site = someSite();
    const before = buildCity({ vfs: session.state.vfs, unlocked: ['center'] });
    const after = buildCity({
      vfs: session.state.vfs,
      unlocked: ['center'],
      designed: [{ site, kind: 'house', level: 1 }],
    });
    expect(after.buildings.length).toBe(before.buildings.length + 1);
    expect(after.buildings.some((b) => b.id === `design:${site}`)).toBe(true);
    // 建てた区画は、空いている区画から消える
    expect(after.sites.some((s) => s.id === site)).toBe(false);
  });

  it('選んだ規模が、建物の大きさになる', () => {
    const site = someSite();
    const small = buildCity({ unlocked: ['center'], designed: [{ site, kind: 'office', level: 1 }] });
    const big = buildCity({ unlocked: ['center'], designed: [{ site, kind: 'office', level: 4 }] });
    expect(small.buildings.find((b) => b.id === `design:${site}`)?.level).toBe(1);
    expect(big.buildings.find((b) => b.id === `design:${site}`)?.level).toBe(4);
  });

  it('同じ設計からは必ず同じ街になる', () => {
    const site = someSite();
    const design = [{ site, kind: 'monument' as const, level: 2 }];
    expect(buildCity({ unlocked: ['center'], designed: design })).toEqual(
      buildCity({ unlocked: ['center'], designed: design }),
    );
  });

  it('知らない区画を指しても街は壊れない', () => {
    const plain = buildCity({ unlocked: ['center'] });
    expect(buildCity({ unlocked: ['center'], designed: [{ site: 'nope', kind: 'house', level: 1 }] })).toEqual(plain);
  });
});

describe('置いたぶんだけ建築権が減る', () => {
  it('同じ区画に二重には置けない。建築権を空費させない', () => {
    act(() => {
      useStore.getState().place('git', { site: 'site:center:0:0', kind: 'house', level: 1 });
      useStore.getState().place('git', { site: 'site:center:0:0', kind: 'office', level: 2 });
    });
    expect(useStore.getState().designs.git).toHaveLength(1);
  });

  it('カテゴリごとに別に持つ', () => {
    act(() => {
      useStore.getState().place('git', { site: 'site:center:0:0', kind: 'house', level: 1 });
    });
    expect(useStore.getState().designs.k8s).toBeUndefined();
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

const rights = (view: HTMLElement): string =>
  view.querySelector('[data-metric="rights"]')?.textContent ?? '';

describe('建設メニューから選ぶ', () => {
  it('建築権を得ると、上の帯の数が増える', () => {
    act(() => {
      useStore.setState({ growth: { git: { houses: 1, floors: 2 } } });
    });
    expect(rights(openWork())).toContain('3');
  });

  it('道具を選ぶと、置ける区画が光る', () => {
    const view = openWork();
    expect(view.querySelector('[data-testid="city-stage"]')?.getAttribute('data-sites')).toBe('off');
    click(view, '[data-tool="house"]');
    expect(view.querySelector('[data-testid="city-stage"]')?.getAttribute('data-sites')).toBe('on');
  });

  it('道具を選ぶと、いちばん小さい種類が最初から選ばれている', () => {
    const view = openWork();
    click(view, '[data-tool="house"]');
    expect(view.querySelector('[data-variant="hut"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('種類には建てるものの規模が入っている', () => {
    expect(variantById('hut')).toMatchObject({ kind: 'house', level: 1 });
    expect(variantById('tower')).toMatchObject({ kind: 'office', level: 4 });
  });
});
