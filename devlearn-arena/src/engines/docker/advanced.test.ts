import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import type { ShellState } from '@/engines/kernel/registry';
import { execute } from '@/engines/kernel/shell';
import { checkState } from '@/learning/practice';

/** ctr・docker の上級の実戦で使う模擬: 再起動の方針（ctr.a.01）・非 root と点検（ctr.a.02）・マルチステージ（docker.a.01）・止まる原因（docker.a.02） */

const registry = createDefaultRegistry();
const clock = createClock();

function session(setup: unknown) {
  let shell: ShellState = initialShell('container-host', setup);
  return {
    run(line: string) {
      const o = execute(shell, line, registry, clock);
      shell = o.state;
      const pick = (s: string) => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    },
    is: (expr: string) => checkState({ kind: 'container', expr }, { shell }),
  };
}

describe('再起動の方針', () => {
  it('方針が無いと、落ちたコンテナは止まったまま', () => {
    const s = session({ cwd: '/home/learner' });
    s.run('docker run -d --name shop -p 8080:80 city-shop:1.0');
    const pid = s.run("docker inspect -f '{{.State.Pid}}' shop").out.trim();
    expect(s.run(`sudo kill -9 ${pid}`).code).toBe(0);
    expect(s.is('exited:shop')).toBe(true);
    expect(s.run('docker ps -a').out).toContain('Exited (137)');
  });

  it('--restart=always なら起き上がり、回数が増え、ログも残る', () => {
    const s = session({ cwd: '/home/learner' });
    s.run('docker run -d --name shop --restart=always -p 8080:80 city-shop:1.0');
    expect(s.is('restart:shop=always')).toBe(true);
    const pid = s.run("docker inspect -f '{{.State.Pid}}' shop").out.trim();
    s.run(`sudo kill -9 ${pid}`);
    expect(s.is('running:shop restarts:shop>=1')).toBe(true);
    expect(s.run("docker inspect -f '{{.RestartCount}}' shop").out.trim()).toBe('1');
    expect(s.run("docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' shop").out.trim()).toBe('always');
    expect(s.run("docker inspect -f '{{.State.Pid}}' shop").out.trim()).not.toBe(pid);
    expect(s.run('curl -s http://localhost:8080/').code).toBe(0);
  });

  it('設定の誤りは再起動では直らず、Restarting を繰り返す', () => {
    const s = session({ cwd: '/home/learner' });
    s.run('docker run -d --name crowd --restart=always city-crowd:1.0');
    expect(s.run('docker ps -a').out).toContain('Restarting (1)');
    expect(s.is('running:crowd')).toBe(false);
    expect(s.is('restarts:crowd>=1')).toBe(true);
    expect(s.run('docker logs crowd').out + s.run('docker logs crowd').err).toContain('TARGET_URL is not set');
  });

  it('知らない方針は本物と同じ文で断る。--log-opt を受けて inspect で読める。docker update で変えられる', () => {
    const s = session({ cwd: '/home/learner' });
    const bad = s.run('docker run -d --restart=sometimes city-shop:1.0');
    expect(bad.code).toBe(125);
    expect(bad.err).toContain('invalid restart policy');
    s.run('docker run -d --name shop --log-driver json-file --log-opt max-size=10m -p 8080:80 city-shop:1.0');
    expect(s.is('logopt:shop=max-size')).toBe(true);
    expect(s.run("docker inspect -f '{{.HostConfig.LogConfig.Type}}' shop").out.trim()).toBe('json-file');
    expect(s.run('docker update --restart=on-failure shop').code).toBe(0);
    expect(s.is('restart:shop=on-failure')).toBe(true);
  });

  it('podman でも同じに動く', () => {
    const s = session({ cwd: '/home/learner', containerCli: 'podman' });
    s.run('podman run -d --name shop --restart=always -p 8080:80 city-shop:1.0');
    const pid = s.run("podman inspect -f '{{.State.Pid}}' shop").out.trim();
    s.run(`kill -9 ${pid}`);
    expect(s.is('running:shop restarts:shop>=1')).toBe(true);
  });
});

const NGINX_SITE = { '/home/learner/site/site/index.html': '<h1>市の案内</h1>\n' };

describe('非 root と点検', () => {
  it('trivy は土台ごとの件数を出し、小さな土台で減る。判定は vulns と size', () => {
    const s = session({ cwd: '/home/learner/site', dirs: ['/home/learner/site/site'], files: { ...NGINX_SITE, '/home/learner/site/Dockerfile': 'FROM nginx:1.27\nCOPY site /usr/share/nginx/html\n' } });
    s.run('docker build -t board:1 .');
    const big = s.run('trivy image board:1').out;
    expect(big).toMatch(/Total: 86 \(UNKNOWN: 0, LOW: \d+, MEDIUM: \d+, HIGH: \d+, CRITICAL: \d+\)/);
    expect(s.is('vulns:board:1<=5')).toBe(false);
    s.run("sed -i 's/nginx:1.27/nginx:1.27-alpine/' Dockerfile");
    s.run('docker build -t board:2 .');
    expect(s.run('trivy image board:2').out).toContain('Total: 3 ');
    expect(s.is('vulns:board:2<=5 size:board:2<=100')).toBe(true);
    expect(s.run('trivy image --exit-code 1 board:2').code).toBe(1);
    expect(s.run('trivy image nothing:9').code).toBe(1);
  });

  it('作った nginx のイメージは、写した頁を答える', () => {
    const s = session({ cwd: '/home/learner/site', dirs: ['/home/learner/site/site'], files: { ...NGINX_SITE, '/home/learner/site/Dockerfile': 'FROM nginx:1.27-alpine\nCOPY site /usr/share/nginx/html\n' } });
    s.run('docker build -t board:2 .');
    s.run('docker run -d --name board -p 8080:80 board:2');
    expect(s.run('curl -s http://localhost:8080/').out).toContain('市の案内');
    expect(s.run('docker exec board id').out).toContain('uid=0(root)');
  });

  it('USER で一般の利用者にすると、80 番では動けない。8080 で待つ土台なら動く', () => {
    const s = session({ cwd: '/home/learner/site', dirs: ['/home/learner/site/site'], files: { ...NGINX_SITE, '/home/learner/site/Dockerfile': 'FROM nginx:1.27-alpine\nCOPY site /usr/share/nginx/html\nUSER nginx\n' } });
    s.run('docker build -t board:3 .');
    s.run('docker run -d --name board -p 8080:80 board:3');
    expect(s.is('exited:board')).toBe(true);
    expect(s.run('docker logs board').out).toContain('bind() to 0.0.0.0:80 failed (13: Permission denied)');
    s.run('docker rm board');
    s.run("sed -i 's/^FROM .*/FROM nginxinc\\/nginx-unprivileged:1.27-alpine/;/^USER/d' Dockerfile");
    s.run('docker build -t board:4 .');
    s.run('docker run -d --name board -p 8080:8080 board:4');
    expect(s.is('running:board user:board=nginx')).toBe(true);
    expect(s.run('docker exec board id').out).toContain('uid=101(nginx)');
    expect(s.run('curl -s http://localhost:8080/').out).toContain('市の案内');
    expect(s.run("docker inspect -f '{{.Config.User}}' board").out.trim()).toBe('nginx');
  });
});

const APP = {
  '/home/learner/app/package.json': '{ "name": "app", "version": "1.0.0", "scripts": { "build": "vite build" }, "dependencies": { "vite": "^5.0.0" } }\n',
  '/home/learner/app/src/index.html': '<h1>小さな店</h1>\n',
};

describe('マルチステージ', () => {
  const stage = 'FROM node:20 AS build\nWORKDIR /app\nCOPY package.json .\nRUN npm ci\nCOPY src src\nRUN npm run build\nFROM nginx:1.27-alpine\nCOPY --from=build /app/dist /usr/share/nginx/html\n';

  it('1 段のイメージは 1GB を超える', () => {
    const s = session({ cwd: '/home/learner/app', dirs: ['/home/learner/app/src'], files: { ...APP, '/home/learner/app/Dockerfile': 'FROM node:20\nWORKDIR /app\nCOPY package.json .\nRUN npm ci\nCOPY src src\nRUN npm run build\n' } });
    expect(s.run('docker build -t shop:1 .').code).toBe(0);
    expect(s.is('size:shop:1<=1000')).toBe(false);
    expect(s.run('docker images').out).toMatch(/shop\s+1\s+\S+\s+.*1\.\d+GB/);
  });

  it('最後の段だけがイメージに入り、成果物の頁を答える', () => {
    const s = session({ cwd: '/home/learner/app', dirs: ['/home/learner/app/src'], files: { ...APP, '/home/learner/app/Dockerfile': stage } });
    const r = s.run('docker build -t shop:2 .');
    expect(r.code).toBe(0);
    expect(s.is('size:shop:2<=100 image:shop:2')).toBe(true);
    s.run('docker run -d --name shop -p 8080:80 shop:2');
    expect(s.run('curl -s http://localhost:8080/').out).toContain('小さな店');
    // 作る道具は最後のイメージに入らない
    expect(s.run('docker exec shop ls /app').code).not.toBe(0);
  });

  it('知らない段の名前は断る。写す物が無ければ断る', () => {
    const s = session({ cwd: '/home/learner/app', dirs: ['/home/learner/app/src'], files: { ...APP, '/home/learner/app/Dockerfile': stage.replace('--from=build', '--from=make') } });
    const r = s.run('docker build -t shop:3 .');
    expect(r.code).not.toBe(0);
    expect(r.err).toContain('make');
    const t = session({ cwd: '/home/learner/app', dirs: ['/home/learner/app/src'], files: { ...APP, '/home/learner/app/Dockerfile': stage.replace('/app/dist', '/app/out') } });
    expect(t.run('docker build -t shop:3 .').code).not.toBe(0);
  });
});

describe('diff -s', () => {
  it('同じファイルは identical と言う。違えば差分を出す', () => {
    const s = session({ cwd: '/home/learner', files: { '/home/learner/a.txt': 'x\n', '/home/learner/b.txt': 'x\n', '/home/learner/c.txt': 'y\n' } });
    expect(s.run('diff -s a.txt b.txt').out).toBe('Files a.txt and b.txt are identical\n');
    expect(s.run('diff -s a.txt c.txt').code).toBe(1);
  });
});

describe('止まる原因が重なるイメージ', () => {
  it('city-batch は環境変数が無いと 1 で止まり、メモリが足りないと 137 で止まり、両方直すと動く', () => {
    const s = session({ cwd: '/home/learner' });
    s.run('docker run -d --name batch --memory 64m city-batch:1.0');
    expect(s.run('docker ps -a').out).toContain('Exited (1)');
    s.run('docker rm batch');
    s.run('docker run -d --name batch --memory 64m -e DATABASE_URL=postgres://db/batch city-batch:1.0');
    expect(s.run('docker ps -a').out).toContain('Exited (137)');
    expect(s.run("docker inspect -f '{{.State.OOMKilled}}' batch").out.trim()).toBe('true');
    s.run('docker rm batch');
    s.run('docker run -d --name batch --memory 256m -e DATABASE_URL=postgres://db/batch city-batch:1.0');
    expect(s.is('running:batch')).toBe(true);
  });
});
