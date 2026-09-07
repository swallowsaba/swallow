import { beforeEach, describe, expect, it } from 'vitest';
import { createSession, type Session } from '../session';
import { execute } from '../shell';

let session: Session;
beforeEach(() => {
  session = createSession({
    files: { '/home/learner': null, '/home/learner/memo.txt': 'hello\n' },
  });
});

function run(line: string) {
  const outcome = execute(session.state, line, session.registry, session.clock);
  session = { ...session, state: outcome.state };
  return outcome;
}

describe('簡易エディタ', () => {
  it('既存ファイルを開くと中身が渡る', () => {
    const outcome = run('vi memo.txt');
    expect(outcome.editor).toEqual({
      path: '/home/learner/memo.txt',
      content: 'hello\n',
      tool: 'vi',
    });
  });

  it('新規ファイルは空で開く', () => {
    expect(run('vi new.txt').editor?.content).toBe('');
  });

  it('vim と nano も同じように開く', () => {
    expect(run('vim memo.txt').editor?.tool).toBe('vim');
    expect(run('nano memo.txt').editor?.tool).toBe('nano');
  });

  it('ディレクトリは開けない', () => {
    const outcome = run('vi /home/learner');
    expect(outcome.exitCode).toBe(1);
    expect(outcome.editor).toBeNull();
  });

  it('ファイル名が無ければ促す', () => {
    expect(run('vi').exitCode).toBe(1);
  });

  it('編集を伴わないコマンドでは要求が出ない', () => {
    expect(run('ls').editor).toBeNull();
  });
});
