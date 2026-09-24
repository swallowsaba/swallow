import { describe, expect, it } from 'vitest';
import type { Journey } from '@/city/journey';
import {
  DWELL_SECONDS, LEG_SECONDS, TRAVEL_SECONDS, cartAt, routeOf, routeSeconds, type CartRoute,
} from './journey';

/**
 * 荷車の走り方。
 *
 * 見たいのは 3 つ。
 * 1. 停留所から停留所まで、途切れずに進むこと
 * 2. 停留所に着いた所で積荷の姿が変わること
 * 3. 時刻だけで位置が決まること（同じ秒数からは必ず同じ場所）
 */

const JOURNEY: Journey = {
  id: '1:git commit',
  command: 'git commit',
  stops: [
    { building: 'index', label: '倉庫から積み出す', cargo: 'crate', cargoLabel: '荷札の付いた塊' },
    { building: 'commit:a', label: '記念碑に刻む', cargo: 'stone', cargoLabel: '刻まれた石' },
    { building: 'branch:main', label: '旗が進む', cargo: 'seal', cargoLabel: '通りの印' },
  ],
};

const BUILDINGS = [
  { id: 'index', at: { x: 0, z: 0 } },
  { id: 'commit:a', at: { x: 40, z: 0 } },
  { id: 'branch:main', at: { x: 40, z: 60 } },
];

const route = (): CartRoute => {
  const made = routeOf(JOURNEY, BUILDINGS);
  if (made === null) throw new Error('道のりが出なかった');
  return made;
};

describe('旅を地面の上の道のりに直す', () => {
  it('停留所の建物の位置を拾う', () => {
    expect(route().stops.map((stop) => stop.at)).toEqual([
      { x: 0, z: 0 },
      { x: 40, z: 0 },
      { x: 40, z: 60 },
    ]);
  });

  it('街に無い建物は飛ばす', () => {
    const made = routeOf(JOURNEY, BUILDINGS.filter((b) => b.id !== 'commit:a'));
    expect(made?.stops.map((stop) => stop.building)).toEqual(['index', 'branch:main']);
  });

  it('停留所が 2 つに満たなければ道のりにしない', () => {
    expect(routeOf(JOURNEY, [{ id: 'index', at: { x: 0, z: 0 } }])).toBeNull();
  });

  it('かかる秒数は停留所の数から決まる', () => {
    expect(routeSeconds(route())).toBeCloseTo(2 * LEG_SECONDS);
  });
});

describe('荷車が停留所を巡る', () => {
  it('出発は最初の停留所', () => {
    const spot = cartAt(route(), 0);
    expect(spot.at).toEqual({ x: 0, z: 0 });
    expect(spot.done).toBe(false);
  });

  it('区間の途中では、停留所と停留所の間にいる', () => {
    const spot = cartAt(route(), TRAVEL_SECONDS / 2);
    expect(spot.at.x).toBeGreaterThan(0);
    expect(spot.at.x).toBeLessThan(40);
    expect(spot.leg).toBe(0);
  });

  it('走っている間は行き先を向いている', () => {
    const spot = cartAt(route(), TRAVEL_SECONDS / 2);
    // +x へ進むので、`props.pointAt` と同じ取り方では 90 度
    expect(spot.angle).toBeCloseTo(Math.PI / 2);
    const later = cartAt(route(), LEG_SECONDS + TRAVEL_SECONDS / 2);
    // 次の区間は +z へ進む
    expect(later.angle).toBeCloseTo(0);
  });

  it('着いた停留所で積み替えの間がある', () => {
    const spot = cartAt(route(), TRAVEL_SECONDS + DWELL_SECONDS / 2);
    expect(spot.loading).toBe(true);
    expect(spot.at).toEqual({ x: 40, z: 0 });
  });

  it('最後まで走ると、着いた所で止まる', () => {
    const spot = cartAt(route(), routeSeconds(route()) + 10);
    expect(spot.at).toEqual({ x: 40, z: 60 });
    expect(spot.done).toBe(true);
  });

  it('道のりの上から外れない', () => {
    const made = route();
    for (let s = 0; s <= routeSeconds(made); s += 0.05) {
      const spot = cartAt(made, s);
      expect(spot.at.x).toBeGreaterThanOrEqual(0);
      expect(spot.at.x).toBeLessThanOrEqual(40);
      expect(spot.at.z).toBeGreaterThanOrEqual(0);
      expect(spot.at.z).toBeLessThanOrEqual(60);
    }
  });

  it('位置が飛ばない。1 こまで進む距離は区間の長さを超えない', () => {
    const made = route();
    let before = cartAt(made, 0).at;
    for (let s = 0.02; s <= routeSeconds(made); s += 0.02) {
      const here = cartAt(made, s).at;
      expect(Math.hypot(here.x - before.x, here.z - before.z)).toBeLessThan(4);
      before = here;
    }
  });
});

describe('積荷が停留所で姿を変える', () => {
  it('走っている間は、出てきた停留所の荷を積んでいる', () => {
    expect(cartAt(route(), TRAVEL_SECONDS / 2).cargo).toBe('crate');
    expect(cartAt(route(), LEG_SECONDS + TRAVEL_SECONDS / 2).cargo).toBe('stone');
  });

  it('着いた所で次の姿に変わる', () => {
    expect(cartAt(route(), TRAVEL_SECONDS + 0.01).cargo).toBe('stone');
    expect(cartAt(route(), TRAVEL_SECONDS + 0.01).cargoLabel).toBe('刻まれた石');
  });

  it('旅の終わりは最後の停留所の荷', () => {
    expect(cartAt(route(), routeSeconds(route())).cargo).toBe('seal');
  });

  it('旅の間に、積荷は停留所の数だけ姿を変える', () => {
    const made = route();
    const seen: string[] = [];
    for (let s = 0; s <= routeSeconds(made); s += 0.05) {
      const { cargo } = cartAt(made, s);
      if (seen[seen.length - 1] !== cargo) seen.push(cargo);
    }
    expect(seen).toEqual(['crate', 'stone', 'seal']);
  });
});

describe('時刻だけで決まる', () => {
  it('同じ秒数からは同じ場所になる', () => {
    expect(cartAt(route(), 1.1)).toEqual(cartAt(route(), 1.1));
  });
});
