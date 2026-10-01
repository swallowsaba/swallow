import { describe, expect, it } from 'vitest';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { container, emptyCluster, node, pod } from '@/engines/k8s/factory';
import type { ClusterState, Pod } from '@/engines/k8s/types';
import { key } from '@/engines/k8s/types';
import { mount } from '@/visual/mountForTest';
import { CityCanvas } from './CityCanvas';
import { fitCity } from './view';
import { buildCity, whereabouts } from './model';
import { DISTRICT_IDS } from './growth';
import { BUILDING, GROUND, OCCUPANT, TILE } from './palette';

const ALL = DISTRICT_IDS;

/** あとから加わったノード（kubeadm join）。最初からあるノードは建ち上がり済みとして扱う */
function joined(name: string, at: number) {
  const n = node(name, 4000, 8192);
  return { ...n, metadata: { ...n.metadata, createdAt: at } };
}

function shell(files: Record<string, string | null> = { '/home/learner': null }) {
  let session: Session = createSession({ files });
  return {
    run(line: string) {
      session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
      return this;
    },
    get state() {
      return session.state;
    },
  };
}

function place(state: ClusterState, pods: Pod[], nodeName: string): ClusterState {
  const map = new Map(state.pods);
  for (const p of pods) {
    map.set(key(p.metadata.namespace, p.metadata.name), { ...p, status: { ...p.status, nodeName, phase: 'Running' as const } });
  }
  return { ...state, pods: map };
}

const running = (nodeName: string, tick = 9) => ({
  ...place(emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192)]), [pod('web', [container('c', 'nginx')])], nodeName),
  tick,
});

describe('街を描く', () => {
  it('真上から見た 2D。斜めに倒す変換は使わない', () => {
    const view = mount(<CityCanvas city={buildCity({ unlocked: ALL })} />);
    const svg = view.querySelector('[data-testid="city-canvas"]');
    expect(svg).not.toBeNull();
    expect(svg?.innerHTML).not.toContain('skew');
    expect(svg?.innerHTML).not.toContain('matrix(');
    expect(svg?.getAttribute('viewBox')).toBe(`0 0 ${String(48 * TILE)} ${String(34 * TILE)}`);
  });

  it('高層ビルは階を線で描き、level が上がると階が増える', () => {
    const one = mount(<CityCanvas city={buildCity({ cluster: running('n1'), unlocked: ALL })} />);
    const tower = one.querySelector('[data-building="node:n1"]');
    expect(tower?.getAttribute('data-kind')).toBe('tower');
    const floors = tower?.querySelectorAll('[data-mark="floors"] line').length ?? 0;
    expect(floors).toBe(Number(tower?.getAttribute('data-level')));
    expect(floors).toBeGreaterThan(0);
  });

  it('住人は丸。色で状態を示す', () => {
    const view = mount(<CityCanvas city={buildCity({ cluster: running('n1'), unlocked: ALL })} />);
    const resident = view.querySelector('[data-resident="pod:default/web"]');
    expect(resident?.tagName.toLowerCase()).toBe('circle');
    expect(resident?.getAttribute('data-resident-state')).toBe('settled');
    expect(resident?.getAttribute('fill')).toBe(OCCUPANT.settled);
  });

  it('建設中の建物は塗らない。基礎 → 骨組み → 完成 の順に建つ', () => {
    const phaseAt = (tick: number) => {
      const city = buildCity({ cluster: { ...emptyCluster([joined('n1', 1)]), tick }, unlocked: ALL });
      const view = mount(<CityCanvas city={city} />);
      const tower = view.querySelector('[data-building="node:n1"]');
      return { phase: tower?.getAttribute('data-phase'), fill: tower?.querySelector('[data-body]')?.getAttribute('fill') };
    };
    expect(phaseAt(1)).toMatchObject({ phase: 'base', fill: 'none' });
    expect(phaseAt(3).phase).toBe('frame');
    expect(phaseAt(10)).toMatchObject({ phase: 'done', fill: BUILDING.tower });
  });

  it('切れている道は途切れさせ、使われている道は太く明るく引く', () => {
    const sh = shell().run('ip link set eth0 down');
    const city = buildCity({ net: sh.state.net, unlocked: ALL });
    const view = mount(<CityCanvas city={city} />);
    const roads = [...view.querySelectorAll('[data-road]')];
    for (const road of roads) {
      const broken = road.getAttribute('data-road') === 'broken';
      expect(road.getAttribute('stroke-dasharray') === null).toBe(!broken);
    }
  });

  it('未解放の区域は暗く沈め、輪郭だけ見せる', () => {
    const view = mount(<CityCanvas city={buildCity({ unlocked: ['center'] })} />);
    const fog = [...view.querySelectorAll('[data-locked]')].map((g) => g.getAttribute('data-locked'));
    expect(fog.sort()).toEqual(['git', 'github', 'k8s', 'kernel', 'net']);
    expect(view.querySelector('[data-locked="k8s"] rect')?.getAttribute('fill')).not.toBe(GROUND.grass);
  });

  it('引っ越してきた住人は、元の建物から歩いて入る', () => {
    const before = buildCity({ cluster: running('n1'), unlocked: ALL });
    const after = buildCity({ cluster: running('n2'), unlocked: ALL, before: whereabouts(before) });
    const view = mount(<CityCanvas city={after} animate />);
    const resident = view.querySelector('[data-resident="pod:default/web"]');
    // 歩き始めは移動元の建物の真ん中
    const n1 = after.buildings.find((b) => b.id === 'node:n1');
    expect(resident?.getAttribute('cx')).toBe(String((n1?.x ?? 0) * TILE + ((n1?.w ?? 0) * TILE) / 2));
  });

  it('区画（ディレクトリ）は地面に線で描かれ、名前が出る', () => {
    const sh = shell().run('mkdir /home/learner/work');
    const view = mount(<CityCanvas city={buildCity({ vfs: sh.state.vfs, unlocked: ALL })} />);
    expect(view.querySelector('[data-plot="dir:/home/learner/work"]')?.textContent).toContain('work');
  });
});

describe('街を映す枠', () => {
  it('初期表示で街全体が枠に収まる', () => {
    const content = { w: 48 * TILE, h: 34 * TILE };
    const view = fitCity({ w: 400, h: 300 }, content);
    expect(content.w * view.k).toBeLessThanOrEqual(400 + 0.01);
    expect(content.h * view.k).toBeLessThanOrEqual(300 + 0.01);
    expect(view.x).toBeGreaterThanOrEqual(0);
    expect(view.y).toBeGreaterThanOrEqual(0);
  });

  it('枠が横長でも縦長でも、はみ出さずに真ん中へ置く', () => {
    const content = { w: 200, h: 100 };
    const wide = fitCity({ w: 1000, h: 200 }, content);
    expect(wide.k).toBe(2);
    expect(wide.x).toBeCloseTo(300);
    const tall = fitCity({ w: 100, h: 1000 }, content);
    expect(tall.k).toBe(0.5);
    expect(tall.y).toBeCloseTo(475);
  });
});
