import { act } from 'react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CITIES, cityOf } from '@/content/city';
import { createCity, REWARD, START_MONEY } from '@/engines/city/sim';
import { allMissions } from '@/engines/lesson/registry';
import { CityPane } from '@/features/citymap/CityPane';
import { complaintDay } from '@/engines/city/civic';
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
    useStore.setState({ facilitiesBuilt: [], introsRead: [], lessons: {}, missionProgress: {}, missionState: {}, lastMissionId: null, cities: {} });
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
    // 右は市長が作る街
    expect(view.querySelector('[data-testid="city-pane"]')).not.toBeNull();
  });

  it('就任のあとは、まず街づくり。苦情が届くまで要望の話は始まらない', () => {
    const view = openWorld('/world/git');
    click(view, '[data-testid="welcome-start"]');
    expect(stage(view)).toBe('city');
    expect(view.querySelector('[data-testid="city-board"]')).not.toBeNull();
    expect(view.querySelector('[data-voice="complaint"]')).toBeNull();
    expect(view.querySelector('[data-testid="next-voice"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="briefing"]')).toBeNull();
    expect(view.querySelector('[data-testid="terminal-lock"]')).not.toBeNull();
  });

  it('苦情に対応 → 施設を学んで建てる（地図に工事現場ができる）→ 依頼を聞く の順に進む', () => {
    act(() => {
      useStore.setState({ cities: { git: { ...createCity(), day: complaintDay(0) } } });
    });
    const view = openWorld('/world/git');
    expect(stage(view)).toBe('city');
    expect(view.querySelector('[data-voice="complaint"]')?.getAttribute('data-facility')).toBe('git/01');
    click(view, '[data-handle="git/01"]');
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
    // 建設を決めると予算が入り、地図に仮置きされ、出来事が出る
    const saved = useStore.getState().cities['git'];
    expect(saved?.money ?? 0).toBeGreaterThanOrEqual(START_MONEY + REWARD.learn + REWARD.quizRetry - 400);
    expect(saved?.facilities.map((f) => f.id)).toContain('git/01');
    expect(view.querySelector('[data-city-event]')).not.toBeNull();
    // 街づくりに戻れる
    click(view, '[data-testid="back-to-city"]');
    expect(stage(view)).toBe('city');
    expect(view.querySelector('[data-voice="waiting"]')).not.toBeNull();
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

  it('街の施設の一覧から「要望に対応」を押すと、その施設の任務に移る', () => {
    act(() => {
      useStore.setState({ facilitiesBuilt: ['git/01', 'git/02'], cities: { git: { ...createCity(), facilities: [{ id: 'git/02', x: 2, y: 16 }] } } });
    });
    const view = openWorld('/world/git?mission=git%2F01%2Fobjects');
    click(view, 'button[data-tool="facility"]');
    click(view, '[data-city-facility="git/02"] button:last-child');
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

describe('市長が作る街', () => {
  const gitCity = (built: string[]) =>
    cityOf(CITIES.git, new Set(built), allMissions().filter((m) => m.track === 'git'), new Set());

  it('予算・人口・日付・需要と道具が並び、地図を描けない環境では案内を出す', () => {
    act(() => {
      useStore.setState({ cities: { git: { ...createCity(), day: complaintDay(0) } } });
    });
    const view = mount(<CityPane track="git" city={gitCity([])} placeRequest={null} onStudy={() => undefined} initialSpeed={0} />);
    expect(view.querySelector('[data-testid="city-money"]')?.getAttribute('data-value')).toBe(String(START_MONEY));
    expect(view.querySelector('[data-testid="city-population"]')?.getAttribute('data-value')).toBe('0');
    expect(view.querySelector('[data-testid="city-demand"]')).not.toBeNull();
    expect(view.querySelectorAll('[role="toolbar"] button')).toHaveLength(8);
    expect(view.querySelector('[data-testid="city-canvas"]')?.getAttribute('data-canvas')).toBe('off');
    // はじめは道路を求め、苦情が届いた施設の困りごとを伝える
    expect(view.querySelector('[data-advice="noRoad"]')).not.toBeNull();
    expect(view.querySelector('[data-advice="trouble"]')?.textContent).toContain(CITIES.git.facilities[0]?.trouble.text.slice(0, 10) ?? '');
  });

  it('道具を選ぶと、その使い方が出る', () => {
    const view = mount(<CityPane track="git" city={gitCity([])} placeRequest={null} onStudy={() => undefined} initialSpeed={0} />);
    click(view, 'button[data-tool="road"]');
    expect(view.querySelector('[data-testid="city-pane"]')?.getAttribute('data-tool')).toBe('road');
    expect(view.querySelector('[data-testid="city-tool-hint"]')?.textContent).toContain('¥10');
  });

  it('施設の一覧は、未学習なら学ぶへ、建設を決めたら配置へ案内する', () => {
    const onStudy = vi.fn();
    const view = mount(<CityPane track="git" city={gitCity(['git/01'])} placeRequest={null} onStudy={onStudy} initialSpeed={0} />);
    click(view, 'button[data-tool="facility"]');
    expect(view.querySelector('[data-city-facility="git/01"] [data-place]')).not.toBeNull();
    const next = CITIES.git.facilities.find((f) => f.id !== 'git/01' && f.needs.every((n) => n === 'git/01'))?.id ?? '';
    click(view, `[data-city-facility="${next}"] button`);
    expect(onStudy).toHaveBeenCalledWith(next);
  });

  it('建設を決めたばかりの施設（仮置き済み）を詳しく見せ、移設もできる', () => {
    act(() => {
      useStore.setState({ cities: { git: { ...createCity(), facilities: [{ id: 'git/01', x: 2, y: 16 }] } } });
    });
    const view = mount(<CityPane track="git" city={gitCity(['git/01'])} placeRequest="git/01" onStudy={() => undefined} initialSpeed={0} />);
    expect(view.querySelector('[data-testid="city-inspector"]')?.textContent).toContain(CITIES.git.facilities[0]?.name ?? '');
    click(view, 'button[data-tool="facility"]');
    click(view, '[data-move="git/01"]');
    expect(view.querySelector('[data-testid="city-tool-hint"]')?.textContent).toContain(CITIES.git.facilities[0]?.name ?? '');
  });

  it('出来事は住民の声の欄にも出る', () => {
    const view = mount(
      <CityPane track="git" city={gitCity([])} placeRequest={null} onStudy={() => undefined} initialSpeed={0} events={[{ id: 1, facilityId: null, text: '⌨ 対応が進んだ', color: '#000' }]} />,
    );
    expect(view.querySelector('[data-city-event]')?.textContent).toContain('対応が進んだ');
  });

  it('時間を進めると日付が進む', () => {
    vi.useFakeTimers();
    try {
      const view = mount(<CityPane track="git" city={gitCity([])} placeRequest={null} onStudy={() => undefined} initialSpeed={0} />);
      click(view, '[data-speed="3"]');
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      expect(Number(useStore.getState().cities['git']?.day)).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('寄せる表示は、指定した点を枠の真ん中に置き、枠いっぱいに映す', () => {
    const view = focusView({ w: 400, h: 800 }, { w: 2000, h: 1000 }, { x: 1000, y: 500 });
    expect(view.k).toBeCloseTo(0.8);
    expect(view.x + 1000 * view.k).toBeCloseTo(200);
    expect(view.y).toBe(0);
  });
});
