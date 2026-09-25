import { beforeAll, describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { DISTRICT_IDS } from '@/city/growth';
import { emptyCluster, node } from '@/engines/k8s/factory';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { ShellState } from '@/engines/kernel/registry';
import { click, mount } from '@/visual/mountForTest';
import { BuildingPanel } from './BuildingPanel';
import { buildingInfo, type BuildingInfo } from './buildingInfo';

/**
 * 施設の中身（REWORK 3）。
 * どの建物を押しても「それが何か・いまどういう状態か・関係するコマンド」が出る。
 * 数はすべて模型から読む。ここで数え直さない。
 */

beforeAll(() => {
  if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

/** ビルが 1 棟ある街で、コマンドを何本か打った後の姿 */
function arena(lines: readonly string[] = []) {
  let session: Session = createSession({
    cluster: emptyCluster([node('n1', 4000, 8192)]),
    files: { '/home/learner': null },
  });
  for (const line of lines) {
    session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
  }
  const state: ShellState = session.state;
  const city = buildCity({ cluster: state.cluster, unlocked: DISTRICT_IDS });
  return { city, cluster: state.cluster, state };
}

function inside(lines: readonly string[], id: string): BuildingInfo {
  const { city, cluster } = arena(lines);
  const info = buildingInfo(city, cluster, id);
  if (info === null) throw new Error(`${id} が街に無い`);
  return info;
}

function panel(info: BuildingInfo) {
  const sent: string[] = [];
  const view = mount(
    <BuildingPanel
      info={info}
      onCommand={(line) => sent.push(line)}
      onClose={() => undefined}
    />,
  );
  return { view, sent };
}

const factOf = (info: BuildingInfo, key: string) => info.facts.find((f) => f.key === key)?.value;

describe('どの建物にも「それが何か」がある', () => {
  it('街に建っている建物は、どれも 1 行の説明を持つ', () => {
    const { city, cluster } = arena(['kubectl run web --image=nginx', 'kubectl wait 5']);
    const here = city.buildings.filter((b) => b.district === 'k8s');
    expect(here.length).toBeGreaterThan(4);
    for (const building of here) {
      const info = buildingInfo(city, cluster, building.id);
      expect(info?.what.length, `${building.id} に説明が無い`).toBeGreaterThan(10);
    }
  });

  it('説明はパネルに出る', () => {
    const info = inside([], 'cp:store');
    const { view } = panel(info);
    expect(view.querySelector('[data-testid="building-what"]')?.textContent).toBe(info.what);
  });
});

describe('いまの状態を模型から読む', () => {
  it('台帳は、載っている記録の数を出す', () => {
    const before = inside([], 'cp:store');
    const after = inside(['kubectl run web --image=nginx'], 'cp:store');
    expect(Number.parseInt(factOf(after, 'records') ?? '0', 10))
      .toBeGreaterThan(Number.parseInt(factOf(before, 'records') ?? '0', 10));
    expect(factOf(after, 'pods')).toBe('1 件');
  });

  it('配置係は、待っている住人の数を出す', () => {
    expect(factOf(inside([], 'cp:scheduler'), 'waiting')).toBe('0 人');
    // 作った直後はまだ行き先が決まっていない
    expect(factOf(inside(['kubectl run web --image=nginx'], 'cp:scheduler'), 'waiting')).toBe('1 人');
    // 時間が進むと行き先が決まる
    const settled = inside(['kubectl run web --image=nginx', 'kubectl wait 5'], 'cp:scheduler');
    expect(factOf(settled, 'waiting')).toBe('0 人');
    expect(factOf(settled, 'placed')).toBe('1 人');
  });

  it('ビルは、動いている住人と待っている住人を分けて出す', () => {
    const tower = inside(['kubectl run web --image=nginx', 'kubectl wait 5'], 'node:n1');
    expect(factOf(tower, 'running')).toBe('1 人');
    expect(factOf(tower, 'waiting')).toBe('0 人');
  });

  it('ビルは CPU と memory の使い具合も出す', () => {
    const tower = inside(['kubectl run web --image=nginx', 'kubectl wait 5'], 'node:n1');
    expect(tower.usage.map((u) => u.key)).toContain('cpu');
    expect(tower.usage.map((u) => u.key)).toContain('memory');
  });

  it('監督は、あるべき数といまの数の開きを出す', () => {
    const watch = inside(['kubectl create deployment web --image=nginx --replicas=2'], 'cp:controller');
    expect(factOf(watch, 'orders')).toBe('1 件');
    expect(factOf(watch, 'gap')).toBe('2 人');
  });

  it('数はパネルに出る', () => {
    const info = inside(['kubectl run web --image=nginx'], 'cp:scheduler');
    const { view } = panel(info);
    expect(view.querySelector('[data-fact="waiting"]')?.textContent).toContain('1 人');
  });
});

describe('直近の出来事', () => {
  it('台帳に残った出来事を、その建物のものだけ出す', () => {
    const tower = inside(['kubectl run web --image=nginx', 'kubectl wait 5'], 'node:n1');
    expect(tower.log.length).toBeGreaterThan(0);
    for (const line of tower.log) expect(line.text ?? '').not.toBe('');
  });
});

describe('関係するコマンド', () => {
  it('押すと端末に入る', () => {
    const info = inside([], 'node:n1');
    const { view, sent } = panel(info);
    const first = view.querySelector<HTMLElement>('[data-command]');
    expect(first).not.toBeNull();
    click(view, '[data-command]');
    expect(sent).toEqual([first?.getAttribute('data-command')]);
  });

  it('管制の施設にも、そこを覗くコマンドが付いている', () => {
    for (const id of ['cp:api', 'cp:store', 'cp:controller', 'cp:scheduler']) {
      expect(inside([], id).actions.length, id).toBeGreaterThan(0);
    }
  });
});
