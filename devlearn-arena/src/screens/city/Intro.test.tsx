import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { newPlayer } from '@/save/saveData';
import { createSession } from '../session';
import { Intro } from './Intro';
import { INTRO_STEPS } from './introSteps';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

function mount(introSeen: boolean) {
  const session = createSession(undefined, { player: { ...newPlayer('p-1', '2026-10-09T10:00:00+09:00'), introSeen } });
  const host = document.createElement('div');
  document.body.append(host);
  // 示す所（建設メニュー・おすすめの欄・上の帯）
  host.innerHTML = '<div data-testid="build-menu"><div class="build-bar"></div></div><aside data-testid="recommend"></aside><header data-testid="topbar"><button data-testid="topbar-xp"></button><nav class="topbar-entries"></nav></header>';
  const mountAt = document.createElement('div');
  host.append(mountAt);
  const root = createRoot(mountAt);
  roots.push(root);
  act(() => root.render(<Intro session={session} />));
  return { session, host };
}

const key = (k: string): void => {
  act(() => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });
};
const intro = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-testid="intro"]');

describe('初回の操作説明（docs/ui-design.md 9 章）', () => {
  it('初めて遊ぶ市長に、3 回に分けて、示す所を囲んで説明する。Enter で次へ、最後で閉じると次からは出さない', () => {
    const { session, host } = mount(false);
    expect(INTRO_STEPS).toHaveLength(3);
    const marks: number[] = [];
    for (let i = 1; i <= 3; i += 1) {
      expect(intro(host)?.dataset.step).toBe(String(i));
      expect(intro(host)?.querySelector('#intro-title')?.textContent).toBe(INTRO_STEPS[i - 1]?.title);
      marks.push(intro(host)?.querySelectorAll('.intro-mark').length ?? 0);
      key('Enter');
    }
    // 建設メニュー・おすすめの欄・上の帯の XP と入口
    expect(marks).toEqual([1, 1, 2]);
    expect(intro(host)).toBeNull();
    expect(session.player.getState().player.introSeen).toBe(true);
  });

  it('いつでも飛ばせる（Esc か「飛ばす」）', () => {
    const a = mount(false);
    key('Enter');
    key('Escape');
    expect(intro(a.host)).toBeNull();
    expect(a.session.player.getState().player.introSeen).toBe(true);

    const b = mount(false);
    const skip = [...b.host.querySelectorAll('button')].find((x) => x.textContent?.startsWith('飛ばす'));
    act(() => skip?.click());
    expect(intro(b.host)).toBeNull();
    expect(b.session.player.getState().player.introSeen).toBe(true);
  });

  it('見終えた市長には出さない', () => {
    const { host } = mount(true);
    expect(intro(host)).toBeNull();
  });
});
