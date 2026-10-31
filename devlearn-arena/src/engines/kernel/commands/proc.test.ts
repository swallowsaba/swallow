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
    run(`sudo kill ${pid}`);
    expect(run('ps aux').out).toContain('sshd');
    run(`sudo kill -9 ${pid}`);
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
    // 掴んでいるプロセスが居るので、消しても使用量は変わらない（本物と同じ）
    expect(after).toBe(before);
    expect(run('lsof /var/log/app.log').out).toContain('(deleted)');
    // 掴んでいるプロセスを止めれば戻る
    const pid = run('pgrep report-batch').out.trim();
    run(`kill ${pid}`);
    expect(run('lsof /var/log/app.log').code).toBe(1);
  });
});

describe('メモリが足りない時（スワップ）', () => {
  const swapped = () =>
    createSession({
      totalMemory: 4096,
      totalSwap: 2048,
      processes: [
        { command: 'postgres: main', user: 'root', cpu: 2.0, memory: 900 },
        { command: 'node report-builder.js', cpu: 35.0, memory: 4100 },
        { command: 'nginx: worker process', cpu: 0.4, memory: 60 },
      ],
    });

  it('使用量がメモリを超えた分はスワップに置かれ、free の Swap の行に出る', () => {
    session = swapped();
    const lines = run('free -m').out.split('\n');
    // 4096 を全て使い、超えた分（8 + 12 + 900 + 4100 + 60 − 4096 = 984）がスワップにある
    expect(lines.find((l) => l.startsWith('Mem:'))?.split(/\s+/)).toEqual(['Mem:', '4096', '4096', '0']);
    expect(lines.find((l) => l.startsWith('Swap:'))?.split(/\s+/)).toEqual(['Swap:', '2048', '984', '1064']);
  });

  it('使っているプロセスを止めると、スワップが空き、メモリにも空きが戻る', () => {
    session = swapped();
    const pid = run('pgrep report-builder').out.trim();
    run(`kill ${pid}`);
    const lines = run('free').out.split('\n');
    expect(lines.find((l) => l.startsWith('Swap:'))?.split(/\s+/)).toEqual(['Swap:', '2048', '0', '2048']);
    expect(lines.find((l) => l.startsWith('Mem:'))?.split(/\s+/)).toEqual(['Mem:', '4096', '980', '3116']);
  });

  it('スワップの無い機械の free には Swap の行が出ない（前と同じ）', () => {
    expect(run('free').out).not.toContain('Swap:');
  });

  it('top の頭にスワップの量も出る', () => {
    session = swapped();
    expect(run('top -b -n 1').out).toContain('MiB Swap:   2048 total,   1064 free,    984 used');
  });

  it('ps aux --sort=-%mem はメモリの多い順、--sort=-%cpu は CPU の多い順に並ぶ', () => {
    session = swapped();
    const rows = (line: string) => run(line).out.split('\n').slice(1).filter((l) => l !== '').map((l) => l.split(/\s+/).slice(6).join(' '));
    expect(rows('ps aux --sort=-%mem')[0]).toBe('node report-builder.js');
    expect(rows('ps aux --sort=-%mem')[1]).toBe('postgres: main');
    expect(rows('ps aux --sort -rss')[0]).toBe('node report-builder.js');
    expect(rows('ps aux --sort=-%cpu')[0]).toBe('node report-builder.js');
    expect(rows('ps aux --sort=-%cpu')[1]).toBe('postgres: main');
    expect(rows('ps aux --sort=%mem')[0]).toBe('/sbin/init');
  });
});
