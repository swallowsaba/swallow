import { describe, expect, it } from 'vitest';
import { createSession, type Session } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { emptyCluster, node } from '@/engines/k8s/factory';
import type { ShellState } from '@/engines/kernel/registry';
import { buildCity } from './model';
import { DISTRICT_IDS } from './growth';
import { CARGO_SHAPES, journeyOf, wordsOf, type Journey, type WorldState } from './journey';

/**
 * 旅路は台本ではない。打つ前と打った後の模型を見比べて導く（REWORK 2-5）。
 * ここでは本物のシェルを動かし、停留所の列が状態の変わり方と一致するかを見る。
 */

const ALL = DISTRICT_IDS;

/** Kubernetes の街。ビルが 2 棟建っている所から始める */
function arena() {
  let session: Session = createSession({
    cluster: emptyCluster([node('n1', 4000, 8192), node('n2', 4000, 8192)]),
    files: { '/home/learner': null },
  });
  return {
    get state(): ShellState {
      return session.state;
    },
    /** 1 行打ち、打つ前と後の状態を返す */
    run(line: string) {
      const before = session.state;
      session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
      return { before, after: session.state };
    },
  };
}

function world(state: ShellState): WorldState {
  return { vfs: state.vfs, git: state.git, cluster: state.cluster, net: state.net, repo: state.repo };
}

/** その 1 行を打ったときの旅。街は打った後の姿から組む */
function travel(shell: ReturnType<typeof arena>, line: string, serial = 1): Journey | null {
  const { before, after } = shell.run(line);
  const city = buildCity({ vfs: after.vfs, git: after.git, cluster: after.cluster, unlocked: ALL });
  return journeyOf({ command: line, before: world(before), after: world(after), city, serial });
}

const stopsOf = (journey: Journey | null): string[] => (journey?.stops ?? []).map((s) => s.building);

describe('コマンドを語に割る', () => {
  it('1 行目だけを見る', () => {
    expect(wordsOf('git add README.md\n次の行')).toEqual(['git', 'add', 'README.md']);
  });

  it('空白だけの行は語にならない', () => {
    expect(wordsOf('   ')).toEqual([]);
  });
});

describe('Kubernetes の旅路は、状態の変わり方から導く', () => {
  it('Pod を頼むと、窓口 → 台帳 → 配置係の待合 まで進む', () => {
    const shell = arena();
    const journey = travel(shell, 'kubectl run web --image=nginx');
    // この時点ではまだ行き先が決まっていない。決まっていないのに決まったとは見せない
    expect(stopsOf(journey)).toEqual(['cp:api', 'cp:store', 'cp:scheduler']);
    expect(journey?.stops[2]?.label).toContain('Pending');
  });

  it('時間が進んで行き先が決まると、配置係からビルへ旅が続く', () => {
    const shell = arena();
    travel(shell, 'kubectl run web --image=nginx');
    const journey = travel(shell, 'kubectl wait 5', 2);
    const stops = stopsOf(journey);
    expect(stops).toContain('cp:scheduler');
    expect(stops).toContain('node:n1');
    expect(journey?.stops.find((s) => s.building === 'cp:scheduler')?.label).toContain('web');
    expect(journey?.stops.find((s) => s.building === 'node:n1')?.label).toContain('入居');
  });

  it('何も変えない問い合わせは、窓口と台帳を読んで帰る', () => {
    const shell = arena();
    const journey = travel(shell, 'kubectl get nodes');
    expect(stopsOf(journey)).toEqual(['cp:api', 'cp:store']);
    expect(journey?.stops[1]?.label).toContain('読み上げた');
  });

  it('作ったあと消すと、行きと帰りで停留所が変わる', () => {
    const shell = arena();
    travel(shell, 'kubectl run web --image=nginx');
    travel(shell, 'kubectl wait 5', 2);
    const gone = travel(shell, 'kubectl delete pod web', 3);
    expect(stopsOf(gone)).toEqual(['cp:api', 'cp:store', 'node:n1']);
    expect(gone?.stops[2]?.label).toContain('出ていった');
  });

  it('Deployment に頼むと、事務所に注文が残る。監督が動くのはその後', () => {
    const shell = arena();
    const order = travel(shell, 'kubectl create deployment web --image=nginx');
    expect(stopsOf(order)).toEqual(['cp:api', 'cp:store', 'deploy:default/web']);
    const worked = travel(shell, 'kubectl wait 5', 2);
    expect(stopsOf(worked)).toContain('cp:controller');
    expect(worked?.stops.find((s) => s.building === 'cp:controller')?.label).toContain('見比べ');
  });

  it('住人が動き出すと、そのビルに寄って窓が灯る', () => {
    const shell = arena();
    travel(shell, 'kubectl run web --image=nginx');
    const journey = travel(shell, 'kubectl wait 5', 2);
    expect(stopsOf(journey)).toContain('node:n1');
    expect(journey?.stops.some((s) => s.label.includes('Running'))).toBe(true);
  });

  it('Kubernetes に宛てていない行は、窓口まで歩かない', () => {
    const shell = arena();
    expect(travel(shell, 'echo hello')).toBeNull();
  });

  it('帯には通りうる施設が並び、通らなかった所には印が付かない', () => {
    const shell = arena();
    const journey = travel(shell, 'kubectl run web --image=nginx');
    const lanes = journey?.lanes ?? [];
    expect(lanes.map((l) => l.title)).toEqual(['窓口', '台帳', '事務所', '監督', '配置係', 'ビル', 'バス停']);
    const passed = (title: string) => lanes.find((l) => l.title === title)?.stop;
    expect(passed('窓口')).toBe(0);
    expect(passed('台帳')).toBe(1);
    expect(passed('配置係')).toBe(2);
    // 事務所も監督もビルもバス停も、この旅では動いていない
    expect(passed('事務所')).toBeNull();
    expect(passed('監督')).toBeNull();
    expect(passed('ビル')).toBeNull();
    expect(passed('バス停')).toBeNull();
  });
});

describe('Git の旅路', () => {
  function repo() {
    let session: Session = createSession({ files: { '/home/learner': null } });
    return {
      run(line: string) {
        const before = session.state;
        session = { ...session, state: execute(session.state, line, session.registry, session.clock).state };
        return { before, after: session.state };
      },
    };
  }

  it('git add は倉庫に寄り、git commit は記念碑と旗に寄る', () => {
    const shell = repo();
    shell.run('git init');
    shell.run('echo hello > /home/learner/a.txt');
    const added = shell.run('git add a.txt');
    const addCity = buildCity({ vfs: added.after.vfs, git: added.after.git, unlocked: ALL });
    const addTrip = journeyOf({
      command: 'git add a.txt', before: world(added.before), after: world(added.after), city: addCity,
    });
    expect((addTrip?.stops ?? []).some((s) => s.label.includes('倉庫'))).toBe(true);

    const done = shell.run('git commit -m first');
    const city = buildCity({ vfs: done.after.vfs, git: done.after.git, unlocked: ALL });
    const trip = journeyOf({
      command: 'git commit -m first', before: world(done.before), after: world(done.after), city,
    });
    const labels = (trip?.stops ?? []).map((s) => s.label).join(' ');
    expect(labels).toContain('石に刻み');
    expect(labels).toContain('旗');
  });
});

describe('旅の決まりごと', () => {
  it('空の行は旅に出ない', () => {
    const shell = arena();
    const city = buildCity({ cluster: shell.state.cluster, unlocked: ALL });
    const same = world(shell.state);
    expect(journeyOf({ command: '', before: same, after: same, city })).toBeNull();
  });

  it('停留所になる建物が街に無ければ旅に出ない', () => {
    const shell = arena();
    const { before, after } = shell.run('kubectl run web --image=nginx');
    // 建物が 1 つも無い街
    const empty = { buildings: [] };
    expect(journeyOf({ command: 'kubectl run web', before: world(before), after: world(after), city: empty })).toBeNull();
  });

  it('粒の姿は決まった 5 つの中から選ばれる', () => {
    const shell = arena();
    for (const stop of travel(shell, 'kubectl run web --image=nginx')?.stops ?? []) {
      expect(CARGO_SHAPES).toContain(stop.cargo);
    }
  });

  it('同じ状態の組からは必ず同じ道のりになる', () => {
    const a = arena();
    const b = arena();
    expect(travel(a, 'kubectl run web --image=nginx')).toEqual(travel(b, 'kubectl run web --image=nginx'));
  });

  it('同じコマンドを続けて打っても、別の旅として数える', () => {
    const shell = arena();
    const once = travel(shell, 'kubectl get nodes', 1);
    const twice = travel(shell, 'kubectl get nodes', 2);
    expect(once?.id).not.toBe(twice?.id);
  });
});

describe('問い合わせの答えを、街の建物で指す（REWORK 5-5）', () => {
  it('kubectl get nodes は、ビルを光らせて「これがノード。アプリを動かす建物」と添える', () => {
    const journey = travel(arena(), 'kubectl get nodes');
    expect(journey?.highlight).toEqual(['node:n1', 'node:n2']);
    expect(journey?.answer).toEqual({ title: 'これがノード', plain: 'アプリを動かす建物' });
  });

  it('住人のいないビルを「Pod がいる」とは指さない', () => {
    const shell = arena();
    expect(travel(shell, 'kubectl get pods')?.highlight).toEqual([]);
    expect(travel(shell, 'kubectl get pods')?.answer).toBeNull();
    shell.run('kubectl run web --image=nginx');
    shell.run('kubectl wait 10');
    const journey = travel(shell, 'kubectl get pods');
    expect(journey?.highlight).toHaveLength(1);
    expect(journey?.answer?.title).toContain('Pod');
  });

  it('問い合わせでないコマンドは、何も指さない', () => {
    const journey = travel(arena(), 'kubectl run web --image=nginx');
    expect(journey?.highlight).toEqual([]);
    expect(journey?.answer).toBeNull();
  });
});
