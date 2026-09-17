import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { advanceCluster } from '@/engines/k8s/controllers';
import { container, deployment, emptyCluster, node, service } from '@/engines/k8s/factory';
import { tickPods } from '@/engines/k8s/kubelet';
import type { ClusterState } from '@/engines/k8s/types';
import { createRepo, openPull, setChecks } from '@/engines/github/pr';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { ShellState } from '@/engines/kernel/registry';
import { createVfs } from '@/engines/kernel/vfs';
import { host, iface, link, resetMac, router, topology } from '@/engines/net/factory';
import { ViewModeSwitch, WorldView } from '@/features/park/WorldView';
import { useStore } from '@/store';
import { click, mount, rerender } from '../mountForTest';
import { FsGame } from './FsGame';
import { GhGame } from './GhGame';
import { GitGame } from './GitGame';
import { K8sGame } from './K8sGame';
import { NetGame } from './NetGame';

const button = (command: string) => `[role="button"][aria-label="${command}"]`;

function shell(lines: readonly string[], options: Parameters<typeof createSession>[0] = {}): ShellState[] {
  let session = createSession({ files: { '/home/learner': null, '/home/learner/a.txt': 'A\n', '/home/learner/b.txt': 'B\n' }, ...options });
  const states = [session.state];
  for (const line of lines) {
    session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
    states.push(session.state);
  }
  return states;
}

describe('ファイルの街', () => {
  const vfs = createVfs({
    '/home/learner': null,
    '/home/learner/notes.txt': 'a\n',
    '/home/learner/work': null,
    '/etc/hosts': '127.0.0.1 localhost\n',
  });

  it('家を押すと cd、木箱を押すと cat が端末に流れる', () => {
    const onCommand = vi.fn();
    const view = mount(<FsGame vfs={vfs} cwd="/home/learner" onCommand={onCommand} />);
    click(view, button('cd /home/learner/work'));
    expect(onCommand).toHaveBeenLastCalledWith('cd /home/learner/work');
    click(view, button('cat /etc/hosts'));
    expect(onCommand).toHaveBeenLastCalledWith('cat /etc/hosts');
  });

  it('主人公はいまいる家に立ち、cd すると移る', () => {
    const view = mount(<FsGame vfs={vfs} cwd="/home/learner" />);
    expect(view.querySelector('[data-testid="hero"]')?.getAttribute('data-at')).toBe('/home/learner');
    expect(view.querySelector('[data-house="/home/learner"]')?.getAttribute('data-here')).toBe('true');
    rerender(view, <FsGame vfs={vfs} cwd="/etc" />);
    expect(view.querySelector('[data-testid="hero"]')?.getAttribute('data-at')).toBe('/etc');
    expect(view.querySelector('[data-house="/etc"]')?.getAttribute('data-here')).toBe('true');
  });

  it('増えたファイルの木箱は光る', () => {
    const after = createVfs({
      '/home/learner': null,
      '/home/learner/notes.txt': 'a\n',
      '/home/learner/new.txt': 'x',
      '/home/learner/work': null,
      '/etc/hosts': '127.0.0.1 localhost\n',
    });
    const view = mount(<FsGame vfs={after} previous={vfs} cwd="/home/learner" />);
    expect(view.querySelector('[data-file="/home/learner/new.txt"]')?.getAttribute('data-glow')).toBe('true');
    expect(view.querySelector('[data-file="/home/learner/notes.txt"]')?.getAttribute('data-glow')).toBe('false');
  });

  it('onCommand が無ければ押せる部品は無い', () => {
    const view = mount(<FsGame vfs={vfs} cwd="/home/learner" />);
    expect(view.querySelector('[role="button"]')).toBeNull();
  });
});

describe('記録の鉄道', () => {
  it('リポジトリが無ければ、git init を案内する', () => {
    const view = mount(<GitGame git={null} />);
    expect(view.textContent).toContain('git init');
  });

  it('add した木箱は荷台、まだの木箱は作業場の前にあり、押すと add / restore --staged', () => {
    const states = shell(['git init', 'git add a.txt']);
    const state = states[states.length - 1];
    const onCommand = vi.fn();
    const view = mount(<GitGame git={state?.git ?? null} vfs={state?.vfs} cwd="/home/learner" onCommand={onCommand} />);
    expect(view.querySelector('[data-file="a.txt"]')?.getAttribute('data-lane')).toBe('index');
    expect(view.querySelector('[data-file="b.txt"]')?.getAttribute('data-lane')).toBe('worktree');
    click(view, button('git restore --staged a.txt'));
    expect(onCommand).toHaveBeenLastCalledWith('git restore --staged a.txt');
    click(view, button('git add b.txt'));
    expect(onCommand).toHaveBeenLastCalledWith('git add b.txt');
  });

  it('分かれた駅は別の列にでき、旗を押すと switch、駅を押すと show', () => {
    const states = shell([
      'git init', 'git add .', 'git commit -m base',
      'git switch -c feature', 'echo f > b.txt', 'git add .', 'git commit -m f',
      'git switch main', 'echo m > a.txt', 'git add .', 'git commit -m m',
    ]);
    const state = states[states.length - 1];
    const onCommand = vi.fn();
    const view = mount(<GitGame git={state?.git ?? null} vfs={state?.vfs} onCommand={onCommand} />);
    const cols = new Set([...view.querySelectorAll('[data-commit]')].map((c) => c.getAttribute('data-col')));
    expect(cols).toEqual(new Set(['0', '1']));
    expect(view.querySelector('[data-testid="game-head"]')?.textContent).toContain('main');
    click(view, button('git switch feature'));
    expect(onCommand).toHaveBeenLastCalledWith('git switch feature');
    const first = view.querySelector('[data-commit]')?.getAttribute('data-commit') ?? '';
    click(view, button(`git show ${first}`));
    expect(onCommand).toHaveBeenLastCalledWith(`git show ${first}`);
  });

  it('rebase のあとは、元の駅を薄く残して複製への線と説明を出す', () => {
    const states = shell([
      'git init', 'git add .', 'git commit -m base',
      'git switch -c feature', 'echo f > b.txt', 'git add .', 'git commit -m f1',
      'git switch main', 'echo m > a.txt', 'git add .', 'git commit -m m1',
      'git switch feature', 'git rebase main',
    ]);
    const before = states[states.length - 2];
    const after = states[states.length - 1];
    const view = mount(<GitGame git={after?.git ?? null} previous={before?.git} vfs={after?.vfs} />);
    expect(view.querySelectorAll('[data-ghost="true"]').length).toBe(1);
    expect(view.querySelectorAll('path[data-copy]').length).toBe(1);
    expect(view.querySelector('[data-testid="rebase-note"]')).not.toBeNull();
    expect(view.querySelector('[data-branch="feature"]')?.getAttribute('data-moved')).toBe('true');
  });
});

describe('クラスタ牧場', () => {
  function cluster(): ClusterState {
    let state: ClusterState = {
      ...emptyCluster([node('node-1', 4000, 8192)]),
      deployments: new Map([['default/web', deployment('web', 2, [container('web', 'nginx')])]]),
      services: new Map([['default/web', service('web', { app: 'web' })]]),
    };
    for (let i = 0; i < 10; i += 1) state = advanceCluster(state, tickPods);
    return state;
  }

  it('スライムを押すと describe、× で delete、門で cordon、± で scale', () => {
    const onCommand = vi.fn();
    const state = cluster();
    const name = [...state.pods.values()][0]?.metadata.name ?? '';
    const view = mount(<K8sGame cluster={state} onCommand={onCommand} />);
    click(view, button(`kubectl describe pod ${name}`));
    click(view, button(`kubectl delete pod ${name}`));
    click(view, button('kubectl cordon node-1'));
    click(view, button('kubectl scale deploy web --replicas=3'));
    expect(onCommand.mock.calls.map((c) => c[0] as string)).toEqual([
      `kubectl describe pod ${name}`,
      `kubectl delete pod ${name}`,
      'kubectl cordon node-1',
      'kubectl scale deploy web --replicas=3',
    ]);
    const advance = [...view.querySelectorAll('button')].find((b) => b.title === 'kubectl wait 5');
    act(() => {
      advance?.click();
    });
    expect(onCommand).toHaveBeenLastCalledWith('kubectl wait 5');
  });

  it('スライムの状態を文字でも出し、窓口から Endpoints のスライムにだけ綱を張る', () => {
    const state = cluster();
    const view = mount(<K8sGame cluster={state} />);
    expect(view.textContent).toContain('Running');
    const ropes = view.querySelectorAll('[data-service="web"] path[data-rope]');
    expect(ropes.length).toBe(state.services.get('default/web')?.status.endpoints.length);
    expect(ropes.length).toBeGreaterThan(0);
  });

  it('時間を進めたあとは、配置係と見張り係が「！」を出す', () => {
    const before: ClusterState = {
      ...emptyCluster([node('node-1', 4000, 8192)]),
      deployments: new Map([['default/web', deployment('web', 2, [container('web', 'nginx')])]]),
    };
    let after = before;
    for (let i = 0; i < 3; i += 1) after = advanceCluster(after, tickPods);
    const view = mount(<K8sGame cluster={after} previous={before} />);
    expect(view.querySelector('[data-part="scheduler"]')?.getAttribute('data-active')).toBe('true');
    expect(view.querySelector('[data-part="controller"]')?.getAttribute('data-active')).toBe('true');
    expect(view.querySelector('[data-part="scheduler"]')?.textContent).toContain('！');
  });

  it('cordon した土地は門が閉じる', () => {
    const state = cluster();
    const nodeState = state.nodes.get('node-1');
    if (!nodeState) throw new Error('node-1 がありません');
    const closed: ClusterState = {
      ...state,
      nodes: new Map([['node-1', { ...nodeState, spec: { ...nodeState.spec, unschedulable: true } }]]),
    };
    const onCommand = vi.fn();
    const view = mount(<K8sGame cluster={closed} onCommand={onCommand} />);
    expect(view.querySelector('[data-node="node-1"]')?.getAttribute('data-cordoned')).toBe('true');
    click(view, button('kubectl uncordon node-1'));
    expect(onCommand).toHaveBeenLastCalledWith('kubectl uncordon node-1');
  });
});

describe('手紙の街道', () => {
  function lab() {
    resetMac();
    return topology(
      [
        host('pc1', [iface('eth0', '192.168.1.10', 24)], {
          routes: [{ destination: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
        }),
        router('gw', [iface('eth0', '192.168.1.1', 24), iface('eth1', '10.0.0.1', 24)]),
        host('web', [iface('eth0', '10.0.0.20', 24)], {
          routes: [{ destination: '0.0.0.0/0', via: '10.0.0.1', dev: 'eth0' }],
          listening: [80],
        }),
      ],
      [link('pc1:eth0', 'gw:eth0'), link('gw:eth1', 'web:eth0')],
      { 'web.internal': '10.0.0.20' },
    );
  }

  it('建物を押すと ping、道を押すと切る、旗で操作する機器を変える', () => {
    const onCommand = vi.fn();
    const view = mount(<NetGame net={lab()} self="pc1" onCommand={onCommand} />);
    click(view, button('ping 192.168.1.1'));
    expect(onCommand).toHaveBeenLastCalledWith('ping 192.168.1.1');
    click(view, button('ip link set eth0 down'));
    expect(onCommand).toHaveBeenLastCalledWith('ip link set eth0 down');
    click(view, button('export NET_SELF=web'));
    expect(onCommand).toHaveBeenLastCalledWith('export NET_SELF=web');
    expect(view.querySelector('[data-device="pc1"]')?.getAttribute('data-self')).toBe('true');
  });

  it('届かなかったら、止まった建物で理由を言う。手紙を押すとヘッダが見える', () => {
    const states = shell(['curl http://10.0.0.20:8080/'], { net: lab(), vars: { NET_SELF: 'pc1' }, files: { '/home/learner': null } });
    const net = states[states.length - 1]?.net ?? null;
    const view = mount(<NetGame net={net} self="pc1" />);
    expect(view.querySelector('[data-testid="headers"]')).toBeNull();
    click(view, '[data-testid="packet"]');
    expect(view.querySelector('[data-testid="headers"]')).not.toBeNull();
    click(view, 'button[data-hop="2"]');
    expect(view.querySelector('[data-device="web"]')?.getAttribute('data-stopped')).toBe('true');
    expect(view.querySelector('[data-testid="stop-reason"]')?.textContent).toContain('Connection refused');
  });

  it('切れたケーブルの道は通行止めになる', () => {
    const states = shell(['ip link set eth0 down'], { net: lab(), vars: { NET_SELF: 'pc1' }, files: { '/home/learner': null } });
    const view = mount(<NetGame net={states[1]?.net ?? null} self="pc1" />);
    expect(view.querySelector('[data-link="pc1:eth0-gw:eth0"]')?.getAttribute('data-up')).toBe('false');
  });
});

describe('チーム本部', () => {
  function repo() {
    const opened = openPull(createRepo('acme', 'app'), { title: 'feat', head: 'feature' }).repo;
    return setChecks(opened, 1, [
      { name: 'build', status: 'failure', needs: [], logs: [] },
      { name: 'test', status: 'skipped', needs: ['build'], logs: [] },
    ]);
  }

  it('関所を押すとその段のコマンド、部屋を押すと checks', () => {
    const onCommand = vi.fn();
    const view = mount(<GhGame repo={repo()} onCommand={onCommand} />);
    click(view, button('gh pr review 1 --approve'));
    expect(onCommand).toHaveBeenLastCalledWith('gh pr review 1 --approve');
    click(view, button('gh pr view 1'));
    expect(onCommand).toHaveBeenLastCalledWith('gh pr view 1');
    click(view, '[data-job="build"]');
    expect(onCommand).toHaveBeenLastCalledWith('gh pr checks 1');
  });

  it('失敗した部屋の先の部屋には × が付き、チェックの関所は止まっている', () => {
    const view = mount(<GhGame repo={repo()} />);
    expect(view.querySelector('[data-job="test"]')?.getAttribute('data-blocked')).toBe('true');
    expect(view.querySelector('[data-job="test"] [data-cross="true"]')).not.toBeNull();
    expect(view.querySelector('[data-stage="checks"]')?.getAttribute('data-state')).toBe('bad');
  });

  it('リポジトリが無ければ案内を出す', () => {
    const view = mount(<GhGame repo={null} />);
    expect(view.querySelector('[data-testid="game-gh"]')).not.toBeNull();
  });
});

describe('ゲームと図の切り替え', () => {
  it('既定はゲーム。切り替えると同じ状態を図で見せ、設定に残る', () => {
    act(() => {
      useStore.getState().updateSettings({ visualMode: 'game' });
    });
    const states = shell([]);
    const state = states[0];
    if (!state) throw new Error('状態がありません');
    const view = mount(
      <div>
        <ViewModeSwitch />
        <WorldView tab="fs" state={state} previous={undefined} onCommand={vi.fn()} />
      </div>,
    );
    expect(view.querySelector('[data-testid="game-fs"]')).not.toBeNull();
    click(view, 'button[data-mode="diagram"]');
    expect(useStore.getState().settings.visualMode).toBe('diagram');
    expect(view.querySelector('[data-testid="game-fs"]')).toBeNull();
    expect(view.querySelector('[data-testid="fs-tree"]')).not.toBeNull();
    click(view, 'button[data-mode="game"]');
    expect(view.querySelector('[data-testid="game-fs"]')).not.toBeNull();
  });
});
