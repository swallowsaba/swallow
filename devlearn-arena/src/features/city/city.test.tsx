import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CITIES } from '@/content/city';
import { useStore } from '@/store';
import { click, mount } from '@/visual/mountForTest';
import CityPage from './CityPage';
import { layoutCity } from './cityLayout';
import { FacilityLesson } from './FacilityLesson';

// jsdom では退場のアニメーションが終わらないので、動きを止めて段の切り替えをすぐ反映させる
beforeAll(() => {
  act(() => {
    useStore.setState((s) => ({ settings: { ...s.settings, motion: 'reduced' } }));
  });
});

const record = CITIES.git.facilities[0];
if (!record) throw new Error('施設がありません');

function answerAll(view: HTMLElement, wrongFirst = false): void {
  for (let i = 0; i < 10; i += 1) {
    if (wrongFirst && view.querySelector('[data-correct="false"]:not([disabled])')) {
      click(view, '[data-correct="false"]:not([disabled])');
    }
    click(view, '[data-correct="true"]');
    const next = view.querySelector('[data-testid="exam-next"]');
    if (!next) return;
    click(view, '[data-testid="exam-next"]');
    if (view.querySelector('[data-testid="facility-built"]')) return;
  }
}

describe('施設の学習', () => {
  it('困りごと → 何なのか → なぜ → 仕組み → 落とし穴 → 審査 の順に進み、コマンドは打たない', () => {
    const view = mount(
      <MemoryRouter>
        <FacilityLesson facility={record} track="git" guide={CITIES.git.guide} built={false} onBuild={vi.fn()} onClose={vi.fn()} firstMissionId={null} />
      </MemoryRouter>,
    );
    expect(view.textContent).toContain(record.trouble.text);
    click(view, '[data-testid="lesson-next"]');
    expect(view.textContent).toContain(record.analogy);
    click(view, '[data-testid="lesson-next"]');
    expect(view.querySelector('[aria-current="step"]')?.getAttribute('data-step')).toBe('why');
    click(view, '[data-testid="lesson-next"]');
    // 仕組みは 1 手順ずつ積み上がる
    expect(view.querySelectorAll('ol > li')).toHaveLength(1);
    for (let i = 1; i < record.how.length; i += 1) click(view, '[data-testid="lesson-next"]');
    expect(view.querySelectorAll('ol > li')).toHaveLength(record.how.length);
    click(view, '[data-testid="lesson-next"]');
    expect(view.querySelector('[aria-current="step"]')?.getAttribute('data-step')).toBe('field');
    click(view, '[data-testid="lesson-next"]');
    expect(view.querySelector('[data-testid="exam"]')).not.toBeNull();
    expect(view.querySelector('.xterm')).toBeNull();
  });

  it('間違えても建たず、理由を読んで全部正しく判断すると施設が建つ', () => {
    const onBuild = vi.fn();
    const view = mount(
      <MemoryRouter>
        <FacilityLesson facility={record} track="git" guide={CITIES.git.guide} built={false} onBuild={onBuild} onClose={vi.fn()} firstMissionId="git/01/objects" />
      </MemoryRouter>,
    );
    click(view, '[data-step="exam"]');
    click(view, '[data-correct="false"]');
    expect(onBuild).not.toHaveBeenCalled();
    expect(view.querySelector('[data-testid="exam-next"]')).toBeNull();
    answerAll(view, true);
    expect(onBuild).toHaveBeenCalledTimes(1);
    expect(view.querySelector('[data-testid="facility-built"]')).not.toBeNull();
    expect(view.querySelector('a[href="/?mission=git%2F01%2Fobjects"]')).not.toBeNull();
  });

  it('正解すると、なぜそれが正しいのかを見せる', () => {
    const view = mount(
      <MemoryRouter>
        <FacilityLesson facility={record} track="git" guide={CITIES.git.guide} built={false} onBuild={vi.fn()} onClose={vi.fn()} firstMissionId={null} />
      </MemoryRouter>,
    );
    click(view, '[data-step="exam"]');
    click(view, '[data-correct="true"]');
    expect(view.querySelector('[data-testid="explain"]')?.textContent?.length).toBeGreaterThan(10);
  });
});

describe('街の画面', () => {
  beforeEach(() => {
    act(() => {
      useStore.setState({ facilitiesBuilt: [], lessons: {} });
    });
  });

  const open = (path = '/city/git') =>
    mount(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/city/:trackId" element={<CityPage />} />
        </Routes>
      </MemoryRouter>,
    );

  it('はじめは案内が出て、最初の施設だけが建設可能、次の目標がそれを指す', () => {
    const view = open();
    expect(view.querySelector('[data-testid="city-welcome"]')).not.toBeNull();
    expect(view.querySelector('[data-facility="git/01"]')?.getAttribute('data-state')).toBe('available');
    expect(view.querySelector('[data-facility="git/02"]')?.getAttribute('data-state')).toBe('locked');
    expect(view.querySelector('[data-facility="git/01"]')?.getAttribute('data-next')).toBe('true');
  });

  it('学んで審査に合格すると、施設が建って保存され、次の施設が建設可能になる', () => {
    const view = open();
    click(view, '[data-testid="learn-facility"]');
    click(view, '[data-step="exam"]');
    answerAll(view);
    expect(useStore.getState().facilitiesBuilt).toContain('git/01');
    expect(view.querySelector('[data-facility="git/01"]')?.getAttribute('data-state')).toBe('built');
    expect(view.querySelector('[data-facility="git/02"]')?.getAttribute('data-state')).toBe('available');
    expect(view.querySelector('[data-testid="city-welcome"]')).toBeNull();
  });

  it('建てた施設からは、その施設の任務へ進める', () => {
    act(() => {
      useStore.setState({ facilitiesBuilt: ['git/01'] });
    });
    const view = open('/city/git');
    click(view, '[data-facility="git/01"]');
    expect(view.querySelector('[data-testid="run-facility"]')?.getAttribute('href')).toMatch(/^\/\?mission=git%2F01%2F/);
  });

  it('任務の依頼画面の「街で学ぶ」から来たら、その施設の学習がすぐ開く', () => {
    const view = open('/city/git?facility=git%2F01');
    expect(view.querySelector('[data-testid="facility-lesson"]')).not.toBeNull();
  });
});

describe('街の地図の置き場所', () => {
  it('施設は学ぶ順に通りに沿って並び、区画は重ならない', () => {
    const layout = layoutCity(CITIES.k8s);
    expect(layout.plots.map((p) => p.id)).toEqual(CITIES.k8s.facilities.map((f) => f.id));
    for (const a of layout.plots) {
      for (const b of layout.plots) {
        if (a === b) continue;
        const overlap = a.box.x < b.box.x + b.box.w && a.box.x + a.box.w > b.box.x && a.box.y < b.box.y + b.box.h && a.box.y + a.box.h > b.box.y;
        expect(overlap, `${a.id} と ${b.id}`).toBe(false);
      }
    }
    expect(layout.streets.length).toBeGreaterThan(0);
  });
});
