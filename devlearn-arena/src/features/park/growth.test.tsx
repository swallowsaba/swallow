import { allMissions } from '@/engines/lesson/registry';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { growthOf } from '@/features/citymap/cityStore';
import { useStore } from '@/store';
import { click, mount } from '@/visual/mountForTest';
import { gainFor, grows, growsFromCommand, GROWTH_TRIGGERS } from './growth';
import ParkPage from './ParkPage';

// 学びの流れの体験から確かめまでを済ませた状態で開く。ここで見たいのは操作の段の画面
const PAST_FLOW = allMissions().map((m) => m.id);

/**
 * 学習の成功では、必ず街が育つ（REWORK 3-1）。
 * コマンドの成功・手順の通過・理解度の正解・任務のクリア、どれも育つ。
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
      facilitiesBuilt: [], introsRead: PAST_FLOW, lessons: {},
      missionProgress: {}, missionState: {}, lastMissionId: null, growth: {}, designs: {},
    });
  });
});

describe('育つきっかけ', () => {
  it('きっかけは 4 つ。コマンド・手順・理解度・クリア', () => {
    expect(GROWTH_TRIGGERS).toEqual(['command', 'step', 'quiz', 'clear']);
  });

  it('どのきっかけでも必ず街が育つ。0 しか増えないきっかけを作らない', () => {
    for (const trigger of GROWTH_TRIGGERS) {
      expect(grows(gainFor(trigger)), trigger).toBe(true);
    }
  });

  it('コマンドと手順では階が、理解度では家が増える', () => {
    expect(gainFor('command').floors).toBeGreaterThan(0);
    expect(gainFor('step').floors).toBeGreaterThan(0);
    expect(gainFor('quiz').houses).toBeGreaterThan(0);
  });

  it('クリアでは家も階もまとめて増える', () => {
    expect(gainFor('clear')).toEqual({ houses: 1, floors: 2 });
  });
});

describe('コマンドで育つかどうか', () => {
  it('通ったコマンドでは育つ', () => {
    expect(growsFromCommand('mkdir work', 0)).toBe(true);
    expect(growsFromCommand('git init', 0)).toBe(true);
  });

  it('失敗したコマンドでは育たない', () => {
    expect(growsFromCommand('mkdir work', 1)).toBe(false);
  });

  it('助けを求めた行では育たない', () => {
    expect(growsFromCommand('hint', 0)).toBe(false);
    expect(growsFromCommand('answer', 0)).toBe(false);
  });

  it('空の行では育たない', () => {
    expect(growsFromCommand('', 0)).toBe(false);
    expect(growsFromCommand('   ', 0)).toBe(false);
  });
});

describe('育ちは街の姿に出る', () => {
  it('家が増えると建物が増える', () => {
    const none = buildCity({ unlocked: ['center'], growth: { houses: 0, floors: 0 } });
    const grown = buildCity({ unlocked: ['center'], growth: { houses: 3, floors: 0 } });
    expect(grown.buildings.length).toBe(none.buildings.length + 3);
  });

  it('階が増えると建物が高くなる', () => {
    const tall = buildCity({ unlocked: ['center'], growth: { houses: 3, floors: 5 } });
    const bonus = tall.buildings.reduce((sum, b) => sum + (b.bonusFloors ?? 0), 0);
    expect(bonus).toBe(5);
  });

  it('家が先に建つので、正解で建った家にも階が積める', () => {
    // コマンドだけを通した街（学習の状態から導いた建物がまだ無い）でも、
    // クリアで家が建てば、そこに階が積まれる
    const city = buildCity({ unlocked: ['center'], growth: gainFor('clear') });
    expect(city.buildings.length).toBe(gainFor('clear').houses);
    const bonus = city.buildings.reduce((sum, b) => sum + (b.bonusFloors ?? 0), 0);
    expect(bonus).toBe(gainFor('clear').floors);
  });

  it('積み上がった階は消えない。建物が現れれば必ず反映される', () => {
    const empty = buildCity({ unlocked: ['center'], growth: { houses: 0, floors: 4 } });
    expect(empty.buildings).toEqual([]);
    // あとから家が建つと、貯まっていた 4 階ぶんがそこに載る
    const later = buildCity({ unlocked: ['center'], growth: { houses: 1, floors: 4 } });
    expect(later.buildings.reduce((sum, b) => sum + (b.bonusFloors ?? 0), 0)).toBe(4);
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

describe('学習画面でも育つ', () => {
  it('理解度の問題に正解すると、その街の家が増える', () => {
    const view = openWork();
    expect(growthOf(useStore.getState().growth, 'git')).toEqual({ houses: 0, floors: 0 });
    click(view, '[data-testid="task-why"]');
    const drawer = view.querySelector('[data-testid="explain-drawer"]');
    expect(drawer).not.toBeNull();
    // 選択肢を順に押す。正解が 1 つあるので、そこで家が増える
    const choices = [...(drawer?.querySelectorAll('[data-choice]') ?? [])];
    expect(choices.length).toBeGreaterThan(1);
    for (const choice of choices) {
      act(() => {
        choice.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      if (growthOf(useStore.getState().growth, 'git').houses > 0) break;
    }
    expect(growthOf(useStore.getState().growth, 'git').houses).toBe(1);
  });

  it('育つと右上の「成長の記録」に、何をしたら・何が増えたかが 1 件残る', () => {
    const view = openWork();
    const record = view.querySelector('[data-testid="growth-record"]');
    expect(record).not.toBeNull();
    expect(record?.querySelectorAll('[data-testid="growth-entry"]')).toHaveLength(0);
    click(view, '[data-testid="task-why"]');
    const drawer = view.querySelector('[data-testid="explain-drawer"]');
    for (const choice of [...(drawer?.querySelectorAll('[data-choice]') ?? [])]) {
      act(() => {
        choice.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
      if (growthOf(useStore.getState().growth, 'git').houses > 0) break;
    }
    const entries = [...view.querySelectorAll('[data-testid="growth-entry"]')];
    expect(entries).toHaveLength(1);
    expect(entries[0]?.textContent).toContain('確かめの問いに正解した');
    expect(entries[0]?.textContent).toContain('＋家 1');
    // 押すと、増えた建物へ飛ぶ。どの建物かは記録が持っている
    expect(entries[0]?.getAttribute('data-building')).toBe('home:1');
  });
});
