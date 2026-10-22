import { describe, expect, it } from 'vitest';
import { containerHolds } from '@/engines/container/check';
import { createContainerHost } from '@/engines/container/container';
import { initialShell } from '@/engines/environments';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { ShellState } from '@/engines/kernel/registry';

/**
 * 同じ結果に至る別の正しい書き方（VERIFY-FREE.txt【1】）。実務で打つ人がいる書き方は、最後のヒントの書き方と同じに動く。
 * 管理の命令の形（docker container ls・docker image pull）・値を取る旗（--tail 20・-t 1）・--mount・sh -c など
 */

function docker(images: string[] = ['nginx:1.27', 'city-db:1.0', 'city-reserve:2.0']) {
  const s = createSession({ containers: createContainerHost(images) });
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
  return { sh, holds: (expr: string) => containerHolds(state.containers, expr) };
}

function podman() {
  let state = initialShell('linux-basic', { containerCli: 'podman', images: ['city-db:1.0', 'city-reserve:2.0'] });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const sh = (line: string) => {
    const o = execute(state, line, registry, clock);
    state = o.state;
    const pick = (k: 'stdout' | 'stderr'): string => o.chunks.filter((c) => c.stream === k).map((c) => c.text).join('');
    return { stdout: pick('stdout'), stderr: pick('stderr'), code: o.exitCode };
  };
  return { sh, holds: (expr: string) => containerHolds(state.containers, expr) };
}

describe('docker の管理の命令の形（docker container …・docker image …）', () => {
  it('docker container run・ls・stop・rm は、docker run・ps・stop・rm と同じ', () => {
    const { sh, holds } = docker();
    expect(sh('docker container run -d --name=web nginx:1.27').code).toBe(0);
    expect(holds('running:web')).toBe(true);
    expect(sh('docker container ls').stdout).toBe(sh('docker ps').stdout);
    expect(sh('docker container stop web')).toMatchObject({ stdout: 'web\n', code: 0 });
    expect(sh('docker container ls --all').stdout).toContain('Exited (0)');
    expect(sh('docker container rm web')).toMatchObject({ stdout: 'web\n', code: 0 });
    expect(holds('!exists:web')).toBe(true);
  });

  it('docker image pull・ls・tag・rm は、docker pull・images・tag・rmi と同じ', () => {
    const { sh, holds } = docker([]);
    expect(sh('docker image pull nginx:1.27').code).toBe(0);
    expect(holds('image:nginx:1.27')).toBe(true);
    expect(sh('docker image ls').stdout).toBe(sh('docker images').stdout);
    expect(sh('docker image tag nginx:1.27 web:1').code).toBe(0);
    expect(sh('docker image rm web:1').stdout).toContain('Untagged: web:1');
  });

  it('置き場まで書いた名前（docker.io/library/nginx:1.27）は、短い名前と同じイメージ', () => {
    const { sh, holds } = docker([]);
    expect(sh('docker pull docker.io/library/nginx:1.27').code).toBe(0);
    expect(holds('image:nginx:1.27')).toBe(true);
  });

  it('docker images 名前 は、その名前のイメージだけを並べる', () => {
    const { sh } = docker(['nginx:1.27', 'city-db:1.0']);
    const out = sh('docker images nginx').stdout;
    expect(out).toContain('nginx');
    expect(out).not.toContain('city-db');
  });
});

describe('値を取る旗', () => {
  it('docker logs --tail 20 名前・-n 5 名前 は、その名前のログの終わりを出す', () => {
    const { sh } = docker();
    sh('docker run -d --name reserve city-reserve:2.0');
    expect(sh('docker logs --tail 20 reserve')).toMatchObject({ code: 0 });
    expect(sh('docker logs --tail 20 reserve').stdout).toContain('DATABASE_URL');
    expect(sh('docker logs -n 1 reserve').stdout.trim().split('\n')).toHaveLength(1);
  });

  it('docker stop -t 1 名前・--time=1 は、待つ秒数を決めて止める', () => {
    const { sh, holds } = docker();
    sh('docker run -d --name web nginx:1.27');
    expect(sh('docker stop -t 1 web')).toMatchObject({ stdout: 'web\n', code: 0 });
    expect(holds('exited:web')).toBe(true);
    sh('docker start web');
    expect(sh('docker stop --time=1 web')).toMatchObject({ stdout: 'web\n', code: 0 });
  });

  it('docker network create --driver bridge 名前・-d bridge 名前 は、その名前の網を作る', () => {
    const { sh, holds } = docker();
    expect(sh('docker network create --driver bridge city-net').code).toBe(0);
    expect(holds('network:city-net')).toBe(true);
    expect(sh('docker network create -d bridge back-net').code).toBe(0);
    expect(holds('network:back-net')).toBe(true);
  });

  it('docker top 名前 は、そのコンテナのプロセスを機械から見た PID で並べる', () => {
    const { sh } = docker(['nginx:1.27-alpine']);
    sh('docker run -d --name web nginx:1.27-alpine');
    const out = sh('docker top web');
    expect(out.code).toBe(0);
    expect(out.stdout).toMatch(/^UID +PID +PPID/);
    expect(out.stdout).toContain('nginx: master process');
  });
});

describe('--mount でボリュームを付ける', () => {
  it('docker run --mount source=…,target=… は -v と同じ（type=volume・src・dst も読む）', () => {
    const { sh, holds } = docker();
    sh('docker volume create db-data');
    expect(sh('docker run -d --name db --mount source=db-data,target=/var/lib/postgresql/data city-db:1.0').code).toBe(0);
    expect(holds('running:db mount:db=db-data:/var/lib/postgresql/data')).toBe(true);
    sh('docker rm -f db');
    expect(sh('docker run -d --name db --mount type=volume,src=db-data,dst=/var/lib/postgresql/data city-db:1.0').code).toBe(0);
    expect(holds('mount:db=db-data:/var/lib/postgresql/data')).toBe(true);
  });

  it('podman run --mount type=volume,source=…,target=… も同じ', () => {
    const { sh, holds } = podman();
    expect(sh('podman run -d --name db --mount type=volume,source=db-data,target=/var/lib/postgresql/data city-db:1.0').code).toBe(0);
    expect(holds('running:db mount:db=db-data:/var/lib/postgresql/data')).toBe(true);
  });
});

describe('コンテナの中で打つ', () => {
  it('exec 名前 sh -c "…" は、中で 1 行を動かす（&& でつないでもよい）', () => {
    const { sh } = docker();
    sh('docker run -d --name web nginx:1.27');
    expect(sh("docker exec web sh -c 'cat /etc/nginx/conf.d/default.conf'").stdout).toBe(sh('docker exec web cat /etc/nginx/conf.d/default.conf').stdout);
    expect(sh('docker exec web sh -c "ls /etc/nginx && hostname"').code).toBe(0);
    // 何も書かない sh は、今まで通り対話の端末は開けないと言う
    expect(sh('docker exec -it web sh').code).not.toBe(0);
  });

  it('中で打つ命令の相対パスは、イメージの WORKDIR から（sh -c の中も）', () => {
    const app = { containerCli: 'podman', images: ['node:20-alpine'], files: {
      '/home/learner/reserve/Containerfile': 'FROM docker.io/library/node:20-alpine\nWORKDIR /app\nCOPY server.js .\nCMD ["node", "server.js"]\n',
      '/home/learner/reserve/server.js': "require('http').createServer((q, r) => r.end('閉館 17:00')).listen(3000);\n",
    }, run: ['podman build -t reserve:1.0 reserve', 'podman run -d --name web -p 8080:3000 reserve:1.0'] };
    let state = initialShell('linux-basic', app);
    const registry = createDefaultRegistry();
    const clock = createClock();
    const sh = (line: string) => {
      const o = execute(state, line, registry, clock);
      state = o.state;
      return { stdout: o.chunks.filter((c) => c.stream === 'stdout').map((c) => c.text).join(''), code: o.exitCode };
    };
    expect(sh(`podman exec web sh -c "sed -i 's/17:00/19:00/' server.js"`).code).toBe(0);
    expect(sh('podman exec web cat server.js').stdout).toContain('19:00');
    expect(sh('podman exec web grep 19:00 /app/server.js').code).toBe(0);
    expect(sh('podman exec web ls').stdout).toContain('server.js');
  });

  it('COPY の写す元に * を書ける（package*.json は package.json と package-lock.json）。合う物が無ければ断る', () => {
    const files = {
      '/home/learner/app/package.json': '{ "name": "app", "dependencies": { "express": "^4.19.0" } }\n',
      '/home/learner/app/package-lock.json': '{}\n',
      '/home/learner/app/server.js': "require('http').createServer((q, r) => r.end('ok')).listen(3000);\n",
      '/home/learner/app/Dockerfile': 'FROM node:20-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm install\nCOPY . .\nCMD ["node", "server.js"]\n',
      '/home/learner/bad/Dockerfile': 'FROM node:20-alpine\nWORKDIR /app\nCOPY *.lock ./\n',
    };
    let state = initialShell('container-host', { images: ['node:20-alpine'], files });
    const registry = createDefaultRegistry();
    const clock = createClock();
    const sh = (line: string) => {
      const o = execute(state, line, registry, clock);
      state = o.state;
      return { out: o.chunks.map((c) => c.text).join(''), code: o.exitCode };
    };
    expect(sh('docker build -t app:1 app').code).toBe(0);
    sh('docker run -d --name a app:1');
    expect(sh('docker exec a ls /app').out).toContain('package-lock.json');
    expect(sh('docker build -t bad:1 bad').code).not.toBe(0);
  });

  it('exec 名前 grep 語 ファイル は、中のファイルから語のある行を出す（alpine の busybox にある）', () => {
    const { sh } = docker(['nginx:1.27-alpine']);
    sh('docker run -d --name web nginx:1.27-alpine');
    const out = sh('docker exec web grep root /etc/nginx/conf.d/default.conf');
    expect(out.code).toBe(0);
    expect(out.stdout).toContain('/usr/share/nginx/html');
  });

  it('psql で DB を書かなければ、初めから在る postgres の DB につなぐ（SHOW は答え、予約の表は無い）', () => {
    const { sh } = docker();
    sh('docker run -d --name db city-db:1.0');
    const shown = sh("docker exec db psql -U postgres -c 'SHOW data_directory;'");
    expect(shown.code).toBe(0);
    expect(shown.stdout).toContain('/var/lib/postgresql/data');
    expect(sh("docker exec db psql -U postgres -c 'SELECT * FROM reservations'").stderr).toContain('relation "reservations" does not exist');
    expect(sh("docker exec db psql -U postgres -d nope -c 'SELECT 1'").stderr).toContain('database "nope" does not exist');
  });

  it('psql の DB の名前は、-d でも後ろの引数でも書ける', () => {
    const { sh } = docker();
    sh('docker run -d --name db city-db:1.0');
    expect(sh('docker exec db psql -U postgres reserve -c "SELECT count(*) FROM reservations"').stdout).toContain('     3\n');
  });
});

describe('podman も同じ書き方を読む', () => {
  it('podman logs --tail 5 名前・podman container ls・podman stop -t 1 名前・podman top 名前', () => {
    const { sh, holds } = podman();
    sh('podman run -d --name web city-reserve:2.0');
    expect(sh('podman logs --tail 5 web')).toMatchObject({ code: 0 });
    expect(sh('podman logs --tail 5 web').stdout).toContain('DATABASE_URL');
    sh('podman run -d --name db city-db:1.0');
    expect(sh('podman container ls').stdout).toBe(sh('podman ps').stdout);
    expect(sh('podman top db').code).toBe(0);
    expect(sh('podman stop -t 1 db')).toMatchObject({ stdout: 'db\n', code: 0 });
    expect(holds('exited:db')).toBe(true);
  });
});
