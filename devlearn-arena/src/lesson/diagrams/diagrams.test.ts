import { describe, expect, it } from 'vitest';
import { DIAGRAM_IDS, isDiagramId } from '@/engines/lesson/diagramIds';
import { allMissions } from '@/engines/lesson/registry';
import { terms } from '@/content/glossary';
import { diagramOfStep } from './pick';
import { PLAYGROUNDS, settleAll } from './playgrounds';
import type { Playground, Sim } from './sim';

/**
 * 遊べる図解（REWORK 6-6）。
 *
 * 見たいのは、図が台本ではなく本物の仕組みで動いていること。
 * - 操作の一覧があり、どの操作も端末で打てるコマンドを返す
 * - 操作を与えると、シェルの中の状態（クラスタ・リポジトリ・ネットワーク・ファイル）が変わる
 * - 目標があり、そこへ届く操作の並びが実際にある
 */

const ALL = DIAGRAM_IDS.map((id) => [id, PLAYGROUNDS[id] as Playground<unknown>] as const);

/** 模型の状態。図が読む元になる所だけを取り出す */
function engineOf(sim: Sim) {
  const { cluster, git, net, vfs } = sim.session.state;
  return { cluster, git, net, vfs };
}

function play(playground: Playground<unknown>, moves: readonly string[]): Sim {
  let sim = playground.start();
  for (const id of moves) {
    const applied = playground.apply(sim, id);
    expect({ id, ok: applied.ok, reason: applied.reason }).toEqual({ id, ok: true, reason: null });
    sim = settleAll(playground, applied.sim);
  }
  return sim;
}

describe.each(ALL)('図解 %s', (id, playground) => {
  it('目標と、3 行までの説明がある', () => {
    expect(playground.id).toBe(id);
    expect(playground.goal).not.toBe('');
    expect(playground.notes.length).toBeGreaterThan(0);
    expect(playground.notes.length).toBeLessThanOrEqual(3);
  });

  it('操作の一覧があり、どれも端末で打てるコマンドを返す', () => {
    const moves = playground.moves(playground.start());
    expect(moves.length).toBeGreaterThan(0);
    for (const move of moves) {
      expect(move.command).toMatch(/^(kubectl|git|ping|ip|mkdir|mv|echo) /);
      const applied = playground.apply(playground.start(), move.id);
      expect(applied.command).toBe(move.command);
    }
  });

  it('操作を与えると、仕組みの状態が変わる（台本ではない）', () => {
    const sim = playground.start();
    const changed = playground.moves(sim).filter((move) => {
      const applied = playground.apply(sim, move.id);
      if (!applied.ok) return false;
      const after = settleAll(playground, applied.sim);
      return JSON.stringify(playground.view(after)) !== JSON.stringify(playground.view(sim));
    });
    expect(changed.length).toBeGreaterThan(0);
    // 状態が変わった操作では、シェルの中の模型そのものが別物になっている
    const first = changed[0];
    if (first === undefined) return;
    const applied = playground.apply(sim, first.id);
    const before = engineOf(sim);
    const after = engineOf(settleAll(playground, applied.sim));
    expect([
      before.cluster !== after.cluster,
      before.git !== after.git,
      before.net !== after.net,
      before.vfs !== after.vfs,
    ]).toContain(true);
  });

  it('はじめは仕組みが落ち着いていて、すぐに手を出せる', () => {
    expect(playground.settle?.(playground.start()) ?? null).toBeNull();
  });

  it('はじめは目標に届いていない', () => {
    expect(playground.reached(playground.start())).toBe(false);
  });

  it('模範の操作の並びで、目標に届く', () => {
    expect(playground.reached(play(playground, playground.solution))).toBe(true);
  });

  it('知らない操作では何も変わらない', () => {
    const sim = playground.start();
    const applied = playground.apply(sim, 'no-such-move');
    expect(applied.ok).toBe(false);
    expect(applied.sim).toBe(sim);
  });
});

describe('仕組みが決める制約', () => {
  it('満員のビルには引っ越せず、配置係の理由が数字で出る', () => {
    const playground = PLAYGROUNDS['pod-in-node'];
    let sim = play(playground, ['move:web-1:node-2']);
    const refused = playground.apply(sim, 'move:web-2:node-2');
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain('満員');
    expect(refused.reason).toContain('100m');
    sim = refused.sim;
    expect(playground.view(sim).nodes.find((n) => n.name === 'node-1')?.pods.map((p) => p.name)).toEqual(['web-2']);
  });

  it('住人を消すと、監督が新しい住人を呼んで注文の数に戻す', () => {
    const playground = PLAYGROUNDS['desired-vs-actual'];
    const sim = playground.start();
    const gone = playground.view(sim).pods[0]?.name;
    const applied = playground.apply(sim, 'delete:first');
    expect(playground.view(applied.sim).pods).toHaveLength(2);
    const healed = playground.view(settleAll(playground, applied.sim));
    expect(healed.pods).toHaveLength(3);
    expect(healed.pods.map((p) => p.name)).not.toContain(gone);
    expect(healed.running).toBe(3);
  });

  it('つまみで注文を 5 にすると、住人が 5 人になる', () => {
    const playground = PLAYGROUNDS['desired-vs-actual'];
    const view = playground.view(play(playground, ['scale:5']));
    expect({ desired: view.desired, running: view.running }).toEqual({ desired: 5, running: 5 });
  });

  it('時間を進めるたびに、Pending → ContainerCreating → Running と 1 段ずつ進む', () => {
    const playground = PLAYGROUNDS['pod-lifecycle'];
    let sim = playground.apply(playground.start(), 'run:good').sim;
    const phases = [playground.view(sim).pod?.phase];
    for (let i = 0; i < 3; i += 1) {
      sim = playground.apply(sim, 'tick').sim;
      phases.push(playground.view(sim).pod?.phase);
    }
    expect(phases).toEqual(['Pending', 'ContainerCreating', 'ContainerCreating', 'Running']);
  });

  it('壊れた荷物では、再試行の間隔が伸びていく', () => {
    const playground = PLAYGROUNDS['pod-lifecycle'];
    let sim = playground.apply(playground.start(), 'run:broken').sim;
    const waits: number[] = [];
    let attempts = 0;
    for (let i = 0; i < 40 && waits.length < 3; i += 1) {
      sim = playground.apply(sim, 'tick').sim;
      const pod = playground.view(sim).pod;
      if (pod !== null && pod.attempts > attempts) {
        attempts = pod.attempts;
        waits.push(pod.retryIn ?? 0);
      }
    }
    expect(waits).toHaveLength(3);
    expect(waits[1]).toBeGreaterThan(waits[0] ?? Infinity);
    expect(waits[2]).toBeGreaterThan(waits[1] ?? Infinity);
    expect(playground.reached(sim)).toBe(false);
  });

  it('名札を付け替えると、バス停からの線が付いたり消えたりする', () => {
    const playground = PLAYGROUNDS['service-endpoints'];
    const start = playground.view(playground.start());
    expect(start.pods.map((p) => p.linked)).toEqual([true, true, false]);
    const off = playground.view(play(playground, ['label:a:api']));
    expect(off.pods.map((p) => p.linked)).toEqual([false, true, false]);
    const swapped = playground.view(play(playground, ['selector:api']));
    expect(swapped.pods.map((p) => p.linked)).toEqual([false, false, true]);
  });

  it('インデックスが空のまま写真は撮れない', () => {
    const playground = PLAYGROUNDS['git-three-areas'];
    const refused = playground.apply(playground.start(), 'commit');
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain('インデックスが空');
  });

  it('札を運ぶと、作業ツリー → インデックス → コミットと台が変わる', () => {
    const playground = PLAYGROUNDS['git-three-areas'];
    const areas = (sim: Sim) => playground.view(sim).cards.find((c) => c.path === 'app.txt')?.area;
    const start = playground.start();
    const added = playground.apply(start, 'add:app.txt').sim;
    const committed = playground.apply(added, 'commit').sim;
    expect([areas(start), areas(added), areas(committed)]).toEqual(['worktree', 'index', 'commit']);
  });

  it('荷物はルータを越えるたびに TTL が 1 減り、切れた線の手前で止まる', () => {
    const playground = PLAYGROUNDS['packet-hops'];
    const blocked = playground.apply(playground.start(), 'send:pc2');
    expect(blocked.ok).toBe(false);
    expect(playground.view(blocked.sim).trip?.hops.map((h) => h.device)).toEqual(['pc1', 'r1']);

    const sim = play(playground, ['link:r1:eth1', 'send:pc2']);
    const hops = playground.view(sim).trip?.hops ?? [];
    expect(hops.map((h) => h.device)).toEqual(['pc1', 'r1', 'r2', 'pc2']);
    const ttls = hops.map((h) => h.ttl);
    expect(ttls.slice(1).map((ttl, i) => (ttls[i] ?? 0) - ttl)).toEqual([1, 1, 1]);
  });

  it('箱が無いうちは、ファイルを入れられない', () => {
    const playground = PLAYGROUNDS['file-tree'];
    const refused = playground.apply(playground.start(), 'mv:app.log');
    expect(refused.ok).toBe(false);
    expect(refused.reason).toContain('mkdir');
  });
});

describe('どの手順にも、遊べる図解がある（REWORK 6-5）', () => {
  it('全ての任務の全ての手順が、登録された図解に決まる', () => {
    const missing: string[] = [];
    const used = new Set<string>();
    for (const entry of allMissions()) {
      const lesson = entry.build();
      lesson.steps.forEach((_, i) => {
        const id = diagramOfStep(lesson, i);
        if (!isDiagramId(id) || !(id in PLAYGROUNDS)) missing.push(`${lesson.id} #${String(i)}`);
        used.add(id);
      });
    }
    expect(missing).toEqual([]);
    // 作った図解は、どれもどこかの手順で開かれる（作っただけで使われない図を残さない）
    expect([...used].sort()).toEqual([...DIAGRAM_IDS].sort());
  });

  it('用語辞書が指す図解も、全て作ってある', () => {
    for (const entry of terms()) expect(entry.diagram in PLAYGROUNDS).toBe(true);
  });
});
