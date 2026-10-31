import { describe, expect, it } from 'vitest';
import { initialShell } from '../../environments';
import { checkState } from '@/learning/practice';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { createDefaultRegistry } from '.';

/**
 * サービスを動かす利用者（ユニットファイルの User=）と、専用の利用者を作る useradd（sec.i.04 最小権限）。
 * ユニットファイルは daemon-reload で読み込み、動かす時に、その利用者が書く場所に書けるかを確かめる
 */

const UNIT = '[Unit]\nDescription=Daily report\n\n[Service]\nExecStart=/opt/report/report-app\nUser=root\n\n[Install]\nWantedBy=multi-user.target\n';

function open(): { run: (line: string) => { out: string; err: string; code: number }; state: () => ShellState } {
  let state: ShellState = initialShell('linux-basic', {
    hostname: 'report-srv',
    dirs: ['/var/lib/report', '/opt/report'],
    files: { '/etc/systemd/system/report.service': UNIT, '/opt/report/report-app': '#!/bin/sh\n' },
    services: { report: { description: 'Daily report', enabled: true, active: true, unit: '/etc/systemd/system/report.service', writes: ['/var/lib/report'] } },
  });
  const registry = createDefaultRegistry();
  const clock = createClock();
  return {
    run: (line) => {
      const o = execute(state, line, registry, clock);
      state = o.state;
      const pick = (k: 'stdout' | 'stderr'): string => o.chunks.filter((c) => c.stream === k).map((c) => c.text).join('');
      return { out: pick('stdout'), err: pick('stderr'), code: o.exitCode };
    },
    state: () => state,
  };
}

describe('sudo', () => {
  it('前のコマンドの出力を受け取る（echo … | sudo tee）', () => {
    const t = open();
    expect(t.run('echo more | sudo tee -a /etc/added').out).toBe('more\n');
    expect(t.run('cat /etc/added').out).toBe('more\n');
  });

  it('空白を含む引数を、1 つのまま渡す', () => {
    const t = open();
    t.run("sudo sh -c 'echo inner > /etc/made'");
    expect(t.run('cat /etc/made').out).toBe('inner\n');
    t.run("sudo sed -i 's/Daily report/Nightly report/' /etc/systemd/system/report.service");
    expect(t.run('grep Description /etc/systemd/system/report.service').out).toBe('Description=Nightly report\n');
  });

  it("行を置き換える sed の c（'/型/c 新しい行'）", () => {
    const t = open();
    t.run("sudo sed -i '/^User=/c User=report' /etc/systemd/system/report.service");
    expect(t.run('grep ^User= /etc/systemd/system/report.service').out).toBe('User=report\n');
  });
});

describe('サービスを動かす利用者（User=）', () => {
  it('初めは root で動いている（ps の USER の欄）', () => {
    const t = open();
    expect(t.run('ps aux').out).toMatch(/^root\s+\d+\s+1\s+.*\/opt\/report\/report-app$/m);
    expect(checkState({ kind: 'service', name: 'report', active: true, user: 'root' }, { shell: t.state() })).toBe(true);
  });

  it('useradd は管理者だけが打てる。作った利用者は id と /etc/passwd に出る。同じ名前は断る', () => {
    const t = open();
    expect(t.run('useradd -r -s /usr/sbin/nologin report')).toMatchObject({ code: 1, err: 'useradd: Permission denied.\nuseradd: cannot lock /etc/passwd; try again later.\n' });
    expect(t.run('id report')).toMatchObject({ code: 1, err: "id: 'report': no such user\n" });
    expect(t.run('sudo useradd --system --no-create-home --shell /usr/sbin/nologin report').code).toBe(0);
    expect(t.run('id report').out).toBe('uid=999(report) gid=999(report) groups=999(report)\n');
    expect(t.run('grep report /etc/passwd').out).toBe('report:x:999:999::/home/report:/usr/sbin/nologin\n');
    expect(t.run('sudo useradd -r report')).toMatchObject({ code: 9, err: "useradd: user 'report' already exists\n" });
  });

  it('User= を書き換えても、daemon-reload するまでは前のユニットで動かし、知らせを出す', () => {
    const t = open();
    t.run('sudo useradd -r report');
    t.run('sudo chown report:report /var/lib/report');
    t.run("sudo sed -i 's/^User=root/User=report/' /etc/systemd/system/report.service");
    const r = t.run('sudo systemctl restart report');
    expect(r.err).toContain("Warning: The unit file, source configuration file or drop-ins of report.service changed on disk. Run 'systemctl daemon-reload' to reload units.");
    expect(checkState({ kind: 'service', name: 'report', active: true, user: 'root' }, { shell: t.state() })).toBe(true);
    t.run('sudo systemctl daemon-reload');
    expect(t.run('sudo systemctl restart report').err).toBe('');
    expect(checkState({ kind: 'service', name: 'report', active: true, user: 'report' }, { shell: t.state() })).toBe(true);
    expect(t.run('ps aux').out).toMatch(/^report\s+\d+\s+1\s+.*\/opt\/report\/report-app$/m);
  });

  it('書く場所に書けない利用者で動かすと、Permission denied で失敗する。持ち主を替えると動く', () => {
    const t = open();
    t.run('sudo useradd -r report');
    t.run("sudo sed -i 's/^User=root/User=report/' /etc/systemd/system/report.service");
    t.run('sudo systemctl daemon-reload');
    const r = t.run('sudo systemctl restart report');
    expect(r.code).toBe(1);
    expect(r.err).toContain('Job for report.service failed');
    expect(t.run('sudo journalctl -u report --no-pager').out).toContain('report-app[');
    expect(t.run('sudo journalctl -u report --no-pager').out).toContain('/var/lib/report: Permission denied');
    t.run('sudo chown report:report /var/lib/report');
    expect(t.run('sudo systemctl restart report').code).toBe(0);
    expect(checkState({ kind: 'service', name: 'report', active: true, user: 'report' }, { shell: t.state() })).toBe(true);
  });

  it('居ない利用者を User= に書くと、217/USER で失敗する', () => {
    const t = open();
    t.run("sudo sed -i 's/^User=root/User=reporter/' /etc/systemd/system/report.service");
    t.run('sudo systemctl daemon-reload');
    expect(t.run('sudo systemctl restart report').code).toBe(1);
    const log = t.run('sudo journalctl -u report --no-pager').out;
    expect(log).toContain('report.service: Failed to determine user credentials: No such process');
    expect(log).toContain('status=217/USER');
  });
});
