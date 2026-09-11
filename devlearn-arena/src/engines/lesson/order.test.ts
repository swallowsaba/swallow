import { describe, expect, it } from 'vitest';
import { missionsOf, nextMission } from './catalog';
import { allMissions, missingPrerequisites, missionById, recommendedNext } from './registry';
import { TRACK_ORDER } from './order';

const entries = allMissions();
const chapterNo = (id: string) => Number(id.split('/')[1] ?? '0');

describe('推奨順', () => {
  it('最初の1本は、端末に慣れる任務', () => {
    expect(entries[0]?.id).toBe('kernel/00/shell-warmup');
    expect(recommendedNext(new Set())?.id).toBe('kernel/00/shell-warmup');
  });

  it('番号が重ならず、一覧はその順に並んでいる', () => {
    const orders = entries.map((e) => e.order);
    expect(new Set(orders).size).toBe(orders.length);
    expect([...orders].sort((a, b) => a - b)).toEqual(orders);
  });

  it('世界の順、章の番号順に進む', () => {
    for (let i = 1; i < entries.length; i += 1) {
      const a = entries[i - 1];
      const b = entries[i];
      if (!a || !b) continue;
      const ta = TRACK_ORDER.indexOf(a.track);
      const tb = TRACK_ORDER.indexOf(b.track);
      expect(ta <= tb, `${a.id} → ${b.id}`).toBe(true);
      if (ta === tb) expect(chapterNo(a.chapterId) <= chapterNo(b.chapterId), `${a.id} → ${b.id}`).toBe(true);
    }
  });

  it('章の中では、読んで手を動かす任務 → 演習 → 障害対応', () => {
    const rank = (e: (typeof entries)[number]) => (e.kind === 'boss' ? 2 : e.curated ? 0 : 1);
    for (let i = 1; i < entries.length; i += 1) {
      const a = entries[i - 1];
      const b = entries[i];
      if (!a || !b || a.chapterId !== b.chapterId) continue;
      expect(rank(a) <= rank(b), `${a.id} → ${b.id}`).toBe(true);
    }
  });

  it('Kubernetes は Pod を作る任務、YAML の任務、クラスタを組む演習の順', () => {
    const order = (id: string) => missionById(id)?.order ?? 0;
    expect(order('k8s/01/first-kubectl')).toBeLessThan(order('k8s/01/first-yaml'));
    const kubeadm = entries.find((e) => e.chapterId === 'k8s/01' && !e.curated);
    expect(order('k8s/01/first-yaml')).toBeLessThan(kubeadm?.order ?? 0);
  });

  it('地図の一覧も同じ順に並ぶ', () => {
    for (const track of TRACK_ORDER) {
      const listed = missionsOf(track).map((m) => missionById(m.id)?.order ?? 0);
      expect([...listed].sort((a, b) => a - b)).toEqual(listed);
    }
    expect(nextMission(new Set())?.id).toBe('kernel/00/shell-warmup');
  });
});

describe('先にやっておくとよい任務', () => {
  it('前提は必ず存在し、自分より先に並んでいる', () => {
    for (const entry of entries) {
      for (const req of entry.requires) {
        const before = missionById(req);
        expect(before, `${entry.id} → ${req}`).toBeDefined();
        expect((before?.order ?? 0) < entry.order, `${entry.id} → ${req}`).toBe(true);
      }
    }
  });

  it('最初の1本には前提が無い。ほかの世界の最初の任務は、端末の任務が前提', () => {
    expect(missionById('kernel/00/shell-warmup')?.requires).toEqual([]);
    const firstGit = entries.find((e) => e.track === 'git');
    expect(firstGit?.requires).toEqual(['kernel/00/shell-warmup']);
  });

  it('まだ終えていない前提だけを知らせる', () => {
    expect(missingPrerequisites('k8s/01/first-yaml', new Set()).map((m) => m.id)).toEqual(['k8s/01/first-kubectl']);
    expect(missingPrerequisites('k8s/01/first-yaml', new Set(['k8s/01/first-kubectl']))).toEqual([]);
  });

  it('演習は同じ章の任務が前提になる', () => {
    const drill = entries.find((e) => e.chapterId === 'k8s/01' && !e.curated);
    expect(drill?.requires).toEqual(['k8s/01/first-kubectl', 'k8s/01/first-yaml']);
  });
});
