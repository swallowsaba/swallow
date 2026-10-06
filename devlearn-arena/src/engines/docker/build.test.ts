import { describe, expect, it } from 'vitest';
import { createContainerHost } from '@/engines/container/container';
import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { ShellState } from '@/engines/kernel/registry';

/** docker build（Dockerfile からイメージを作る）と、作ったイメージのアプリを動かす（docs/lessons/docker.md docker.i.01・i.02） */

const PACKAGE = '{\n  "name": "hello",\n  "version": "1.0.0",\n  "dependencies": { "express": "^4.21.0" }\n}\n';
const SERVER = [
  "const express = require('express');",
  'const app = express();',
  "app.get('/', (req, res) => res.send('市の窓口: 本日は受付中'));",
  "app.listen(3000, () => console.log('hello: listening on :3000'));",
  '',
].join('\n');
const GOOD = 'FROM node:20-alpine\nWORKDIR /app\nCOPY package.json .\nRUN npm install\nCOPY . .\nCMD ["node", "server.js"]\n';

function shell(dockerfile: string | null = GOOD) {
  const files: Record<string, string | null> = { '/home/learner/hello': null, '/home/learner/hello/package.json': PACKAGE, '/home/learner/hello/server.js': SERVER };
  if (dockerfile !== null) files['/home/learner/hello/Dockerfile'] = dockerfile;
  const s = createSession({ containers: createContainerHost(), files, cwd: '/home/learner/hello' });
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

describe('docker build', () => {
  it('Dockerfile の命令を順に段にして作り、-t の名前を付ける。一覧に出る', () => {
    const { sh } = shell();
    const r = sh('docker build -t hello:1.0 .');
    expect(r.code).toBe(0);
    const steps = r.stdout.split('\n').filter((l) => l.startsWith(' => ')).map((l) => l.replace(/\s+\d+\.\ds$/, ''));
    expect(steps).toEqual([
      ' => [internal] load build definition from Dockerfile',
      ' => [internal] load metadata for docker.io/library/node:20-alpine',
      ' => [1/5] FROM docker.io/library/node:20-alpine',
      ' => [2/5] WORKDIR /app',
      ' => [3/5] COPY package.json .',
      ' => [4/5] RUN npm install',
      ' => [5/5] COPY . .',
      ' => exporting to image',
      ' => => naming to docker.io/library/hello:1.0',
    ]);
    expect(r.stdout).toMatch(/^\[\+\] Building \d+\.\ds \(8\/8\) FINISHED/);
    expect(sh('docker images').stdout).toMatch(/\nhello\s+1\.0\s+[0-9a-f]{12}\s/);
  });

  it('同じ中身の段は使い回す（CACHED）。コードだけ変えると、変わった COPY から下だけ作り直す', () => {
    const { sh } = shell();
    sh('docker build -t hello:1.0 .');
    const again = sh('docker build -t hello:1.0 .').stdout;
    expect(again).toContain(' => CACHED [4/5] RUN npm install');
    expect(again).toContain(' => CACHED [5/5] COPY . .');
    sh("sed -i 's/受付中/受付終了/' server.js");
    const changed = sh('docker build -t hello:1.1 .').stdout;
    expect(changed).toContain(' => CACHED [4/5] RUN npm install');
    expect(changed).toMatch(/\n => \[5\/5\] COPY \. \./);
  });

  it('作ったイメージを動かすと、CMD のアプリが待ち受けて答える', () => {
    const { sh } = shell();
    sh('docker build -t hello:1.0 .');
    expect(sh('docker run -d --name hello -p 8080:3000 hello:1.0').code).toBe(0);
    expect(sh('docker logs hello').stdout).toBe('hello: listening on :3000\n');
    expect(sh('curl -s http://localhost:8080/').stdout).toBe('市の窓口: 本日は受付中\n');
  });

  it('本物と同じ言い方で断る: 知らない命令・置き場所に無いファイル・Dockerfile が無い・FROM が無い・土台のイメージが無い', () => {
    expect(shell('FROM node:20-alpine\nCOPPY . .\n').sh('docker build -t hello:1.0 .').stderr)
      .toContain('ERROR: failed to solve: dockerfile parse error on line 2: unknown instruction: COPPY (did you mean COPY?)');
    expect(shell('FROM node:20-alpine\nCOPY app.js .\n').sh('docker build -t hello:1.0 .').stderr)
      .toMatch(/ERROR: failed to solve: failed to compute cache key: failed to calculate checksum of ref [0-9a-f:]+: "\/app\.js": not found\n/);
    expect(shell(null).sh('docker build -t hello:1.0 .').stderr).toContain('ERROR: failed to solve: failed to read dockerfile: open Dockerfile: no such file or directory');
    expect(shell('WORKDIR /app\n').sh('docker build -t hello:1.0 .').stderr).toContain('ERROR: failed to solve: no build stage in current context');
    expect(shell('FROM node:20-alpne\n').sh('docker build -t hello:1.0 .').stderr)
      .toContain('ERROR: failed to solve: node:20-alpne: failed to resolve source metadata for docker.io/library/node:20-alpne: docker.io/library/node:20-alpne: not found');
    const { sh } = shell();
    expect(sh('docker build -t hello:1.0').stderr).toBe('ERROR: "docker buildx build" requires exactly 1 argument.\nSee \'docker buildx build --help\'.\n');
  });

  it('RUN の失敗で止まる。package.json を写す前の npm install は、ファイルが無いと言う', () => {
    const r = shell('FROM node:20-alpine\nWORKDIR /app\nRUN npm install\nCOPY . .\n').sh('docker build -t hello:1.0 .');
    expect(r.code).toBe(1);
    // 進みの表示も標準エラー（本物と同じ）。ERROR の行は最後
    expect(r.stdout).toBe('');
    expect(r.stderr).toContain(' => ERROR [3/4] RUN npm install');
    expect(r.stderr).toContain('npm error enoent Could not read package.json');
    expect(r.stderr).toMatch(/\nERROR: failed to solve: process "\/bin\/sh -c npm install" did not complete successfully: exit code: 254\n$/);
  });

  it('作ったアプリの誤りは、動かした時に node の言い方で止まる（CMD のファイルが無い・npm install をしていない・CMD が無い）', () => {
    const wrongCmd = shell('FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nRUN npm install\nCMD ["node", "serve.js"]\n');
    wrongCmd.sh('docker build -t hello:1.0 .');
    wrongCmd.sh('docker run -d --name hello -p 8080:3000 hello:1.0');
    expect(wrongCmd.sh('docker ps -a').stdout).toContain('Exited (1)');
    expect(wrongCmd.sh('docker logs hello').stdout).toContain("Error: Cannot find module '/app/serve.js'");

    const noInstall = shell('FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nCMD ["node", "server.js"]\n');
    noInstall.sh('docker build -t hello:1.0 .');
    noInstall.sh('docker run -d --name hello hello:1.0');
    expect(noInstall.sh('docker logs hello').stdout).toContain("Error: Cannot find module 'express'\nRequire stack:\n- /app/server.js");

    const noCmd = shell('FROM node:20-alpine\nWORKDIR /app\nCOPY . .\nRUN npm install\n');
    noCmd.sh('docker build -t hello:1.0 .');
    noCmd.sh('docker run -d --name hello -p 8080:3000 hello:1.0');
    expect(noCmd.sh('docker ps -a').stdout).toContain('Exited (0)');
    expect(noCmd.sh('curl -s http://localhost:8080/').code).not.toBe(0);
  });

  it('docker tag で同じイメージに別の名前を付ける（同じ ID）', () => {
    const { sh } = shell();
    sh('docker build -t hello:1.0 .');
    expect(sh('docker tag hello:1.0 shop/hello:1.0').code).toBe(0);
    const list = sh('docker images').stdout;
    const id = /\nhello\s+1\.0\s+([0-9a-f]{12})/.exec(list)?.[1];
    expect(list).toMatch(new RegExp(`\\nshop/hello\\s+1\\.0\\s+${id ?? 'x'}`));
    expect(sh('docker tag nothing:1 a:1').stderr).toBe('Error response from daemon: No such image: nothing:1\n');
  });
});
