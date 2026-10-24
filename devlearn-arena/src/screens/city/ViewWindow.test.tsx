import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import type { SimHost } from '@/sim/host';
import { FACTORS } from '@/sim/layers';
import type { StateMessage } from '@/sim/runner';
import { districtOf } from '@/sim/space';
import type { WeeklyBreakdown, World } from '@/sim/types';
import { createCityStore } from './cityStore';
import { ViewWindow } from './ViewWindow';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Root[] = [];
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
  roots = [];
  document.body.innerHTML = '';
});

/** 模擬の返事を手で送れる口 */
function manualHost(): { host: SimHost; send: (m: StateMessage) => void } {
  let listener: ((m: StateMessage) => void) | null = null;
  return {
    host: { inWorker: true, post: () => undefined, listen: (fn) => { listener = fn; return () => undefined; }, stop: () => undefined },
    send: (m) => act(() => listener?.(m)),
  };
}

const zero = (): number[][] => FACTORS.map(() => new Array<number>(12).fill(0));

/** 4 週で、工業区画の騒音で 6 下がった記録 */
function noisyWeeks(world: World): World {
  const city = {
    ...world.city,
    zones: [...world.city.zones, { id: 'z-fac', kind: 'industrial' as const, cells: [{ x: 41, y: 46 }] }],
    buildings: [...world.city.buildings, { id: 'b1', zoneId: 'z-fac', cell: { x: 41, y: 46 }, variant: 'f', level: 3, builtDay: 0 }],
  };
  const breakdown: WeeklyBreakdown[] = [
    { week: 10, factors: zero(), causes: [], approval: 50 },
    { week: 14, factors: zero(), causes: [{ factor: 'noise', source: { kind: 'building', id: 'b1', at: { x: 41.5, y: 46.5 } }, points: -6.2 }], approval: 43.8 },
  ];
  return { ...world, city, history: { ...world.history, breakdown } };
}

describe('表示切替の窓（docs/ui-design.md 11 章）', () => {
  it('支持率の「なぜ」を出し、押すと原因の場所へ寄り、その要因のヒートマップに切り替わる', () => {
    const { host, send } = manualHost();
    const store = createCityStore(1, undefined, { host });
    const world = noisyWeeks(store.getState().world);
    send({ type: 'state', seq: 0, day: Math.floor(world.city.day), patch: { city: world.city, history: world.history } });
    store.getState().openWindow('view');
    const el = document.createElement('div');
    document.body.append(el);
    const root = createRoot(el);
    roots.push(root);
    act(() => root.render(<ViewWindow store={store} stack={0} shifted={false} />));
    const name = world.sim.districtNames[districtOf(41, 46)] as string;
    expect(el.querySelector('[data-testid="view-explain"]')?.textContent).toBe(`この 4 週で支持率が 6 下がった。主な理由は、${name}の工業区画（騒音）`);
    act(() => el.querySelector<HTMLButtonElement>('[data-testid="view-explain"]')?.click());
    expect(store.getState().overlay).toBe('noise');
    expect(store.getState().focus?.at).toEqual({ x: 41.5, y: 46.5 });
  });

  it('ヒートマップの行を押すと重ね、もう一度押すと外す。閉じると窓が消える', () => {
    const store = createCityStore(1);
    store.getState().openWindow('view');
    const el = document.createElement('div');
    document.body.append(el);
    const root = createRoot(el);
    roots.push(root);
    act(() => root.render(<ViewWindow store={store} stack={0} shifted={false} />));
    act(() => el.querySelector<HTMLButtonElement>('[data-testid="overlay-rent"]')?.click());
    expect(store.getState().overlay).toBe('rent');
    act(() => el.querySelector<HTMLButtonElement>('[data-testid="overlay-rent"]')?.click());
    expect(store.getState().overlay).toBeNull();
    act(() => el.querySelector<HTMLButtonElement>('[data-testid="overlay-traffic"]')?.click());
    expect(store.getState().overlay).toBe('traffic');
    act(() => el.querySelector<HTMLButtonElement>('[data-testid="view-window-close"]')?.click());
    expect(store.getState().windows).toEqual([]);
  });

  it('支持率が 4 週で 3 以上動いた週は、説明の 1 行目を知らせにも出す（11.3）', () => {
    const { host, send } = manualHost();
    const store = createCityStore(1, undefined, { host });
    const world = noisyWeeks(store.getState().world);
    send({ type: 'state', seq: 0, day: Math.floor(world.city.day), patch: { city: world.city, history: world.history } });
    expect(store.getState().notice?.text).toMatch(/^この 4 週で支持率が 6 下がった。主な理由は、.+の工業区画（騒音）$/);
  });
});
