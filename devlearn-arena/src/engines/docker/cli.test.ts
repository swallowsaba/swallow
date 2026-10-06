import { describe, expect, it } from 'vitest';
import { createContainerHost, findContainer, pull, remove, run, servedAt, start, stop } from '@/engines/container/container';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { createServiceTable } from '@/engines/kernel/services';
import type { ShellState } from '@/engines/kernel/registry';

function shell(extra: Parameters<typeof createSession>[0] = {}) {
  const s = createSession({ containers: createContainerHost(), ...extra });
  let state: ShellState = s.state;
  const sh = (line: string) => {
    const out = execute(state, line, s.registry, s.clock);
    state = out.state;
    return {
      stdout: out.chunks.filter((c) => c.stream === 'stdout').map((c) => c.text).join(''),
      stderr: out.chunks.filter((c) => c.stream === 'stderr').map((c) => c.text).join(''),
      code: out.exitCode,
    };
  };
  return { sh, state: () => state };
}

describe('コンテナの模型（イメージ・コンテナ・ポート）', () => {
  it('イメージは置き場から取ってくる。同じイメージから何個でもコンテナを作れる', () => {
    let h = createContainerHost();
    const p = pull(h, 'nginx');
    if (!p.ok) throw new Error('取れない');
    expect(p.value.ref).toBe('nginx:1.27');
    h = p.host;
    const a = run(h, { image: 'nginx', name: 'a', ports: [{ host: 8080, container: 80 }] });
    if (!a.ok) throw new Error('動かない');
    const b = run(a.host, { image: 'nginx', name: 'b', ports: [{ host: 8081, container: 80 }] });
    if (!b.ok) throw new Error('動かない');
    expect(b.host.containers.map((c) => [c.name, c.state])).toEqual([['a', 'running'], ['b', 'running']]);
    expect(b.host.images).toHaveLength(1);
    expect(a.value.id).not.toBe(b.value.id);
  });

  it('同じ手元のポートは 2 つに使えない。名前も重ねられない', () => {
    const a = run(createContainerHost(), { image: 'nginx', name: 'a', ports: [{ host: 8080, container: 80 }] });
    if (!a.ok) throw new Error('動かない');
    expect(run(a.host, { image: 'httpd', ports: [{ host: 8080, container: 80 }] })).toMatchObject({ ok: false, error: { kind: 'port-in-use', port: 8080 } });
    expect(run(a.host, { image: 'httpd', name: 'a' })).toMatchObject({ ok: false, error: { kind: 'name-in-use', name: 'a' } });
  });

  it('止めると手元のポートが空く。動いているコンテナは force でないと消せない', () => {
    const a = run(createContainerHost(), { image: 'nginx', name: 'a', ports: [{ host: 8080, container: 80 }] });
    if (!a.ok) throw new Error('動かない');
    expect(remove(a.host, 'a')).toMatchObject({ ok: false, error: { kind: 'container-running' } });
    const s = stop(a.host, 'a');
    if (!s.ok) throw new Error('止まらない');
    expect(servedAt(s.host, 8080)).toBeNull();
    expect(remove(s.host, 'a').ok).toBe(true);
    const again = start(s.host, 'a');
    expect(again.ok && servedAt(again.host, 8080)?.container.name).toBe('a');
  });

  it('要る環境変数が無いイメージは、すぐに止まり理由がログに残る', () => {
    const r = run(createContainerHost(), { image: 'postgres:16', name: 'db' });
    if (!r.ok) throw new Error('作れない');
    expect(r.value).toMatchObject({ state: 'exited', exitCode: 1 });
    expect(r.value.log.join('\n')).toContain('superuser password is not specified');
    const ok = run(createContainerHost(), { image: 'postgres:16', name: 'db', env: { POSTGRES_PASSWORD: 'x' } });
    expect(ok.ok && ok.value.state).toBe('running');
  });

  it('同じ操作からは同じ ID と名前', () => {
    const a = run(createContainerHost(), { image: 'redis:7' });
    const b = run(createContainerHost(), { image: 'redis:7' });
    expect(a.ok && b.ok && [a.value.id, a.value.name]).toEqual(b.ok ? [b.value.id, b.value.name] : null);
    expect(a.ok && findContainer(a.host, a.value.id.slice(0, 4))?.name).toBe(a.ok ? a.value.name : '');
  });
});

describe('docker（CLI）', () => {
  it('run -d -p で動かし、ps に出て、curl で中身が返る', () => {
    const { sh } = shell();
    const r = sh('docker run -d --name web -p 8080:80 nginx');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain("Unable to find image 'nginx:1.27' locally");
    expect(r.stdout.trim().split('\n').pop()).toMatch(/^[0-9a-f]{64}$/);
    const ps = sh('docker ps').stdout;
    expect(ps).toContain('0.0.0.0:8080->80/tcp');
    expect(ps).toContain('web');
    expect(sh('curl -s http://localhost:8080').stdout).toContain('Welcome to nginx!');
    expect(sh('docker images').stdout).toMatch(/nginx\s+1\.27\s+3b25b682ea82/);
  });

  it('コンテナの中のポートを取り違えると、つながっても中身が返らない', () => {
    const { sh } = shell();
    sh('docker run -d --name web -p 8080:8080 nginx');
    expect(sh('curl http://localhost:8080')).toMatchObject({ code: 52, stderr: 'curl: (52) Empty reply from server\n' });
  });

  it('本物と同じ言い方のエラー（イメージの名前の綴り・ポートの重なり・名前の重なり・無いコンテナ・動いているコンテナの削除）', () => {
    const { sh } = shell();
    expect(sh('docker run -d ngnix')).toMatchObject({ code: 125 });
    expect(sh('docker run -d ngnix').stderr).toContain("pull access denied for ngnix, repository does not exist");
    sh('docker run -d --name web -p 8080:80 nginx');
    expect(sh('docker run -d -p 8080:80 httpd').stderr).toContain('Bind for 0.0.0.0:8080 failed: port is already allocated');
    expect(sh('docker run -d --name web nginx').stderr).toContain('Conflict. The container name "/web" is already in use');
    expect(sh('docker stop wbe')).toMatchObject({ code: 1, stderr: 'Error response from daemon: No such container: wbe\n' });
    expect(sh('docker rm web').stderr).toContain('container is running: stop the container before removing or force remove');
    expect(sh('docker rm -f web')).toMatchObject({ code: 0, stdout: 'web\n' });
  });

  it('止めたコンテナは ps -a にだけ出る。logs で記録を読む', () => {
    const { sh } = shell();
    sh('docker run -d --name db postgres:16');
    expect(sh('docker ps').stdout).not.toContain('db');
    expect(sh('docker ps -a').stdout).toContain('Exited (1)');
    expect(sh('docker logs db').stdout).toContain('superuser password is not specified');
  });

  it('Docker の無い環境では、つながらないと言う', () => {
    const s = createSession();
    expect(execute(s.state, 'docker ps', s.registry, s.clock).exitCode).toBe(1);
  });
});

describe('隔離の仕組み（名前空間と cgroups。ctr.i.02）', () => {
  it('コンテナの中の ps は自分のプロセスだけを見せ、主のプロセスは PID 1。機械の ps aux には、同じプロセスが機械の PID で出る', () => {
    const { sh } = shell();
    sh('docker run -d --name web -p 8080:80 nginx:1.27-alpine');
    const inside = sh('docker exec web ps').stdout;
    expect(inside).toMatch(/^PID {3}USER {5}TIME {2}COMMAND\n/);
    expect(inside).toMatch(/\n {4}1 root {6}0:00 nginx: master process nginx -g daemon off;\n/);
    expect(inside).not.toContain('/sbin/init');
    const outside = sh('ps aux').stdout;
    expect(outside).toContain('/sbin/init');
    expect(outside).toMatch(/root\s+2101\s+2100\s.*nginx: master process nginx -g daemon off;/);
    expect(outside).toMatch(/root\s+2100\s+1\s.*containerd-shim-runc-v2 -namespace moby -id [0-9a-f]{64}/);
    // 中から見える主のプロセスの、機械での PID
    expect(sh("docker inspect -f '{{.State.Pid}}' web").stdout).toBe('2101\n');
  });

  it('ps の無いイメージで exec ps は、本物と同じく実行するファイルが無いと言う。止まったコンテナには exec できない', () => {
    const { sh } = shell();
    sh('docker run -d --name web nginx:1.27');
    expect(sh('docker exec web ps')).toMatchObject({ code: 127, stderr: 'OCI runtime exec failed: exec failed: unable to start container process: exec: "ps": executable file not found in $PATH: unknown\n' });
    sh('docker stop web');
    expect(sh('docker exec web ps').stderr).toMatch(/^Error response from daemon: container [0-9a-f]{64} is not running\n$/);
  });

  it('--memory の上限より多く使うコンテナは、起動してすぐ止められる（Exited (137)・OOMKilled）。上限が足りれば動き、stats に上限が出る', () => {
    const { sh } = shell();
    expect(sh('docker run -d --name report -p 8081:80 --memory 64m city-report:1.0').code).toBe(0);
    expect(sh('docker ps').stdout).not.toContain('report');
    expect(sh('docker ps -a').stdout).toContain('Exited (137)');
    expect(sh("docker inspect -f '{{.State.OOMKilled}}' report").stdout).toBe('true\n');
    expect(sh('docker stats --no-stream report').stdout).toMatch(/report\s+0\.00%\s+0B \/ 0B\s+0\.00%/);
    sh('docker rm report');
    sh('docker run -d --name report -p 8081:80 -m 256m city-report:1.0');
    expect(sh('docker ps').stdout).toContain('report');
    expect(sh('docker stats --no-stream report').stdout).toMatch(/report\s+\S+%\s+182\.4MiB \/ 256MiB\s+71\.25%/);
    expect(sh('docker exec report cat /sys/fs/cgroup/memory.max').stdout).toBe('268435456\n');
    expect(sh("docker inspect --format '{{.HostConfig.Memory}}' report").stdout).toBe('268435456\n');
    expect(sh('curl -s localhost:8081').code).toBe(0);
  });

  it('上限が無いと、stats の上限は機械の全てのメモリになり、中の memory.max は max。小さすぎる上限は断る', () => {
    const { sh } = shell();
    sh('docker run -d --name report city-report:1.0');
    expect(sh('docker stats --no-stream report').stdout).toContain('182.4MiB / 8GiB');
    expect(sh('docker exec report cat /sys/fs/cgroup/memory.max').stdout).toBe('max\n');
    expect(sh('docker run -d --name tiny -m 4m city-report:1.0')).toMatchObject({ code: 125, stderr: 'docker: Error response from daemon: Minimum memory limit allowed is 6MB.\n' });
    expect(sh('docker run -d --name bad -m lots city-report:1.0')).toMatchObject({ code: 125, stderr: "invalid argument \"lots\" for \"-m, --memory\" flag: invalid size: 'lots'\nSee 'docker run --help'.\n" });
  });
});

describe('curl（手元のサービス）', () => {
  it('サービスが動いている間だけ、そのポートで応える', () => {
    const { sh } = shell({ services: createServiceTable([{ name: 'web', description: 'Web server', active: 'inactive', enabled: false, port: 80, body: '<h1>shop</h1>' }]) });
    expect(sh('curl localhost')).toMatchObject({ code: 7 });
    expect(sh('curl localhost').stderr).toBe("curl: (7) Failed to connect to localhost port 80 after 0 ms: Couldn't connect to server\n");
    sh('systemctl start web');
    expect(sh('curl localhost').stdout).toBe('<h1>shop</h1>\n');
    expect(sh('curl -I http://localhost/').stdout).toMatch(/^HTTP\/1\.1 200 OK\nServer: web\n/);
  });
});
