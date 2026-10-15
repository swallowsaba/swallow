import { describe, expect, it } from 'vitest';
import { createSession, restoreShell, snapshotShell } from '../session';
import { execute } from '../shell';
import { createServiceTable, reboot, serviceOf } from '../services';
import type { ShellState } from '../registry';

/** web（止まっている・起動時に動かない）と db（壊れている）を持つサーバ */
function server() {
  const s = createSession({
    services: createServiceTable([
      { name: 'web', description: 'Web server', active: 'inactive', enabled: false, port: 80, body: '<h1>shop</h1>' },
      { name: 'db', description: 'Database', active: 'inactive', enabled: false, broken: 'bind: address already in use (port 5432)' },
    ]),
  });
  let state: ShellState = s.state;
  const run = (line: string) => {
    const out = execute(state, line, s.registry, s.clock);
    state = out.state;
    return {
      stdout: out.chunks.filter((c) => c.stream === 'stdout').map((c) => c.text).join(''),
      stderr: out.chunks.filter((c) => c.stream === 'stderr').map((c) => c.text).join(''),
      code: out.exitCode,
    };
  };
  return { run, state: () => state };
}

describe('systemctl（サービスの状態と操作）', () => {
  it('status は、今の状態（Active）と起動時の登録（Loaded の enabled / disabled）を見せる。動いていなければ 3 で終わる', () => {
    const { run } = server();
    const r = run('systemctl status web');
    expect(r.stdout).toContain('web.service - Web server');
    expect(r.stdout).toContain('Loaded: loaded (/etc/systemd/system/web.service; disabled; preset: disabled)');
    expect(r.stdout).toContain('Active: inactive (dead)');
    expect(r.code).toBe(3);
  });

  it('start は今だけ動かす。enable しないと、再起動の後は止まったまま', () => {
    const { run, state } = server();
    expect(run('systemctl start web').code).toBe(0);
    expect(run('systemctl is-active web').stdout).toBe('active\n');
    expect(run('systemctl is-enabled web')).toMatchObject({ stdout: 'disabled\n', code: 1 });
    const after = reboot(state().services ?? createServiceTable());
    expect(serviceOf(after, 'web')?.active).toBe('inactive');
  });

  it('enable --now は、起動時の登録と今動かすことを一度に行う。再起動の後も動く', () => {
    const { run, state } = server();
    const r = run('systemctl enable --now web');
    expect(r.code).toBe(0);
    expect(r.stdout).toContain('Created symlink /etc/systemd/system/multi-user.target.wants/web.service');
    expect(serviceOf(state().services, 'web')).toMatchObject({ active: 'active', enabled: true });
    expect(serviceOf(reboot(state().services ?? createServiceTable()), 'web')?.active).toBe('active');
    expect(run('systemctl status web.service').stdout).toContain('Active: active (running)');
  });

  it('enable だけでは今は動かない。stop・disable・restart', () => {
    const { run, state } = server();
    run('systemctl enable web');
    expect(serviceOf(state().services, 'web')).toMatchObject({ active: 'inactive', enabled: true });
    run('systemctl restart web');
    expect(serviceOf(state().services, 'web')?.active).toBe('active');
    run('systemctl stop web');
    run('systemctl disable web');
    expect(serviceOf(state().services, 'web')).toMatchObject({ active: 'inactive', enabled: false });
  });

  it('無い名前は「Unit ... not found」（エラーの解説 unit-not-found に当たる）', () => {
    const { run } = server();
    const r = run('systemctl start wbe');
    expect(r.stderr).toBe('Failed to start wbe.service: Unit wbe.service not found.\n');
    expect(r.code).toBe(5);
    expect(new RegExp('Unit [^ ]+\\.service (not found|could not be found)').test(run('systemctl status wbe').stderr)).toBe(true);
  });

  it('壊れたサービスは failed になり、理由がログ（journalctl -u）に残る', () => {
    const { run, state } = server();
    const r = run('systemctl start db');
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('Job for db.service failed');
    expect(serviceOf(state().services, 'db')?.active).toBe('failed');
    expect(run('systemctl status db').stdout).toContain('Active: failed (Result: exit-code)');
    const log = run('journalctl -u db --no-pager').stdout;
    expect(log).toContain('bind: address already in use (port 5432)');
    expect(run('journalctl -xeu db.service').stdout).toContain("Failed with result 'exit-code'");
  });

  it('メモリが足りずに止められた物は、status の Result に oom-kill と出る。保存から戻しても残り、動かし直すと active になる', () => {
    const s = createSession({
      services: createServiceTable([
        { name: 'app', description: 'App', active: 'failed', enabled: true, port: 8080, body: 'ok', result: 'oom-kill' },
      ]),
    });
    const run = (st: ShellState, line: string) => execute(st, line, s.registry, s.clock);
    expect(run(s.state, 'systemctl status app').chunks.map((c) => c.text).join('')).toContain('Active: failed (Result: oom-kill)');
    const back = restoreShell(JSON.parse(JSON.stringify(snapshotShell(s.state))) as ReturnType<typeof snapshotShell>);
    expect(serviceOf(back.services, 'app')?.result).toBe('oom-kill');
    const after = run(s.state, 'systemctl restart app').state;
    expect(run(after, 'systemctl status app').chunks.map((c) => c.text).join('')).toContain('Active: active (running)');
  });

  it('--failed は、落ちたサービスだけを印（●）付きで並べ、数を言う', () => {
    const { run } = server();
    run('systemctl start web');
    run('systemctl start db');
    const r = run('systemctl --failed');
    expect(r.stdout).toContain('● db.service');
    expect(r.stdout).not.toContain('web.service');
    expect(r.stdout).toContain('1 loaded units listed.');
    expect(run('systemctl list-units').stdout).toContain('2 loaded units listed.');
  });

  it('同じ操作からは同じログ（時刻も決まる）', () => {
    const a = server();
    const b = server();
    a.run('systemctl start db');
    b.run('systemctl start db');
    expect(a.run('journalctl -u db').stdout).toBe(b.run('journalctl -u db').stdout);
  });

  it('サービスの無い環境では使えないと言う', () => {
    const s = createSession();
    const out = execute(s.state, 'systemctl status web', s.registry, s.clock);
    expect(out.exitCode).toBe(1);
  });

  it('保存と復元でサービスの状態が残る', () => {
    const { run, state } = server();
    run('systemctl enable --now web');
    const back = restoreShell(JSON.parse(JSON.stringify(snapshotShell(state()))) as ReturnType<typeof snapshotShell>);
    expect(serviceOf(back.services, 'web')).toMatchObject({ active: 'active', enabled: true });
  });
});
