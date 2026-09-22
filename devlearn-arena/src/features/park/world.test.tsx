import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CITIES, cityOf } from '@/content/city';
import { createSession } from '@/engines/kernel/session';
import { allMissions } from '@/engines/lesson/registry';
import { CityPane } from '@/features/citymap/CityPane';
import { missionById } from '@/engines/lesson/registry';
import { useStore } from '@/store';
import { focusView } from '@/visual/viewportMath';
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
    expect(view.querySelector('[data-testid="city-pane"]')).not.toBeNull();
  });

  it('就任のあとは市政ボード。最初の施設の苦情だけが届き、次の声はまだ届かない', () => {
    const view = openWorld('/world/git');
    click(view, '[data-testid="welcome-start"]');
    expect(stage(view)).toBe('city');
    expect([...view.querySelectorAll('[data-voice="complaint"]')].map((v) => v.getAttribute('data-facility'))).toEqual(['git/01']);
    expect(view.querySelector('[data-testid="briefing"]')).toBeNull();
  });

  it('苦情に対応 → 施設を学んで建てる → 依頼を聞く の順に進み、街づくりに戻ると対応待ちになる', () => {
    const view = openWorld('/world/git');
    click(view, '[data-testid="welcome-start"]');
    click(view, '[data-handle="git/01"]');
    expect(stage(view)).toBe('facility');
    passFacilityLesson(view);
    expect(useStore.getState().facilitiesBuilt).toContain('git/01');
    expect(view.querySelector('[data-city-event]')).not.toBeNull();
    click(view, '[data-testid="facility-continue"]');
    expect(stage(view)).toBe('briefing');
    click(view, '[data-testid="back-to-city"]');
    expect(stage(view)).toBe('city');
    expect(view.querySelector('[data-voice="waiting"]')?.getAttribute('data-facility')).toBe('git/01');
    // 任務を切り替えても、就任のあいさつは出し直さない
    click(view, '[data-handle="git/01"]');
    expect(stage(view)).not.toBe('welcome');
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

  it('やり直すは選べる。街ごとやり直すと、施設と任務の進みが消えて就任からになる', () => {
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
    expect(state.introsRead).toEqual([]);
    expect(stage(view)).toBe('welcome');
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

describe('カテゴリごとの街', () => {
  const gitCity = (built: string[]) => cityOf(CITIES.git, new Set(built), allMissions().filter((m) => m.track === 'git'), new Set());

  it('街の枠には、いまいる場所と施設の数が出る', () => {
    const state = createSession({ files: { '/home/learner': null } }).state;
    const view = mount(<CityPane track="git" city={gitCity([])} state={state} />);
    expect(view.querySelector('[data-testid="city-pane"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="city-cwd"]')?.textContent).toBe(state.cwd);
  });

  it('出来事は地図の上の欄にも出る', () => {
    const state = createSession({ files: { '/home/learner': null } }).state;
    const view = mount(
      <CityPane track="git" city={gitCity([])} state={state} events={[{ id: 1, facilityId: null, text: 'コマンドで現場が変わった', color: '#000' }]} />,
    );
    expect(view.querySelector('[data-city-event]')?.textContent).toContain('現場が変わった');
  });

  it('寄せる表示は、指定した点を枠の真ん中に置き、枠いっぱいに映す', () => {
    const view = focusView({ w: 400, h: 800 }, { w: 2000, h: 1000 }, { x: 1000, y: 500 });
    expect(view.k).toBeCloseTo(0.8);
    expect(view.x + 1000 * view.k).toBeCloseTo(200);
    expect(view.y).toBe(0);
  });
});
