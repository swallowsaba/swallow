/**
 * サービス（systemd が管理する、裏で動き続けるプログラム）の模型。純粋な関数。
 * docs/lessons/linux.md の linux.i.01（サービスと systemd）の実戦が使う。
 *
 * - 状態は 2 つの軸: 今動いているか（active / inactive / failed）と、次の起動で自動で動くか（enabled）
 * - broken を持つサービスは、動かそうとすると失敗する（理由はログに出る）
 * - 待ち受けるポートと、応える中身を持てる（curl で確かめる。src/engines/http）
 * - 設定ファイル（config）を持つサービスは、動かす時に設定を読む（src/engines/kernel/webConfig.ts）。
 *   設定の誤りでは起動に失敗し、理由をログに書く。待ち受けるポートは設定から決まる
 * - 動いている別のサービスと同じポートでは待ち受けられない（起動に失敗する）
 */
import type { ConfigResult, Listen } from './webConfig';

export type ActiveState = 'active' | 'inactive' | 'failed';

export interface Service {
  name: string;
  description: string;
  active: ActiveState;
  enabled: boolean;
  /** 動かそうとすると失敗する理由（ログに出す行） */
  broken?: string;
  /** 待ち受けるポート（動いている間だけ） */
  port?: number;
  /** HTTP で応える中身 */
  body?: string;
  /** HTTP で応える状態の番号（無ければ 200。準備中の 503 など） */
  status?: number;
  /** 設定ファイルの場所（動かす時に読む） */
  config?: string;
  /** 設定から決まった待ち受け（動いている間だけ意味がある） */
  listens?: readonly Listen[];
  /** ログ（journalctl で読む） */
  log: readonly string[];
}

export interface ServiceTable {
  services: ReadonlyMap<string, Service>;
  /** ログに書く時刻を進めるための数（同じ操作からは同じログ） */
  tick: number;
}

export function createServiceTable(seed: readonly Omit<Service, 'log'>[] = []): ServiceTable {
  return { services: new Map(seed.map((s) => [s.name, { ...s, log: [] }])), tick: 0 };
}

/** web と web.service のどちらで書いても同じサービスを指す */
export function unitName(raw: string): string {
  return raw.endsWith('.service') ? raw.slice(0, -'.service'.length) : raw;
}

export type ServiceError = { kind: 'not-found'; unit: string } | { kind: 'failed'; unit: string };

export type ServiceResult = { ok: true; table: ServiceTable } | { ok: false; table: ServiceTable; error: ServiceError };

function stamp(tick: number): string {
  const s = 30 + tick;
  return `Oct 03 09:${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** ログの 1 行。文字列なら systemd が書いた行、from があればそのプログラムが書いた行 */
type LogLine = string | { from: string; text: string };

function update(table: ServiceTable, s: Service, lines: LogLine[]): ServiceTable {
  const services = new Map(table.services);
  const log = [...s.log, ...lines.map((l, i) => `${stamp(table.tick + i)} server ${typeof l === 'string' ? `systemd[1]: ${l}` : `${l.from}: ${l.text}`}`)];
  services.set(s.name, { ...s, log });
  return { services, tick: table.tick + lines.length };
}

function find(table: ServiceTable, raw: string): Service | ServiceError {
  const s = table.services.get(unitName(raw));
  return s ?? { kind: 'not-found', unit: `${unitName(raw)}.service` };
}

const isError = (x: Service | ServiceError): x is ServiceError => 'kind' in x;

/** 設定ファイルを読む関数（場所 → 結果）。systemctl が仮想のファイルから読んで渡す */
export type ConfigLoader = (path: string) => ConfigResult;

/** サービスが待ち受けるポート（設定から決まった物と、初めから決まっている物） */
export function portsOf(s: Service): number[] {
  return [...(s.listens ?? []).map((l) => l.port), ...(s.port !== undefined && !s.config ? [s.port] : [])];
}

function fail(table: ServiceTable, s: Service, why: LogLine): ServiceResult {
  const t = update(table, { ...s, active: 'failed' }, [
    `Starting ${s.name}.service - ${s.description}...`,
    why,
    `${s.name}.service: Main process exited, code=exited, status=1/FAILURE`,
    `${s.name}.service: Failed with result 'exit-code'.`,
    `Failed to start ${s.name}.service - ${s.description}.`,
  ]);
  return { ok: false, table: t, error: { kind: 'failed', unit: `${s.name}.service` } };
}

export function startService(table: ServiceTable, raw: string, load?: ConfigLoader): ServiceResult {
  const s = find(table, raw);
  if (isError(s)) return { ok: false, table, error: s };
  if (s.active === 'active') return { ok: true, table };
  if (s.broken) return fail(table, s, `${s.name}.service: ${s.broken}`);
  let ready: Service = s;
  if (s.config && load) {
    const conf = load(s.config);
    if (!conf.ok) return fail(table, s, { from: `${s.name}[${String(800 + table.tick)}]`, text: conf.error });
    ready = { ...s, listens: conf.listens };
  }
  for (const port of portsOf(ready)) {
    const other = [...table.services.values()].find((o) => o.name !== s.name && o.active === 'active' && portsOf(o).includes(port));
    if (other) return fail(table, s, { from: `${s.name}[${String(800 + table.tick)}]`, text: `${s.name}: [emerg] bind() to 0.0.0.0:${String(port)} failed (98: Address already in use)` });
  }
  return { ok: true, table: update(table, { ...ready, active: 'active' }, [`Starting ${s.name}.service - ${s.description}...`, `Started ${s.name}.service - ${s.description}.`]) };
}

export function stopService(table: ServiceTable, raw: string): ServiceResult {
  const s = find(table, raw);
  if (isError(s)) return { ok: false, table, error: s };
  if (s.active === 'inactive') return { ok: true, table };
  return { ok: true, table: update(table, { ...s, active: 'inactive' }, [`Stopping ${s.name}.service - ${s.description}...`, `Stopped ${s.name}.service - ${s.description}.`]) };
}

export function restartService(table: ServiceTable, raw: string, load?: ConfigLoader): ServiceResult {
  const stopped = stopService(table, raw);
  return stopped.ok ? startService(stopped.table, raw, load) : stopped;
}

export function setEnabled(table: ServiceTable, raw: string, enabled: boolean): ServiceResult {
  const s = find(table, raw);
  if (isError(s)) return { ok: false, table, error: s };
  const services = new Map(table.services);
  services.set(s.name, { ...s, enabled });
  return { ok: true, table: { ...table, services } };
}

/** 次の起動（サーバの再起動）。有効なサービスだけが動き出し、それ以外は止まったまま */
export function reboot(table: ServiceTable, load?: ConfigLoader): ServiceTable {
  let t: ServiceTable = { ...table, services: new Map([...table.services].map(([k, s]) => [k, { ...s, active: 'inactive' as const }])) };
  for (const s of t.services.values()) if (s.enabled) t = startService(t, s.name, load).table;
  return t;
}

export function serviceOf(table: ServiceTable | null, raw: string): Service | undefined {
  return table?.services.get(unitName(raw));
}
