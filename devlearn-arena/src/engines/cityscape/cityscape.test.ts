import { describe, expect, it } from 'vitest';
import { createRepo } from '@/engines/github/pr';
import { emptyCluster, node } from '@/engines/k8s/factory';
import type { ShellState } from '@/engines/kernel/registry';
import { createSession, type Session, type SessionOptions } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { host, iface, link, resetMac, router, topology } from '@/engines/net/factory';
import { translate } from '@/i18n';
import { sceneOf } from './index';
import { auditImage } from './k8s';
import type { Scene, SceneBuilding, SceneItem } from './types';

const t = (key: Parameters<typeof translate>[1], params?: Readonly<Record<string, string | number>>) => translate('ja', key, params);

function shell(options: SessionOptions) {
  let session: Session = createSession(options);
  let previous: ShellState | undefined;
  return {
    run(...lines: string[]) {
      for (const line of lines) {
        previous = session.state;
        session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
      }
    },
    get state() {
      return session.state;
    },
    get previous() {
      return previous;
    },
  };
}

const buildings = (scene: Scene): SceneBuilding[] => scene.items.filter((i): i is SceneBuilding => i.type === 'building');
const byId = (scene: Scene, id: string): SceneItem | undefined => scene.items.find((i) => i.id === id);

describe('Git の街：計画図 → 仮組み → 完成', () => {
  it('リポジトリが無ければ更地で、git init を案内する', () => {
    const sh = shell({ files: { '/home/learner': null } });
    const scene = sceneOf('git', sh.state, undefined, t);
    expect(scene.empty?.text).toContain('git init');
  });

  it('新しいファイルは計画図、add すると仮組み、commit すると完成した建物になる', () => {
    const sh = shell({ files: { '/home/learner': null } });
    sh.run('git init', 'echo hello > notes.md');
    let scene = sceneOf('git', sh.state, sh.previous, t);
    expect((byId(scene, 'file:work:notes.md') as SceneBuilding).style).toBe('blueprint');
    expect(scene.legend.map((l) => l.command)).toContain('git add <ファイル>');

    sh.run('git add notes.md');
    scene = sceneOf('git', sh.state, sh.previous, t);
    expect(byId(scene, 'file:work:notes.md')).toBeUndefined();
    const frame = byId(scene, 'file:index:notes.md') as SceneBuilding;
    expect(frame.style).toBe('frame');
    expect(frame.info.next).toContain('git commit');

    sh.run('git commit -m "first"');
    scene = sceneOf('git', sh.state, sh.previous, t);
    const done = buildings(scene).filter((b) => b.id.startsWith('commit:'));
    expect(done).toHaveLength(1);
    expect(done[0]?.style).toBe('solid');
    expect(done[0]?.changed).toBe(true);
    expect(byId(scene, 'file:index:notes.md')).toBeUndefined();
    expect(scene.stats.find((s) => s.label === '完成')?.value).toBe(1);
  });

  it('記録したファイルを書き換えると改修工事（足場）、ブランチは通りになり、市長の旗が今の通りに立つ', () => {
    const sh = shell({ files: { '/home/learner': null } });
    sh.run('git init', 'echo a > a.txt', 'git add a.txt', 'git commit -m "a"', 'git switch -c plan', 'echo b >> a.txt');
    const scene = sceneOf('git', sh.state, sh.previous, t);
    expect((byId(scene, 'file:work:a.txt') as SceneBuilding).style).toBe('scaffold');
    const plan = scene.items.find((i) => i.id === 'branch:plan');
    expect(plan?.type === 'marker' && plan.icon).toBe('🚩');
    const main = scene.items.find((i) => i.id === 'branch:main');
    expect(main?.type === 'marker' && main.icon).toBe('🪧');
  });
});

describe('Kubernetes の街：ビル・部屋・待機広場・監査局', () => {
  it('ノードはビル、Pod はビルの部屋になり、入居企業の看板が立つ', () => {
    const sh = shell({ cluster: emptyCluster([node('node-1', 4000, 8192)]), files: { '/home/learner': null } });
    sh.run('kubectl create deployment web --image=nginx:1.27.0 --replicas=2');
    sh.run('kubectl wait 15');
    const scene = sceneOf('k8s', sh.state, undefined, t);
    const building = byId(scene, 'node:node-1') as SceneBuilding;
    expect(building.rooms?.length).toBe(2);
    expect(scene.items.some((i) => i.id === 'deploy:web')).toBe(true);
    expect(scene.legend.some((l) => l.command?.startsWith('kubectl scale'))).toBe(true);
  });

  it('監査局は :latest やタグ無しのイメージを指摘する', () => {
    expect(auditImage('nginx:latest')).toBe('latest');
    expect(auditImage('nginx')).toBe('untagged');
    expect(auditImage('registry.local:5000/app')).toBe('untagged');
    expect(auditImage('nginx:1.27.0')).toBeNull();
    const sh = shell({ cluster: emptyCluster([node('node-1', 4000, 8192)]), files: { '/home/learner': null } });
    sh.run('kubectl create deployment web --image=nginx --replicas=1');
    const scene = sceneOf('k8s', sh.state, undefined, t);
    const audit = byId(scene, 'audit') as SceneBuilding;
    expect(audit.info.lines.join('')).toContain('nginx');
  });

  it('入れるビルが無い Pod は待機広場のテントになる', () => {
    const sh = shell({ cluster: emptyCluster([node('node-1', 4000, 8192)]), files: { '/home/learner': null } });
    sh.run('kubectl cordon node-1', 'kubectl create deployment web --image=nginx:1.27.0 --replicas=1');
    sh.run('kubectl wait 15');
    const scene = sceneOf('k8s', sh.state, undefined, t);
    expect(buildings(scene).some((b) => b.style === 'tent')).toBe(true);
    expect((byId(scene, 'node:node-1') as SceneBuilding).badges?.some((b) => b.icon === '🚧')).toBe(true);
  });
});

describe('シェルの街：街区と家', () => {
  it('ディレクトリは街区、ファイルは通りに面した家、いまいる場所に旗、書き込めないファイルに鍵', () => {
    const sh = shell({ files: { '/home/learner': null, '/home/learner/memo.txt': 'hi' } });
    sh.run('mkdir reports', 'touch reports/a.log', 'chmod 444 memo.txt', 'cd reports');
    const scene = sceneOf('kernel', sh.state, sh.previous, t);
    // ディレクトリごとに街区ができ、その中の区画に家が建つ
    const block = scene.plan.blocks.find((b) => b.id === 'street:/home/learner/reports');
    expect(block).toBeDefined();
    const lot = scene.plan.lots.get('file:/home/learner/reports/a.log');
    expect(lot?.district).toBe('street:/home/learner/reports');
    expect(byId(scene, 'file:/home/learner/reports/a.log')?.type).toBe('building');
    const sign = byId(scene, 'sign:/home/learner/reports');
    expect(sign?.type === 'marker' && sign.icon).toBe('🚩');
    expect((byId(scene, 'file:/home/learner/memo.txt') as SceneBuilding).badges?.some((b) => b.icon === '🔒')).toBe(true);
  });

  it('開いた街区は通りで囲まれ、どの街区も道に面する', () => {
    const sh = shell({ files: { '/home/learner': null } });
    sh.run('mkdir a', 'mkdir b', 'mkdir c', 'touch a/1.txt', 'touch b/2.txt', 'touch c/3.txt');
    const scene = sceneOf('kernel', sh.state, sh.previous, t);
    expect(scene.plan.blocks.length).toBeGreaterThanOrEqual(4);
    // 縦の通りと横の大通りの両方が通っている＝碁盤の目
    expect(scene.plan.roads.some((r) => r.axis === 'x')).toBe(true);
    expect(scene.plan.roads.some((r) => r.axis === 'y')).toBe(true);
    for (const block of scene.plan.blocks.filter((b) => b.developed)) {
      const touching = scene.plan.roads.some(
        (r) =>
          (r.axis === 'y' && (r.x + r.w === block.x || r.x === block.x + block.w)) ||
          (r.axis === 'x' && (r.y + r.d === block.y || r.y === block.y + block.d)),
      );
      expect(touching, `${block.id} が道に面していない`).toBe(true);
    }
  });
});

describe('ネットワークの街：家・郵便局・道路・郵便車', () => {
  it('ルータは郵便局、切れたリンクは通行止め、送ったパケットは道を走る', () => {
    resetMac();
    const net = topology(
      [
        host('pc1', [iface('eth0', '192.168.1.10', 24)], { routes: [{ destination: '0.0.0.0/0', via: '192.168.1.1', dev: 'eth0' }] }),
        router('gw', [iface('eth0', '192.168.1.1', 24), iface('eth1', '10.0.0.1', 24)]),
        host('web', [iface('eth0', '10.0.0.20', 24)], { routes: [{ destination: '0.0.0.0/0', via: '10.0.0.1', dev: 'eth0' }] }),
      ],
      [link('pc1:eth0', 'gw:eth0'), link('gw:eth1', 'web:eth0')],
    );
    const sh = shell({ net, vars: { NET_SELF: 'pc1' }, files: { '/home/learner': null } });
    sh.run('ping 10.0.0.20');
    const scene = sceneOf('net', sh.state, undefined, t);
    expect((byId(scene, 'device:gw') as SceneBuilding).roof).toBe('hall');
    expect((byId(scene, 'device:pc1') as SceneBuilding).badges?.some((b) => b.icon === '🚩')).toBe(true);
    expect(scene.items.some((i) => i.type === 'link' && i.flow === true)).toBe(true);
  });
});

describe('GitHub の街：建築申請', () => {
  it('リポジトリは市役所、PR は申請通りの建物、Issue は陳情の掲示板', () => {
    const sh = shell({ repo: createRepo('acme', 'app'), files: { '/home/learner': null } });
    sh.run('gh issue create -t "ボタンが押せない" -b "直して"');
    const scene = sceneOf('github', sh.state, undefined, t);
    expect(byId(scene, 'hall')?.type).toBe('building');
    expect(scene.items.some((i) => i.id.startsWith('issue:'))).toBe(true);
  });
});
