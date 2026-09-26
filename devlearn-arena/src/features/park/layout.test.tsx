import { allMissions } from '@/engines/lesson/registry';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '@/store';
import { mount } from '@/visual/mountForTest';
import { SIZE } from './hud/theme';
import ParkPage from './ParkPage';

// 学びの流れの体験から確かめまでを済ませた状態で開く。ここで見たいのは操作の段の画面
const PAST_FLOW = allMissions().map((m) => m.id);

/**
 * 画面の作り。`docs/design/hud-mockup.html` の構成と寸法をそのまま確かめる。
 * 画面いっぱいが街で、その上に HUD が重なる。左の学習パネルは無い。
 */

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
    useStore.setState({ facilitiesBuilt: [], introsRead: PAST_FLOW, lessons: {}, missionProgress: {}, missionState: {}, lastMissionId: null, growth: {} });
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

const style = (view: HTMLElement, testId: string): string =>
  view.querySelector(`[data-testid="${testId}"]`)?.getAttribute('style') ?? '';

describe('画面の作り', () => {
  it('画面いっぱいが街で、その上に HUD を重ねる', () => {
    const view = openWork();
    const stage = view.querySelector('[data-testid="city-stage"]');
    expect(stage).not.toBeNull();
    expect(stage?.className).toContain('absolute');
    expect(stage?.className).toContain('inset-0');
  });

  it('端末は左に常駐する。はじめの幅 440px、上の帯の下から画面の下端まで', () => {
    const view = openWork();
    const dock = style(view, 'terminal-dock');
    // 幅は学習画面の根に置いた --dock で決まる（仕切りで変えられる。REWORK 3-3）
    expect(dock).toContain('width: var(--dock');
    expect(style(view, 'arena')).toContain(`--dock: ${String(SIZE.dock)}px`);
    expect(dock).toContain(`top: ${String(SIZE.topBar)}px`);
    expect(view.querySelector('[data-testid="terminal-dock"]')?.className).toContain('bottom-0');
  });

  it('上の帯は高さ 56px', () => {
    const view = openWork();
    expect(style(view, 'arena-bar')).toContain(`height: ${String(SIZE.topBar)}px`);
  });

  it('課題の札は端末の右、上の帯の下に幅 330px で重なる', () => {
    const view = openWork();
    const card = style(view, 'task-card');
    expect(card).toContain(`width: ${String(SIZE.task)}px`);
    expect(card).toContain('left: calc(var(--dock');
    expect(card).toContain('+ 16px)');
    expect(card).toContain(`top: ${String(SIZE.panelTop)}px`);
  });

  it('操作の段の札には説明の文章を置かず、いまの手順で何を確かめるかを先に 1 行で出す', () => {
    const view = openWork();
    expect(view.querySelector('[data-testid="task-lead"]')).toBeNull();
    const purpose = view.querySelector('[data-testid="task-purpose"]')?.textContent ?? '';
    expect(purpose).toContain('確かめること');
    expect(purpose.length).toBeGreaterThan('確かめること'.length);
  });

  it('左の学習パネルと紙芝居は無い', () => {
    const view = openWork();
    expect(view.querySelector('[data-testid="learning-panel"]')).toBeNull();
    expect(view.querySelector('[data-testid="briefing"]')).toBeNull();
    expect(view.querySelector('[data-testid="talk-next"]')).toBeNull();
  });

  it('解説は「なぜ」から開く。閉じている間も端末は生きている', () => {
    const view = openWork();
    expect(view.querySelector('[data-testid="explain-drawer"]')).toBeNull();
    const why = view.querySelector('[data-testid="task-why"]');
    expect(why).not.toBeNull();
    act(() => {
      why?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(view.querySelector('[data-testid="explain-drawer"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="terminal"]')).not.toBeNull();
  });
});
