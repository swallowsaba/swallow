import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { newPlayer } from '@/save/saveData';
import { createSession } from '../session';
import { Intro } from './Intro';
import { StartWindow } from './StartWindow';

/**
 * 始め方の選択（docs/ui-design.md 10.12・docs/game-design.md 27 章）。都市画面の上の大きな窓。
 * 3 つを横に並べて違いを数で示す。既定はふつうで、選ばずに閉じてもふつう。初回の操作説明はこの窓の後
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

function mount(introSeen = false) {
  const session = createSession(undefined, { player: { ...newPlayer('p-1', '2026-10-30T10:00:00+09:00'), introSeen } });
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  roots.push(root);
  act(() => session.city.getState().openStart());
  act(() => root.render(<><StartWindow store={session.city} /><Intro session={session} /></>));
  return { session, host };
}

const win = (host: HTMLElement) => host.querySelector<HTMLElement>('[data-testid="start-window"]');

describe('始め方の選択（10.12）', () => {
  it('3 つを横に並べ、反対の組織化・申し立ての境・初めの政治資本を数で示す。既定はふつう。開いている間は時間が止まり、初回の操作説明は出ない', () => {
    const { session, host } = mount();
    const cols = [...(win(host)?.querySelectorAll<HTMLElement>('[data-testid^="start-mode-"]') ?? [])];
    expect(cols.map((c) => c.dataset.testid)).toEqual(['start-mode-gentle', 'start-mode-normal', 'start-mode-tough']);
    const nums = (el: HTMLElement): string[] => [...el.querySelectorAll('.start-num')].map((n) => n.textContent ?? '');
    expect(nums(cols[0] as HTMLElement)).toEqual(['×0.8', '45%', '14']);
    expect(nums(cols[1] as HTMLElement)).toEqual(['×1.0', '35%', '10']);
    expect(nums(cols[2] as HTMLElement)).toEqual(['×1.25', '25%', '7']);
    expect(cols[1]?.getAttribute('aria-pressed')).toBe('true');
    expect(session.city.getState().holds).toContain('window');
    expect(host.querySelector('[data-testid="intro"]')).toBeNull();
  });

  it('手ごわい町を選んで始めると、始め方と初めの政治資本が変わり、窓が閉じて時間が動き、初回の操作説明が出る', () => {
    const { session, host } = mount();
    act(() => win(host)?.querySelector<HTMLButtonElement>('[data-testid="start-mode-tough"]')?.click());
    expect(win(host)?.querySelector('[data-testid="start-mode-tough"]')?.getAttribute('aria-pressed')).toBe('true');
    act(() => win(host)?.querySelector<HTMLButtonElement>('[data-testid="start-go"]')?.click());
    expect(win(host)).toBeNull();
    const p = session.city.getState().world.politics;
    expect([p.difficulty, p.capital]).toEqual(['tough', 7]);
    expect(session.city.getState().holds).not.toContain('window');
    expect(host.querySelector('[data-testid="intro"]')).not.toBeNull();
    expect(session.city.getState().notice?.text).toBe('「手ごわい町」で始めた。政治資本 7。どのレッスンも、いつでも始められる');
  });

  it('選ばずに閉じると、ふつうで始まる', () => {
    const { session, host } = mount();
    act(() => win(host)?.querySelector<HTMLButtonElement>('[data-testid="start-mode-gentle"]')?.click());
    act(() => win(host)?.querySelector<HTMLButtonElement>('.election-close')?.click());
    expect(win(host)).toBeNull();
    expect(session.city.getState().world.politics.difficulty).toBe('normal');
    expect(session.city.getState().world.politics.capital).toBe(10);
  });

  it('落選の後の新しい都市（操作説明を見終えた市長）では、公約を選ぶ窓はこの窓を閉じるまで出ない', () => {
    const { session } = mount(true);
    session.city.getState().askPledges();
    expect(session.city.getState().election).toBeNull();
    act(() => session.city.getState().chooseStart('gentle', 0));
    session.city.getState().askPledges();
    expect(session.city.getState().election).toBe('term');
  });

  it('始めた後の都市（申請を出した・政治資本を動かした）では開かない', () => {
    const session = createSession(undefined, {});
    const w = session.city.getState().world;
    act(() => session.city.getState().load({ ...w, politics: { ...w.politics, capitalLog: [{ day: 1, amount: 3, why: 'ミッション' }] } }));
    session.city.getState().openStart();
    expect(session.city.getState().starting).toBe(false);
  });
});
