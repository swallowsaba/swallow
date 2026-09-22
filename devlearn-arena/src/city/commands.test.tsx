import { describe, expect, it } from 'vitest';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { container, deployment, emptyCluster, node, pod } from '@/engines/k8s/factory';
import type { ClusterState, Pod } from '@/engines/k8s/types';
import { key } from '@/engines/k8s/types';
import { host, iface, link, topology } from '@/engines/net/factory';
import { click, mount } from '@/visual/mountForTest';
import { CityCanvas } from './CityCanvas';
import { buildCity, type Building, type City } from './model';
import { DISTRICT_IDS } from './growth';

const ALL = DISTRICT_IDS;

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

/** 街を描いて、押したときに端末へ送られた行を集める */
function open(city: City) {
  const sent: string[] = [];
  const view = mount(<CityCanvas city={city} animate={false} onCommand={(line) => sent.push(line)} />);
  return { view, sent };
}

const cluster = () => ({
  ...place(emptyCluster([node('n1', 4000, 8192)]), [pod('web', [container('c', 'nginx')])], 'n1'),
  tick: 9,
});

const find = (city: City, id: string): Building | undefined => city.buildings.find((b) => b.id === id);

describe('街から操作する', () => {
  it('高層ビル（ノード）を押すと、そのノードを調べるコマンドが端末へ行く', () => {
    const { view, sent } = open(buildCity({ cluster: cluster(), unlocked: ALL }));
    click(view, '[data-building="node:n1"]');
    expect(sent).toEqual(['kubectl describe node n1']);
  });

  it('ビルの停止の印で、新しい住人を受け入れなくする', () => {
    const { view, sent } = open(buildCity({ cluster: cluster(), unlocked: ALL }));
    click(view, '[data-building="node:n1"] [data-handle="stop"]');
    expect(sent).toEqual(['kubectl cordon n1']);
  });

  it('住人（Pod）を押すと様子を調べ、× で出ていってもらう', () => {
    const { view, sent } = open(buildCity({ cluster: cluster(), unlocked: ALL }));
    click(view, '[data-resident="pod:default/web"]');
    click(view, '[data-resident-actions="pod:default/web"] [data-handle="close"]');
    expect(sent).toEqual(['kubectl describe pod web', 'kubectl delete pod web']);
  });

  it('建設会社の ＋ と − で、募集する人数を増やし減らしする', () => {
    const deploy = deployment('web', 2, [container('c', 'nginx')]);
    const state: ClusterState = {
      ...emptyCluster([node('n1', 4000, 8192)]),
      tick: 9,
      deployments: new Map([[key('default', 'web'), deploy]]),
    };
    const { view, sent } = open(buildCity({ cluster: state, unlocked: ALL }));
    click(view, '[data-building="deploy:default/web"] [data-handle="plus"]');
    click(view, '[data-building="deploy:default/web"] [data-handle="minus"]');
    expect(sent).toEqual(['kubectl scale deploy web --replicas=3', 'kubectl scale deploy web --replicas=1']);
  });

  it('記念碑を押すとそのコミットを見て、旗を押すとその通りへ移る', () => {
    const sh = shell({ '/home/learner': null, '/home/learner/a.txt': 'A\n' })
      .run('cd /home/learner')
      .run('git init')
      .run('git add a.txt')
      .run('git commit -m first');
    const city = buildCity({ git: sh.state.git, unlocked: ALL });
    const monument = city.buildings.find((b) => b.kind === 'monument');
    const { view, sent } = open(city);
    click(view, `[data-building="${String(monument?.id)}"]`);
    click(view, '[data-building="branch:main"]');
    expect(sent[0]).toMatch(/^git show [0-9a-f]{7}$/);
    expect(sent[1]).toBe('git switch main');
  });

  it('小屋の「運ぶ」印で、ファイルが倉庫（index）へ行く', () => {
    const sh = shell({ '/home/learner': null, '/home/learner/a.txt': 'A\n' }).run('cd /home/learner').run('git init');
    const city = buildCity({ vfs: sh.state.vfs, git: sh.state.git, unlocked: ALL });
    const { view, sent } = open(city);
    click(view, '[data-building="file:/home/learner/a.txt"] [data-handle="send"]');
    expect(sent).toEqual(['git add a.txt']);
  });

  it('道路を押すとケーブルを落とし、施設を押すと荷物を送る', () => {
    const net = topology(
      [host('pc1', [iface('eth0', '10.0.0.10', 24)]), host('pc2', [iface('eth0', '10.0.0.11', 24)])],
      [link('pc1:eth0', 'pc2:eth0')],
    );
    const city = buildCity({ net, unlocked: ALL });
    const { view, sent } = open(city);
    click(view, '[data-building="dev:pc1"]');
    click(view, '[data-road]');
    expect(sent[0]).toBe('ping pc1');
    expect(sent[1]).toBe('ip link set eth0 down');
  });

  it('なぜそのコマンドなのかが、押した直後に一行だけ出る', () => {
    const city = buildCity({ cluster: cluster(), unlocked: ALL });
    const { view } = open(city);
    expect(view.querySelector('[data-testid="city-why"]')).toBeNull();
    click(view, '[data-building="node:n1"]');
    expect(view.querySelector('[data-testid="city-why"]')?.textContent).toBe(find(city, 'node:n1')?.why);
  });

  it('押せない建物には、押すための役目を付けない', () => {
    const city = buildCity({ unlocked: ALL });
    expect(city.buildings.filter((b) => b.command === undefined)).toEqual([]);
  });
});
