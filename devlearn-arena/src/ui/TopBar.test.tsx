import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopBar, type TopBarClock } from './TopBar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

function mount(clock: TopBarClock, approval: number | null) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => root.render(<TopBar cityName="みなと市" clock={clock} approval={approval} funds={1500} xp={0} rankName="見習い" population={120} stageName="村" />));
  return host;
}

const clockOf = (patch: Partial<TopBarClock> = {}): TopBarClock => ({ year: 2, week: 14, speed: 1, paused: false, held: false, onSpeed: vi.fn(), ...patch });

describe('上の帯の日付と速さ・支持率（docs/ui-design.md 3.1・docs/development-plan.md G1）', () => {
  it('日付は「2 年目 14 週」。今の速さのボタンが押された形になる', () => {
    const host = mount(clockOf({ speed: 2 }), 54.4);
    expect(host.querySelector('[data-testid="topbar-date"]')?.textContent).toBe('2年目 14週');
    expect(host.querySelector('[data-testid="topbar-speed-2"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-testid="topbar-speed-1"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('[data-testid="topbar-pause"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('止めている時は、止めるのボタンだけが押された形になる', () => {
    const host = mount(clockOf({ paused: true, speed: 3 }), 54);
    expect(host.querySelector('[data-testid="topbar-pause"]')?.getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('[data-testid="topbar-speed-3"]')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('ボタンを押すと、止める（0）・1〜3 倍を知らせる', () => {
    const clock = clockOf();
    const host = mount(clock, 54);
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="topbar-speed-3"]')?.click());
    act(() => host.querySelector<HTMLButtonElement>('[data-testid="topbar-pause"]')?.click());
    expect(clock.onSpeed).toHaveBeenNthCalledWith(1, 3);
    expect(clock.onSpeed).toHaveBeenNthCalledWith(2, 0);
  });

  it('支持率は四捨五入した数と %。住む人がいなければ「—」', () => {
    expect(mount(clockOf(), 54.6).querySelector('[data-testid="topbar-approval"] .topbar-stat-value')?.textContent).toBe('55%');
    expect(mount(clockOf(), null).querySelector('[data-testid="topbar-approval"] .topbar-stat-value')?.textContent).toBe('—');
  });
});
