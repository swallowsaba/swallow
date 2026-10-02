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
