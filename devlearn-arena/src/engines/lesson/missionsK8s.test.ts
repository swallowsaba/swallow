import { describe, expect, it } from 'vitest';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { createClock } from '@/engines/kernel/clock';
import { createShellState } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { ShellState } from '@/engines/kernel/registry';
import { findMission } from './missions';
import { createProgress, evaluate } from './runner';

const registry = createDefaultRegistry();

/** マニフェストを1行ずつ書き出すヘルパ（heredoc の代わり） */
function writeYaml(path: string, lines: readonly string[]): string[] {
  const out = [`> ${path}`];
  for (const line of lines) out.push(`printf '%s\\n' ${JSON.stringify(line)} >> ${path}`);
  return out;
}

/** 途中で状態を見て次の行を決めたい任務のために、1行ずつ流せる形も用意する */
function player(id: string) {
  const mission = findMission(id);
  if (!mission) throw new Error(`任務が見つかりません: ${id}`);
  const clock = createClock();
  const timeline: ShellState[] = [createShellState(mission.initial)];
  let progress = createProgress(mission);
  return {
    run(line: string): string {
      const last = timeline[timeline.length - 1];
      if (!last) return '';
      const outcome = execute(last, line, registry, clock);
      timeline.push(outcome.state);
      progress = evaluate(mission, progress, timeline);
      return outcome.chunks.filter((c) => c.stream === 'stdout').map((c) => c.text).join('');
    },
    state(): ShellState | undefined {
      return timeline[timeline.length - 1];
    },
    get cleared() {
      return progress.cleared;
    },
    get stepIndex() {
      return progress.stepIndex;
    },
  };
}

function solve(id: string, lines: readonly string[]): { cleared: boolean; stoppedAt: number } {
  const mission = findMission(id);
  if (!mission) throw new Error(`任務が見つかりません: ${id}`);
  const clock = createClock();
  const timeline: ShellState[] = [createShellState(mission.initial)];
  let progress = createProgress(mission);
  for (const line of lines) {
    const last = timeline[timeline.length - 1];
    if (!last) break;
    timeline.push(execute(last, line, registry, clock).state);
    progress = evaluate(mission, progress, timeline);
  }
  return { cleared: progress.cleared, stoppedAt: progress.stepIndex };
}

function expectCleared(id: string, lines: readonly string[]): void {
  const result = solve(id, lines);
  expect(result.cleared, `${id} が手順 ${String(result.stoppedAt + 1)} で止まりました`).toBe(true);
}

describe('空のクラスタに Pod を作る', () => {
  it('ノードだけがあり、Pod は 0 個から始まる', () => {
    const play = player('k8s/01/first-kubectl');
    const cluster = play.state()?.cluster;
    expect(cluster?.nodes.size).toBe(2);
    expect(cluster?.pods.size).toBe(0);
    expect(cluster?.deployments.size).toBe(0);
  });

  it('Pod の名前を画面で確かめながら解ける', () => {
    const play = player('k8s/01/first-kubectl');
    play.run('kubectl get nodes');
    play.run('kubectl run web --image=nginx');
    play.run('kubectl wait 10');
    play.run('kubectl delete pod web');
    play.run('kubectl wait 10');
    expect(play.run('kubectl get pods')).toContain('No resources found');
    play.run('kubectl create deployment web --image=nginx --replicas=2');
    play.run('kubectl wait 10');
    const name = /^(web-\S+)/m.exec(play.run('kubectl get pods'))?.[1] ?? '';
    expect(name).not.toBe('');
    play.run(`kubectl delete pod ${name}`);
    expect(play.cleared).toBe(false);
    play.run('kubectl wait 10');
    expect(play.run('kubectl get pods')).not.toContain(name);
    expect(play.cleared, `手順 ${String(play.stepIndex + 1)} で止まりました`).toBe(true);
  });

  it('単独の Pod を消した直後は、時間を進めるまで通らない', () => {
    const result = solve('k8s/01/first-kubectl', [
      'kubectl get nodes',
      'kubectl run web --image=nginx',
      'kubectl wait 10',
      'kubectl delete pod web',
    ]);
    expect(result.stoppedAt).toBe(3);
  });

  it('Deployment の Pod を消さずに待つだけでは通らない', () => {
    const result = solve('k8s/01/first-kubectl', [
      'kubectl get nodes',
      'kubectl run web --image=nginx',
      'kubectl wait 10',
      'kubectl delete pod web',
      'kubectl wait 10',
      'kubectl create deployment web --image=nginx --replicas=2',
      'kubectl wait 30',
    ]);
    expect(result).toEqual({ cleared: false, stoppedAt: 5 });
  });
});

describe('Kubernetes の任務が実際に解ける', () => {
  it('Pending から動かない', () => {
    const play = player('k8s/02/boss-stuck-pending');
    play.run('kubectl wait 5');
    play.run('kubectl get pods');
    const name = [...(play.state()?.cluster?.pods.keys() ?? [])][0]?.split('/')[1] ?? '';
    expect(name).not.toBe('');
    play.run(`kubectl describe pod ${name}`);
    play.run('kubectl get nodes');
    play.run('kubectl scale deployment api --replicas=1');
    play.run('kubectl wait 20');
    expect(play.cleared, `手順 ${String(play.stepIndex + 1)} で止まりました`).toBe(true);
  });

  it('マニフェストから宣言的に作る', () => {
    expectCleared('k8s/03/apply-vs-create', [
      ...writeYaml('app.yaml', [
        'kind: Deployment',
        'metadata:',
        '  name: web',
        'spec:',
        '  replicas: 2',
        '  template:',
        '    metadata:',
        '      labels:',
        '        app: web',
        '    spec:',
        '      containers:',
        '        - name: web',
        '          image: nginx:1.25',
      ]),
      'kubectl apply -f app.yaml',
      'kubectl apply -f app.yaml',
      'kubectl wait 20',
    ]);
  });

  it('終わる仕事と、繰り返す仕事', () => {
    expectCleared('k8s/04/job-cronjob', [
      ...writeYaml('job.yaml', [
        'kind: Job',
        'metadata:',
        '  name: migrate',
        'spec:',
        '  completions: 2',
        '  template:',
        '    metadata:',
        '      labels:',
        '        job: migrate',
        '    spec:',
        '      containers:',
        '        - name: main',
        '          image: migrator',
      ]),
      'kubectl apply -f job.yaml',
      'kubectl wait 20',
      ...writeYaml('cron.yaml', [
        'kind: CronJob',
        'metadata:',
        '  name: nightly',
        'spec:',
        '  everyTicks: 3',
        '  jobTemplate:',
        '    spec:',
        '      template:',
        '        metadata:',
        '          labels:',
        '            job: nightly',
        '        spec:',
        '          containers:',
        '            - name: main',
        '              image: batch',
      ]),
      'kubectl apply -f cron.yaml',
      'kubectl wait 10',
    ]);
  });

  it('順番と名前が要るワークロード', () => {
    expectCleared('k8s/04/statefulset', [
      ...writeYaml('sts.yaml', [
        'kind: StatefulSet',
        'metadata:',
        '  name: db',
        'spec:',
        '  replicas: 3',
        '  serviceName: db',
        '  template:',
        '    metadata:',
        '      labels:',
        '        app: db',
        '    spec:',
        '      containers:',
        '        - name: main',
        '          image: postgres',
      ]),
      'kubectl apply -f sts.yaml',
      'kubectl wait 3',
      'kubectl wait 30',
    ]);
  });

  it('設定と機密をコンテナに渡す', () => {
    expectCleared('k8s/05/configmap', [
      ...writeYaml('cfg.yaml', [
        'kind: ConfigMap',
        'metadata:',
        '  name: app-config',
        'data:',
        '  GREETING: hello',
        '---',
        'kind: Secret',
        'metadata:',
        '  name: app-secret',
        'stringData:',
        '  TOKEN: s3cret',
      ]),
      'kubectl apply -f cfg.yaml',
      ...writeYaml('pod.yaml', [
        'kind: Pod',
        'metadata:',
        '  name: reader',
        'spec:',
        '  containers:',
        '    - name: main',
        '      image: busybox',
        '      envFrom:',
        '        - configMapRef:',
        '            name: app-config',
        '        - secretRef:',
        '            name: app-secret',
      ]),
      'kubectl apply -f pod.yaml',
      'kubectl wait 10',
      'kubectl get secret app-secret -o yaml',
      'kubectl exec reader -- env',
    ]);
  });

  it('PVC が Bound にならない', () => {
    expectCleared('k8s/06/boss-pvc-pending', [
      ...writeYaml('sc.yaml', [
        'kind: StorageClass',
        'metadata:',
        '  name: manual',
        'provisioner: none',
        'dynamic: false',
        '---',
        'kind: PersistentVolumeClaim',
        'metadata:',
        '  name: data',
        'spec:',
        '  storageClassName: manual',
        '  accessModes: [ReadWriteOnce]',
        '  resources:',
        '    requests:',
        '      storage: 5',
      ]),
      'kubectl apply -f sc.yaml',
      'kubectl wait 3',
      'kubectl get pvc',
      ...writeYaml('pv.yaml', [
        'kind: PersistentVolume',
        'metadata:',
        '  name: vol1',
        'spec:',
        '  capacity:',
        '    storage: 10',
        '  accessModes: [ReadWriteOnce]',
        '  storageClassName: manual',
      ]),
      'kubectl apply -f pv.yaml',
      'kubectl wait 3',
    ]);
  });

  it('置ける場所が無い', () => {
    expectCleared('k8s/08/boss-unschedulable', [
      ...writeYaml('pod.yaml', [
        'kind: Pod',
        'metadata:',
        '  name: plain',
        'spec:',
        '  containers:',
        '    - name: main',
        '      image: nginx',
      ]),
      'kubectl apply -f pod.yaml',
      'kubectl wait 3',
      'kubectl describe pod plain',
      ...writeYaml('tol.yaml', [
        'kind: Pod',
        'metadata:',
        '  name: gpu-job',
        'spec:',
        '  tolerations:',
        '    - key: gpu',
        '      effect: NoSchedule',
        '  containers:',
        '    - name: main',
        '      image: nginx',
      ]),
      'kubectl apply -f tol.yaml',
      'kubectl wait 12',
    ]);
  });

  it('再起動を繰り返して止まらない', () => {
    const play = player('k8s/09/boss-crashloop');
    play.run('kubectl wait 12');
    play.run('kubectl get pods');
    const name = [...(play.state()?.cluster?.pods.keys() ?? [])][0]?.split('/')[1] ?? '';
    expect(name).not.toBe('');
    expect(play.run(`kubectl logs ${name}`)).toContain('起動直後に終了');
    const path = '{.status.containerStatuses[0].restartCount}';
    const first = Number(play.run(`kubectl get pods ${name} -o jsonpath=${path}`).trim());
    play.run('kubectl wait 10');
    const second = Number(play.run(`kubectl get pods ${name} -o jsonpath=${path}`).trim());
    expect(second).toBeGreaterThan(first);
    play.run('kubectl set image deployment worker worker=nginx:1.25');
    play.run('kubectl wait 30');
    expect(play.cleared, `手順 ${String(play.stepIndex + 1)} で止まりました`).toBe(true);
  });

  it('権限が足りなくて叩けない', () => {
    expectCleared('k8s/10/boss-rbac-denied', [
      ...writeYaml('sa.yaml', [
        'kind: ServiceAccount',
        'metadata:',
        '  name: deploy-bot',
      ]),
      'kubectl apply -f sa.yaml',
      'kubectl auth can-i list pods --as=system:serviceaccount:default:deploy-bot',
      ...writeYaml('rbac.yaml', [
        'kind: Role',
        'metadata:',
        '  name: pod-reader',
        'rules:',
        '  - apiGroups: [""]',
        '    resources: ["pods"]',
        '    verbs: ["get", "list"]',
        '---',
        'kind: RoleBinding',
        'metadata:',
        '  name: read-pods',
        'roleRef:',
        '  kind: Role',
        '  name: pod-reader',
        'subjects:',
        '  - kind: ServiceAccount',
        '    name: deploy-bot',
        '    namespace: default',
      ]),
      'kubectl apply -f rbac.yaml',
      'kubectl auth can-i delete pods --as=system:serviceaccount:default:deploy-bot',
    ]);
  });

  it('負荷に合わせて台数を変える', () => {
    expectCleared('k8s/11/hpa', [
      ...writeYaml('hpa.yaml', [
        'kind: HorizontalPodAutoscaler',
        'metadata:',
        '  name: web',
        'spec:',
        '  scaleTargetRef:',
        '    name: web',
        '  minReplicas: 2',
        '  maxReplicas: 6',
        '  metrics:',
        '    - resource:',
        '        target:',
        '          averageUtilization: 50',
      ]),
      'kubectl apply -f hpa.yaml',
      'kubectl load web 100',
      'kubectl wait 20',
      'kubectl load web 1000',
      'kubectl wait 30',
    ]);
  });

  it('ノードを安全に空ける', () => {
    expectCleared('k8s/12/drain-cordon', [
      'kubectl wait 25',
      'kubectl drain node-1',
      'kubectl wait 30',
    ]);
  });

  it('limits を書かないと何が起きるか', () => {
    expectCleared('k8s/13/no-limits', [
      'kubectl get deploy noisy -o yaml',
      ...writeYaml('fix.yaml', [
        'kind: Deployment',
        'metadata:',
        '  name: noisy',
        'spec:',
        '  replicas: 1',
        '  template:',
        '    metadata:',
        '      labels:',
        '        app: noisy',
        '    spec:',
        '      containers:',
        '        - name: noisy',
        '          image: batch:1.0',
        '          resources:',
        '            requests:',
        '              cpu: 100',
        '              memory: 128',
        '            limits:',
        '              cpu: 200',
        '              memory: 256',
      ]),
      'kubectl apply -f fix.yaml',
    ]);
  });
});
