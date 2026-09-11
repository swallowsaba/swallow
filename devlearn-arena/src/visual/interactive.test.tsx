import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { advanceCluster } from '@/engines/k8s/controllers';
import { container, deployment, emptyCluster, node } from '@/engines/k8s/factory';
import { tickPods } from '@/engines/k8s/kubelet';
import type { ClusterState } from '@/engines/k8s/types';
import { host, iface, link, resetMac, router, topology } from '@/engines/net/factory';
import { ClusterCanvas } from './ClusterCanvas';
import { PacketFlow } from './PacketFlow';

// React の act() を jsdom の上で使う
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host$: HTMLDivElement | null = null;

function mount(element: React.ReactElement): HTMLDivElement {
  host$ = document.createElement('div');
  document.body.appendChild(host$);
  root = createRoot(host$);
  act(() => {
    root?.render(element);
  });
  return host$;
}

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host$?.remove();
  root = null;
  host$ = null;
});

function click(container: HTMLElement, selector: string): void {
  const target = container.querySelector<HTMLElement>(selector);
  if (!target) throw new Error(`見つかりません: ${selector}`);
  act(() => {
    target.click();
  });
}

function cluster(): ClusterState {
  let state: ClusterState = {
    ...emptyCluster([node('node-1', 4000, 8192)]),
    deployments: new Map([['default/web', deployment('web', 2, [container('web', 'nginx')])]]),
  };
  for (let i = 0; i < 10; i += 1) state = advanceCluster(state, tickPods);
  return state;
}

describe('クラスタの図を押すと、コマンドが端末に流れる', () => {
  it('Pod の × で delete、Pod を押すと describe', () => {
    const onCommand = vi.fn();
    const state = cluster();
    const name = [...state.pods.values()][0]?.metadata.name ?? '';
    const view = mount(<ClusterCanvas cluster={state} onCommand={onCommand} />);
    click(view, `button[title="kubectl delete pod ${name}"]`);
    expect(onCommand).toHaveBeenLastCalledWith(`kubectl delete pod ${name}`);
    click(view, `button[aria-label*="${name}"]:not([title])`);
    expect(onCommand).toHaveBeenLastCalledWith(`kubectl describe pod ${name}`);
  });

  it('± で scale、⏸ で cordon、時間を進めるで wait', () => {
    const onCommand = vi.fn();
    const view = mount(<ClusterCanvas cluster={cluster()} onCommand={onCommand} />);
    click(view, 'button[title="kubectl scale deploy web --replicas=3"]');
    click(view, 'button[title="kubectl cordon node-1"]');
    expect(onCommand.mock.calls.map((c) => c[0] as string)).toEqual([
      'kubectl scale deploy web --replicas=3',
      'kubectl cordon node-1',
    ]);
    const advance = [...view.querySelectorAll('button')].find((b) => b.textContent?.includes('▶'));
    act(() => {
      advance?.click();
    });
    expect(onCommand).toHaveBeenLastCalledWith('kubectl wait 5');
  });

  it('onCommand が無ければ、押しても何も起きない見るだけの図', () => {
    const view = mount(<ClusterCanvas cluster={cluster()} />);
    expect(view.querySelector('button[title^="kubectl delete"]')).toBeNull();
  });
});

describe('ネットワークの図を押すと、コマンドが端末に流れる', () => {
  it('機器を押すと ping、ケーブルを押すと抜き挿し', () => {
    resetMac();
    const net = topology(
      [
        host('pc1', [iface('eth0', '192.168.1.10', 24)]),
        router('r1', [iface('eth0', '192.168.1.1', 24)]),
      ],
      [link('pc1:eth0', 'r1:eth0')],
    );
    const onCommand = vi.fn();
    const view = mount(<PacketFlow net={net} self="pc1" onCommand={onCommand} />);
    click(view, 'button[title="ping 192.168.1.1"]');
    expect(onCommand).toHaveBeenLastCalledWith('ping 192.168.1.1');
    click(view, 'button[title="ip link set eth0 down"]');
    expect(onCommand).toHaveBeenLastCalledWith('ip link set eth0 down');
  });
});

describe('クラスタの図の作り', () => {
  it('時間を進めたあとは、配置係と見張り係が光る', () => {
    const before: ClusterState = {
      ...emptyCluster([node('node-1', 4000, 8192)]),
      deployments: new Map([['default/web', deployment('web', 2, [container('web', 'nginx')])]]),
    };
    let after = before;
    for (let i = 0; i < 3; i += 1) after = advanceCluster(after, tickPods);
    const view = mount(<ClusterCanvas cluster={after} previous={before} />);
    expect(view.querySelector('[data-part="scheduler"]')?.getAttribute('data-active')).toBe('true');
    expect(view.querySelector('[data-part="controller"]')?.getAttribute('data-active')).toBe('true');
  });

  it('持ち主の線と、Service から Endpoints の Pod への線を引く', () => {
    const state = cluster();
    const view = mount(<ClusterCanvas cluster={state} />);
    // Deployment → ReplicaSet が1本、ReplicaSet → Pod が2本
    expect(view.querySelectorAll('path[data-edge="own"]').length).toBe(3);
    expect(view.querySelectorAll('path[data-edge="serve"]').length).toBe(0);
  });

  it('Pod の状態を文字でも出す', () => {
    const view = mount(<ClusterCanvas cluster={cluster()} />);
    expect(view.textContent).toContain('Running');
  });
});
