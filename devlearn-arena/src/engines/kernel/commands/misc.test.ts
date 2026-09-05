import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, type Session } from '../session';
import { execute } from '../shell';

let session: Session;
beforeEach(() => {
  session = createSession();
});

function run(line: string): string {
  const outcome = execute(session.state, line, session.registry, session.clock);
  session = { ...session, state: outcome.state };
  return outcome.chunks.map((c) => c.text).join('');
}

describe('環境変数', () => {
  it('env は初期変数を並べる', () => {
    const out = run('env');
    expect(out).toContain('USER=learner');
    expect(out).toContain('HOME=/home/learner');
  });
  it('export したものが env に出る', () => {
    run('export TOKEN=abc');
    expect(run('env')).toContain('TOKEN=abc');
  });
  it('unset で消える', () => {
    run('export TOKEN=abc');
    run('unset TOKEN');
    expect(run('env')).not.toContain('TOKEN=abc');
  });
  it('cd すると PWD が追随する', () => {
    run('cd /etc');
    expect(run('env')).toContain('PWD=/etc');
  });
});

describe('補助コマンド', () => {
  it('help はコマンド一覧を出す', () => {
    const out = run('help');
    expect(out).toContain('grep');
    expect(out).toContain('mkdir');
  });
  it('which は存在しないコマンドで 1 を返す', () => {
    expect(run('which kubectl')).toContain('no kubectl');
    expect(run('which ls')).toBe('/usr/bin/ls\n');
  });
  it('history は実行した行を番号付きで出す', () => {
    run('echo one');
    expect(run('history')).toContain('echo one');
  });
  it('whoami はユーザ名を返す', () => {
    expect(run('whoami')).toBe('learner\n');
  });
  it('uptime は仮想時計を見る（実時間を見ない）', () => {
    expect(run('uptime')).toBe('up 0s (tick 0)\n');
    session.clock.advance(4);
    expect(run('uptime')).toBe('up 2s (tick 4)\n');
  });
  it('basename はパスの末尾を返す', () => {
    expect(run('basename /a/b/c.txt')).toBe('c.txt\n');
  });
});
