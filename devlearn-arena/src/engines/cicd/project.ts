import type { Route, Site } from '@/engines/http/http';
import type { ActionsSetup, FileMatch, SiteSetup } from './setup';
import type { SiteState } from './types';

/**
 * runner の中の道具（npm と、scripts が呼ぶ道具）と、配る先のサーバの模型。純粋な関数。
 * 部品の版は、本物の npm と同じく package-lock.json か、置き場（registry）の範囲に合う一番新しい版で決まる。
 */

export type Files = Readonly<Record<string, string>>;

/** ファイルの中身の条件を全て満たすか */
export function allMatch(files: Files, when: readonly FileMatch[]): boolean {
  return when.every((m) => {
    const text = files[m.path];
    if (text === undefined) return m.has === undefined;
    return (m.has === undefined || text.includes(m.has)) && (m.lacks === undefined || !text.includes(m.lacks));
  });
}

const parse = (v: string): [number, number, number] => {
  const [a = 0, b = 0, c = 0] = v.split('.').map(Number);
  return [a, b, c];
};
const cmp = (x: string, y: string): number => {
  const a = parse(x);
  const b = parse(y);
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
};

/** その版が below より古いか */
export const versionBelow = (version: string, below: string): boolean => cmp(version, below) < 0;

/** 版の範囲（^1.2.3・~1.2.3・1.2.3・*・latest）に、その版が入るか */
export function satisfies(version: string, range: string): boolean {
  const r = range.trim();
  if (r === '*' || r === 'latest' || r === '') return true;
  const base = r.replace(/^[\^~=]/, '');
  if (!/^\d+\.\d+\.\d+$/.test(base)) return false;
  const [ma, mi] = parse(base);
  const [va, vi] = parse(version);
  if (cmp(version, base) < 0) return false;
  if (r.startsWith('^')) return ma === 0 ? va === 0 && vi === mi : va === ma;
  if (r.startsWith('~')) return va === ma && vi === mi;
  return cmp(version, base) === 0;
}

/**
 * 置き場から、範囲に合う一番新しい版（now の時刻に出ている物）。
 * 置き場に書いていない部品は、範囲の版がそのままある物とする（模型が見ない部品）
 */
export function resolveVersion(setup: ActionsSetup, name: string, range: string, now: number, parseTime: (t: string) => number | null): string | null {
  const known = setup.packages[name];
  if (!known) return range.replace(/^[\^~=]/, '') || '1.0.0';
  const out = known
    .filter((p) => p.published === undefined || (parseTime(p.published) ?? 0) <= now)
    .filter((p) => satisfies(p.version, range))
    .sort((a, b) => cmp(b.version, a.version));
  return out[0]?.version ?? null;
}

export interface PackageJson {
  name: string;
  version: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export function readPackageJson(text: string): PackageJson | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const map = (v: unknown): Record<string, string> =>
    typeof v === 'object' && v !== null ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, String(x)])) : {};
  return {
    name: typeof r['name'] === 'string' ? r['name'] : 'app',
    version: typeof r['version'] === 'string' ? r['version'] : '1.0.0',
    scripts: map(r['scripts']),
    dependencies: map(r['dependencies']),
    devDependencies: map(r['devDependencies']),
  };
}

/** package-lock.json の、部品ごとの版（読めなければ null） */
export function readLock(text: string): Record<string, string> | null {
  try {
    const raw = JSON.parse(text) as { packages?: Record<string, { version?: string }> };
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw.packages ?? {})) {
      if (k.startsWith('node_modules/') && typeof v.version === 'string') out[k.slice('node_modules/'.length)] = v.version;
    }
    return out;
  } catch {
    return null;
  }
}

export function lockText(pkg: PackageJson, versions: Readonly<Record<string, string>>): string {
  const packages: Record<string, unknown> = { '': { name: pkg.name, version: pkg.version, dependencies: pkg.dependencies, devDependencies: pkg.devDependencies } };
  for (const [name, version] of Object.entries(versions)) {
    packages[`node_modules/${name}`] = { version, resolved: `https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`, ...(name in pkg.devDependencies ? { dev: true } : {}) };
  }
  return `${JSON.stringify({ name: pkg.name, version: pkg.version, lockfileVersion: 3, requires: true, packages }, null, 2)}\n`;
}

/**
 * esbuild で 1 つに束ねたファイル（--bundle）。本物と同じく、部品と元のファイルを、それぞれの場所の注釈の後ろに並べる。
 * 部品は dependencies の物だけを、入れた版で入れる
 */
export function bundleText(pkg: PackageJson, installed: Readonly<Record<string, string>>, sources: Files): string {
  const parts: string[] = [];
  for (const name of Object.keys(pkg.dependencies).sort()) {
    const v = installed[name];
    if (v !== undefined) parts.push(`// node_modules/${name}/index.js`, `var version = "${v}";`, '');
  }
  for (const [path, text] of Object.entries(sources).sort(([a], [b]) => a.localeCompare(b))) parts.push(`// ${path}`, text.replace(/\n$/, ''), '');
  return `${parts.join('\n')}`;
}

/** 中身から決まる指紋（sha256 の見かけの 64 桁。同じ中身なら同じ） */
export function digestOf(files: Files): string {
  const text = Object.entries(files).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}\0${v}`).join('\0');
  let out = '';
  for (let round = 0; out.length < 64; round += 1) {
    let h = 0x811c9dc5 ^ round;
    for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
    out += h.toString(16).padStart(8, '0');
  }
  return out.slice(0, 64);
}

export const fill = (line: string, vars: Readonly<Record<string, string>>): string =>
  line.replace(/\{(\w+)\}/g, (all, k: string) => vars[k] ?? all);

/** 配る先の初めの状態 */
export const siteStateOf = (s: SiteSetup): SiteState => ({ host: s.host, current: s.current, releases: s.releases.map((r) => ({ version: r.version, files: { ...r.files } })) });

/** 配る先のサーバの、今の版で決まる道ごとの答え */
export function siteRoutes(setup: SiteSetup, state: SiteState): Record<string, Route> {
  const files = state.releases.find((r) => r.version === state.current)?.files ?? {};
  const fault = setup.faults.find((f) => allMatch(files, f.when));
  const merged = { ...setup.routes, ...(fault?.routes ?? {}) };
  return Object.fromEntries(Object.entries(merged).map(([k, r]) => [k, { status: r.status, body: fill(r.body, { version: state.current }) }]));
}

/** HTTP の世界に出すサイト（curl で届く） */
export function siteOf(setup: SiteSetup, state: SiteState): Site {
  return { host: setup.host, port: setup.port, ...(setup.chain ? { chain: setup.chain } : {}), routes: siteRoutes(setup, state) };
}
