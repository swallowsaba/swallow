import { describe, expect, it } from 'vitest';
import { shellSnapshotSchema } from '@/lib/storage/shellSchema';
import { findMission } from '@/engines/lesson/missions';
import { createDefaultRegistry } from './commands';
import { createClock } from './clock';
import { execute } from './shell';
import { createShellState, restoreShell, snapshotShell } from './session';
import type { ShellState } from './registry';

const registry = createDefaultRegistry();

/** 任務を少し進めてから、保存 → スキーマ検証 → 復元 を通す */
function roundTrip(missionId: string, lines: readonly string[]): ShellState {
  const mission = findMission(missionId);
  if (!mission) throw new Error(`任務が見つかりません: ${missionId}`);
  const clock = createClock();
  let state = createShellState(mission.initial);
  for (const line of lines) state = execute(state, line, registry, clock).state;

  const raw = JSON.parse(JSON.stringify(snapshotShell(state))) as unknown;
  const parsed = shellSnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`スキーマに合いません: ${parsed.error.issues[0]?.path.join('.') ?? ''} ${parsed.error.issues[0]?.message ?? ''}`);
  }
  return restoreShell(parsed.data);
}

describe('シェルの保存と復元', () => {
  it('ファイルと変数と履歴が戻る', () => {
    const restored = roundTrip('kernel/00/shell-warmup', ['mkdir reports', 'echo hi > reports/a.txt']);
    expect(restored.vfs.nodes.get('/home/learner/reports/a.txt')).toEqual({
      kind: 'file',
      content: 'hi\n',
    });
    expect(restored.history).toContain('mkdir reports');
  });

  it('Git のオブジェクトと参照が戻る', () => {
    const restored = roundTrip('git/01/first-commit', ['git init', 'git add .', 'git commit -m "x"']);
    expect(restored.git).not.toBeNull();
    expect(restored.git?.refs.get('refs/heads/main')).toBeDefined();
  });

  it('クラスタが戻る', () => {
    const restored = roundTrip('k8s/01/first-look', ['kubectl get pods']);
    expect(restored.cluster).not.toBeNull();
    expect(restored.cluster?.nodes.size ?? 0).toBeGreaterThan(0);
  });

  it('ネットワークが戻る', () => {
    const restored = roundTrip('net/01/first-hop', ['ip addr']);
    expect(restored.net).not.toBeNull();
    expect(restored.net?.devices.size ?? 0).toBeGreaterThan(0);
  });

  it('GitHub のリポジトリが戻る', () => {
    const restored = roundTrip('github/04/protected-merge', [
      'gh protect main --approvals=1 --checks=Build',
      'gh pr create -t "機能追加" -b feature',
    ]);
    expect(restored.repo?.protections.find((p) => p.branch === 'main')?.requiredChecks).toContain('Build');
    expect(restored.repo?.pulls.length ?? 0).toBeGreaterThan(0);
  });

  it('クラスタを進めた結果もそのまま戻る', () => {
    const mission = findMission('k8s/07/no-endpoints');
    if (!mission) throw new Error('missing');
    const clock = createClock();
    let state = createShellState(mission.initial);
    for (const line of ['kubectl get pods', 'kubectl get pods', 'kubectl get pods']) {
      state = execute(state, line, registry, clock).state;
    }
    const before = state.cluster;
    const parsed = shellSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshotShell(state))));
    const after = restoreShell(parsed).cluster;
    expect(after?.tick).toBe(before?.tick);
    expect(after?.pods.size).toBe(before?.pods.size);
    expect(after?.events.length).toBe(before?.events.length);
  });
});
