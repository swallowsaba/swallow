import { describe, expect, it } from 'vitest';
import { readAmConfig, receiversFor, routeTree } from './alertmanager';
import { evaluate, parsePromql, PromqlError } from './promql';
import { formatDuration, parseDuration, readRules } from './rules';
import { expandValues, runTestFile } from './unittest';

/** Prometheus の規則・PromQL・promtool test rules・Alertmanager の振り分け（mon.b.04） */

const rule = (body: string): string => `groups:\n  - name: reserve\n    rules:\n      - alert: ReserveErrorRate\n${body}`;

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
            exp_annotations:
              summary: 予約のエラーが増えている
`;

const withRule = (text: string) => runTestFile(TEST, (p) => (p === '../rules/reserve.yml' ? { path: 'rules/reserve.yml', text } : null));

describe('PromQL', () => {
  const samples = [
    { labels: { __name__: 'reserve:error_ratio', job: 'reserve' }, value: 0.07 },
    { labels: { __name__: 'reserve:error_ratio', job: 'shop' }, value: 0.01 },
    { labels: { __name__: 'requests', job: 'reserve' }, value: 200 },
  ];

  it('比べると、条件を満たす時系列だけが残る（名前とラベルはそのまま）', () => {
    expect(evaluate(parsePromql('reserve:error_ratio > 0.05'), samples)).toEqual([samples[0]]);
    expect(evaluate(parsePromql('reserve:error_ratio{job!="reserve"} >= 0.01'), samples)).toEqual([samples[1]]);
  });

  it('四則は名前を外し、時系列どうしはラベルの同じ物を組にする', () => {
    expect(evaluate(parsePromql('reserve:error_ratio{job="reserve"} * requests'), samples)).toEqual([{ labels: { job: 'reserve' }, value: 14.000000000000002 }]);
    expect(evaluate(parsePromql('reserve:error_ratio{job=~"sh.*"} * 100'), samples)).toEqual([{ labels: { job: 'shop' }, value: 1 }]);
  });

  it('読めない式は、本物と同じく何文字目かを言って断る', () => {
    expect(() => parsePromql('reserve:error_ratio > 5%')).toThrow(new PromqlError("1:24: parse error: unexpected character: '%'"));
    expect(() => parsePromql('foo(x)')).toThrow(new PromqlError('1:1: parse error: unknown function with name "foo"'));
  });
});

describe('規則のファイル', () => {
  it('時間の書き方を読み、書き戻す', () => {
    expect(parseDuration('5m')).toBe(300);
    expect(parseDuration('1h30m')).toBe(5400);
    expect(parseDuration('5分')).toBeNull();
    expect(formatDuration(36180)).toBe('10h3m');
    expect(formatDuration(0)).toBe('0s');
  });

  it('アラートの規則を読み、誤りは promtool check rules と同じ言い方で返す', () => {
    const ok = readRules('r.yml', rule('        expr: reserve:error_ratio > 0.05\n        for: 5m\n        labels:\n          severity: page\n'));
    expect(ok.ok && ok.alerts[0]?.forSeconds).toBe(300);
    const bad = readRules('r.yml', rule('        expr: reserve:error_ratio > 5%\n        for: 5分\n'));
    expect(bad.ok).toBe(false);
    if (!bad.ok) {
      expect(bad.errors[0]).toMatch(/^r\.yml: 5:\d+: group "reserve", rule 1, "ReserveErrorRate": could not parse expression: 1:24: parse error/);
      expect(bad.errors[1]).toBe('r.yml: 6:14: not a valid duration string: "5分"');
    }
    const key = readRules('r.yml', rule('        expr: up == 0\n        fore: 5m\n'));
    expect(!key.ok && key.errors[0]).toBe('r.yml: yaml: unmarshal errors:\n  line 6: field fore not found in type rulefmt.RuleNode');
  });
});

describe('promtool test rules', () => {
  it('入れる値の書き方（a+bxn・axn・_）を広げる', () => {
    expect(expandValues('1+2x2 5x1 _ 7')).toEqual([1, 3, 5, 5, 5, null, 7]);
    expect(expandValues('0.005x2')).toEqual([0.005, 0.005, 0.005]);
  });

  it('継続時間（for）の間は待ちで、続いた時だけ鳴る。一瞬の跳ねでは鳴らない', () => {
    const r = withRule(rule('        expr: reserve:error_ratio > 0.05\n        for: 5m\n        labels:\n          severity: page\n        annotations:\n          summary: 予約のエラーが増えている\n'));
    expect(r.failures).toEqual([]);
    expect(r.firing.get(600)).toEqual([]);
    expect(r.firing.get(26 * 60)?.[0]).toMatchObject({ state: 'firing', activeAt: 21 * 60, labels: { alertname: 'ReserveErrorRate', job: 'reserve', severity: 'page' } });
  });

  it('for が無いと跳ねで鳴り、時刻ごとに期待（exp）と鳴った物（got）を並べて失敗する', () => {
    const r = withRule(rule('        expr: reserve:error_ratio > 0.05\n        labels:\n          severity: warning\n        annotations:\n          summary: 予約のエラーが増えている\n'));
    expect(r.failures).toHaveLength(2);
    expect(r.failures?.[0]).toBe('    alertname: ReserveErrorRate, time: 10m, \n        exp:[], \n        got:[\n            0:\n              Labels:{alertname="ReserveErrorRate", job="reserve", severity="warning"}\n              Annotations:{summary="予約のエラーが増えている"}\n            ]');
    expect(r.failures?.[1]).toMatch(/time: 26m, \n {8}exp:\[\n[\s\S]*severity="page"[\s\S]*got:\[\n[\s\S]*severity="warning"/);
  });

  it('しきい値が高いと、続いた失敗でも鳴らない（got:[]）', () => {
    const r = withRule(rule('        expr: reserve:error_ratio > 0.5\n        for: 5m\n'));
    expect(r.failures?.[0]).toMatch(/time: 26m, [\s\S]*got:\[\]$/);
  });

  it('規則のファイルが読めなければ、テストは動かさずに誤りを返す', () => {
    expect(withRule(rule('        expr: x > 5%\n')).errors[0]).toMatch(/^rules\/reserve\.yml: 5:\d+: .*could not parse expression/);
    expect(runTestFile(TEST, () => null).errors).toEqual(['open ../rules/reserve.yml: no such file or directory']);
  });
});

describe('Alertmanager の振り分け', () => {
  const AM = `route:
  receiver: all-mail
  routes:
    - matchers: ['severity="page"']
      receiver: oncall-phone
    - match:
        severity: info
      receiver: dashboard
receivers:
  - name: all-mail
  - name: oncall-phone
  - name: dashboard
`;

  it('ラベルを木の上から当て、合った枝の知らせる先に送る。どれにも合わなければ根の先', () => {
    const c = readAmConfig(AM);
    if (!c.ok) throw new Error(c.error);
    expect(receiversFor(c.route, { severity: 'page' })).toEqual(['oncall-phone']);
    expect(receiversFor(c.route, { severity: 'info' })).toEqual(['dashboard']);
    expect(receiversFor(c.route, { severity: 'warning' })).toEqual(['all-mail']);
  });

  it('amtool config routes show の木を描く', () => {
    const c = readAmConfig(AM);
    expect(c.ok && routeTree(c.route)).toBe('Routing tree:\n.\n└── default-route  receiver: all-mail\n    ├── {severity="page"}  receiver: oncall-phone\n    └── {severity="info"}  receiver: dashboard\n');
  });

  it('無い知らせる先を指す枝は、本物と同じ文で断る', () => {
    expect(readAmConfig(AM.replace('receiver: dashboard', 'receiver: board'))).toEqual({ ok: false, error: 'undefined receiver "board" used in route' });
  });
});
