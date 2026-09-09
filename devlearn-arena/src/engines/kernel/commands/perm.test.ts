import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, type Session } from '../session';
import { execute } from '../shell';

let session: Session;

beforeEach(() => {
  session = createSession({
    files: {
      '/home/learner': null,
      '/home/learner/note.txt': 'hello\n',
      '/home/learner/bin': null,
      '/home/learner/bin/deploy.sh': 'echo deploying\n',
      '/home/learner/secret': null,
      '/home/learner/secret/token': 'abc123\n',
    },
  });
});

function run(line: string): { out: string; err: string; code: number } {
  const outcome = execute(session.state, line, session.registry, session.clock);
  session = { ...session, state: outcome.state };
  const pick = (s: 'stdout' | 'stderr') =>
    outcome.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
  return { out: pick('stdout'), err: pick('stderr'), code: outcome.exitCode };
}

describe('既定の権限', () => {
  it('ls -l に本物と同じ並びで出る', () => {
    const out = run('ls -l').out;
    expect(out).toContain('-rw-r--r-- 1 learner learner');
    expect(out).toContain('drwxr-xr-x 1 learner learner');
  });

  it('stat で 8 進数と記号の両方が見える', () => {
    const out = run('stat note.txt').out;
    expect(out).toContain('(644/-rw-r--r--)');
    expect(out).toContain('Uid: (learner)');
  });
});

describe('chmod', () => {
  it('8 進数で変えられる', () => {
    expect(run('chmod 600 note.txt').code).toBe(0);
    expect(run('stat note.txt').out).toContain('(600/-rw-------)');
  });

  it('記号で足せる', () => {
    run('chmod u+x bin/deploy.sh');
    expect(run('stat bin/deploy.sh').out).toContain('(744/-rwxr--r--)');
  });

  it('読めない指定は断る', () => {
    const result = run('chmod zzz note.txt');
    expect(result.code).toBe(1);
    expect(result.err).toContain('invalid mode');
  });

  it('無いファイルには文句を言う', () => {
    expect(run('chmod 644 nope').err).toContain('No such file or directory');
  });

  it('-R で中身までまとめて変えられる', () => {
    run('chmod -R 700 secret');
    expect(run('stat secret/token').out).toContain('(700/-rwx------)');
  });
});

describe('読めなくする', () => {
  it('読み権限を落とすと cat が断られる', () => {
    run('chmod 000 note.txt');
    const result = run('cat note.txt');
    expect(result.code).toBe(1);
    expect(result.err).toContain('cat: note.txt: Permission denied');
  });

  it('戻せばまた読める', () => {
    run('chmod 000 note.txt');
    run('chmod 644 note.txt');
    expect(run('cat note.txt').out).toBe('hello\n');
  });

  it('ディレクトリの読み権限を落とすと ls が断られる', () => {
    run('chmod 000 secret');
    expect(run('ls secret').err).toContain('Permission denied');
  });

  it('ディレクトリの実行権限を落とすと cd が断られる', () => {
    run('chmod 600 secret');
    expect(run('cd secret').err).toContain('cd: secret: Permission denied');
    expect(run('pwd').out).toBe('/home/learner\n');
  });

  it('書き権限の無いディレクトリには作れない・消せない', () => {
    run('chmod 555 secret');
    expect(run('touch secret/new').err).toContain('Permission denied');
    expect(run('rm secret/token').err).toContain('Permission denied');
    // 中身自体は読める
    expect(run('cat secret/token').out).toBe('abc123\n');
  });
});

describe('umask', () => {
  it('既定は 022 で、新しいファイルは 644 になる', () => {
    expect(run('umask').out.trim()).toBe('0022');
    run('touch fresh.txt');
    expect(run('stat fresh.txt').out).toContain('(644/');
  });

  it('変えると新しく作るものに効く', () => {
    run('umask 077');
    run('touch private.txt');
    run('mkdir private');
    expect(run('stat private.txt').out).toContain('(600/');
    expect(run('stat private').out).toContain('(700/');
  });

  it('既にあるものには効かない', () => {
    run('umask 077');
    expect(run('stat note.txt').out).toContain('(644/');
  });
});

describe('利用者', () => {
  it('id でいまの利用者が分かる', () => {
    expect(run('id').out).toContain('(learner)');
  });

  it('所有者を変えられるのは root だけ', () => {
    expect(run('chown root note.txt').err).toContain('Operation not permitted');
    expect(run('sudo chown root:root note.txt').code).toBe(0);
    expect(run('stat note.txt').out).toContain('Uid: (root)');
  });

  it('root なら権限を無視して読める', () => {
    run('chmod 000 note.txt');
    expect(run('cat note.txt').code).toBe(1);
    expect(run('sudo cat note.txt').out).toBe('hello\n');
  });

  it('他人のものになったファイルは書けなくなる', () => {
    run('sudo chown root:root secret');
    run('sudo chmod 700 secret');
    expect(run('ls secret').err).toContain('Permission denied');
    expect(run('sudo ls secret').out).toContain('token');
  });
});
