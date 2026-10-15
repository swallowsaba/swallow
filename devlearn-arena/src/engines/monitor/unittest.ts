import { load } from 'js-yaml';
import { evaluate, parsePromql, PromqlError, type Labels, type Sample } from './promql';
import { expandTemplate, formatDuration, parseDuration, readRules, scalarText, type ActiveAlert, type AlertRule } from './rules';

/**
 * promtool test rules（Prometheus の規則の単体テスト）。純粋な関数。
 *
 * テストのファイルに、入れる時系列（input_series。`0.005x602 0.12` の書き方）と、その時刻に鳴っているはずのアラート
 * （alert_rule_test の exp_alerts）を書く。規則を、時刻 0 から evaluation_interval ごとに動かし、鳴っている（firing）
 * アラートを比べる。出し方は本物の promtool と同じ（Unit Testing:・SUCCESS・FAILED: と exp・got）
 */

const LOOKBACK = 300;

export interface Outcome {
  stdout: string;
  stderr: string;
  code: number;
}

/** 入れる値の書き方（a・a+bxn・a-bxn・axn・_・_xn・stale）を、時刻の順の値にする（null は欠け） */
export function expandValues(text: string): (number | null)[] | null {
  const out: (number | null)[] = [];
  for (const item of text.trim().split(/\s+/).filter(Boolean)) {
    let m = /^_(?:x(\d+))?$/.exec(item);
    if (m) {
      for (let i = 0; i < Number(m[1] ?? 1); i += 1) out.push(null);
      continue;
    }
    if (item === 'stale') { out.push(null); continue; }
    m = /^(-?[\d.e+]+?)(?:([+-])([\d.e]+))?x(\d+)$/i.exec(item);
    if (m) {
      const a = Number(m[1]);
      const b = (m[2] === '-' ? -1 : 1) * Number(m[3] ?? 0);
      for (let i = 0; i <= Number(m[4]); i += 1) out.push(a + b * i);
      continue;
    }
    const n = Number(item);
    if (!Number.isFinite(n)) return null;
    out.push(n);
  }
  return out;
}

interface Series { labels: Labels; values: (number | null)[] }

function seriesLabels(text: string): Labels | null {
  try {
    const n = parsePromql(text);
    if (n.kind !== 'selector' || n.matchers.some((m) => m.op !== '=')) return null;
    return { __name__: n.name, ...Object.fromEntries(n.matchers.map((m) => [m.label, m.value])) };
  } catch (e) {
    if (e instanceof PromqlError) return null;
    throw e;
  }
}

const labelsText = (l: Labels): string => `{${Object.keys(l).sort().map((k) => `${k}="${l[k] ?? ''}"`).join(', ')}}`;

/** その時刻に見える値（その時刻より前の、一番新しい値。5 分より古ければ見えない） */
function samplesAt(series: readonly Series[], t: number, interval: number): Sample[] {
  const out: Sample[] = [];
  for (const s of series) {
    for (let k = Math.min(Math.floor(t / interval), s.values.length - 1); k >= 0 && t - k * interval < LOOKBACK; k -= 1) {
      const v = s.values[k];
      if (v !== null && v !== undefined) {
        out.push({ labels: s.labels, value: v });
        break;
      }
    }
  }
  return out;
}

/** 規則を時刻 0 から動かし、求めた時刻ごとに、鳴っている（firing）アラートを返す */
export function runAlerts(alerts: readonly AlertRule[], records: readonly { record: string; expr: ReturnType<typeof parsePromql>; labels: Record<string, string> }[], series: readonly Series[], interval: number, evalInterval: number, times: readonly number[]): Map<number, ActiveAlert[]> {
  const result = new Map<number, ActiveAlert[]>();
  if (times.length === 0) return result;
  const end = Math.max(...times);
  const active = alerts.map(() => new Map<string, ActiveAlert>());
  for (let t = 0; t <= end; t += evalInterval) {
    const samples = samplesAt(series, t, interval);
    for (const r of records) {
      for (const s of evaluate(r.expr, samples)) samples.push({ labels: { ...s.labels, ...r.labels, __name__: r.record }, value: s.value });
    }
    alerts.forEach((rule, i) => {
      const now = new Map<string, ActiveAlert>();
      for (const s of evaluate(rule.expr, samples)) {
        const base = Object.fromEntries(Object.entries(s.labels).filter(([k]) => k !== '__name__'));
        const labels = { ...base, ...rule.labels, alertname: rule.alert };
        const key = labelsText(labels);
        const before = active[i]?.get(key);
        const activeAt = before?.activeAt ?? t;
        const annotations = Object.fromEntries(Object.entries(rule.annotations).map(([k, v]) => [k, expandTemplate(v, base, s.value)]));
        now.set(key, { labels, annotations, activeAt, state: t - activeAt >= rule.forSeconds ? 'firing' : 'pending' });
      }
      active[i] = now;
    });
    if (times.includes(t)) result.set(t, active.flatMap((m) => [...m.values()].filter((a) => a.state === 'firing')));
  }
  return result;
}

interface TestCase { evalTime: number; alertname: string; exp: { labels: Record<string, string>; annotations: Record<string, string> }[] }

interface TestGroup { interval: number; series: Series[]; cases: TestCase[] }

export interface TestFile { ruleFiles: string[]; evalInterval: number; groups: TestGroup[] }

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strMap = (v: unknown): Record<string, string> => (isRecord(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)])) : {});

export function readTestFile(text: string): TestFile | string {
  let doc: unknown;
  try {
    doc = load(text);
  } catch (e) {
    return `yaml: ${String((e as { reason?: string }).reason ?? e)}`;
  }
  if (!isRecord(doc)) return 'yaml: the test file is empty';
  const dur = (v: unknown, fallback: number): number => (v === undefined ? fallback : parseDuration(scalarText(v)) ?? fallback);
  const groups: TestGroup[] = [];
  for (const g of Array.isArray(doc['tests']) ? (doc['tests'] as unknown[]) : []) {
    if (!isRecord(g)) continue;
    const series: Series[] = [];
    for (const s of Array.isArray(g['input_series']) ? (g['input_series'] as unknown[]) : []) {
      if (!isRecord(s)) continue;
      const labels = seriesLabels(scalarText(s['series']));
      const values = expandValues(scalarText(s['values']));
      if (!labels || !values) return `bad input series: ${scalarText(s['series'])}`;
      series.push({ labels, values });
    }
    const cases: TestCase[] = [];
    for (const c of Array.isArray(g['alert_rule_test']) ? (g['alert_rule_test'] as unknown[]) : []) {
      if (!isRecord(c)) continue;
      cases.push({
        evalTime: dur(c['eval_time'], 0),
        alertname: scalarText(c['alertname']),
        exp: (Array.isArray(c['exp_alerts']) ? (c['exp_alerts'] as unknown[]) : []).filter(isRecord).map((a) => ({ labels: strMap(a['exp_labels']), annotations: strMap(a['exp_annotations']) })),
      });
    }
    groups.push({ interval: dur(g['interval'], 60), series, cases });
  }
  return {
    ruleFiles: Array.isArray(doc['rule_files']) ? (doc['rule_files'] as unknown[]).map(String) : [],
    evalInterval: dur(doc['evaluation_interval'], 60),
    groups,
  };
}

const alertsText = (list: readonly { labels: Labels; annotations: Labels }[]): string => {
  if (list.length === 0) return '[]';
  const items = list.map((a, i) => `            ${String(i)}:\n              Labels:${labelsText(a.labels)}\n              Annotations:${labelsText(a.annotations)}`);
  return `[\n${items.join(',\n')}\n            ]`;
};

export interface TestRun {
  /** 規則とテストのファイルが読めた時、テストの結果（失敗の文。空なら成功） */
  failures: string[] | null;
  /** 読めなかった時の文 */
  errors: string[];
  /** 求めた時刻ごとの、鳴っているアラート（名前ごと） */
  firing: Map<number, ActiveAlert[]>;
}

/**
 * テストのファイルを動かす。read は、テストのファイルの rule_files に書いた場所を、テストのファイルのディレクトリから読む
 * （本物の promtool と同じ。path は誤りの文に出す名前。無ければ null）
 */
export function runTestFile(testText: string, read: (path: string) => { path: string; text: string } | null): TestRun {
  const test = readTestFile(testText);
  if (typeof test === 'string') return { failures: null, errors: [test], firing: new Map() };
  const alerts: AlertRule[] = [];
  const records: { record: string; expr: ReturnType<typeof parsePromql>; labels: Record<string, string> }[] = [];
  const errors: string[] = [];
  for (const f of test.ruleFiles) {
    const file = read(f);
    if (file === null) {
      errors.push(`open ${f}: no such file or directory`);
      continue;
    }
    const r = readRules(file.path, file.text);
    if (!r.ok) errors.push(...r.errors);
    else {
      alerts.push(...r.alerts);
      records.push(...r.records);
    }
  }
  if (errors.length > 0) return { failures: null, errors, firing: new Map() };
  const failures: string[] = [];
  const firing = new Map<number, ActiveAlert[]>();
  for (const g of test.groups) {
    const got = runAlerts(alerts, records, g.series, g.interval, test.evalInterval, g.cases.map((c) => c.evalTime));
    for (const [t, list] of got) firing.set(t, list);
    for (const c of g.cases) {
      const have = (got.get(c.evalTime) ?? []).filter((a) => a.labels['alertname'] === c.alertname)
        .map((a) => ({ labels: a.labels, annotations: a.annotations }))
        .sort((a, b) => labelsText(a.labels).localeCompare(labelsText(b.labels)));
      const want = c.exp.map((e) => ({ labels: { ...e.labels, alertname: c.alertname }, annotations: e.annotations }))
        .sort((a, b) => labelsText(a.labels).localeCompare(labelsText(b.labels)));
      const same = have.length === want.length && have.every((h, i) => labelsText(h.labels) === labelsText(want[i]?.labels ?? {}) && labelsText(h.annotations) === labelsText(want[i]?.annotations ?? {}));
      if (!same) failures.push(`    alertname: ${c.alertname}, time: ${formatDuration(c.evalTime)}, \n        exp:${alertsText(want)}, \n        got:${alertsText(have)}`);
    }
  }
  return { failures, errors: [], firing };
}

/** promtool test rules のファイル 1 つ分の出力 */
export function testOutput(path: string, run: TestRun): Outcome {
  const head = `Unit Testing:  ${path}\n`;
  if (run.failures === null) return { stdout: head, stderr: `  FAILED:\n${run.errors.map((e) => `    ${e}`).join('\n')}\n\n`, code: 1 };
  if (run.failures.length === 0) return { stdout: `${head}  SUCCESS\n\n`, stderr: '', code: 0 };
  return { stdout: head, stderr: `  FAILED:\n${run.failures.join('\n')}\n\n`, code: 1 };
}

/** promtool check rules のファイル 1 つ分の出力 */
export function checkOutput(path: string, text: string): Outcome {
  const r = readRules(path, text);
  if (!r.ok) return { stdout: `Checking ${path}\n`, stderr: `  FAILED:\n${r.errors.join('\n')}\n\n`, code: 1 };
  return { stdout: `Checking ${path}\n  SUCCESS: ${String(r.count)} rules found\n\n`, stderr: '', code: 0 };
}

export { PromqlError };
