import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { gitHolds } from '@/engines/git/check';
import { createClock } from '../clock';
import { createDefaultRegistry } from '.';
import type { ShellState } from '../registry';
import { restoreShell, snapshotShell } from '../session';
import { execute } from '../shell';

const URL = 'https://git.city.example/city/reserve.git';
const BODY = '何を: 2 枠まで。なぜ: 独り占めを防ぐ。確かめ方: test で 3 枠目を断る。';

/** 予約システムのサーバに Pull Request の置き場（forge）を付け、limit の枝を送った所から始める */
function machine() {
  let shell: ShellState = initialShell('linux-basic', {
    cwd: '/home/learner',
    gitServers: [{
      url: URL,
      run: [
        "echo 'return true;' > reserve.js",
        'git add reserve.js',
        'git commit -q -m "予約を受け付ける"',
      ],
      forge: {
        repo: 'city/reserve',
        checks: [{ name: 'test', path: 'reserve.js', pass: ['count >= 2'], failLog: ['3 枠目は断る ... not ok'], passLog: ['all passing'] }],
        reviewers: [{ login: 'tanaka', describe: ['何を', 'なぜ', '確かめ'], question: '説明が足りない', changes: '比べ方を直して', approve: '取り込んでよい' }],
        protect: { branch: 'main', approvals: 1, checks: ['test'] },
      },
    }],
  });
  const registry = createDefaultRegistry();
  const clock = createClock();
  const run = (line: string): { out: string; err: string; code: number } => {
    const o = execute(shell, line, registry, clock);
    shell = o.state;
    const pick = (s: 'stdout' | 'stderr') => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
    return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
  };
  const holds = (expr: string): boolean => gitHolds(shell.git, shell.vfs, expr, shell.gitServers);
  for (const line of [
    `git clone -q ${URL} reserve`,
    'cd reserve',
    'git switch -q -c limit',
    "echo 'if (count > 2) return false;' > reserve.js",
    'git commit -q -am "2 枠まで"',
    'git push -q -u origin limit',
  ]) run(line);
  return { run, holds, shell: () => shell, set: (s: ShellState) => { shell = s; } };
}

describe('gh pr（Pull Request の置き場）', () => {
  it('取り込み先と取り込む枝が同じ・送っていない枝では、依頼を作れない', () => {
    const m = machine();
    expect(m.run('gh pr create --base limit --head limit --title "t" --body "b"').err).toContain('is the same as base branch');
    expect(m.run('gh pr create --base main --head limitt --title "t" --body "b"').err).toContain('you must first push the current branch');
    expect(m.run('gh pr create --base main --head limit').err).toContain('--title');
    expect(m.holds('pr:limit>main')).toBe(false);
  });

  it('依頼を作ると番号が振られ、頼んだ人が説明と検査の結果で返事をする', () => {
    const m = machine();
    const r = m.run('gh pr create --base main --head limit --title "2 枠まで" --body "直しました" --reviewer tanaka');
    expect(r.out).toContain('https://git.city.example/city/reserve/pull/1');
    expect(m.holds('pr:limit>main')).toBe(true);
    // 説明が足りないので質問が返る
    expect(m.run('gh pr view 1').out).toContain('tanaka (Commented)');
    // 説明を直して頼み直すと、検査が落ちているので変更を求める
    m.run(`gh pr edit 1 --body "${BODY}" --add-reviewer tanaka`);
    expect(m.run('gh pr view').out).toContain('tanaka (Changes requested)');
    expect(m.holds('pr-approved:limit')).toBe(false);
  });

  it('検査は head の今の先で決まり、直して push すると通る。ログは実行の番号で読める', () => {
    const m = machine();
    m.run(`gh pr create --base main --head limit --title "2 枠まで" --body "${BODY}"`);
    const failed = m.run('gh pr checks 1');
    expect(failed.code).toBe(1);
    expect(failed.out).toContain('1 failing');
    const id = /runs\/(\d+)/.exec(failed.out)?.[1] ?? '';
    expect(m.run(`gh run view ${id} --log-failed`).out).toContain('test\t3 枠目は断る ... not ok');
    expect(m.holds('pr-checks:limit')).toBe(false);

    m.run("sed -i 's/count > 2/count >= 2/' reserve.js");
    m.run('git commit -q -am "比べ方を直す"');
    m.run('git push -q');
    expect(m.run('gh pr checks 1').out).toContain('All checks were successful');
    expect(m.holds('pr-checks:limit')).toBe(true);
    // 前の実行の番号は、もう開いている依頼の検査ではない
    expect(m.run(`gh run view ${id}`).err).toContain('could not find any workflow run');
  });

  it('保護された main には、検査が通り承認がある時だけ取り込め、サーバの main に合わせる記録ができる', () => {
    const m = machine();
    m.run(`gh pr create --base main --head limit --title "2 枠まで" --body "${BODY}" --reviewer tanaka`);
    const blocked = m.run('gh pr merge 1 --merge');
    expect(blocked.code).toBe(1);
    expect(blocked.err).toContain('is not mergeable');
    expect(blocked.err).toContain('required status check "test" is failing');
    expect(blocked.err).toContain('changes were requested by a reviewer');

    m.run("sed -i 's/count > 2/count >= 2/' reserve.js");
    m.run('git commit -q -am "比べ方を直す"');
    m.run('git push -q');
    // 直しても、頼み直すまでは変更を求めたまま
    expect(m.run('gh pr merge 1 --merge').err).toContain('changes were requested by a reviewer');
    m.run('gh pr edit 1 --add-reviewer tanaka');
    expect(m.holds('pr-approved:limit')).toBe(true);
    expect(m.holds('remote-merged:limit>main')).toBe(false);

    expect(m.run('gh pr merge 1 --merge').out).toContain('Merged pull request city/reserve#1');
    expect(m.holds('remote-merged:limit>main')).toBe(true);
    expect(m.run('gh pr merge 1 --merge').err).toContain('already merged');
    // 手元に取り込むと、合わせる記録が届く
    m.run('git switch -q main');
    m.run('git pull -q');
    expect(m.run('git log --oneline -1').out).toContain('Merge pull request #1 from limit');
  });

  it('依頼と返事は保存から戻しても残る', () => {
    const m = machine();
    m.run(`gh pr create --base main --head limit --title "2 枠まで" --body "${BODY}" --reviewer tanaka`);
    m.set(restoreShell(JSON.parse(JSON.stringify(snapshotShell(m.shell()))) as ReturnType<typeof snapshotShell>));
    expect(m.holds('pr:limit>main')).toBe(true);
    expect(m.run('gh pr view 1').out).toContain('tanaka (Changes requested)');
  });
});
