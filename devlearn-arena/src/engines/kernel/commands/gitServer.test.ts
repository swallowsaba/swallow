import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { createClock } from '../clock';
import { createDefaultRegistry } from '.';
import type { ShellState } from '../registry';
import { restoreShell, snapshotShell } from '../session';
import { execute } from '../shell';

const URL = 'https://git.city.example/park/reserve.git';
const SSH = 'git@git.city.example:park/reserve.git';

/** 公園課のサーバにある予約システムのリポジトリ（setup の gitServers で作る） */
function machine(extra: Record<string, unknown> = {}, server: Record<string, unknown> = {}) {
  let shell: ShellState = initialShell('linux-basic', {
    cwd: '/home/learner',
    gitServers: [{
      url: URL,
      ssh: SSH,
      run: [
        'export GIT_AUTHOR_NAME=Tanaka GIT_AUTHOR_EMAIL=tanaka@city.example GIT_AUTHOR_DATE="2026-09-30 10:00"',
        "echo '# 予約システム' > README.md",
        'git add README.md',
        'git commit -m "予約システムを作る"',
      ],
      ...server,
    }],
    ...extra,
  });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string): { out: string; err: string; all: string; code: number } => {
    const o = execute(shell, line, registry, clock);
    shell = o.state;
    const pick = (s: 'stdout' | 'stderr') => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    // all は、画面に出る順のまま
    return { out: pick('stdout'), err: pick('stderr'), all: o.chunks.map((c) => c.text).join(''), code: o.exitCode };
  };
  return { run, shell: () => shell };
}

describe('サーバのリポジトリと git clone', () => {
  it('clone すると、URL の名前のディレクトリに履歴ごと複製され、origin がその URL を指す', () => {
    const m = machine();
    const r = m.run(`git clone ${URL}`);
    expect(r.code).toBe(0);
    expect(r.out + r.err).toContain("Cloning into 'reserve'...");
    expect(m.run('cat reserve/README.md').out).toBe('# 予約システム\n');
    m.run('cd reserve');
    expect(m.run('git log --oneline').out).toMatch(/^[0-9a-f]{7} \(HEAD -> main, origin\/main\) 予約システムを作る\n$/);
    expect(m.run('git log').out).toContain('Author: Tanaka <tanaka@city.example>');
    expect(m.run('git remote -v').out).toBe(`origin\t${URL} (fetch)\norigin\t${URL} (push)\n`);
    expect(m.run('git status').out).toContain("Your branch is up to date with 'origin/main'.");
  });

  it('リポジトリの外（clone した先に入っていない所）では、git は not a git repository と言う', () => {
    const m = machine();
    m.run(`git clone ${URL}`);
    const r = m.run('git status');
    expect(r.code).toBe(128);
    expect(r.err).toContain('not a git repository');
  });

  it('ディレクトリの名前を指定でき、既にある空でないディレクトリには複製しない', () => {
    const m = machine({ dirs: ['/home/learner', '/home/learner/taken'], files: { '/home/learner/taken/x.txt': 'x\n' } });
    expect(m.run(`git clone ${URL} app`).code).toBe(0);
    expect(m.run('ls app').out).toContain('README.md');
    const r = m.run(`git clone ${URL} taken`);
    expect(r.code).toBe(128);
    expect(r.err).toContain("fatal: destination path 'taken' already exists and is not an empty directory.");
  });

  it('無い URL は repository not found', () => {
    const m = machine();
    const r = m.run('git clone https://git.city.example/park/nothing.git');
    expect(r.code).toBe(128);
    expect(r.err).toContain("fatal: repository 'https://git.city.example/park/nothing.git/' not found");
  });

  it('SSH の URL は、自分の公開鍵がサーバに登録されていなければ Permission denied (publickey)', () => {
    const m = machine();
    const r = m.run(`git clone ${SSH}`);
    expect(r.code).toBe(128);
    expect(r.err).toContain('git@git.city.example: Permission denied (publickey).');
    expect(r.err).toContain('fatal: Could not read from remote repository.');
    const key = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIParkKey learner@dev-office';
    const ok = machine({ files: { '/home/learner/.ssh/id_ed25519.pub': `${key}\n`, '/home/learner/.ssh/id_ed25519': 'PRIVATE\n' } }, { keys: [key] });
    expect(ok.run(`git clone ${SSH}`).code).toBe(0);
  });

  it('push はサーバの履歴を進め、ほかの人の push（after）があれば、取り込むまで拒否される', () => {
    const m = machine({
      run: [`git clone ${URL}`],
    }, {
      after: [
        'export GIT_AUTHOR_NAME=Sato GIT_AUTHOR_EMAIL=sato@city.example GIT_AUTHOR_DATE="2026-10-02 10:00"',
        "echo '予約は 1 人 2 枠まで' >> README.md",
        'git commit -am "予約の決まりを書く"',
        'git push',
      ],
    });
    m.run('cd reserve');
    m.run("echo 'memo' > memo.txt");
    m.run('git add memo.txt');
    m.run('git commit -m "メモを足す"');
    const r = m.run('git push');
    expect(r.code).toBe(1);
    expect(r.err).toContain('! [rejected]        main -> main (fetch first)');
    expect(r.err).toContain(`error: failed to push some refs to '${URL}'`);
    // 取ってきただけ（fetch）では、分かれたままなので non-fast-forward で拒否される
    expect(m.run('git fetch').out).toMatch(/^From https:\/\/git\.city\.example\/park\/reserve\.git\n {3}[0-9a-f]{7}\.\.[0-9a-f]{7} {2}main {7}-> origin\/main\n$/);
    expect(m.run('git push').err).toContain('! [rejected]        main -> main (non-fast-forward)');
    // 取り込めば送れる
    expect(m.run('git pull').out).toContain("Merge made by the 'ort' strategy.");
    expect(m.run('git log --oneline').out).toContain("Merge branch 'main' of https://git.city.example/park/reserve");
    expect(m.run('git log --oneline').out).toContain('予約の決まりを書く');
    const sent = m.run('git push');
    expect(sent.code).toBe(0);
    expect(sent.out).toMatch(/^To https:\/\/git\.city\.example\/park\/reserve\.git\n {3}[0-9a-f]{7}\.\.[0-9a-f]{7} {2}main -> main\n$/);
    expect(m.run('git push').out).toBe('Everything up-to-date\n');
    // サーバに届いた（別の場所に複製し直すと見える）
    m.run('cd /home/learner');
    m.run(`git clone ${URL} again`);
    m.run('cd again');
    expect(m.run('git log --oneline').out).toContain('メモを足す');
  });

  it('git log はリモートの枝の控え（origin/main）から辿れ、main..origin/main は手元に無い記録だけを出す', () => {
    const m = machine({ run: [`git clone ${URL}`] }, {
      after: ["echo 'rule' >> README.md", 'git commit -am "予約の決まりを書く"', 'git push'],
    });
    m.run('cd reserve');
    m.run('git fetch');
    expect(m.run('git log --oneline origin/main').out).toMatch(/^[0-9a-f]{7} \(origin\/main\) 予約の決まりを書く\n[0-9a-f]{7} \(HEAD -> main\) 予約システムを作る\n$/);
    expect(m.run('git log --oneline main..origin/main').out).toMatch(/^[0-9a-f]{7} \(origin\/main\) 予約の決まりを書く\n$/);
    expect(m.run('git log --oneline origin/main..main').out).toBe('');
    const bad = m.run('git log nothing');
    expect(bad.code).toBe(128);
    expect(bad.err).toContain("fatal: ambiguous argument 'nothing': unknown revision or path not in the working tree.");
  });

  it('pull が衝突すると、本物と同じ順（Auto-merging・CONFLICT・Automatic merge failed）で言い、取ってきた origin/main は残る', () => {
    const m = machine({ run: [`git clone ${URL}`, 'cd reserve', "echo '# 予約（月曜は休み）' > README.md", 'git commit -am "月曜を休みにする"', 'cd /home/learner'] }, {
      after: ["echo '# 予約（9 時から）' > README.md", 'git commit -am "9 時から"', 'git push'],
    });
    m.run('cd reserve');
    const r = m.run('git pull');
    expect(r.code).toBe(1);
    expect(r.all.indexOf('Auto-merging README.md')).toBeLessThan(r.all.indexOf('CONFLICT (content): Merge conflict in README.md'));
    expect(r.all.indexOf('CONFLICT (content)')).toBeLessThan(r.all.indexOf('Automatic merge failed'));
    expect(r.err).toContain('Automatic merge failed; fix conflicts and then commit the result.');
    expect(m.run('git log --oneline origin/main -1').out).toContain('9 時から');
  });

  it('保存して戻しても、サーバのリポジトリは残る', () => {
    const m = machine();
    const back = restoreShell(JSON.parse(JSON.stringify(snapshotShell(m.shell()))) as ReturnType<typeof snapshotShell>);
    const o = execute(back, `git clone ${URL}`, createDefaultRegistry(), createClock());
    expect(o.exitCode).toBe(0);
  });
});
