import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, type Session } from '../session';
import { execute } from '../shell';

let session: Session;

beforeEach(() => {
  session = createSession({
    files: {
      '/home/learner': null,
      '/var/log': null,
      '/var/log/app.log': 'x'.repeat(50_000),
      '/var/log/old': null,
      '/var/log/old/2026-03.log': 'y'.repeat(20_000),
    },
    processes: [
      { command: 'nginx: worker process', cpu: 1.5, memory: 64 },
      { command: 'java -jar report-batch.jar', cpu: 92.4, memory: 2048, openFiles: ['/var/log/app.log'] },
      { command: 'sshd: root@pts/0', user: 'root', cpu: 0.1, memory: 12, ignoresTerm: true },
    ],
  });
});

function run(line: string): { out: string; err: string; code: number } {
  const outcome = execute(session.state, line, session.registry, session.clock);
  session = { ...session, state: outcome.state };
  const pick = (s: 'stdout' | 'stderr') =>
    outcome.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
  return { out: pick('stdout'), err: pick('stderr'), code: outcome.exitCode };
}

describe('プロセスを見る', () => {
  it('ps に init と自分のシェルと種を撒いたものが並ぶ', () => {
    const out = run('ps aux').out;
    expect(out).toContain('/sbin/init');
    expect(out).toContain('/bin/devsh');
    expect(out).toContain('report-batch.jar');
    expect(out).toContain('USER');
  });

  it('top は CPU の多い順に並ぶ', () => {
    const lines = run('top').out.split('\n').filter((l) => /^\d/.test(l));
    expect(lines[0]).toContain('report-batch.jar');
  });

  it('free でメモリの空きが分かる', () => {
    const out = run('free').out;
    expect(out).toContain('Mem:');
    expect(out).toContain('8192');
  });

  it('pgrep で pid を引ける', () => {
    const pid = run('pgrep report-batch').out.trim();
    expect(Number(pid)).toBeGreaterThan(2);
    expect(run('pgrep いない').code).toBe(1);
  });
});

describe('プロセスを止める', () => {
  it('kill で止まると ps から消える', () => {
    const pid = run('pgrep report-batch').out.trim();
    expect(run(`kill ${pid}`).code).toBe(0);
    expect(run('ps aux').out).not.toContain('report-batch.jar');
  });

  it('SIGTERM を無視する相手は -9 でないと落ちない', () => {
    const pid = run('pgrep sshd').out.trim();
    run(`kill ${pid}`);
    expect(run('ps aux').out).toContain('sshd');
    run(`kill -9 ${pid}`);
    expect(run('ps aux').out).not.toContain('sshd');
  });

  it('init は止められない', () => {
    const result = run('kill 1');
    expect(result.code).toBe(1);
    expect(result.err).toContain('Operation not permitted');
  });

  it('いない pid には文句を言う', () => {
    expect(run('kill 9999').err).toContain('No such process');
  });

  it('pkill は名前でまとめて止める', () => {
    expect(run('pkill nginx').code).toBe(0);
    expect(run('ps aux').out).not.toContain('nginx');
    expect(run('pkill nginx').code).toBe(1);
  });
});

describe('容量', () => {
  it('du でディレクトリごとの大きさが見える', () => {
    const out = run('du -h /var/log').out;
    expect(out).toContain('/var/log/old');
    expect(out).toContain('/var/log');
  });

  it('df は使用量を出す', () => {
    expect(run('df -h').out).toContain('Mounted on');
  });

  it('掴まれたまま消したファイルの分は空きに戻らない', () => {
    const before = run('df').out;
    run('rm /var/log/app.log');
    const after = run('df').out;
    // 掴んでいるプロセスが居るので、消しても使用量が大きく減らない
    expect(after).not.toBe(before);
    expect(run('lsof /var/log/app.log').out).toContain('(deleted)');
    // 掴んでいるプロセスを止めれば戻る
    const pid = run('pgrep report-batch').out.trim();
    run(`kill ${pid}`);
    expect(run('lsof /var/log/app.log').code).toBe(1);
  });
});
