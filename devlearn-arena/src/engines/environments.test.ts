import { describe, expect, it } from 'vitest';
import { createClock } from './kernel/clock';
import { createDefaultRegistry } from './kernel/commands';
import { createShellState } from './kernel/session';
import { execute } from './kernel/shell';
import { exists, readFile } from './kernel/vfs';
import { initialShell, resolveSetup, shellOptions } from './environments';

const run = (env: string, setup: unknown, lines: string[]): string => {
  let shell = createShellState(shellOptions(env, setup));
  const registry = createDefaultRegistry();
  const clock = createClock();
  let out = '';
  for (const line of lines) {
    const r = execute(shell, line, registry, clock);
    shell = r.state;
    out += r.chunks.map((c) => c.text).join('');
  }
  return out;
};

describe('実戦の模擬環境の初期状態（docs/content-spec.md 2.4 の environment と setup）', () => {
  it('土台に setup を重ねる（ディレクトリは足し、ファイルを置き、始める場所を変える）', () => {
    expect(run('linux-basic', { cwd: '/srv/app', dirs: ['/srv/app'], files: { '/srv/app/config.txt': 'port=8080\n' } }, ['pwd', 'whoami', 'cat config.txt', 'ls /home'])).toBe('/srv/app\nlearner\nport=8080\nlearner/\n');
  });

  it('サーバは管理者で入り、setup のサービスを systemctl で扱える', () => {
    const out = run('linux-server', { services: { web: { description: 'Web server' } } }, ['whoami', 'systemctl is-active web', 'systemctl is-enabled web']);
    expect(out).toBe('root\ninactive\ndisabled\n');
  });

  it('コンテナの動く機械では docker が使え、Web を確かめる機械では練習用のルートを信頼する', () => {
    expect(run('container-host', { images: ['nginx:1.27'] }, ['docker images --format "{{.Repository}}:{{.Tag}}"'])).toContain('nginx');
    expect(shellOptions('web-client', {}).web?.roots.map((r) => r.subject)).toEqual(['Minato Root CA']);
  });

  it('知らない環境・形の違う setup・端末の無い環境で端末を作ろうとすると投げる', () => {
    expect(() => resolveSetup('no-such', {})).toThrow('知らない模擬環境');
    expect(() => resolveSetup('linux-basic', { cwd: 'relative' })).toThrow();
    expect(() => resolveSetup('linux-basic', { lock: true })).toThrow();
    expect(() => shellOptions('sql-sqlite', {})).toThrow('端末の実戦に使えない');
  });

  it('同じ setup からは同じ初期状態', () => {
    const setup = { files: { '/home/learner/a.txt': 'a\n' } };
    expect(run('linux-basic', setup, ['ls -l'])).toBe(run('linux-basic', setup, ['ls -l']));
  });
});

describe('setup の run（始める前に打っておくコマンド）', () => {
  it('打った結果から始まり、履歴は残らず、始める場所に戻る', () => {
    const shell = initialShell('linux-basic', { run: ['mkdir -p /home/learner/site', 'cd /home/learner/site', 'echo hi > index.html'] });
    expect(shell.cwd).toBe('/home/learner');
    expect(shell.history).toEqual([]);
    expect(readFile(shell.vfs, '/home/learner/site/index.html')).toBe('hi\n');
  });

  it('打った行は ~/.bash_history に残る（run の行は残らない）', () => {
    let shell = initialShell('linux-basic', { run: ['mkdir -p /home/learner/site'] });
    expect(exists(shell.vfs, '/home/learner/.bash_history')).toBe(false);
    shell = execute(shell, 'ls -l ~', createDefaultRegistry(), createClock()).state;
    expect(readFile(shell.vfs, '/home/learner/.bash_history')).toBe('ls -l ~\n');
    const root = execute(initialShell('linux-server', {}), 'pwd', createDefaultRegistry(), createClock()).state;
    expect(readFile(root.vfs, '/root/.bash_history')).toBe('pwd\n');
  });

  it('run のコマンドが失敗すれば、内容の誤りとして投げる', () => {
    expect(() => initialShell('linux-basic', { run: ['cat /nothing'] })).toThrow(/setup の run/);
  });

  it('cluster を書くと、その数の Node を持つクラスタで始まる', () => {
    expect(initialShell('linux-basic', { cluster: { nodes: 2 } }).cluster?.nodes.size).toBe(2);
    expect(initialShell('linux-basic', {}).cluster).toBeNull();
  });
});
