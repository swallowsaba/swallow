import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CITIES } from '@/content/city';
import { createSession } from '@/engines/kernel/session';
import { missionById } from '@/engines/lesson/registry';
import { buildCity } from '@/city/model';
import { CityStage } from '@/features/citymap/CityStage';
import { useStore } from '@/store';
import { focusView } from '@/visual/viewportMath';
import { click, mount } from '@/visual/mountForTest';
import HomeRedirect from './HomeRedirect';
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
    useStore.setState({ facilitiesBuilt: [], introsRead: [], lessons: {}, missionProgress: {}, missionState: {}, lastMissionId: null, growth: {} });
  });
});

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function openWorld(path: string) {
  return mount(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/world/:trackId" element={<ParkPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('カテゴリの作業画面', () => {
  it('開いた瞬間から、街・端末・課題の札がそろっている', () => {
    const view = openWorld('/world/git');
    expect(view.querySelector('[data-testid="city-stage"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="terminal"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="task-card"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="world-title"]')?.textContent).toContain(CITIES.git.name);
  });

  it('任務を指定して開くと、その任務の札が出る', () => {
    expect(missionById('git/04/three-way-merge')).toBeDefined();
    const view = openWorld('/world/git?mission=git%2F04%2Fthree-way-merge');
    expect(view.querySelector('[data-testid="task-card"]')?.textContent).toContain(
      missionById('git/04/three-way-merge')?.title ?? '',
    );
  });

  it('課題の札には、いまの手順の位置が出る', () => {
    const view = openWorld('/world/git?mission=git%2F01%2Fobjects');
    const total = missionById('git/01/objects')?.stepCount ?? 0;
    expect(view.querySelector('[data-testid="task-progress"]')?.textContent).toBe(`0 / ${String(total)}`);
  });

  it('やり直すは選べる。街ごとやり直すと、施設と任務の進みが消える', () => {
    act(() => {
      useStore.setState({
        facilitiesBuilt: ['git/01', 'k8s/01'],
        lessons: { 'git/01/objects': { cleared: true, attempts: 1, hintsUsed: 0, bestScore: 100, clearedAt: 1 } },
      });
    });
    const view = openWorld('/world/git?mission=git%2F01%2Fobjects');
    click(view, '[data-testid="retry-open"]');
    expect(view.querySelector('[data-testid="retry-mission"]')).not.toBeNull();
    click(view, '[data-testid="retry-city"]');
    click(view, '[data-testid="retry-city-confirm"]');
    const state = useStore.getState();
    expect(state.facilitiesBuilt).toEqual(['k8s/01']);
    expect(state.lessons['git/01/objects']).toBeUndefined();
  });
});

describe('入口', () => {
  const open = (path: string) =>
    mount(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );

  it('何も指定が無ければ全体図へ', () => {
    expect(open('/').querySelector('[data-testid="where"]')?.textContent).toBe('/map');
  });

  it('任務の指定があれば、そのカテゴリの作業画面へ', () => {
    expect(open('/?mission=git%2F01%2Fobjects').querySelector('[data-testid="where"]')?.textContent).toBe('/world/git?mission=git%2F01%2Fobjects');
  });
});

describe('画面いっぱいの街', () => {
  it('枠も見出しも付けず、画面を覆う', () => {
    const state = createSession({ files: { '/home/learner': null } }).state;
    const city = buildCity({ vfs: state.vfs, unlocked: ['center', 'kernel'] });
    const view = mount(<CityStage city={city} label={CITIES.git.name} />);
    const stage = view.querySelector('[data-testid="city-stage"]');
    expect(stage).not.toBeNull();
    expect(stage?.className).toContain('inset-0');
  });

  it('寄せる表示は、指定した点を枠の真ん中に置き、枠いっぱいに映す', () => {
    const view = focusView({ w: 400, h: 800 }, { w: 2000, h: 1000 }, { x: 1000, y: 500 });
    expect(view.k).toBeCloseTo(0.8);
    expect(view.x + 1000 * view.k).toBeCloseTo(200);
    expect(view.y).toBe(0);
  });
});
