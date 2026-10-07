import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { clusterHolds } from '@/engines/k8s/check';
import { writeFile } from '../vfs';
import type { ShellState } from '../registry';
import { createClock } from '../clock';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/** 係が用意した PV（5Gi・RWO・manual） */
const PV = 'apiVersion: v1\nkind: PersistentVolume\nmetadata:\n  name: pv-db-1\nspec:\n  capacity:\n    storage: 5Gi\n  accessModes:\n  - ReadWriteOnce\n  storageClassName: manual\n  hostPath:\n    path: /srv/pv/db-1\n';
const PVC = (size = '1Gi', cls = '  storageClassName: manual\n'): string => `apiVersion: v1\nkind: PersistentVolumeClaim\nmetadata:\n  name: db-data\nspec:\n${cls}  accessModes:\n  - ReadWriteOnce\n  resources:\n    requests:\n      storage: ${size}\n---\n`;
/** 予約の DB（city-db:1.0）。PVC を付ける時は mount に書く */
const DB = (mount = ''): string => [
  'apiVersion: apps/v1',
  'kind: Deployment',
  'metadata:',
  '  name: db',
  'spec:',
  '  replicas: 1',
  '  selector:',
  '    matchLabels:',
  '      app: db',
  '  template:',
  '    metadata:',
  '      labels:',
  '        app: db',
  '    spec:',
  '      containers:',
  '      - name: postgres',
  '        image: city-db:1.0',
  '        ports:',
  '        - containerPort: 5432',
  ...(mount === '' ? [] : [
    '        volumeMounts:',
    '        - name: data',
    `          mountPath: ${mount}`,
    '      volumes:',
    '      - name: data',
    '        persistentVolumeClaim:',
    '          claimName: db-data',
  ]),
  '',
].join('\n');
const PSQL = (sql: string): string => `kubectl exec deploy/db -- psql -U postgres -d reserve -c "${sql}"`;

function console_() {
  let shell: ShellState = initialShell('k8s-cluster', { cluster: { nodes: 2, ageDays: 3, manifests: `${PV}---\n${DB()}` } });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string) => {
    const r = execute(shell, line, registry, clock);
    shell = r.state;
    const pick = (s: 'stdout' | 'stderr'): string => r.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), code: r.exitCode };
  };
  const apply = (text: string) => {
    shell = { ...shell, vfs: writeFile(shell.vfs, '/home/learner/db.yaml', text, true) };
    return run('kubectl apply -f db.yaml');
  };
  /** 予約を 1 件足し、Pod を消して作り直させ、数を数える（k8s.i.03 の確かめ方） */
  const recreate = (): string => {
    run(PSQL("INSERT INTO reservations (name) VALUES ('市民ホール')"));
    run('kubectl delete pod -l app=db');
    run('kubectl rollout status deployment/db');
    return run(PSQL('SELECT count(*) FROM reservations')).out;
  };
  return { run, apply, recreate, holds: (expr: string) => clusterHolds(shell.cluster, expr) };
}

describe('PV と PVC（DB のデータの置き場所）', () => {
  it('DB は psql で数え・足せる', () => {
    const c = console_();
    expect(c.run(PSQL('SELECT count(*) FROM reservations')).out).toBe(' count \n-------\n     3\n(1 row)\n\n');
    expect(c.run(PSQL("INSERT INTO reservations (name) VALUES ('市民ホール')")).out).toBe('INSERT 0 1\n');
    expect(c.holds('deployment/db rows.reservations=4')).toBe(true);
  });

  it('PVC が無ければデータは Pod の中にあり、Pod を作り直すと足した予約は消える（最初の 3 件に戻る）', () => {
    const c = console_();
    expect(c.recreate()).toContain('     3\n');
    expect(c.holds('deployment/db rows.reservations=3')).toBe(true);
  });

  it('PVC は合う PV と結ばれ、get pvc・get pv は本物の欄で出る', () => {
    const c = console_();
    expect(c.apply(PVC() + DB()).out).toBe('persistentvolumeclaim/db-data created\ndeployment.apps/db unchanged\n');
    c.run('kubectl get pods');
    expect(c.run('kubectl get pvc').out).toMatch(/^NAME +STATUS +VOLUME +CAPACITY +ACCESS MODES +STORAGECLASS +VOLUMEATTRIBUTESCLASS +AGE\ndb-data +Bound +pv-db-1 +5Gi +RWO +manual +<unset> +\d+s\n$/);
    expect(c.run('kubectl get pv').out).toMatch(/^pv-db-1 +5Gi +RWO +Retain +Bound +default\/db-data +manual +<unset> +\S+$/m);
    expect(c.holds('pvc/db-data status=Bound')).toBe(true);
  });

  it('大きさが足りない・種類が違う・種類を書かない PVC は、合う PV が無くて Pending のまま', () => {
    const big = console_();
    big.apply(PVC('10Gi') + DB());
    big.run('kubectl get pods');
    expect(big.run('kubectl get pvc').out).toMatch(/^db-data +Pending +manual +<unset> +\d+s$/m);
    expect(big.holds('pvc/db-data status=Pending')).toBe(true);
    const none = console_();
    none.apply(PVC('1Gi', '') + DB());
    none.run('kubectl get pods');
    expect(none.run('kubectl describe pvc db-data').out).toContain('no persistent volumes available for this claim and no storage class is set');
  });

  it('PVC を DB のデータの場所に付けると、Pod を作り直しても足した予約が残る', () => {
    const c = console_();
    c.apply(PVC() + DB('/var/lib/postgresql/data'));
    expect(c.run('kubectl rollout status deployment/db').code).toBe(0);
    expect(c.run('kubectl logs deploy/db').out).toContain('PostgreSQL init process complete; ready for start up.');
    expect(c.recreate()).toContain('     4\n');
    expect(c.run('kubectl logs deploy/db').out).toContain('Skipping initialization');
    expect(c.holds('deployment/db readyReplicas=1 rows.reservations=4')).toBe(true);
  });

  it('違う場所に付けると、データは Pod の中に書かれ、作り直すと消える', () => {
    const c = console_();
    c.apply(PVC() + DB('/data'));
    c.run('kubectl rollout status deployment/db');
    expect(c.recreate()).toContain('     3\n');
  });

  it('付けた PVC が Pending なら、Pod は置けずに Pending のまま（unbound immediate PersistentVolumeClaims）', () => {
    const c = console_();
    c.apply(PVC('10Gi') + DB('/var/lib/postgresql/data'));
    const status = c.run('kubectl rollout status deployment/db');
    expect(status.err).toContain('exceeded its progress deadline');
    expect(c.run('kubectl get pods').out).toMatch(/^db-\S+ +0\/1 +Pending +0 /m);
    const pod = /^(db-\S+) +0\/1 +Pending/m.exec(c.run('kubectl get pods').out)?.[1] ?? '';
    expect(c.run(`kubectl describe pod ${pod}`).out).toContain('pod has unbound immediate PersistentVolumeClaims');
  });

  it('describe は本物の形で、結んだ相手・使っている Pod・結べない理由（係が見直すたびの知らせ）を出す', () => {
    const c = console_();
    c.apply(PVC() + DB('/var/lib/postgresql/data'));
    c.run('kubectl rollout status deployment/db');
    const pvc = c.run('kubectl describe pvc db-data').out;
    expect(pvc).toMatch(/^Status: +Bound\nVolume: +pv-db-1$/m);
    expect(pvc).toMatch(/^Capacity: +5Gi\nAccess Modes: +RWO$/m);
    expect(pvc).toMatch(/^Used By: +db-\S+$/m);
    expect(c.run('kubectl describe pv pv-db-1').out).toMatch(/^Claim: +default\/db-data\nReclaim Policy: +Retain$/m);
    expect(c.run('kubectl describe deployment db').out).toContain('  Volumes:\n   data:\n    Type:       PersistentVolumeClaim (a reference to a PersistentVolumeClaim in the same namespace)\n    ClaimName:  db-data\n');
    const big = console_();
    big.apply(PVC('10Gi') + DB('/var/lib/postgresql/data'));
    big.run('kubectl rollout status deployment/db');
    expect(big.run('kubectl describe pvc db-data').out).toMatch(/^ {2}Warning +ProvisioningFailed +\S+ \(x\d+ over \S+\) +persistentvolume-controller +storageclass\.storage\.k8s\.io "manual" not found$/m);
  });

  it('psql の誤りは本物の形', () => {
    const c = console_();
    expect(c.run(PSQL('SELECT count(*) FROM reservation')).err).toContain('ERROR:  relation "reservation" does not exist');
    expect(c.run('kubectl exec deploy/db -- psql -U postgres -d nope -c "SELECT 1"').err).toContain('FATAL:  database "nope" does not exist');
  });
});
