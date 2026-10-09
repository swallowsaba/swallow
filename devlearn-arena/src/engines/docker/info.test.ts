import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import type { ShellState } from '@/engines/kernel/registry';
import { execute } from '@/engines/kernel/shell';

/** docker version・docker info と、本体（Engine）を systemd の docker のサービスとして動かす・止める（docs/lessons/docker.md docker.b.01） */

function machine(dockerService: boolean) {
  let state: ShellState = initialShell('container-host', {
    images: ['nginx:1.27', 'httpd:2.4'],
    ...(dockerService ? { services: { docker: { description: 'Docker Application Container Engine', active: true, enabled: true } } } : {}),
  });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const sh = (line: string) => {
    const out = execute(state, line, registry, clock);
    state = out.state;
    const pick = (s: 'stdout' | 'stderr') => out.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    return { stdout: pick('stdout'), stderr: pick('stderr'), code: out.exitCode };
  };
  return { sh };
}

describe('docker version', () => {
  it('Client（CLI）と Server（Engine・containerd・runc）の版を、別々の段に出す', () => {
    const { sh } = machine(false);
    const r = sh('docker version');
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/^Client: Docker Engine - Community\n Version: +27\.3\.1\n/);
    expect(r.stdout).toContain('Server: Docker Engine - Community\n Engine:\n  Version: ');
    expect(r.stdout).toMatch(/ containerd:\n {2}Version: +1\.7\.22/);
    expect(r.stdout).toMatch(/ runc:\n {2}Version: +1\.1\.14/);
  });
});

describe('docker info', () => {
  it('作ったコンテナの数・動いている数・止まっている数・イメージの数を出す', () => {
    const { sh } = machine(false);
    sh('docker run -d --name web nginx:1.27');
    sh('docker run -d --name api httpd:2.4');
    sh('docker run -d --name old nginx:1.27');
    sh('docker stop old');
    const r = sh('docker info');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Server:\n Containers: 3\n  Running: 2\n  Paused: 0\n  Stopped: 1\n Images: 2\n Server Version: ');
  });
});

describe('本体（Engine）を systemd の docker のサービスで動かす', () => {
  it('サービスが止まっていると、version は Client の段まで出してつながらないと断り、ほかの命令も断る', () => {
    const { sh } = machine(true);
    sh('docker run -d --name web nginx:1.27');
    expect(sh('sudo systemctl stop docker').code).toBe(0);

    const v = sh('docker version');
    expect(v.code).toBe(1);
    expect(v.stdout).toContain('Client: Docker Engine - Community');
    expect(v.stdout).not.toContain('Server:');
    expect(v.stderr).toBe('Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n');
    expect(sh('docker ps').stderr).toContain('Cannot connect to the Docker daemon');
    expect(sh('docker info').stderr).toContain('Cannot connect to the Docker daemon');

    // journal の行には、この機械の名前が出る
    expect(sh('journalctl -u docker').stdout).toMatch(/ docker-host systemd\[1\]: Stopped docker\.service/);

    // 動かすと、前に作ったコンテナもそのまま見える
    expect(sh('sudo systemctl start docker').code).toBe(0);
    expect(sh('docker version').stdout).toContain('Server: Docker Engine - Community');
    expect(sh('docker ps -a').stdout).toContain('web');
  });
});
