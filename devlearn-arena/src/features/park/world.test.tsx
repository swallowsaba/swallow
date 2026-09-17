import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CITIES } from '@/content/city';
import { missionById } from '@/engines/lesson/registry';
import { useStore } from '@/store';
import { focusView } from '@/visual/viewportMath';
import { CityScene } from '@/visual/game/CityScene';
import { click, mount } from '@/visual/mountForTest';
import HomeRedirect from './HomeRedirect';
import ParkPage from './ParkPage';

// jsdom では退場のアニメーションが終わらないので、動きを止めて段の切り替えをすぐ反映させる
beforeAll(() => {
  act(() => {
    useStore.setState((s) => ({ settings: { ...s.settings, motion: 'reduced' } }));
  });
});

beforeEach(() => {
  act(() => {
    useStore.setState({ facilitiesBuilt: [], introsRead: [], lessons: {}, missionProgress: {}, missionState: {}, lastMissionId: null });
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

const stage = (view: HTMLElement) => view.querySelector('[data-testid="learning-panel"]')?.getAttribute('data-stage');

function passFacilityLesson(view: HTMLElement) {
  click(view, '[data-step="exam"]');
  for (let i = 0; i < 10; i += 1) {
    click(view, '[data-correct="true"]');
    click(view, '[data-testid="exam-next"]');
    if (view.querySelector('[data-testid="facility-built"]')) return;
  }
}

describe('カテゴリの作業画面', () => {
  it('はじめは市長就任のあいさつが出て、説明を聞くまでターミナルは使えない', () => {
    const view = openWorld('/world/git');
    expect(stage(view)).toBe('welcome');
    expect(view.querySelector('[data-testid="terminal-lock"]')).not.toBeNull();
    expect(view.querySelector('.xterm')).toBeNull();
    expect(view.querySelector('[data-testid="world-title"]')?.textContent).toContain(CITIES.git.name);
    // 右は街を映している
    expect(view.querySelector('[data-testid="iso-city"]')).not.toBeNull();
  });

  it('紹介 → 施設を学んで建てる → 依頼を聞く の順に進み、施設は保存される', () => {
    const view = openWorld('/world/git');
    click(view, '[data-testid="welcome-start"]');
    expect(stage(view)).toBe('facility');
    expect(view.querySelector('[data-testid="terminal-lock"]')?.textContent).toContain(CITIES.git.facilities[0]?.name ?? '');
    passFacilityLesson(view);
    expect(useStore.getState().facilitiesBuilt).toContain('git/01');
    // 建った！を見せてから依頼へ
    expect(stage(view)).toBe('facility');
    click(view, '[data-testid="facility-continue"]');
    expect(stage(view)).toBe('briefing');
    expect(view.querySelector('[data-testid="briefing"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="terminal-lock"]')).not.toBeNull();
    // 街に名所が建っている
    expect(view.querySelector('[data-district="git/01"]')?.getAttribute('data-state')).toBe('built');
  });

  it('はじめて聞く依頼は飛ばせない（背景を聞かずにコマンドへ行かない）', () => {
    act(() => {
      useStore.setState({ facilitiesBuilt: ['git/01'] });
    });
    const view = openWorld('/world/git?mission=git%2F01%2Fobjects');
    expect(stage(view)).toBe('briefing');
    expect([...view.querySelectorAll('button')].some((b) => b.textContent?.includes('説明をとばして'))).toBe(false);
  });

  it('施設を建てていない任務を開くと、まずその施設の学習が出る', () => {
    act(() => {
      useStore.setState({ facilitiesBuilt: ['git/01'] });
    });
    expect(missionById('git/04/three-way-merge')).toBeDefined();
    const view = openWorld('/world/git?mission=git%2F04%2Fthree-way-merge');
    expect(stage(view)).toBe('facility');
    expect(view.querySelector('[data-testid="facility-lesson"]')?.textContent).toContain(CITIES.git.facilities[3]?.name ?? '');
  });

  it('街の地区を押すと、その施設の任務に移る', () => {
    act(() => {
      useStore.setState({ facilitiesBuilt: ['git/01', 'git/02'] });
    });
    const view = openWorld('/world/git?mission=git%2F01%2Fobjects');
    click(view, '[data-district="git/02"]');
    expect(missionById(useStore.getState().lastMissionId ?? '')?.chapterId).toBe('git/02');
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

describe('街の絵', () => {
  it('施設ごとに地区があり、建てた地区にだけ車が走り、地区を押すと選べる', () => {
    const facilities = CITIES.k8s.facilities.map((facility, i) => ({
      facility,
      state: i === 0 ? ('complete' as const) : i === 1 ? ('available' as const) : ('locked' as const),
      missionsCleared: i === 0 ? 5 : 0,
      missionsTotal: 5,
      ratio: i === 0 ? 1 : 0,
    }));
    const onSelect = vi.fn();
    const view = mount(<CityScene track="k8s" facilities={facilities} selectedId="k8s/01" onSelect={onSelect} label="街" />);
    expect(view.querySelectorAll('[data-district]')).toHaveLength(facilities.length);
    expect(view.querySelectorAll('[data-testid="car"]').length).toBeGreaterThan(0);
    expect(view.querySelectorAll('[data-testid="crane"]')).toHaveLength(1);
    expect(view.querySelectorAll('[data-building="landmark"]')).toHaveLength(1);
    click(view, '[data-district="k8s/02"]');
    expect(onSelect).toHaveBeenCalledWith('k8s/02');
  });

  it('寄せる表示は、指定した点を枠の真ん中に置き、枠いっぱいに映す', () => {
    const view = focusView({ w: 400, h: 800 }, { w: 2000, h: 1000 }, { x: 1000, y: 500 });
    expect(view.k).toBeCloseTo(0.8);
    expect(view.x + 1000 * view.k).toBeCloseTo(200);
    expect(view.y).toBe(0);
  });
});
