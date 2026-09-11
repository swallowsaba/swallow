import { describe, expect, it } from 'vitest';
import { createRepo } from '@/engines/github/pr';
import { emptyCluster, node } from '@/engines/k8s/factory';
import { host, iface, link, resetMac, router, topology } from '@/engines/net/factory';
import { createSession, type Session, type SessionOptions } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { gitCommands, k8sCommands, linkIsUp, netCommands, nextTryBranch, prCommands } from './commands';

/** 図が作ったコマンドを、端末と同じ道筋で実際に打つ */
function shell(options: SessionOptions) {
  let session: Session = createSession(options);
  return {
    run(line: string): { out: string; code: number } {
      const outcome = execute(session.state, line, session.registry, session.clock);
      session = { ...session, state: outcome.state };
      return { out: outcome.chunks.map((c) => c.text).join(''), code: outcome.exitCode };
    },
    get state() {
      return session.state;
    },
  };
}

describe('クラスタの図から打つコマンド', () => {
  const make = () => {
    const sh = shell({ cluster: emptyCluster([node('node-1', 4000, 8192)]), files: { '/home/learner': null } });
    sh.run('kubectl create deployment web --image=nginx --replicas=2');
    sh.run(k8sCommands.advance());
    sh.run(k8sCommands.advance());
    return sh;
  };

  it('± で数が変わる', () => {
    const sh = make();
    expect(sh.run(k8sCommands.scale('web', 3)).code).toBe(0);
    expect(sh.state.cluster?.deployments.get('default/web')?.spec.replicas).toBe(3);
    expect(k8sCommands.scale('web', -1)).toBe('kubectl scale deploy web --replicas=0');
  });

  it('Pod を見る・消すが通る', () => {
    const sh = make();
    const name = [...(sh.state.cluster?.pods.values() ?? [])][0]?.metadata.name ?? '';
    expect(sh.run(k8sCommands.describePod(name)).code).toBe(0);
    expect(sh.run(k8sCommands.deletePod(name)).code).toBe(0);
    expect(sh.state.cluster?.pods.has(`default/${name}`)).toBe(false);
  });

  it('⏸ で置かない印を付け、もう一度押すと外す', () => {
    const sh = make();
    sh.run(k8sCommands.toggleCordon('node-1', false));
    expect(sh.state.cluster?.nodes.get('node-1')?.spec.unschedulable).toBe(true);
    sh.run(k8sCommands.toggleCordon('node-1', true));
    expect(sh.state.cluster?.nodes.get('node-1')?.spec.unschedulable).toBe(false);
  });
});

describe('履歴の図から打つコマンド', () => {
  it('コミットを見る・ブランチを切り替える・分岐する', () => {
    const sh = shell({ files: { '/home/learner': null, '/home/learner/a.txt': 'A\n' } });
    sh.run('git init');
    sh.run('git add .');
    sh.run('git commit -m first');
    const head = sh.run('git rev-parse HEAD').out.trim();
    expect(sh.run(gitCommands.show(head)).out).toContain('first');
    expect(sh.run(gitCommands.branchOut(['main'])).code).toBe(0);
    expect(sh.run('git branch').out).toContain('* try-1');
    expect(sh.run(gitCommands.switchTo('main')).code).toBe(0);
    expect(sh.run('git branch').out).toContain('* main');
  });

  it('分岐の名前は既にあるものとぶつからない', () => {
    expect(nextTryBranch(['main'])).toBe('try-1');
    expect(nextTryBranch(['main', 'try-1', 'try-2'])).toBe('try-3');
  });
});

describe('ネットワークの図から打つコマンド', () => {
  const make = () => {
    resetMac();
    const pc1 = host('pc1', [iface('eth0', '192.168.1.10', 24)], {
      routes: [{ destination: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }],
    });
    const r1 = router('r1', [iface('eth0', '192.168.1.1', 24), iface('eth1', '10.0.0.1', 24)]);
    const web = host('web', [iface('eth0', '10.0.0.20', 24)], {
      routes: [{ destination: '0.0.0.0/0', via: '10.0.0.1', dev: 'eth0' }],
    });
    const net = topology([pc1, r1, web], [link('pc1:eth0', 'r1:eth0'), link('r1:eth1', 'web:eth0')]);
    return shell({ net, vars: { NET_SELF: 'pc1' } });
  };

  it('機器をクリックすると、そこへ ping が届き、通った道筋が残る', () => {
    const sh = make();
    const line = netCommands.pingTo(sh.state.net ?? topology([], []), 'web');
    expect(line).toBe('ping 10.0.0.20');
    expect(sh.run(line ?? '').code).toBe(0);
    expect(sh.state.net?.trace?.path).toEqual(['pc1', 'r1', 'web']);
    expect(sh.state.net?.trace?.delivered).toBe(true);
  });

  it('自分のケーブルは ip link set で抜き挿しする', () => {
    const sh = make();
    const first = sh.state.net?.links[0];
    if (!first || !sh.state.net) throw new Error('構成がありません');
    const cut = netCommands.toggleLink(sh.state.net, first, 'pc1');
    expect(cut).toBe('ip link set eth0 down');
    sh.run(cut);
    const net = sh.state.net;
    expect(linkIsUp(net, first)).toBe(false);
    expect(sh.run('ping 10.0.0.20').code).toBe(1);
    sh.run(netCommands.toggleLink(net, first, 'pc1'));
    expect(sh.run('ping 10.0.0.20').code).toBe(0);
  });

  it('ほかの機器のケーブルは netlab cable で抜き挿しする', () => {
    const sh = make();
    const far = sh.state.net?.links[1];
    if (!far || !sh.state.net) throw new Error('構成がありません');
    const cut = netCommands.toggleLink(sh.state.net, far, 'pc1');
    expect(cut).toBe('netlab cable down r1:eth1 web:eth0');
    expect(sh.run(cut).code).toBe(0);
    expect(sh.run('ping 10.0.0.20').code).toBe(1);
    expect(sh.state.net?.trace?.delivered).toBe(false);
  });
});

describe('Pull Request の図から打つコマンド', () => {
  it('承認と直してほしいが付けられる', () => {
    const sh = shell({ repo: createRepo('acme', 'app'), files: { '/home/learner': null } });
    sh.run('gh pr create -t "機能追加" -b feature');
    expect(sh.run(prCommands.view(1)).code).toBe(0);
    expect(sh.run(prCommands.approve(1)).code).toBe(0);
    expect(sh.state.repo?.pulls[0]?.reviews[0]?.state).toBe('approved');
    expect(prCommands.requestChanges(1)).toBe('gh pr review 1 --request-changes');
    expect(prCommands.checks(1)).toBe('gh pr checks 1');
  });
});
