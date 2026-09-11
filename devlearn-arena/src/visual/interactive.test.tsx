import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { advanceCluster } from '@/engines/k8s/controllers';
import { container, deployment, emptyCluster, node } from '@/engines/k8s/factory';
import { tickPods } from '@/engines/k8s/kubelet';
import type { ClusterState } from '@/engines/k8s/types';
import { host, iface, link, resetMac, router, topology } from '@/engines/net/factory';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { ClusterCanvas } from './ClusterCanvas';
import { CommitGraph } from './CommitGraph';
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

describe('履歴の図の作り', () => {
  function repo(lines: readonly string[]) {
    let session = createSession({ files: { '/home/learner': null, '/home/learner/a.txt': 'A\n', '/home/learner/b.txt': 'B\n' } });
    for (const line of lines) {
      session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
    }
    return session.state;
  }

  it('add したファイルは真ん中の面、まだのファイルは左の面に立つ', () => {
    const state = repo(['git init', 'git add a.txt']);
    const view = mount(<CommitGraph git={state.git} vfs={state.vfs} />);
    expect(view.querySelector('[data-lane="index"]')?.textContent).toContain('a.txt');
    expect(view.querySelector('[data-lane="worktree"]')?.textContent).toContain('b.txt');
    expect(view.querySelector('[data-lane="head"]')?.textContent).not.toContain('a.txt');
  });

  it('分岐したコミットは別の列に描かれ、HEAD の札は今のブランチの先頭に付く', () => {
    const state = repo([
      'git init', 'git add .', 'git commit -m base',
      'git switch -c feature', 'echo f > b.txt', 'git add .', 'git commit -m f',
      'git switch main', 'echo m > a.txt', 'git add .', 'git commit -m m',
    ]);
    const onCommand = vi.fn();
    const view = mount(<CommitGraph git={state.git} vfs={state.vfs} onCommand={onCommand} />);
    const cols = new Set([...view.querySelectorAll('circle')].map((c) => c.getAttribute('data-col')));
    expect(cols).toEqual(new Set(['0', '1']));
    expect(view.querySelector('[data-head="true"]')?.textContent).toContain('main');
    click(view, 'button[title="git switch feature"]');
    expect(onCommand).toHaveBeenLastCalledWith('git switch feature');
  });
});

describe('履歴の図が変化を見せる', () => {
  function run(lines: readonly string[]) {
    let session = createSession({ files: { '/home/learner': null, '/home/learner/a.txt': 'A\n', '/home/learner/b.txt': 'B\n' } });
    const states = [session.state];
    for (const line of lines) {
      session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
      states.push(session.state);
    }
    return states;
  }

  it('rebase のあとは、元のコミットを点線で残し、複製への線と説明を出す', () => {
    const states = run([
      'git init', 'git add .', 'git commit -m base',
      'git switch -c feature', 'echo f > b.txt', 'git add .', 'git commit -m f1',
      'git switch main', 'echo m > a.txt', 'git add .', 'git commit -m m1',
      'git switch feature', 'git rebase main',
    ]);
    const before = states[states.length - 2];
    const after = states[states.length - 1];
    const view = mount(<CommitGraph git={after?.git ?? null} previous={before?.git} vfs={after?.vfs} />);
    expect(view.querySelectorAll('circle[data-ghost="true"]').length).toBe(1);
    expect(view.querySelectorAll('path[data-copy]').length).toBe(1);
    expect(view.querySelector('[data-testid="rebase-note"]')).not.toBeNull();
    expect(view.querySelector('button[data-moved="true"]')?.textContent).toBe('feature');
  });

  it('コミットしたら新しいコミットが光る', () => {
    const states = run(['git init', 'git add .', 'git commit -m base', 'echo x > a.txt', 'git add .', 'git commit -m next']);
    const view = mount(<CommitGraph git={states[6]?.git ?? null} previous={states[5]?.git} />);
    expect(view.querySelectorAll('circle[data-glow="true"]').length).toBe(1);
    expect(view.querySelector('[data-testid="rebase-note"]')).toBeNull();
  });
});
