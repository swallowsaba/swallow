import { readAmConfig, receiversFor, routeTree } from '@/engines/monitor/alertmanager';
import { checkOutput, runTestFile, testOutput } from '@/engines/monitor/unittest';
import { resolve } from '../path';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { isDir, readFile, stat } from '../vfs';
import { denied } from './perm';

/**
 * Prometheus と Alertmanager の道具（promtool・amtool）。mon.b.04（アラート）の実戦が使う。
 * 対応: promtool check rules ファイル… / promtool test rules テストのファイル… /
 * amtool config routes [show] --config.file=ファイル / amtool config routes test --config.file=ファイル ラベル=値…
 */

/** 読めるファイルの中身。無い・ディレクトリ・読めない時は、その誤り */
function readText(shell: ShellState, path: string, command: string): { text: string } | { error: CommandResult } {
  const node = stat(shell.vfs, resolve(shell.cwd, path));
  if (node === undefined) return { error: { stderr: `open ${path}: no such file or directory\n`, code: 1 } };
  if (isDir(shell.vfs, resolve(shell.cwd, path))) return { error: { stderr: `read ${path}: is a directory\n`, code: 1 } };
  const blocked = denied(shell, path, 'read', command);
  if (blocked) return { error: { stderr: `open ${path}: permission denied\n`, code: 1 } };
  return { text: readFile(shell.vfs, resolve(shell.cwd, path)) };
}

/** a/b/../c → a/c（相対のまま。本物の filepath.Join と同じく整える） */
function joinClean(dir: string, file: string): string {
  if (file.startsWith('/')) return file;
  const parts: string[] = [];
  const abs = dir.startsWith('/');
  for (const p of `${dir}/${file}`.split('/')) {
    if (p === '' || p === '.') continue;
    if (p === '..' && parts.length > 0 && parts[parts.length - 1] !== '..') parts.pop();
    else if (p !== '..' || !abs) parts.push(p);
  }
  return `${abs ? '/' : ''}${parts.join('/')}` || '.';
}

const dirOf = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/')) || '/' : '.');

function promtool(shell: ShellState, args: readonly string[]): CommandResult {
  const [sub, what, ...files] = args;
  if (sub === '--version' || sub === 'version') return { stdout: 'promtool, version 2.53.2 (branch: HEAD, revision: 3d8ec2d8a33e4a0b3b49f19b2b6b5e3f6c0c2a19)\n  build user:       root@a1b2c3d4e5f6\n  go version:       go1.22.6\n' };
  if (sub === undefined) return { stderr: 'promtool: error: expected command but got nothing, try --help\n', code: 1 };
  if (sub !== 'check' && sub !== 'test') return { stderr: `promtool: error: expected command but got "${sub}", try --help\n`, code: 1 };
  if (what !== 'rules') return { stderr: `promtool: error: expected command but got "${what ?? ''}", try --help\n`, code: 1 };
  if (files.length === 0) return { stderr: `promtool: error: required argument '${sub === 'check' ? 'rule-files' : 'test-rule-file'}' not provided, try --help\n`, code: 1 };
  let stdout = '';
  let stderr = '';
  let code = 0;
  for (const f of files) {
    const got = readText(shell, f, 'promtool');
    let out: { stdout: string; stderr: string; code: number };
    if ('error' in got) {
      out = sub === 'check'
        ? { stdout: `Checking ${f}\n`, stderr: `  FAILED:\n${(got.error.stderr ?? '').trimEnd()}\n\n`, code: 1 }
        : { stdout: `Unit Testing:  ${f}\n`, stderr: `  FAILED:\n    ${(got.error.stderr ?? '').trimEnd()}\n\n`, code: 1 };
    } else if (sub === 'check') {
      out = checkOutput(f, got.text);
    } else {
      // rule_files は、テストのファイルのディレクトリから読む（本物と同じ）
      const run = runTestFile(got.text, (rf) => {
        const path = joinClean(dirOf(f), rf);
        const r = readText(shell, path, 'promtool');
        return 'error' in r ? null : { path, text: r.text };
      });
      out = testOutput(f, run);
    }
    stdout += out.stdout;
    stderr += out.stderr;
    if (out.code !== 0) code = 1;
  }
  // 本物は、見出し（Checking・Unit Testing）を標準出力に、FAILED の段を標準エラーに出す
  return { stdout, stderr, code, stderrLast: true };
}

function amtool(shell: ShellState, args: readonly string[]): CommandResult {
  const rest = [...args];
  let file: string | undefined;
  const plain: string[] = [];
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i] ?? '';
    if (a.startsWith('--config.file=')) file = a.slice('--config.file='.length);
    else if (a === '--config.file') file = rest[(i += 1)];
    else plain.push(a);
  }
  const [cmd, sub, action, ...labels] = plain;
  if (cmd === '--version') return { stdout: 'amtool, version 0.27.0 (branch: HEAD, revision: 0aa3c2aad14cff039931923ab16b26b7481783b5)\n' };
  if (cmd !== 'config' || sub !== 'routes') return { stderr: `amtool: error: expected command but got "${[cmd, sub].filter(Boolean).join(' ')}", try --help\n`, code: 1 };
  if (action !== undefined && action !== 'show' && action !== 'test') return { stderr: `amtool: error: expected command but got "${action}", try --help\n`, code: 1 };
  if (file === undefined) return { stderr: 'amtool: error: required flag --alertmanager.url not provided\n', code: 1 };
  const got = readText(shell, file, 'amtool');
  if ('error' in got) return { stderr: `amtool: error: failed to load config: ${(got.error.stderr ?? '').trimEnd()}\n`, code: 1 };
  const conf = readAmConfig(got.text);
  if (!conf.ok) return { stderr: `amtool: error: failed to load config: ${conf.error}\n`, code: 1 };
  if (action === 'test') {
    const set: Record<string, string> = {};
    for (const l of labels) {
      const m = /^([a-zA-Z_][a-zA-Z0-9_]*)=(.*)$/.exec(l);
      if (!m) return { stderr: `amtool: error: bad matcher format: ${l}\n`, code: 1 };
      set[m[1] ?? ''] = (m[2] ?? '').replace(/^"(.*)"$/, '$1');
    }
    return { stdout: `${receiversFor(conf.route, set).join(',')}\n` };
  }
  return { stdout: routeTree(conf.route) };
}

export const promCommands: CommandSpec[] = [
  {
    name: 'promtool',
    summary: 'Prometheus の規則のファイルを確かめる（check rules）・試す（test rules）',
    handler: ({ argv, shell }) => promtool(shell, argv.slice(1)),
  },
  {
    name: 'amtool',
    summary: 'Alertmanager の知らせる先の振り分けを見る（config routes）・試す（config routes test）',
    handler: ({ argv, shell }) => amtool(shell, argv.slice(1)),
  },
];
