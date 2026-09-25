import { describe, expect, it, vi } from 'vitest';
import { buildCity } from '@/city/model';
import { journeyOf, type Journey, type WorldState } from '@/city/journey';
import type { JourneyPlay } from '@/city3d/journey';
import { emptyCluster, node } from '@/engines/k8s/factory';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { ShellState } from '@/engines/kernel/registry';
import { click, mount } from '@/visual/mountForTest';
import { JourneyStrip } from './JourneyStrip';

/**
 * 旅路の帯（REWORK 2-3、2-4）。
 * カメラは一度に一か所しか映せないので、旅の全体はここで見えていなければならない。
 */

const PLAY: JourneyPlay = { playing: true, rate: 1, step: 0 };

function shot(state: ShellState): WorldState {
  return { vfs: state.vfs, git: state.git, cluster: state.cluster, net: state.net, repo: state.repo };
}

/** `kubectl run` を実際に打って導いた旅 */
function ran(): Journey {
  const session = createSession({
    cluster: emptyCluster([node('n1', 4000, 8192)]),
    files: { '/home/learner': null },
  });
  const before = session.state;
  const after = execute(before, 'kubectl run web --image=nginx', session.registry, session.clock).state;
  const city = buildCity({ cluster: after.cluster, unlocked: ['k8s'] });
  const journey = journeyOf({ command: 'kubectl run web --image=nginx', before: shot(before), after: shot(after), city });
  if (journey === null) throw new Error('旅が出なかった');
  return journey;
}

function strip(journey: Journey, at: number, play: JourneyPlay = PLAY, handlers: Partial<{
  onPlaying: (playing: boolean) => void;
  onRate: (rate: number) => void;
  onStep: () => void;
  onClose: () => void;
}> = {}) {
  return mount(
    <JourneyStrip
      journey={journey}
      at={at}
      play={play}
      onPlaying={handlers.onPlaying ?? (() => undefined)}
      onRate={handlers.onRate ?? (() => undefined)}
      onStep={handlers.onStep ?? (() => undefined)}
      onClose={handlers.onClose ?? (() => undefined)}
    />,
  );
}

const lane = (view: HTMLElement, title: string) => view.querySelector(`[data-lane="${title}"]`);

describe('旅路の帯', () => {
  it('通りうる施設を左から並べる', () => {
    const view = strip(ran(), 0);
    const titles = [...view.querySelectorAll('[data-lane]')].map((el) => el.getAttribute('data-lane'));
    expect(titles).toEqual(['窓口', '台帳', '事務所', '監督', '配置係', 'ビル', 'バス停']);
  });

  it('通らなかった施設には取り消し線を引く', () => {
    const view = strip(ran(), 0);
    expect(lane(view, '窓口')?.getAttribute('data-passed')).toBe('yes');
    expect(lane(view, 'ビル')?.getAttribute('data-passed')).toBe('no');
    expect((lane(view, 'ビル') as HTMLElement | null)?.style.textDecoration).toBe('line-through');
  });

  it('いま粒がいる施設に印が付き、進むと印も動く', () => {
    expect(lane(strip(ran(), 0), '窓口')?.getAttribute('data-now')).toBe('yes');
    const later = strip(ran(), 2);
    expect(lane(later, '窓口')?.getAttribute('data-now')).toBeNull();
    expect(lane(later, '配置係')?.getAttribute('data-now')).toBe('yes');
  });

  it('いまの停留所で何が起きたかを 1 行で出す', () => {
    const journey = ran();
    const view = strip(journey, 1);
    expect(view.querySelector('[data-testid="journey-note"]')?.textContent).toBe(journey.stops[1]?.label);
  });

  it('一時停止を押すと、止めてほしいと伝わる', () => {
    const onPlaying = vi.fn();
    click(strip(ran(), 0, PLAY, { onPlaying }), '[data-testid="journey-playing"]');
    expect(onPlaying).toHaveBeenCalledWith(false);
  });

  it('止まっているときに押すと、続けてほしいと伝わる', () => {
    const onPlaying = vi.fn();
    click(strip(ran(), 0, { ...PLAY, playing: false }, { onPlaying }), '[data-testid="journey-playing"]');
    expect(onPlaying).toHaveBeenCalledWith(true);
  });

  it('1 つ進めるを押すと伝わる。最後の停留所では押せない', () => {
    const onStep = vi.fn();
    const journey = ran();
    click(strip(journey, 0, PLAY, { onStep }), '[data-testid="journey-step"]');
    expect(onStep).toHaveBeenCalled();
    const end = strip(journey, journey.stops.length - 1);
    expect(end.querySelector<HTMLButtonElement>('[data-testid="journey-step"]')?.disabled).toBe(true);
  });

  it('速さは 0.5x / 1x / 2x から選べる', () => {
    const onRate = vi.fn();
    const view = strip(ran(), 0, PLAY, { onRate });
    expect([...view.querySelectorAll('[data-rate]')].map((el) => el.getAttribute('data-rate')))
      .toEqual(['0.5', '1', '2']);
    expect(view.querySelector('[data-rate="1"]')?.getAttribute('aria-pressed')).toBe('true');
    click(view, '[data-rate="2"]');
    expect(onRate).toHaveBeenCalledWith(2);
  });
});
