import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '@/store';
import { mount } from '@/visual/mountForTest';
import { splitTemplate } from '@/ui/panes';
import ParkPage from './ParkPage';

beforeAll(() => {
  // 端末（xterm）は画面の問い合わせを使う。jsdom には無いので、最低限を用意する
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

function openWork() {
  act(() => {
    useStore.setState({ facilitiesBuilt: ['git/01'], introsRead: ['git/01/objects'] });
  });
  return mount(
    <MemoryRouter initialEntries={['/world/git?mission=git%2F01%2Fobjects']}>
      <Routes>
        <Route path="/world/:trackId" element={<ParkPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('画面の作り', () => {
  it('左（問題・端末）と右（街）の仕切りに加えて、左の中にも横の仕切りがある', () => {
    const view = openWork();
    const splitters = [...view.querySelectorAll('[role="separator"]')];
    const orientations = splitters.map((s) => s.getAttribute('aria-orientation'));
    expect(orientations).toContain('vertical');
    expect(orientations).toContain('horizontal');
  });

  it('左の格子は割合で決まる。中身が増えても端末の高さは変わらない', () => {
    const view = openWork();
    const left = view.querySelector('[data-testid="learning-panel"]')?.parentElement;
    const rows = left?.getAttribute('style') ?? '';
    const { paneTask } = useStore.getState().settings;
    expect(rows).toContain(splitTemplate(paneTask));
    // どちらの行も minmax(0, Nfr)。中身の量では伸び縮みしない
    expect(rows).not.toContain('auto auto');
  });

  it('ヒントを出すボタンは画面に無い。ヒントは端末で hint と打つ', () => {
    const view = openWork();
    const labels = [...view.querySelectorAll('button')].map((b) => b.textContent ?? '');
    expect(labels.some((label) => label.trim() === 'ヒント')).toBe(false);
    expect(view.querySelector('[data-testid="hint-lead"]')?.textContent).toContain('hint');
    expect(view.querySelector('[data-testid="hint-lead"]')?.textContent).toContain('answer');
  });
});
