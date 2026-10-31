import { describe, expect, it } from 'vitest';
import { initialShell } from '@/engines/environments';
import { checkState } from '@/learning/practice';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { createDefaultRegistry } from './index';

/** git の上級の実戦で使う模擬: blame・bisect run（git.a.01）・枝の保護の API（git.a.02）・履歴の書き換え（git.a.03） */

const registry = createDefaultRegistry();
const clock = createClock();

function session(setup: unknown) {
  let shell: ShellState = initialShell('linux-basic', setup);
  return {
    run(line: string) {
      const o = execute(shell, line, registry, clock);
      shell = o.state;
      const pick = (s: string) => o.chunks.filter((c) => c.stream === s).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    },
    holds(expr: string) {
      return checkState({ kind: 'git', expr }, { shell });
    },
  };
}

const commit = (who: string, msg: string): string[] => ['git add .', `git commit -q --author='${who} <${who}@city.example>' -m '${msg}'`];

const shop = {
  hostname: 'dev', cwd: '/home/learner/shop', dirs: ['/home/learner/shop'], sites: [],
  files: { '/home/learner/shop/price.sh': 'tax=10\nbase=100\n', '/home/learner/shop/test.sh': '#!/bin/sh\ngrep -q "tax=10" price.sh\n' },
  run: [
    'git init -q',
    ...commit('aki', '#100 始める'),
    'git tag v1.0',
    "echo '# 1' >> price.sh", ...commit('rin', '#101 一言'),
    "echo '# 2' >> price.sh", ...commit('rin', '#102 一言'),
    "sed -i 's/tax=10/tax=8/' price.sh", ...commit('sora', '#142 税の表を整える'),
    "echo '# 3' >> price.sh", ...commit('rin', '#143 一言'),
    "echo '# 4' >> price.sh", ...commit('aki', '#144 一言'),
  ],
};

describe('git blame', () => {
  it('行ごとに、最後に変えた記録と人を出す。一番古い記録には ^ が付く', () => {
    const s = session(shop);
    const out = s.run('git blame price.sh').out.split('\n');
    expect(out[0]).toMatch(/^[0-9a-f]{8} \(sora\s+\d{4}-\d\d-\d\d \d\d:\d\d:\d\d [+-]\d{4}\s+1\) tax=8$/);
    expect(out[1]).toMatch(/^\^[0-9a-f]{7} \(aki\s+.*\s+2\) base=100$/);
    expect(out[2]).toContain('(rin');
  });

  it('-L で行を絞る。無いファイルは本物と同じ文で断る', () => {
    const s = session(shop);
    const out = s.run('git blame -L 1,1 price.sh').out.trim().split('\n');
    expect(out).toHaveLength(1);
    expect(out[0]).toContain('tax=8');
    const bad = s.run('git blame nothing.sh');
    expect(bad.code).toBe(128);
    expect(bad.err).toContain("fatal: no such path 'nothing.sh' in HEAD");
  });
});

describe('grep -q', () => {
  it('何も出さず、終了の値だけで答える', () => {
    const s = session(shop);
    const hit = s.run('grep -q tax price.sh');
    expect(hit.out).toBe('');
    expect(hit.code).toBe(0);
    expect(s.run('grep -q nothing price.sh').code).toBe(1);
  });
});

describe('git log の --grep と --format', () => {
  it('文で絞り、書式で出す。$( ) で git revert に渡せる', () => {
    const s = session(shop);
    expect(s.run('git log --format=%s --grep=142').out).toBe('#142 税の表を整える\n');
    expect(s.run('git log -1 --format=%an').out).toBe('aki\n');
    expect(s.run('git revert $(git log --format=%h --grep=142)').code).toBe(0);
    expect(s.run('cat price.sh').out).toContain('tax=10');
  });
});

describe('git bisect run', () => {
  it('テストの終了の値で自動で絞り、最初に壊した記録を出す', () => {
    const s = session(shop);
    s.run('git bisect start');
    s.run('git bisect bad');
    s.run('git bisect good v1.0');
    const r = s.run('git bisect run sh test.sh');
    expect(r.code).toBe(0);
    expect(r.out).toMatch(/[0-9a-f]{40} is the first bad commit/);
    expect(r.out).toContain('#142 税の表を整える');
  });

  it('手で良い・悪いを伝えても、同じ記録にたどり着く', () => {
    const s = session(shop);
    s.run('git bisect start');
    s.run('git bisect bad');
    s.run('git bisect good v1.0');
    let last = '';
    for (let i = 0; i < 6 && !last.includes('first bad commit'); i += 1) last = s.run('sh test.sh && git bisect good || git bisect bad').out;
    expect(last).toContain('#142 税の表を整える');
    s.run('git bisect reset');
    expect(s.holds('on:main')).toBe(true);
  });

  it('良い版か悪い版を伝える前は断る', () => {
    const s = session(shop);
    s.run('git bisect start');
    expect(s.run('git bisect run sh test.sh').code).not.toBe(0);
  });
});

const URL = 'https://git.city.example/city/shop.git';
const forge = {
  hostname: 'dev', cwd: '/home/learner/shop', dirs: ['/home/learner/shop'], sites: [],
  files: { '/home/learner/shop/a.txt': 'a\n' },
  run: ['git init -q', `git remote add origin ${URL}`, 'git add .', "git commit -q -m 'first'", 'git push -q -u origin main'],
  gitServers: [{ url: URL, run: [], forge: { repo: 'city/shop' } }],
};
const RULE = '{"required_status_checks":{"strict":true,"contexts":["test"]},"enforce_admins":true,"required_pull_request_reviews":{"required_approving_review_count":1},"restrictions":null}';

describe('枝の保護（gh api）', () => {
  it('保護の前は main に直接 push できる。入れると GH006 で断られる', () => {
    const s = session(forge);
    s.run("echo b >> a.txt && git add . && git commit -q -m 'direct'");
    expect(s.run('git push origin main').code).toBe(0);
    s.run(`echo '${RULE}' > protect.json`);
    const put = s.run('gh api --method PUT repos/city/shop/branches/main/protection --input protect.json');
    expect(put.code).toBe(0);
    expect(put.out).toContain('"required_approving_review_count": 1');
    s.run("echo c >> a.txt && git add a.txt && git commit -q -m 'direct 2'");
    const denied = s.run('git push origin main');
    expect(denied.code).toBe(1);
    expect(denied.err).toContain('GH006: Protected branch update failed for refs/heads/main.');
    expect(denied.err).toContain('! [remote rejected] main -> main (protected branch hook declined)');
    expect(s.run('git push --force origin main').code).toBe(1);
    // 枝なら push できる
    s.run('git switch -c fix/a');
    expect(s.run('git push -u origin fix/a').code).toBe(0);
  });

  it('gh pr create --fill は、題を最後の記録から作る', () => {
    const s = session(forge);
    s.run('git switch -c fix/a');
    s.run("echo b >> a.txt && git commit -am '朝の点検'");
    s.run('git push -u origin fix/a');
    expect(s.run('gh pr create --fill').code).toBe(0);
    expect(s.run('gh pr view 1').out).toContain('朝の点検');
  });

  it('判定の protected: 承認の数と必須の検査', () => {
    const s = session(forge);
    expect(s.holds('protected:main')).toBe(false);
    s.run(`echo '${RULE}' > protect.json`);
    s.run('gh api -X PUT repos/city/shop/branches/main/protection --input protect.json');
    expect(s.holds('protected:main')).toBe(true);
    expect(s.holds('protected-approvals:main>=1')).toBe(true);
    expect(s.holds('protected-approvals:main>=2')).toBe(false);
    expect(s.holds('protected-checks:main=test')).toBe(true);
    expect(s.holds('protected-checks:main=lint')).toBe(false);
  });

  it('読む・足りない項目は 422・無い枝の保護は 404', () => {
    const s = session(forge);
    const none = s.run('gh api repos/city/shop/branches/main/protection');
    expect(none.code).toBe(1);
    expect(none.err).toContain('gh: Branch not protected (HTTP 404)');
    s.run(`echo '{"enforce_admins":true}' > bad.json`);
    const bad = s.run('gh api -X PUT repos/city/shop/branches/main/protection --input bad.json');
    expect(bad.code).toBe(1);
    expect(bad.err).toContain('(HTTP 422)');
    s.run(`echo '${RULE}' > protect.json`);
    s.run('gh api -X PUT repos/city/shop/branches/main/protection --input protect.json');
    expect(s.run('gh api repos/city/shop/branches/main/protection').out).toContain('"contexts"');
    expect(s.run('gh api repos/other/repo/branches/main/protection').code).toBe(1);
  });
});

const leak = {
  hostname: 'dev', cwd: '/home/learner/shop', dirs: ['/home/learner/shop/config'], sites: [],
  files: { '/home/learner/shop/app.txt': 'app\n' },
  run: [
    'git init -q', `git remote add origin ${URL}`, 'git add .', "git commit -q -m 'first'",
    "echo 'TOKEN=tk-leaked' > config/prod.env", 'git add .', "git commit -q -m '設定を足す'",
    "echo 'more' >> app.txt", 'git add .', "git commit -q -m '次の変更'",
    'git rm -q config/prod.env', "git commit -q -m '設定を消す'",
    'git push -q -u origin main',
  ],
  gitServers: [{ url: URL, run: [], forge: { repo: 'city/shop' } }],
};

describe('履歴の書き換え', () => {
  it('消しただけでは履歴に残る。filter-repo は --force が要り、消して origin も外す', () => {
    const s = session(leak);
    expect(s.holds('history:tk-leaked')).toBe(true);
    const refused = s.run('git filter-repo --path config/prod.env --invert-paths');
    expect(refused.code).toBe(1);
    expect(refused.err).toContain('Refusing to destructively overwrite repo history');
    const done = s.run('git filter-repo --path config/prod.env --invert-paths --force');
    expect(done.code).toBe(0);
    expect(done.out).toContain("NOTICE: Removing 'origin' remote");
    expect(s.holds('!history:tk-leaked')).toBe(true);
    expect(s.run('git remote -v').out).toBe('');
    // 中身の無くなった記録は消える（first・次の変更 の 2 つ）
    expect(s.run('git log --oneline').out.trim().split('\n')).toHaveLength(2);
    expect(s.run('cat app.txt').out).toContain('more');
    expect(s.run('git status').out).toContain('nothing to commit');
  });

  it('付け直して --force で送ると、サーバの枝も置き換わる。普通の push は断られる', () => {
    const s = session(leak);
    s.run('git filter-repo --path config/prod.env --invert-paths --force');
    s.run(`git remote add origin ${URL}`);
    expect(s.run('git push origin main').code).toBe(1);
    expect(s.run('git push --force origin main').code).toBe(0);
    expect(s.holds('pushed:main')).toBe(true);
  });

  it('git push --force --all は全ての枝を送る', () => {
    const s = session(leak);
    s.run('git branch old');
    s.run('git filter-repo --path config/prod.env --invert-paths --force');
    s.run(`git remote add origin ${URL}`);
    expect(s.run('git push --force --all origin').code).toBe(0);
    expect(s.holds('pushed:main')).toBe(true);
    expect(s.holds('pushed:old')).toBe(true);
  });

  it('filter-branch の index-filter でも同じに消える', () => {
    const s = session(leak);
    const r = s.run('git filter-branch --force --index-filter "git rm --cached --ignore-unmatch config/prod.env" --prune-empty --tag-name-filter cat -- --all');
    expect(r.code).toBe(0);
    expect(r.out).toContain("Ref 'refs/heads/main' was rewritten");
    expect(s.holds('!history:tk-leaked')).toBe(true);
  });

  it('タグも新しい記録を指す', () => {
    const s = session(leak);
    s.run('git tag v1.0');
    s.run('git filter-repo --path config/prod.env --invert-paths --force');
    expect(s.holds('tag:v1.0')).toBe(true);
  });
});
