/**
 * DB のコンテナ（PostgreSQL）の中身の模型。純粋な関数（docs/lessons/docker.md docker.i.03・i.06）。
 *
 * - DB は、データを書く場所（/var/lib/postgresql/data）の base/tables.json に表を持つ。最初に動いた時に、その場所が空なら作る（init）
 * - psql -c の文は、よく使う形だけを模す: SELECT count(*) / SELECT * / INSERT INTO … VALUES … / CREATE TABLE。出力は本物の psql の形
 * 本物の SQL を学ぶ実戦は、ブラウザ内 SQL（src/engines/db）で行う。ここは「データがどこに残るか」を確かめるための物
 */

export interface Table {
  columns: string[];
  rows: string[][];
}

export type Tables = Record<string, Table>;

/** データを書く場所からの、表を置くファイル */
export const TABLES_FILE = 'base/tables.json';

/** データを書く場所を初めて作る時のファイル（データを書く場所からの相対パス → 中身） */
export function initFiles(seed: Tables): Record<string, string> {
  return { PG_VERSION: '16\n', 'postgresql.conf': "listen_addresses = '*'\n", [TABLES_FILE]: `${JSON.stringify(seed)}\n` };
}

export function readTables(text: string | undefined): Tables {
  if (text === undefined) return {};
  try {
    return JSON.parse(text) as Tables;
  } catch {
    return {};
  }
}

/** 画面の幅（全角は 2） */
function widthOf(s: string): number {
  let w = 0;
  for (const ch of s) w += (ch.codePointAt(0) ?? 0) > 0x2e80 ? 2 : 1;
  return w;
}

const padEnd = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - widthOf(s)));
const padStart = (s: string, w: number): string => ' '.repeat(Math.max(0, w - widthOf(s))) + s;
const center = (s: string, w: number): string => {
  const pad = Math.max(0, w - widthOf(s));
  return ' '.repeat(Math.floor(pad / 2)) + s + ' '.repeat(pad - Math.floor(pad / 2));
};

/** psql の表の形（見出しは中央、数は右、文字は左に寄せる） */
function render(columns: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = columns.map((c, i) => Math.max(widthOf(c), ...rows.map((r) => widthOf(r[i] ?? ''))));
  const numeric = columns.map((_, i) => rows.length > 0 && rows.every((r) => /^-?\d+$/.test(r[i] ?? '')));
  const head = ` ${columns.map((c, i) => center(c, widths[i] ?? 0)).join(' | ')} `;
  const rule = widths.map((w) => '-'.repeat(w + 2)).join('+');
  const body = rows.map((r) => ` ${r.map((v, i) => (numeric[i] ? padStart(v, widths[i] ?? 0) : padEnd(v, widths[i] ?? 0))).join(' | ')}`.replace(/\s+$/, ''));
  return [head, rule, ...body, `(${String(rows.length)} ${rows.length === 1 ? 'row' : 'rows'})`, ''].join('\n') + '\n';
}

/** 本物の psql の誤りの形（LINE 1 と、誤りの場所の ^） */
function errorAt(sql: string, message: string, at: number): string {
  return `ERROR:  ${message}\nLINE 1: ${sql}\n${' '.repeat('LINE 1: '.length + at)}^\n`;
}

/** 値の並び（'a', 3）を読む */
function values(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/'((?:[^']|'')*)'|(-?\d+(?:\.\d+)?)|(NULL)/gi)) out.push(m[1] !== undefined ? m[1].replace(/''/g, "'") : (m[2] ?? ''));
  return out;
}

export interface PsqlResult {
  out?: string;
  err?: string;
  /** 変わった表（INSERT・CREATE の時） */
  tables?: Tables;
}

/** psql -c の 1 つの文 */
export function psql(tables: Tables, raw: string): PsqlResult {
  const sql = raw.trim().replace(/;\s*$/, '');
  const missing = (name: string): PsqlResult => ({ err: errorAt(sql, `relation "${name}" does not exist`, sql.indexOf(name)) });
  let m = /^select\s+count\(\*\)\s+from\s+(\w+)$/i.exec(sql);
  if (m) {
    const t = tables[(m[1] ?? '').toLowerCase()];
    if (!t) return missing(m[1] ?? '');
    return { out: render(['count'], [[String(t.rows.length)]]) };
  }
  m = /^select\s+\*\s+from\s+(\w+)$/i.exec(sql);
  if (m) {
    const t = tables[(m[1] ?? '').toLowerCase()];
    if (!t) return missing(m[1] ?? '');
    return { out: render(t.columns, t.rows) };
  }
  m = /^insert\s+into\s+(\w+)\s*(?:\(([^)]*)\))?\s*values\s*\((.*)\)$/i.exec(sql);
  if (m) {
    const name = (m[1] ?? '').toLowerCase();
    const t = tables[name];
    if (!t) return missing(m[1] ?? '');
    const cols = m[2] ? m[2].split(',').map((c) => c.trim().toLowerCase()) : t.columns;
    const vals = values(m[3] ?? '');
    const unknown = cols.find((c) => !t.columns.includes(c));
    if (unknown !== undefined) return { err: errorAt(sql, `column "${unknown}" of relation "${name}" does not exist`, sql.indexOf(unknown)) };
    if (vals.length !== cols.length) return { err: errorAt(sql, 'INSERT has more target columns than expressions', sql.indexOf('(')) };
    // id は書かなければ続きの番号（serial）
    const next = String(Math.max(0, ...t.rows.map((r) => Number(r[t.columns.indexOf('id')] ?? 0))) + 1);
    const row = t.columns.map((c) => (cols.includes(c) ? (vals[cols.indexOf(c)] ?? '') : c === 'id' ? next : ''));
    return { out: 'INSERT 0 1\n', tables: { ...tables, [name]: { ...t, rows: [...t.rows, row] } } };
  }
  m = /^create\s+table\s+(\w+)\s*\((.*)\)$/i.exec(sql);
  if (m) {
    const name = (m[1] ?? '').toLowerCase();
    if (tables[name]) return { err: `ERROR:  relation "${name}" already exists\n` };
    const columns = (m[2] ?? '').split(',').map((c) => (c.trim().split(/\s+/)[0] ?? '').toLowerCase()).filter(Boolean);
    return { out: 'CREATE TABLE\n', tables: { ...tables, [name]: { columns, rows: [] } } };
  }
  const word = /^\S+/.exec(sql)?.[0] ?? '';
  return { err: errorAt(sql, `syntax error at or near "${word}"`, 0) };
}
