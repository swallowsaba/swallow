import { allMissions } from '@/engines/lesson/registry';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { useStore } from '@/store';
import { mount } from '@/visual/mountForTest';
import ParkPage from '@/features/park/ParkPage';

// 学びの流れの体験から確かめまでを済ませた状態で開く。ここで見たいのは操作の段の画面
const PAST_FLOW = allMissions().map((m) => m.id);

/**
 * 端末はいつでも使える。閉じない・待たせない・条件を付けない。
 * 説明を読ませてから開く作りに戻らないよう、ここで押さえる。
 */

beforeAll(() => {
  // 端末（xterm）は画面の問い合わせを使う。jsdom には無いので最低限を用意する
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
      facilitiesBuilt: [], introsRead: PAST_FLOW, lessons: {},
      missionProgress: {}, missionState: {}, lastMissionId: null, growth: {},
    });
  });
});

/** まっさらな学習者として学習画面を開く。何も済ませていない状態 */
function openLearning(path = '/world/git') {
  return mount(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/world/:trackId" element={<ParkPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('端末はいつでも使える', () => {
  it('描いた直後から、入力欄が disabled でも aria-disabled でもない', () => {
    const view = openLearning();
    const host = view.querySelector('[data-testid="terminal"]');
    expect(host).not.toBeNull();
    const fields = [host as Element, ...(host?.querySelectorAll('textarea, input') ?? [])];
    for (const field of fields) {
      expect(field.hasAttribute('disabled')).toBe(false);
      expect(field.getAttribute('aria-disabled')).toBeNull();
    }
    // 端末を覆う「まだ使えません」の札も置かない
    expect(view.querySelector('[data-testid="terminal-lock"]')).toBeNull();
  });

  it('どのカテゴリでも、開いた直後から端末が出ている', () => {
    for (const track of ['kernel', 'git', 'k8s', 'net', 'github']) {
      const view = openLearning(`/world/${track}`);
      expect(view.querySelector('[data-testid="terminal"]'), track).not.toBeNull();
      expect(view.querySelector('[data-testid="terminal-lock"]'), track).toBeNull();
    }
  });
});

describe('紙芝居は無い', () => {
  it('ページ送りのボタンが学習画面に無い', () => {
    const view = openLearning();
    const labels = [...view.querySelectorAll('button')].map((b) => (b.textContent ?? '').trim());
    expect(labels).not.toContain('次へ');
    expect(view.querySelector('[data-testid="talk-next"]')).toBeNull();
    expect(view.querySelector('[data-testid="briefing"]')).toBeNull();
  });
});
