import { act } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { Building, City, Occupant } from '@/city/model';
import { container, emptyCluster, node, pod } from '@/engines/k8s/factory';
import type { ClusterState } from '@/engines/k8s/types';
import { click, mount } from '@/visual/mountForTest';
import { BuildingPanel } from './BuildingPanel';
import { buildingInfo, PODS_PER_NODE, tickText } from './buildingInfo';
import { SIZE } from './theme';

/**
 * 建物の情報パネル。街の建物を押すと右に開く。
 * 数は全て街の状態から導く。ボタンにはコマンドを併記し、押すと端末へ送る。
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

function town(buildings: readonly Partial<Building>[]): City {
  return {
    width: 10, height: 10, tiles: [], roads: [], districts: [], plots: [], carts: [], sites: [],
    buildings: buildings.map((b, i) => ({
      id: b.id ?? `b${String(i)}`,
      kind: b.kind ?? 'tower',
      x: 0, y: 0, w: 2, h: 2,
      level: b.level ?? 2,
      label: b.label ?? `b${String(i)}`,
      occupants: b.occupants ?? [],
      state: b.state ?? 'normal',
      phase: 'done',
      district: 'center',
      ...(b.command === undefined ? {} : { command: b.command }),
      ...(b.why === undefined ? {} : { why: b.why }),
      ...(b.actions === undefined ? {} : { actions: b.actions }),
    })),
  };
}

const who = (state: Occupant['state'], id: string): Occupant => ({ id, label: id, state });

describe('建物の中身を街から導く', () => {
  it('知らない建物を指すと null', () => {
    expect(buildingInfo(town([]), null, 'nope')).toBeNull();
  });

  it('名前・種別・レベル・住人を持つ', () => {
    const city = town([{ id: 'node-1', label: 'node-1', kind: 'tower', level: 3, occupants: [who('settled', 'web-1')] }]);
    const info = buildingInfo(city, null, 'node-1');
    expect(info?.label).toBe('node-1');
    expect(info?.kind).toBe('tower');
    expect(info?.level).toBe(3);
    expect(info?.residents).toEqual([{ id: 'web-1', label: 'web-1', state: 'settled' }]);
  });

  it('出て行った人は住人にも記録にも出さない', () => {
    const city = town([{ id: 'a', occupants: [who('settled', 'x'), who('gone', 'y')] }]);
    expect(buildingInfo(city, null, 'a')?.residents.map((r) => r.id)).toEqual(['x']);
  });

  it('操作ボタンは、建物のコマンドと印のコマンドを並べる', () => {
    const city = town([{
      id: 'a',
      command: 'kubectl describe node a',
      why: 'この建物を調べる',
      actions: [{ mark: 'stop', command: 'kubectl cordon a', why: '受付を止める' }],
    }]);
    const info = buildingInfo(city, null, 'a');
    expect(info?.actions).toEqual([
      { command: 'kubectl describe node a', label: 'この建物を調べる', primary: true },
      { command: 'kubectl cordon a', label: '受付を止める', primary: false },
    ]);
  });

  it('tick を分と秒に写す', () => {
    expect(tickText(2)).toBe('0:02');
    expect(tickText(75)).toBe('1:15');
  });
});

describe('ノードの使用量はクラスタから導く', () => {
  /** ノードを 1 台立て、そこに Pod を 1 つ置いたクラスタ */
  function cluster(): ClusterState {
    const base = emptyCluster([node('node-1', 4000, 8192)]);
    const one = pod('web-1', [container('app', 'nginx', { requests: { cpu: 200, memory: 256 } })]);
    return {
      ...base,
      pods: new Map([['web-1', { ...one, status: { ...one.status, phase: 'Running', nodeName: 'node-1', startedAt: 2 } }]]),
    };
  }

  it('クラスタが無ければ住人の棒だけ', () => {
    const info = buildingInfo(town([{ id: 'a', occupants: [who('settled', 'x')] }]), null, 'a');
    expect(info?.usage.map((u) => u.key)).toEqual(['residents']);
  });

  it('ノードなら CPU とメモリの棒が付き、入居できる人数は Kubernetes の上限になる', () => {
    const state = cluster();
    const city = town([{ id: 'node-1', label: 'node-1', occupants: [who('settled', 'web-1')] }]);
    const info = buildingInfo(city, state, 'node-1');
    expect(info?.usage.map((u) => u.key)).toEqual(['cpu', 'memory', 'residents']);
    expect(info?.usage.find((u) => u.key === 'cpu')?.text).toBe('200m / 4000m');
    expect(info?.usage.find((u) => u.key === 'memory')?.text).toBe('256Mi / 8192Mi');
    expect(info?.usage.find((u) => u.key === 'residents')?.total).toBe(PODS_PER_NODE);
  });

  it('記録には、Pod が入居した tick が出る', () => {
    const city = town([{ id: 'node-1', occupants: [who('settled', 'web-1')] }]);
    expect(buildingInfo(city, cluster(), 'node-1')?.log[0]).toEqual({
      id: 'web-1', label: 'web-1', at: '0:02', event: 'running',
    });
  });
});

describe('パネルの見た目と操作', () => {
  const info = buildingInfo(
    town([{
      id: 'node-1',
      label: 'node-1',
      level: 3,
      occupants: [who('settled', 'web-1'), who('sick', 'api-1')],
      actions: [{ mark: 'stop', command: 'kubectl cordon node-1', why: '受付を止める' }],
    }]),
    null,
    'node-1',
  );

  function open() {
    const sent: string[] = [];
    const view = mount(
      <BuildingPanel
        info={info ?? { id: '', label: '', kind: 'tower', level: 1, usage: [], residents: [], log: [], actions: [] }}
        onCommand={(line) => sent.push(line)}
        onClose={() => undefined}
      />,
    );
    return { view, sent };
  }

  it('幅は 340px', () => {
    const style = open().view.querySelector('[data-testid="building-panel"]')?.getAttribute('style') ?? '';
    expect(style).toContain(`width: ${String(SIZE.info)}px`);
  });

  it('名前と種別とレベルが出る', () => {
    const { view } = open();
    expect(view.querySelector('[data-testid="building-name"]')?.textContent).toBe('node-1');
    expect(view.querySelector('[data-testid="building-panel"]')?.textContent).toContain('レベル 3');
  });

  it('タブは概要・住人・記録の 3 つ。押すと中身が入れ替わる', () => {
    const { view } = open();
    expect([...view.querySelectorAll('[data-tab]')].map((el) => el.getAttribute('data-tab'))).toEqual([
      'overview', 'residents', 'log',
    ]);
    expect(view.querySelector('[data-testid="building-overview"]')).not.toBeNull();
    click(view, '[data-tab="residents"]');
    expect(view.querySelector('[data-testid="building-residents"]')?.textContent).toContain('api-1');
    click(view, '[data-tab="log"]');
    expect(view.querySelector('[data-testid="building-log"]')?.textContent).toContain('api-1');
  });

  it('使用量の棒が出る', () => {
    const { view } = open();
    expect(view.querySelector('[data-testid="usage-residents"]')).not.toBeNull();
  });

  it('操作ボタンにはコマンドが併記され、押すと端末へ送られる', () => {
    const { view, sent } = open();
    const button = view.querySelector('[data-command="kubectl cordon node-1"]');
    expect(button?.textContent).toContain('kubectl cordon node-1');
    expect(button?.textContent).toContain('受付を止める');
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(sent).toEqual(['kubectl cordon node-1']);
  });

  it('閉じるが押せる', () => {
    const onClose = vi.fn();
    const view = mount(
      <BuildingPanel
        info={info ?? { id: '', label: '', kind: 'tower', level: 1, usage: [], residents: [], log: [], actions: [] }}
        onCommand={() => undefined}
        onClose={onClose}
      />,
    );
    click(view, '[data-testid="building-close"]');
    expect(onClose).toHaveBeenCalled();
  });
});
