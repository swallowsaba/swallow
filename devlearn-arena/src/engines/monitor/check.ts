import { dirname, resolve } from '@/engines/kernel/path';
import type { ShellState } from '@/engines/kernel/registry';
import { exists, isDir, readFile } from '@/engines/kernel/vfs';
import { parseDuration, readRules } from './rules';
import { readTestFile, runTestFile, type TestRun } from './unittest';

/**
 * 実戦の達成条件 `{ kind: 'alert', expr }`（docs/content-spec.md 2.4）を、端末の機械のファイル（Prometheus の規則と、その単体テスト）で判定する。純粋な関数。
 *
 * expr は空白で区切った条件で、全てを満たせば達成。先頭の `!` で否定。パスは端末の今いる場所から:
 *   rules:規則のファイル               promtool check rules が通る
 *   test:テストのファイル               promtool test rules が通る（鳴った時刻・ラベル・注釈が、書いた期待と全て同じ）
 *   times:テストのファイル              期待を書いた全ての時刻で、鳴っているアラートの数が期待と同じ（ラベルと注釈は問わない）
 *   fire:テストのファイル@時刻=名前      その時刻（10h3m の形）に、その名前のアラートが鳴っている（firing）
 */

function textOf(shell: ShellState, path: string): string | null {
  const p = resolve(shell.cwd, path);
  return exists(shell.vfs, p) && !isDir(shell.vfs, p) ? readFile(shell.vfs, p) : null;
}

function run(shell: ShellState, testPath: string): TestRun | null {
  const text = textOf(shell, testPath);
  if (text === null) return null;
  const dir = dirname(resolve(shell.cwd, testPath));
  return runTestFile(text, (rf) => {
    const t = textOf(shell, resolve(dir, rf));
    return t === null ? null : { path: rf, text: t };
  });
}

function termHolds(shell: ShellState, term: string): boolean {
  const m = /^(rules|test|times|fire):([^@=]+)(?:@([0-9a-z]+)=(\S+))?$/.exec(term);
  if (!m || (m[1] === 'fire') !== (m[3] !== undefined)) throw new Error(`アラートの条件「${term}」は知らない形`);
  const [, key = '', path = '', at, name] = m;
  if (key === 'rules') {
    const text = textOf(shell, path);
    return text !== null && readRules(path, text).ok;
  }
  const r = run(shell, path);
  if (!r || r.failures === null) return false;
  if (key === 'test') return r.failures.length === 0;
  if (key === 'fire') {
    const t = parseDuration(at ?? '');
    if (t === null) throw new Error(`アラートの条件「${term}」の時刻が読めない`);
    if (!r.firing.has(t)) throw new Error(`アラートの条件「${term}」: テストのファイルに、その時刻の alert_rule_test が無い`);
    return (r.firing.get(t) ?? []).some((a) => a.labels['alertname'] === name);
  }
  // times: 鳴った数だけを期待と比べる
  const test = readTestFile(textOf(shell, path) ?? '');
  if (typeof test === 'string') return false;
  return test.groups.every((g) => g.cases.every((c) => (r.firing.get(c.evalTime) ?? []).filter((a) => a.labels['alertname'] === c.alertname).length === c.exp.length));
}

export function alertHolds(shell: ShellState, expr: string): boolean {
  return expr.trim().split(/\s+/).every((t) => (t.startsWith('!') ? !termHolds(shell, t.slice(1)) : termHolds(shell, t)));
}
