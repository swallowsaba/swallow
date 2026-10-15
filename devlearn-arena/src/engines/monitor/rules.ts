import { load } from 'js-yaml';
import { parsePromql, PromqlError, type Labels, type Node } from './promql';

/**
 * Prometheus の規則のファイル（groups の下の alert・record）と、アラートの動き。純粋な関数。
 *
 * アラートは、式の結果に出た時系列ごとに、初めに出た時から pending になり、`for` の間ずっと出続けたら firing になる。
 * 式の結果から消えたら、そのアラートは終わる（Prometheus と同じ）
 */

export interface AlertRule {
  alert: string;
  expr: Node;
  /** for（秒） */
  forSeconds: number;
  labels: Record<string, string>;
  annotations: Record<string, string>;
}

export interface RecordRule {
  record: string;
  expr: Node;
  labels: Record<string, string>;
}

export type RuleFile = { ok: true; alerts: AlertRule[]; records: RecordRule[]; count: number } | { ok: false; errors: string[] };

const UNITS: Record<string, number> = { ms: 0.001, s: 1, m: 60, h: 3600, d: 86400, w: 604800, y: 31536000 };

/** Prometheus の時間の書き方（5m・1h30m・90s）を秒にする。書けなければ null */
export function parseDuration(text: string): number | null {
  const t = text.trim();
  if (t === '0') return 0;
  if (!/^(\d+(ms|s|m|h|d|w|y))+$/.test(t)) return null;
  let total = 0;
  for (const m of t.matchAll(/(\d+)(ms|s|m|h|d|w|y)/g)) total += Number(m[1]) * (UNITS[m[2] ?? 's'] ?? 1);
  return total;
}

/** 秒を、Prometheus の書き方（10h3m・5m・0s）にする */
export function formatDuration(seconds: number): string {
  if (seconds === 0) return '0s';
  let rest = seconds;
  let out = '';
  for (const [u, n] of [['y', 31536000], ['w', 604800], ['d', 86400], ['h', 3600], ['m', 60], ['s', 1]] as const) {
    if (rest >= n) {
      out += `${String(Math.floor(rest / n))}${u}`;
      rest %= n;
    }
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strMap = (v: unknown): Record<string, string> => (isRecord(v) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)])) : {});

/** 鍵の行と桁（1 から）。見つからなければ 1:1 */
function at(lines: readonly string[], key: string, from = 0): string {
  for (let i = from; i < lines.length; i += 1) {
    const m = new RegExp(`^(\\s*(?:-\\s+)?)${key}\\s*:`).exec(lines[i] ?? '');
    if (m) return `${String(i + 1)}:${String((m[1] ?? '').length + key.length + 3)}`;
  }
  return '1:1';
}

/** 規則のファイルを読む。誤りは promtool check rules と同じ言い方（ファイル: 行:桁: group "名前", rule 番号, "名前": …） */
export function readRules(file: string, text: string): RuleFile {
  const lines = text.split('\n');
  let doc: unknown;
  try {
    doc = load(text);
  } catch (e) {
    const mark = (e as { mark?: { line?: number; column?: number } }).mark;
    return { ok: false, errors: [`${file}: yaml: line ${String((mark?.line ?? 0) + 1)}: ${String((e as { reason?: string }).reason ?? 'could not parse')}`] };
  }
  if (!isRecord(doc) || !Array.isArray(doc['groups'])) return { ok: false, errors: [`${file}: yaml: unmarshal errors:\n  line 1: field groups not found in type rulefmt.RuleGroups`] };
  const errors: string[] = [];
  const alerts: AlertRule[] = [];
  const records: RecordRule[] = [];
  let count = 0;
  let from = 0;
  for (const g of doc['groups'] as unknown[]) {
    if (!isRecord(g)) continue;
    const group = String(g['name'] ?? '');
    const rules = Array.isArray(g['rules']) ? (g['rules'] as unknown[]) : [];
    rules.forEach((r, i) => {
      if (!isRecord(r)) return;
      count += 1;
      const name = String(r['alert'] ?? r['record'] ?? '');
      const head = (key: string): string => `${file}: ${at(lines, key, from)}: group "${group}", rule ${String(i + 1)}, "${name}"`;
      for (const k of Object.keys(r)) {
        if (!['alert', 'record', 'expr', 'for', 'keep_firing_for', 'labels', 'annotations'].includes(k)) errors.push(`${file}: ${at(lines, k, from)}: field ${k} not found in type rulefmt.RuleNode`);
      }
      let expr: Node | null = null;
      if (typeof r['expr'] !== 'string' && typeof r['expr'] !== 'number') errors.push(`${head('expr')}: field 'expr' must be set in rule`);
      else {
        try {
          expr = parsePromql(String(r['expr']));
        } catch (e) {
          if (!(e instanceof PromqlError)) throw e;
          errors.push(`${head('expr')}: could not parse expression: ${e.message}`);
        }
      }
      let forSeconds = 0;
      if (r['for'] !== undefined) {
        const d = parseDuration(String(r['for']));
        if (d === null) errors.push(`${file}: ${at(lines, 'for', from)}: not a valid duration string: "${String(r['for'])}"`);
        else forSeconds = d;
      }
      if (expr) {
        if (typeof r['alert'] === 'string') alerts.push({ alert: r['alert'], expr, forSeconds, labels: strMap(r['labels']), annotations: strMap(r['annotations']) });
        else if (typeof r['record'] === 'string') records.push({ record: r['record'], expr, labels: strMap(r['labels']) });
        else errors.push(`${head('expr')}: one of 'record' or 'alert' must be set`);
      }
      // 次の規則は、この規則の expr の行より後ろから探す
      const line = Number(at(lines, 'expr', from).split(':')[0]);
      if (line > 0) from = line;
    });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, alerts, records, count };
}

/** {{ $labels.名前 }}・{{ $value }} を置き換える */
export function expandTemplate(text: string, labels: Labels, value: number): string {
  return text
    .replace(/\{\{\s*\$labels\.([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g, (_, k: string) => labels[k] ?? '')
    .replace(/\{\{\s*\$value\s*\}\}/g, String(value));
}

export interface ActiveAlert {
  labels: Record<string, string>;
  annotations: Record<string, string>;
  state: 'pending' | 'firing';
  activeAt: number;
}
