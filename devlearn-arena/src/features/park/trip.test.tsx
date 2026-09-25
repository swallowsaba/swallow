import { describe, expect, it } from 'vitest';
import { journeyOf, type WorldState } from '@/city/journey';
import { buildCity } from '@/city/model';
import { CityStage } from '@/features/citymap/CityStage';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { mount } from '@/visual/mountForTest';
import { nextTrip } from './trip';

/** 見比べる 2 つの状態。どの行が旅に出るかを見るだけなので、中身は空でよい */
const NOTHING: { before: WorldState; after: WorldState } = { before: {}, after: {} };

/**
 * 打ったコマンドが街を旅する（REWORK 3-3）。
 * どの行が旅に出るのか、その旅が街まで届いているのかを見る。
 */

describe('どの行が旅に出るか', () => {
  it('通ったコマンドは旅に出る', () => {
    expect(nextTrip(null, 'git init', 0, NOTHING)).toMatchObject({ line: 'git init', serial: 1 });
  });

  it('打つたびに旅の番号が進む', () => {
    const first = nextTrip(null, 'git init', 0, NOTHING);
    expect(nextTrip(first, 'git add .', 0, NOTHING)).toMatchObject({ line: 'git add .', serial: 2 });
  });

  it('失敗した行は旅に出ない。前の旅もそのまま', () => {
    const first = nextTrip(null, 'git init', 0, NOTHING);
    expect(nextTrip(first, 'git nope', 1, NOTHING)).toBe(first);
  });

  it('助けを求めた行は旅に出ない', () => {
    expect(nextTrip(null, 'hint', 0, NOTHING)).toBeNull();
    expect(nextTrip(null, 'answer', 0, NOTHING)).toBeNull();
  });

  it('空の行は旅に出ない', () => {
    expect(nextTrip(null, '   ', 0, NOTHING)).toBeNull();
  });
});

describe('旅が街まで届く', () => {
  /** 実際に git を動かし、打つ前と後の状態を取る */
  function commit() {
    const session = createSession({ files: { '/home/learner': null } });
    let state = session.state;
    for (const line of ['git init', 'echo hello > /home/learner/a.txt', 'git add a.txt']) {
      state = execute(state, line, session.registry, session.clock).state;
    }
    const before = state;
    const after = execute(state, 'git commit -m x', session.registry, session.clock).state;
    const shot = (s: typeof state): WorldState => ({ vfs: s.vfs, git: s.git });
    return { before: shot(before), after: shot(after), state: after };
  }

  it('旅が無いときは、街に粒の印が立たない', () => {
    const city = buildCity({ unlocked: ['git'] });
    const view = mount(<CityStage city={city} label="街" />);
    const stage = view.querySelector('[data-testid="city-stage"]');
    expect(stage?.getAttribute('data-journey')).toBeNull();
  });

  it('旅があると、そのコマンドと停留所の数が街に渡る', () => {
    const { before, after, state } = commit();
    const city = buildCity({ vfs: state.vfs, git: state.git, unlocked: ['git', 'kernel'] });
    const journey = journeyOf({ command: 'git commit -m x', before, after, city, serial: 1 });
    expect(journey).not.toBeNull();
    const view = mount(<CityStage city={city} label="街" journey={journey} />);
    const stage = view.querySelector('[data-testid="city-stage"]');
    expect(stage?.getAttribute('data-journey')).toBe('git commit -m x');
    expect(stage?.getAttribute('data-journey-stops')).toBe(String(journey?.stops.length ?? 0));
  });
});
