import { describe, expect, it } from 'vitest';
import { journeyOf } from '@/city/journey';
import { buildCity, type Building, type BuildingKind } from '@/city/model';
import { CityStage } from '@/features/citymap/CityStage';
import { mount } from '@/visual/mountForTest';
import { nextTrip } from './trip';

/**
 * 打ったコマンドが街を旅する（REWORK 3-3）。
 * どの行が旅に出るのか、その旅が街まで届いているのかを見る。
 */

describe('どの行が旅に出るか', () => {
  it('通ったコマンドは旅に出る', () => {
    expect(nextTrip(null, 'git init', 0)).toEqual({ line: 'git init', serial: 1 });
  });

  it('打つたびに旅の番号が進む', () => {
    const first = nextTrip(null, 'git init', 0);
    expect(nextTrip(first, 'git add .', 0)).toEqual({ line: 'git add .', serial: 2 });
  });

  it('失敗した行は旅に出ない。前の旅もそのまま', () => {
    const first = nextTrip(null, 'git init', 0);
    expect(nextTrip(first, 'git nope', 1)).toBe(first);
  });

  it('助けを求めた行は旅に出ない', () => {
    expect(nextTrip(null, 'hint', 0)).toBeNull();
    expect(nextTrip(null, 'answer', 0)).toBeNull();
  });

  it('空の行は旅に出ない', () => {
    expect(nextTrip(null, '   ', 0)).toBeNull();
  });
});

function building(id: string, kind: BuildingKind, label = id): Building {
  return {
    id, kind, x: 0, y: 0, w: 2, h: 2, level: 1, label,
    occupants: [], state: 'normal', phase: 'done', district: 'git',
  };
}

describe('旅が街まで届く', () => {
  const city = { ...buildCity({ unlocked: ['git'] }), buildings: [building('index', 'depot'), building('commit:a', 'monument')] };

  it('旅が無いときは、街に荷車の印が立たない', () => {
    const view = mount(<CityStage city={city} label="街" />);
    const stage = view.querySelector('[data-testid="city-stage"]');
    expect(stage?.getAttribute('data-journey')).toBeNull();
  });

  it('旅があると、そのコマンドと停留所の数が街に渡る', () => {
    const journey = journeyOf('git commit -m x', city, 1);
    expect(journey).not.toBeNull();
    const view = mount(<CityStage city={city} label="街" journey={journey} />);
    const stage = view.querySelector('[data-testid="city-stage"]');
    expect(stage?.getAttribute('data-journey')).toBe('git commit -m x');
    expect(stage?.getAttribute('data-journey-stops')).toBe('2');
  });
});
