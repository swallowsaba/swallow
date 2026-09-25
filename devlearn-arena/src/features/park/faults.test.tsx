import { beforeAll, describe, expect, it } from 'vitest';
import { buildCity } from '@/city/model';
import { DISTRICT_IDS } from '@/city/growth';
import { layoutCity } from '@/city3d/model';
import { buildCityScene } from '@/city3d/scene';
import { container, deployment, emptyCluster, node, service } from '@/engines/k8s/factory';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { ShellState } from '@/engines/kernel/registry';
import { click, mount } from '@/visual/mountForTest';
import { faultsOf, troubles, type Fault, type FaultId } from './faults';
import { FaultMenu } from './hud/FaultMenu';

/**
 * 壊して直す（REWORK 4）。
 *
 * 見たいのは 3 つ。
 * 1. 出す障害が、いまの模型から導かれていること（起こせないものは理由が付く）
 * 2. 起こすコマンドが本当に通り、街が壊れた姿になること
 * 3. 直すコマンドで元に戻ること
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

/** ビル 1 棟・事務所 1 つ・バス停 1 つの Kubernetes の街 */
function town() {
  let session: Session = createSession({
    cluster: {
      ...emptyCluster([node('node-1', 2000, 4096)]),
      deployments: new Map([
        ['default/web', deployment('web', 1, [container('nginx', 'nginx:1.25')], { labels: { app: 'web' } })],
      ]),
      services: new Map([['default/web', service('web', { app: 'web' })]]),
    },
    files: { '/home/learner': null },
  });
  const run = (line: string) => {
    session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
  };
  run('kubectl wait 10');
  return {
    run,
    get state(): ShellState {
      return session.state;
    },
    faults(): Fault[] {
      return faultsOf({ cluster: session.state.cluster, net: session.state.net });
    },
    fault(id: FaultId): Fault {
      const found = this.faults().find((f) => f.id === id);
      if (found === undefined) throw new Error(`${id} が無い`);
      return found;
    },
    city() {
      return buildCity({ cluster: session.state.cluster, unlocked: DISTRICT_IDS });
    },
  };
}

const BREAKABLE: readonly FaultId[] = ['node-down', 'bad-image', 'wrong-selector'];

describe('起こせる障害を模型から導く', () => {
  it('4 つの障害が、いつも同じ並びで出る', () => {
    expect(town().faults().map((f) => f.id)).toEqual(['node-down', 'bad-image', 'wrong-selector', 'link-down']);
  });

  it('何も起きていない街では、どれも起きていない', () => {
    expect(troubles(town().faults())).toEqual([]);
  });

  it('起こせないものには理由が付く。道の無い街では道路を塞げない', () => {
    expect(town().fault('link-down').blocked).toContain('道');
    expect(town().fault('node-down').blocked).toBeNull();
  });

  it('コマンドは、いま街にあるものの名前で組み立てる', () => {
    const here = town();
    expect(here.fault('node-down').command).toBe('kubectl node-down node-1');
    expect(here.fault('node-down').fix).toBe('kubectl node-up node-1');
    expect(here.fault('wrong-selector').fix).toBe('kubectl set selector svc web app=web');
  });
});

describe('起こすと壊れ、直すと戻る', () => {
  it.each(BREAKABLE)('%s は、起こすコマンドで壊れ、直すコマンドで戻る', (id) => {
    const here = town();
    here.run(here.fault(id).command);
    here.run('kubectl wait 6');
    expect(here.fault(id).broken, `${id} が壊れていない`).toBe(true);

    here.run(here.fault(id).fix);
    here.run('kubectl wait 6');
    expect(here.fault(id).broken, `${id} が直っていない`).toBe(false);
  });

  it('道路を塞ぐのは、道のある街でできる', () => {
    const session = createSession({ files: { '/home/learner': null } });
    let state = session.state;
    for (const line of [
      'ip netns add pc1', 'ip netns add pc2',
      'ip link add eth0 type veth peer name eth0 netns pc2',
    ]) {
      state = execute(state, line, session.registry, session.clock).state;
    }
    const before = faultsOf({ net: state.net }).find((f) => f.id === 'link-down');
    if (before === undefined || before.blocked !== null) return; // 道が組めない環境では見ない
    state = execute(state, before.command, session.registry, session.clock).state;
    expect(faultsOf({ net: state.net }).find((f) => f.id === 'link-down')?.broken).toBe(true);
    state = execute(state, before.fix, session.registry, session.clock).state;
    expect(faultsOf({ net: state.net }).find((f) => f.id === 'link-down')?.broken).toBe(false);
  });
});

describe('街が目に見えて反応する', () => {
  it('停電したビルは、窓が 1 枚も灯らない', () => {
    const here = town();
    const litOf = () => {
      const scene = buildCityScene(layoutCity(here.city()));
      const lit = scene.windows.lit;
      scene.dispose();
      return lit;
    };
    const before = litOf();
    expect(before).toBeGreaterThan(0);
    here.run('kubectl node-down node-1');
    here.run('kubectl wait 6');
    expect(litOf()).toBeLessThan(before);
  });

  it('壊れた所は、街の模型で broken になる。赤い光はそこに立つ', () => {
    const here = town();
    here.run('kubectl node-down node-1');
    here.run('kubectl wait 6');
    const tower = here.city().buildings.find((b) => b.id === 'node:node-1');
    expect(tower?.state).toBe('broken');
  });

  it('停電したビルの住人は、動いているとは見せない', () => {
    const here = town();
    here.run('kubectl node-down node-1');
    here.run('kubectl wait 6');
    const tower = here.city().buildings.find((b) => b.id === 'node:node-1');
    expect(tower?.occupants.length).toBeGreaterThan(0);
    for (const one of tower?.occupants ?? []) expect(one.state).toBe('sick');
  });

  it('バス停の行き先を間違えると、そのバス停が broken になる', () => {
    const here = town();
    here.run(here.fault('wrong-selector').command);
    here.run('kubectl wait 4');
    expect(here.city().buildings.find((b) => b.id === 'svc:default/web')?.state).toBe('broken');
  });
});

describe('障害の札', () => {
  function panel(faults: readonly Fault[], healed = false) {
    const sent: string[] = [];
    const view = mount(
      <FaultMenu faults={faults} troubles={troubles(faults)} healed={healed} onCommand={(line) => sent.push(line)} />,
    );
    return { view, sent };
  }

  it('「障害を起こす」を押すと、起こせるものが並ぶ', () => {
    const { view } = panel(town().faults());
    expect(view.querySelector('[data-testid="fault-list"]')).toBeNull();
    click(view, '[data-testid="fault-open"]');
    expect([...view.querySelectorAll('[data-fault]')].map((el) => el.getAttribute('data-fault')))
      .toEqual(['node-down', 'bad-image', 'wrong-selector', 'link-down']);
  });

  it('起こせないものは押せない', () => {
    const { view } = panel(town().faults());
    click(view, '[data-testid="fault-open"]');
    expect(view.querySelector<HTMLButtonElement>('[data-fault="link-down"]')?.disabled).toBe(true);
    expect(view.querySelector<HTMLButtonElement>('[data-fault="node-down"]')?.disabled).toBe(false);
  });

  it('選ぶと、起こすコマンドが端末へ行く', () => {
    const { view, sent } = panel(town().faults());
    click(view, '[data-testid="fault-open"]');
    click(view, '[data-fault="node-down"]');
    expect(sent).toEqual(['kubectl node-down node-1']);
  });

  it('起きている間は赤い札が出る。直し方はすぐには見せない', () => {
    const here = town();
    here.run('kubectl node-down node-1');
    here.run('kubectl wait 6');
    const { view } = panel(here.faults());
    expect(view.querySelector('[data-trouble="node-down"]')).not.toBeNull();
    expect(view.querySelector('[data-testid="fault-fix-node-down"]')).toBeNull();
    click(view, '[data-testid="fault-tell"]');
    expect(view.querySelector('[data-testid="fault-fix-node-down"]')?.textContent).toBe('kubectl node-up node-1');
  });

  it('直し方を押すと、直すコマンドが端末へ行く', () => {
    const here = town();
    here.run('kubectl node-down node-1');
    here.run('kubectl wait 6');
    const { view, sent } = panel(here.faults());
    click(view, '[data-testid="fault-tell"]');
    click(view, '[data-testid="fault-fix-node-down"]');
    expect(sent).toEqual(['kubectl node-up node-1']);
  });

  it('直ると「直った」と出る', () => {
    const { view } = panel(town().faults(), true);
    expect(view.querySelector('[data-testid="fault-healed"]')).not.toBeNull();
  });

  it('障害を起こしたことが無ければ、直ったとは言わない', () => {
    const { view } = panel(town().faults());
    expect(view.querySelector('[data-testid="fault-healed"]')).toBeNull();
  });
});

describe('街の押しても壊れない所', () => {
  it('同じ模型からは必ず同じ障害の一覧になる', () => {
    const a = town();
    const b = town();
    expect(a.faults()).toEqual(b.faults());
  });

  it('壊した後にもう一度押せないようにする', () => {
    const here = town();
    here.run('kubectl node-down node-1');
    here.run('kubectl wait 6');
    const sent: string[] = [];
    const view = mount(
      <FaultMenu
        faults={here.faults()}
        troubles={troubles(here.faults())}
        healed={false}
        onCommand={(line) => sent.push(line)}
      />,
    );
    click(view, '[data-testid="fault-open"]');
    expect(view.querySelector<HTMLButtonElement>('[data-fault="node-down"]')?.disabled).toBe(true);
  });
});
