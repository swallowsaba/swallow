import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { gitHolds } from '@/engines/git/check';
import { createClock } from '../clock';
import { createDefaultRegistry } from '.';
import type { ShellState } from '../registry';
import { execute } from '../shell';

/** 予約システム。dist（作った物）まで記録してしまい、.env（秘密）と node_modules はまだ追跡していない */
function machine() {
  let shell: ShellState = initialShell('linux-basic', {
    cwd: '/home/learner/reserve',
    dirs: ['/home/learner/reserve', '/home/learner/reserve/dist', '/home/learner/reserve/src', '/home/learner/reserve/node_modules/left-pad', '/home/learner/reserve/src/logs'],
    files: {
      '/home/learner/reserve/src/app.js': "console.log('reserve')\n",
      '/home/learner/reserve/src/logs/debug.log': 'debug\n',
      '/home/learner/reserve/dist/app.min.js': "console.log('reserve')\n",
      '/home/learner/reserve/node_modules/left-pad/index.js': 'module.exports = 1\n',
      '/home/learner/reserve/.env': 'DB_PASSWORD=park-2026\n',
      '/home/learner/reserve/README.md': '# 予約システム\n',
    },
    run: ['git init', 'git add src/app.js README.md dist', 'git commit -m "予約システムを作る"'],
  });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string): { out: string; err: string; code: number } => {
    const o = execute(shell, line, registry, clock);
    shell = o.state;
    const pick = (s: 'stdout' | 'stderr') => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
  };
  const holds = (expr: string): boolean => gitHolds(shell.git, shell.vfs, expr);
  return { run, holds };
}

describe('.gitignore', () => {
  it('書いた名前（ディレクトリの / ・* の形・どの深さでも）は、追跡していなければ status に出ず、git add . でも選ばれない', () => {
    const m = machine();
    expect(m.run('git status').out).toContain('.env');
    m.run("echo '.env' > .gitignore");
    m.run("echo 'node_modules/' >> .gitignore");
    m.run("echo '*.log' >> .gitignore");
    const st = m.run('git status').out;
    expect(st).not.toContain('.env\n');
    expect(st).not.toContain('node_modules');
    expect(st).not.toContain('debug.log');
    expect(st).toContain('.gitignore');
    m.run('git add .');
    const staged = m.run('git status').out;
    expect(staged).toContain('new file:   .gitignore');
    expect(staged).not.toContain('.env');
  });

  it('無視するファイルを名前で add すると、本物と同じく断る（-f なら選べる）', () => {
    const m = machine();
    m.run("echo '.env' > .gitignore");
    const r = m.run('git add .env');
    expect(r.code).toBe(1);
    expect(r.err).toBe('The following paths are ignored by one of your .gitignore files:\n.env\nhint: Use -f if you really want to add them.\n');
    expect(m.run('git add -f .env').code).toBe(0);
  });

  it('既に追跡しているファイルは、.gitignore に書いても追跡されたまま。git rm --cached で外すと、ファイルは残り、以後は出ない', () => {
    const m = machine();
    m.run("echo 'dist/' > .gitignore");
    m.run("echo 'changed' > dist/app.min.js");
    expect(m.run('git status').out).toContain('modified:   dist/app.min.js');
    expect(m.run('git rm --cached dist').err).toContain("fatal: not removing 'dist' recursively without -r");
    const r = m.run('git rm -r --cached dist');
    expect(r.out).toBe("rm 'dist/app.min.js'\n");
    expect(m.run('cat dist/app.min.js').out).toBe('changed\n');
    expect(m.run('git status').out).toContain('deleted:    dist/app.min.js');
    m.run('git add .gitignore');
    m.run('git commit -m "作った物を管理から外す"');
    const after = m.run('git status').out;
    expect(after).not.toContain('dist');
    expect(m.holds('!committed:dist/app.min.js')).toBe(true);
    expect(m.run('git rm --cached nothing.txt').err).toContain("fatal: pathspec 'nothing.txt' did not match any files");
  });

  it('git rm（--cached なし）はファイルも消す', () => {
    const m = machine();
    expect(m.run('git rm README.md').out).toBe("rm 'README.md'\n");
    expect(m.run('ls').out).not.toContain('README.md');
  });

  it('git check-ignore は、無視される名前を出し（-v はどの行の決まりか）、無視されなければ 1 で終わる。! で外した名前は無視しない', () => {
    const m = machine();
    m.run("echo '*.log' > .gitignore");
    m.run("echo '!keep.log' >> .gitignore");
    m.run("echo '.env' >> .gitignore");
    expect(m.run('git check-ignore .env').out).toBe('.env\n');
    expect(m.run('git check-ignore -v .env').out).toBe('.gitignore:3:.env\t.env\n');
    expect(m.run('git check-ignore -v src/logs/debug.log').out).toBe('.gitignore:1:*.log\tsrc/logs/debug.log\n');
    m.run("echo 'k' > keep.log");
    const kept = m.run('git check-ignore keep.log');
    expect(kept.code).toBe(1);
    expect(kept.out).toBe('');
    expect(m.run('git status').out).toContain('keep.log');
  });
});

describe('無視の判定', () => {
  it('ignored:<パス> は、そのパスが .gitignore の決まりに当たる時に満たす（追跡しているかは問わない）', () => {
    const m = machine();
    expect(m.holds('ignored:.env')).toBe(false);
    m.run("echo '.env' > .gitignore");
    m.run("echo 'dist/' >> .gitignore");
    expect(m.holds('ignored:.env ignored:dist/app.min.js !ignored:src/app.js')).toBe(true);
  });
});

describe('タグの判定', () => {
  it('tag:<名前> は、そのタグが今の枝の先の記録を指す時だけ満たす', () => {
    const m = machine();
    expect(m.holds('tag:v1.0')).toBe(false);
    m.run('git tag v1.0');
    expect(m.holds('tag:v1.0')).toBe(true);
    m.run("echo 'x' > x.txt");
    m.run('git add x.txt');
    m.run('git commit -m "x"');
    expect(m.holds('tag:v1.0')).toBe(false);
    m.run('git tag -a v1.1 -m "1.1"');
    expect(m.holds('tag:v1.1')).toBe(true);
  });
});

describe('タグを消す', () => {
  it('git tag -d は、本物と同じく消したタグが指していた記録の番号を言う', () => {
    const m = machine();
    m.run('git tag v1.0');
    const head = m.run('git rev-parse --short HEAD').out.trim();
    expect(m.run('git tag -d v1.0').out).toBe(`Deleted tag 'v1.0' (was ${head})\n`);
    expect(m.run('git tag -d v1.0').err).toBe("error: tag 'v1.0' not found.\n");
  });
});

describe('記録の番号を引く', () => {
  it('git rev-parse --short は、本物と同じく番号の頭 7 字を出す', () => {
    const m = machine();
    const full = m.run('git rev-parse HEAD').out.trim();
    expect(full).toHaveLength(40);
    expect(m.run('git rev-parse --short HEAD').out).toBe(`${full.slice(0, 7)}\n`);
  });
});
