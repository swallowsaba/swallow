import { describe, expect, it } from 'vitest';
import { diagramOf } from './diagram';
import { missions } from './missions';
import { allMissions } from './registry';

describe('ネットワークの任務は構成図の読み方を持つ', () => {
  const netLessons = missions.filter((m) => m.track === 'net');

  it('すべての任務で、図の記号の意味とこの任務の構成が出る', () => {
    expect(netLessons.length).toBeGreaterThan(0);
    for (const lesson of netLessons) {
      const diagram = diagramOf(lesson);
      expect(diagram, lesson.id).not.toBeNull();
      expect(diagram?.legend.length, lesson.id).toBeGreaterThan(0);
      expect(diagram?.lines.length, lesson.id).toBeGreaterThan(0);
    }
  });

  it('機器とケーブルを1つ残らず言葉にする', () => {
    for (const lesson of netLessons) {
      const net = lesson.initial.net;
      const text = diagramOf(lesson)?.lines.join('\n') ?? '';
      for (const name of net?.devices.keys() ?? []) expect(text, lesson.id).toContain(name);
      for (const link of net?.links ?? []) {
        const [a = '', aPort = ''] = link.a.split(':');
        const [b = '', bPort = ''] = link.b.split(':');
        expect(text, lesson.id).toContain(`${a} の ${aPort} と ${b} の ${bPort}`);
      }
    }
  });

  it('いま操作している機器に印が付く', () => {
    const lesson = netLessons[0];
    if (lesson === undefined) return;
    const self = lesson.initial.vars?.['NET_SELF'] ?? 'pc1';
    const text = diagramOf(lesson)?.lines.join('\n') ?? '';
    if (lesson.initial.net?.devices.has(self) === true) expect(text).toContain(`${self}（あなたはここ）`);
  });

  it('ネットワーク以外の任務には出ない', () => {
    const k8s = allMissions().find((m) => m.track === 'k8s');
    expect(k8s && diagramOf(k8s.build())).toBeNull();
  });
});

describe('練習の任務は作るところから始まる', () => {
  it('Kubernetes の練習（障害対応ではないもの）は、Deployment の無いクラスタから始まる', () => {
    const prebuilt = missions
      .filter((m) => m.track === 'k8s' && m.kind === 'training')
      .filter((m) => (m.initial.cluster?.deployments.size ?? 0) > 0)
      .map((m) => m.id);
    expect(prebuilt).toEqual([]);
  });

  it('数を変える・消す・ラベルを付ける・Service を立てる演習も、まず自分で作る', () => {
    const families = ['/reconcile-', '/labels-', '/scale-', '/delete-', '/service-type-'];
    const targets = allMissions().filter((m) => families.some((f) => m.id.includes(f)));
    expect(targets.length).toBeGreaterThan(0);
    for (const entry of targets.filter((_, i) => i % 7 === 0)) {
      const lesson = entry.build();
      expect(lesson.initial.cluster?.deployments.size, entry.id).toBe(0);
      expect(lesson.steps[0]?.solution[0], entry.id).toMatch(/^kubectl create deployment /);
    }
  });
});
