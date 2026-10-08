import { describe, expect, it } from 'vitest';
import { shellSnapshotSchema } from '@/save/engine/shell';
import { findMission } from '@/engines/lesson/missions';
import { createDefaultRegistry } from './commands';
import { createClock } from './clock';
import { execute } from './shell';
import { initialShell } from '@/engines/environments';
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
    const restored = roundTrip('git/01/objects', ['git init', 'git add .', 'git commit -m "x"']);
    expect(restored.git).not.toBeNull();
    expect(restored.git?.refs.get('refs/heads/main')).toBeDefined();
  });

  it('クラスタが戻る', () => {
    const restored = roundTrip('k8s/01/first-kubectl', ['kubectl get pods']);
    expect(restored.cluster).not.toBeNull();
    expect(restored.cluster?.nodes.size ?? 0).toBeGreaterThan(0);
  });

  it('ネットワークが戻る', () => {
    const restored = roundTrip('net/05/ttl-hop', ['ip addr']);
    expect(restored.net).not.toBeNull();
    expect(restored.net?.devices.size ?? 0).toBeGreaterThan(0);
  });

  it('GitHub のリポジトリが戻る', () => {
    const restored = roundTrip('github/04/boss-blocked-merge', [
      'gh protect main --approvals=1 --checks=Build',
      'gh pr create -t "機能追加" -b feature',
    ]);
    expect(restored.repo?.protections.find((p) => p.branch === 'main')?.requiredChecks).toContain('Build');
    expect(restored.repo?.pulls.length ?? 0).toBeGreaterThan(0);
  });

  it('レッスンのクラスタ（窓口・置き場・区画・入口の係・PV の中身・コンテナの環境変数と書いた物）もそのまま戻る', () => {
    const manifests = [
      'apiVersion: v1\nkind: PersistentVolume\nmetadata:\n  name: pv-db-1\nspec:\n  capacity:\n    storage: 5Gi\n  accessModes:\n  - ReadWriteOnce\n  storageClassName: manual\n  hostPath:\n    path: /srv/pv/db-1\n',
      'apiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: db-data\nspec:\n  storageClassName: manual\n  accessModes:\n  - ReadWriteOnce\n  resources:\n    requests:\n      storage: 1Gi\n',
      'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: db\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: db\n  template:\n    metadata:\n      labels:\n        app: db\n    spec:\n      containers:\n      - name: postgres\n        image: city-db:1.0\n        env:\n        - name: TZ\n          value: Asia/Tokyo\n        volumeMounts:\n        - name: data\n          mountPath: /var/lib/postgresql/data\n      volumes:\n      - name: data\n        persistentVolumeClaim:\n          claimName: db-data\n',
      'apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: city\nspec:\n  rules:\n  - host: city.example\n    http:\n      paths:\n      - path: /\n        pathType: Prefix\n        backend:\n          service:\n            name: db\n            port:\n              number: 80\n',
    ].join('---\n');
    const clock = createClock();
    let state = initialShell('k8s-cluster', { cluster: { nodes: 2, namespaces: ['dev'], ingress: { address: '203.0.113.10' }, manifests } });
    state = execute(state, 'kubectl exec deploy/db -- psql -U postgres -d reserve -c "INSERT INTO reservations (name) VALUES (\'x\')"', registry, clock).state;
    const before = state.cluster;
    const parsed = shellSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshotShell(state))));
    const after = restoreShell(parsed).cluster;
    expect(after).toEqual(before);
  });

  it('HPA の計算の記録（使用率・推奨の数・状態の欄）と、Pod が Ready になった時刻もそのまま戻る', () => {
    const manifests = [
      'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: web\nspec:\n  replicas: 2\n  selector:\n    matchLabels:\n      app: web\n  template:\n    metadata:\n      labels:\n        app: web\n    spec:\n      containers:\n      - name: web\n        image: city-shop:1.0\n        resources:\n          requests:\n            cpu: 200m\n',
      'apiVersion: v1\nkind: Service\nmetadata:\n  name: web\nspec:\n  selector:\n    app: web\n  ports:\n  - port: 80\n',
      'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: crowd\nspec:\n  replicas: 1\n  selector:\n    matchLabels:\n      app: crowd\n  template:\n    metadata:\n      labels:\n        app: crowd\n    spec:\n      containers:\n      - name: crowd\n        image: city-crowd:1.0\n        env:\n        - name: TARGET_URL\n          value: http://web\n',
    ].join('---\n');
    const clock = createClock();
    let state = initialShell('k8s-cluster', { cluster: { nodes: 2, manifests } });
    for (const line of ['kubectl autoscale deployment web --cpu-percent=50 --min=2 --max=10', 'kubectl get hpa -w']) state = execute(state, line, registry, clock).state;
    const before = state.cluster;
    expect([...(before?.autoscalers.values() ?? [])][0]?.status.conditions?.length).toBe(3);
    const parsed = shellSnapshotSchema.parse(JSON.parse(JSON.stringify(snapshotShell(state))));
    expect(restoreShell(parsed).cluster).toEqual(before);
  });

  it('クラスタを進めた結果もそのまま戻る', () => {
    const mission = findMission('k8s/07/boss-service-no-endpoint');
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
