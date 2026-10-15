import { load } from 'js-yaml';
import { scalarText } from './rules';

/**
 * Alertmanager の知らせる先の振り分け（route と receivers）。純粋な関数。
 *
 * アラートのラベルを、route の木の上から当て、合った枝の receiver に送る（Alertmanager と同じ）。
 * 子の枝のどれにも合わなければ、その枝の receiver。continue: true の枝は、合っても次の兄弟の枝を見る
 */

export interface Matcher {
  label: string;
  op: '=' | '!=' | '=~' | '!~';
  value: string;
}

export interface Route {
  receiver: string;
  matchers: Matcher[];
  continue: boolean;
  routes: Route[];
}

export type AmConfig = { ok: true; route: Route; receivers: string[] } | { ok: false; error: string };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** severity="page"・severity=page・severity=~"page|ticket" の形 */
export function parseMatcher(text: string): Matcher | null {
  const m = /^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(=~|!~|!=|=)\s*(.*?)\s*$/.exec(text);
  if (!m) return null;
  const raw = m[3] ?? '';
  const value = /^".*"$/.test(raw) ? raw.slice(1, -1).replace(/\\(.)/g, '$1') : raw;
  return { label: m[1] ?? '', op: m[2] as Matcher['op'], value };
}

function readRoute(v: unknown, parent: string | null, errors: string[]): Route {
  const r = isRecord(v) ? v : {};
  const receiver = typeof r['receiver'] === 'string' ? r['receiver'] : parent;
  if (receiver === null) errors.push('root route must specify a default receiver');
  const matchers: Matcher[] = [];
  for (const t of Array.isArray(r['matchers']) ? (r['matchers'] as unknown[]) : []) {
    const m = parseMatcher(String(t));
    if (m) matchers.push(m);
    else errors.push(`bad matcher format: ${String(t)}`);
  }
  // 古い書き方（match・match_re）
  if (isRecord(r['match'])) for (const [k, x] of Object.entries(r['match'])) matchers.push({ label: k, op: '=', value: String(x) });
  if (isRecord(r['match_re'])) for (const [k, x] of Object.entries(r['match_re'])) matchers.push({ label: k, op: '=~', value: String(x) });
  const routes = (Array.isArray(r['routes']) ? (r['routes'] as unknown[]) : []).map((c) => readRoute(c, receiver ?? '', errors));
  return { receiver: receiver ?? '', matchers, continue: r['continue'] === true, routes };
}

function receiversUsed(route: Route): string[] {
  return [route.receiver, ...route.routes.flatMap(receiversUsed)];
}

/** alertmanager.yml を読む。誤りは Alertmanager と同じ言い方 */
export function readAmConfig(text: string): AmConfig {
  let doc: unknown;
  try {
    doc = load(text);
  } catch (e) {
    const mark = (e as { mark?: { line?: number } }).mark;
    return { ok: false, error: `yaml: line ${String((mark?.line ?? 0) + 1)}: ${String((e as { reason?: string }).reason ?? 'could not parse')}` };
  }
  if (!isRecord(doc) || !isRecord(doc['route'])) return { ok: false, error: 'no routes provided' };
  const errors: string[] = [];
  const route = readRoute(doc['route'], null, errors);
  const receivers = (Array.isArray(doc['receivers']) ? (doc['receivers'] as unknown[]) : []).filter(isRecord).map((r) => scalarText(r['name']));
  for (const name of receiversUsed(route)) {
    if (name !== '' && !receivers.includes(name)) errors.push(`undefined receiver "${name}" used in route`);
  }
  return errors.length > 0 ? { ok: false, error: errors[0] ?? '' } : { ok: true, route, receivers };
}

const matches = (m: Matcher, labels: Readonly<Record<string, string>>): boolean => {
  const v = labels[m.label] ?? '';
  if (m.op === '=') return v === m.value;
  if (m.op === '!=') return v !== m.value;
  const re = new RegExp(`^(?:${m.value})$`);
  return m.op === '=~' ? re.test(v) : !re.test(v);
};

/** ラベルのアラートが送られる receiver（順に。重ねて送る枝があれば複数） */
export function receiversFor(route: Route, labels: Readonly<Record<string, string>>): string[] {
  const out: string[] = [];
  for (const child of route.routes) {
    if (!child.matchers.every((m) => matches(m, labels))) continue;
    out.push(...receiversFor(child, labels));
    if (!child.continue) break;
  }
  return out.length > 0 ? out : [route.receiver];
}

const matcherText = (ms: readonly Matcher[]): string => `{${ms.map((m) => `${m.label}${m.op}"${m.value}"`).join(',')}}`;

/** amtool config routes show の木 */
export function routeTree(route: Route): string {
  const lines = ['Routing tree:', '.', `└── default-route  receiver: ${route.receiver}`];
  const walk = (r: Route, indent: string): void => {
    r.routes.forEach((c, i) => {
      const last = i === r.routes.length - 1;
      lines.push(`${indent}${last ? '└── ' : '├── '}${matcherText(c.matchers)}${c.continue ? '  continue: true' : ''}  receiver: ${c.receiver}`);
      walk(c, `${indent}${last ? '    ' : '│   '}`);
    });
  };
  walk(route, '    ');
  return `${lines.join('\n')}\n`;
}
