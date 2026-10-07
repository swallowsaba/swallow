import { describe, expect, it } from 'vitest';
import { shellOptions } from '@/engines/environments';
import { createClock } from '../clock';
import { createShellState } from '../session';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';
import { age, table } from './kubectlShared';

/** setup の cluster から作ったクラスタで、kubectl を順に打つ（k8s.b.03 の実戦と同じ形） */
function console_(cluster: unknown): (line: string) => { out: string; err: string; code: number } {
  let shell = createShellState(shellOptions('k8s-cluster', { cluster }));
  const registry = createDefaultRegistry();
  const clock = createClock();
  return (line) => {
    const r = execute(shell, line, registry, clock);
    shell = r.state;
    const pick = (s: 'stdout' | 'stderr'): string => r.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), code: r.exitCode };
  };
}

describe('経った時間（本物の kubectl の AGE と同じ形）', () => {
  it('秒・分・時・日・年を、本物の区切りで丸める', () => {
    expect(age(90, 0)).toBe('90s');
    expect(age(330, 0)).toBe('5m30s');
    expect(age(600, 0)).toBe('10m');
    expect(age(3 * 3600 + 20 * 60, 0)).toBe('3h20m');
    expect(age(30 * 3600, 0)).toBe('30h');
    expect(age(52 * 3600, 0)).toBe('2d4h');
    expect(age(45 * 86400, 0)).toBe('45d');
    expect(age((2 * 365 + 10) * 86400, 0)).toBe('2y10d');
    expect(age(10, 20)).toBe('0s');
  });
});

describe('表（本物の kubectl と同じ欄の幅）', () => {
  it('欄の間は 3 字、欄は 6 字以上。最後の欄は詰める', () => {
    expect(table([['NAME', 'AGE'], ['a', '5m']])).toBe('NAME   AGE\na      5m\n');
  });
});

describe('setup の cluster（制御の側・止まった Node・作ってからの日数）', () => {
  const run = console_({ nodes: 3, controlPlane: true, notReady: ['node-2'], ageDays: 45 });

  it('get nodes は制御の側を先に並べ、止まった Node を NotReady にする', () => {
    expect(run('kubectl get nodes').out).toBe([
      'NAME     STATUS     ROLES           AGE   VERSION',
      'cp-1     Ready      control-plane   45d   v1.31.2',
      'node-1   Ready      <none>          45d   v1.31.2',
      'node-2   NotReady   <none>          45d   v1.31.2',
      'node-3   Ready      <none>          45d   v1.31.2',
      '',
    ].join('\n'));
  });

  it('get nodes -o wide は住所・OS・カーネル・ランタイムを足す', () => {
    const out = run('kubectl get nodes -o wide').out.split('\n');
    expect(out[0]).toMatch(/^NAME +STATUS +ROLES +AGE +VERSION +INTERNAL-IP +EXTERNAL-IP +OS-IMAGE +KERNEL-VERSION +CONTAINER-RUNTIME$/);
    expect(out[2]).toMatch(/^node-1 .* 10\.0\.0\.11 +<none> +Ubuntu 24\.04\.1 LTS +6\.8\.0-45-generic +containerd:\/\/1\.7\.22$/);
  });

  it('describe node は止まった Node の状態を Unknown にし、届かない印を付ける', () => {
    const out = run('kubectl describe node node-2').out;
    expect(out).toMatch(/^Name: +node-2$/m);
    expect(out).toContain('node.kubernetes.io/unreachable:NoSchedule');
    expect(out).toMatch(/^ {2}Ready +Unknown +NodeStatusUnknown +Kubelet stopped posting node status\.$/m);
    expect(out).toMatch(/^ {2}InternalIP: +10\.0\.0\.12$/m);
  });

  it('describe node は制御の側に Pod を置かない印（NoSchedule）を出し、動いている Node は Ready', () => {
    expect(run('kubectl describe node cp-1').out).toMatch(/^Taints: +node-role\.kubernetes\.io\/control-plane:NoSchedule$/m);
    const one = run('kubectl describe node node-1').out;
    expect(one).toMatch(/^Taints: +<none>$/m);
    expect(one).toMatch(/^ {2}Ready +True +KubeletReady +kubelet is posting ready status$/m);
    expect(one).toMatch(/^Non-terminated Pods: +\(0 in total\)$/m);
  });

  it('接続先の設定（~/.kube/config）を読んで頼む。設定は窓口（cp-1 の 6443 番）を指す', () => {
    expect(run('cat ~/.kube/config').out).toContain('server: https://10.0.0.10:6443');
  });

  it('無い Node は本物と同じ NotFound', () => {
    const r = run('kubectl describe node node-9');
    expect(r.code).toBe(1);
    expect(r.err).toContain('nodes "node-9" not found');
  });
});

describe('接続先の設定（kubeconfig）が読めないと、窓口に頼めない', () => {
  it('sudo で root になると /root の設定を探し、本物と同じく localhost:8080 に断られる', () => {
    const run = console_({ nodes: 2 });
    const r = run('sudo kubectl get nodes');
    expect(r.code).toBe(1);
    expect(r.err).toBe('The connection to the server localhost:8080 was refused - did you specify the right host or port?\n');
    expect(run('kubectl get nodes').code).toBe(0);
  });

  it('設定を動かすと頼めず、KUBECONFIG で場所を教えると頼める', () => {
    const run = console_({ nodes: 2 });
    run('mv ~/.kube/config ~/cluster.conf');
    expect(run('kubectl get nodes').err).toContain('localhost:8080 was refused');
    run('export KUBECONFIG=/home/learner/cluster.conf');
    expect(run('kubectl get nodes').out).toContain('node-1');
  });
});
