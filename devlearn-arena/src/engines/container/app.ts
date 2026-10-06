/**
 * 作ったイメージの中のアプリを動かす（docker build で作った Node.js のアプリ）。純粋な関数。
 *
 * CMD の命令（node 置き場所）で、中のファイルを読んで動きを決める。本物の node と同じ言い方で失敗する:
 * - 置き場所のファイルが無い → Cannot find module '/app/serve.js'
 * - require した外の部品が node_modules に無い（npm install をしていない）→ Cannot find module 'express'
 * - node だけ（CMD が無く土台の node のまま）→ 端末が無いので、すぐ終わる（0）
 * 動けば、.listen(番号) で待ち受け、res.send('…') の文で答え、console.log('…') の文をログに出す
 */

/** node の中にある部品（node_modules が要らない） */
const BUILTIN = new Set(['http', 'https', 'fs', 'path', 'os', 'url', 'util', 'events', 'crypto', 'node:http', 'node:fs', 'node:path']);

const NODE_VERSION = 'v20.18.0';

export interface AppRun {
  exitCode: number | null;
  log: string[];
  /** 待ち受けて答える物（動いている時） */
  serves?: { port: number; body: string };
  /** 動いている間のプロセスの命令 */
  command: string;
}

/** CMD を、打つ命令の並びにする（シェルの形 /bin/sh -c "node server.js" も読む） */
export function argvOf(cmd: readonly string[]): string[] {
  if ((cmd[0] === '/bin/sh' || cmd[0] === 'sh') && cmd[1] === '-c') return (cmd[2] ?? '').trim().split(/\s+/).filter(Boolean);
  return [...cmd];
}

const resolveIn = (dir: string, path: string): string => {
  const parts = (path.startsWith('/') ? path : `${dir.replace(/\/$/, '')}/${path}`).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return `/${out.join('/')}`;
};

const missingModule = (target: string): string[] => [
  'node:internal/modules/cjs/loader:1228',
  '  throw err;',
  '  ^',
  '',
  `Error: Cannot find module '${target}'`,
  '    at Module._resolveFilename (node:internal/modules/cjs/loader:1225:15)',
  '    at Module._load (node:internal/modules/cjs/loader:1051:27)',
  '    at node:internal/main/run_main_module:28:49 {',
  "  code: 'MODULE_NOT_FOUND',",
  '  requireStack: []',
  '}',
  '',
  `Node.js ${NODE_VERSION}`,
];

/** Node.js のアプリを動かす。node で始まらない命令なら null（この関数では扱わない） */
export function runNodeApp(cmd: readonly string[], workdir: string, files: Readonly<Record<string, string>>): AppRun | null {
  const argv = argvOf(cmd);
  if (argv[0] !== 'node') return null;
  const script = argv[1];
  // 端末の無い node は、読む物が無いのですぐ終わる
  if (script === undefined) return { exitCode: 0, log: [], command: 'node' };
  const path = resolveIn(workdir, script);
  const source = files[path];
  if (source === undefined) return { exitCode: 1, log: missingModule(path), command: argv.join(' ') };
  for (const m of source.matchAll(/require\(\s*['"]([^'"]+)['"]\s*\)/g)) {
    const name = m[1] ?? '';
    if (name.startsWith('.') || BUILTIN.has(name)) continue;
    if (files[resolveIn(workdir, `node_modules/${name}/package.json`)] !== undefined) continue;
    const log = missingModule(name);
    // 自分のファイルから呼んだ時は、呼んだ場所を Require stack に出す
    log.splice(4, 1, `Error: Cannot find module '${name}'`, 'Require stack:', `- ${path}`);
    log.splice(log.indexOf('  requireStack: []'), 1, `  requireStack: [ '${path}' ]`);
    return { exitCode: 1, log, command: argv.join(' ') };
  }
  const logs = [...source.matchAll(/console\.log\(\s*(['"`])((?:(?!\1).)*)\1\s*\)/g)].map((m) => m[2] ?? '');
  const port = /\.listen\(\s*(\d+)/.exec(source)?.[1];
  const body = /\.(?:send|end)\(\s*(['"`])((?:(?!\1).)*)\1/.exec(source)?.[2] ?? '';
  // 待ち受けない物は、終わりまで流れて 0 で終わる
  if (port === undefined) return { exitCode: 0, log: logs, command: argv.join(' ') };
  return { exitCode: null, log: logs, serves: { port: Number(port), body }, command: argv.join(' ') };
}
