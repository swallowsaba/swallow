import { describe, expect, it } from 'vitest';
import { alertHolds } from '@/engines/monitor/check';
import { initialShell } from '../../environments';
import { createClock } from '../clock';
import type { ShellState } from '../registry';
import { execute } from '../shell';
import { writeFile } from '../vfs';
import { createDefaultRegistry } from '.';

/** promtool（check rules・test rules）と amtool（config routes）、達成条件 alert（mon.b.04） */

const RULE = (expr: string, extra = ''): string => `groups:\n  - name: reserve\n    rules:\n      - alert: ReserveErrorRate\n        expr: ${expr}\n${extra}`;

const TEST = `rule_files:
  - ../rules/reserve.yml
evaluation_interval: 1m
tests:
  - interval: 1m
    input_series:
      - series: 'reserve:error_ratio{job="reserve"}'
        values: '0.005x9 0.12 0.005x9 0.06x9 0.005x9'
    alert_rule_test:
      - eval_time: 10m
        alertname: ReserveErrorRate
        exp_alerts: []
      - eval_time: 26m
        alertname: ReserveErrorRate
        exp_alerts:
          - exp_labels:
              job: reserve
              severity: page
`;

const AM = `route:
  receiver: all-mail
  routes:
    - matchers: ['severity="page"']
      receiver: oncall-phone
receivers:
  - name: all-mail
  - name: oncall-phone
`;

function open(rule: string): { run: (line: string) => { out: string; err: string; code: number }; save: (text: string) => void; holds: (expr: string) => boolean } {
  let state: ShellState = initialShell('linux-basic', {
    hostname: 'mon-01',
    cwd: '/etc/prometheus',
    dirs: ['/etc/prometheus/rules', '/etc/prometheus/tests', '/etc/alertmanager'],
    files: {
      '/etc/prometheus/rules/reserve.yml': rule,
      '/etc/prometheus/tests/yesterday.test.yml': TEST,
      '/etc/alertmanager/alertmanager.yml': AM,
    },
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
    save: (text) => {
      state = { ...state, vfs: writeFile(state.vfs, '/etc/prometheus/rules/reserve.yml', text) };
    },
    holds: (expr) => alertHolds(state, expr),
  };
}

describe('promtool', () => {
  it('check rules: 読めれば規則の数を、読めなければ行と桁と理由を言う', () => {
    const t = open(RULE('reserve:error_ratio > 0.05'));
    expect(t.run('promtool check rules rules/reserve.yml')).toEqual({ out: 'Checking rules/reserve.yml\n  SUCCESS: 1 rules found\n\n', err: '', code: 0 });
    t.save(RULE('reserve:error_ratio > 5%'));
    const r = t.run('promtool check rules rules/reserve.yml');
    expect(r.code).toBe(1);
    expect(r.err).toBe('  FAILED:\nrules/reserve.yml: 5:15: group "reserve", rule 1, "ReserveErrorRate": could not parse expression: 1:24: parse error: unexpected character: \'%\'\n\n');
    expect(t.run('promtool check rules rules/none.yml').err).toContain('open rules/none.yml: no such file or directory');
  });

  it('test rules: rule_files をテストのファイルの場所から読み、昨日の記録を流して、時刻ごとに期待と違う所を言う', () => {
    const t = open(RULE('reserve:error_ratio > 0.05', '        labels:\n          severity: page\n'));
    const r = t.run('promtool test rules tests/yesterday.test.yml');
    expect(r.out).toBe('Unit Testing:  tests/yesterday.test.yml\n');
    expect(r.err).toMatch(/^ {2}FAILED:\n {4}alertname: ReserveErrorRate, time: 10m, \n {8}exp:\[\], \n {8}got:\[\n/);
    expect(r.code).toBe(1);
    t.save(RULE('reserve:error_ratio > 0.05', '        for: 5m\n        labels:\n          severity: page\n'));
    expect(t.run('promtool test rules tests/yesterday.test.yml')).toEqual({ out: 'Unit Testing:  tests/yesterday.test.yml\n  SUCCESS\n\n', err: '', code: 0 });
  });

  it('規則が読めないと、テストは動かさずに誤りを言う（場所はテストのファイルから見た rules/reserve.yml）', () => {
    const t = open(RULE('reserve:error_ratio > 0.05', '        for: 5分\n'));
    expect(t.run('promtool test rules tests/yesterday.test.yml').err).toBe('  FAILED:\n    rules/reserve.yml: 6:14: not a valid duration string: "5分"\n\n');
  });
});

describe('amtool', () => {
  it('config routes show は振り分けの木、test はラベルの届く先を言う', () => {
    const t = open(RULE('up == 0'));
    expect(t.run('amtool config routes show --config.file=/etc/alertmanager/alertmanager.yml').out).toBe('Routing tree:\n.\n└── default-route  receiver: all-mail\n    └── {severity="page"}  receiver: oncall-phone\n');
    expect(t.run('amtool config routes test --config.file=/etc/alertmanager/alertmanager.yml severity=page').out).toBe('oncall-phone\n');
    expect(t.run('amtool config routes test --config.file /etc/alertmanager/alertmanager.yml severity=warning').out).toBe('all-mail\n');
    expect(t.run('amtool config routes').err).toBe('amtool: error: required flag --alertmanager.url not provided\n');
  });
});

describe('達成条件 alert', () => {
  it('times は鳴った数だけ、test はラベルまで期待と同じかを見る', () => {
    const t = open(RULE('reserve:error_ratio > 0.05', '        for: 5m\n        labels:\n          severity: warning\n'));
    expect(t.holds('rules:rules/reserve.yml times:tests/yesterday.test.yml')).toBe(true);
    expect(t.holds('test:tests/yesterday.test.yml')).toBe(false);
    expect(t.holds('fire:tests/yesterday.test.yml@26m=ReserveErrorRate !fire:tests/yesterday.test.yml@10m=ReserveErrorRate')).toBe(true);
    t.save(RULE('reserve:error_ratio > 0.05'));
    expect(t.holds('times:tests/yesterday.test.yml')).toBe(false);
    t.save(RULE('reserve:error_ratio > 5%'));
    expect(t.holds('rules:rules/reserve.yml')).toBe(false);
    expect(t.holds('times:tests/yesterday.test.yml')).toBe(false);
  });

  it('知らない形や、テストに無い時刻は内容の誤りとして投げる', () => {
    const t = open(RULE('up == 0'));
    expect(() => t.holds('fired:x')).toThrow(/知らない形/);
    expect(() => t.holds('fire:tests/yesterday.test.yml@3m=ReserveErrorRate')).toThrow(/alert_rule_test が無い/);
  });
});
