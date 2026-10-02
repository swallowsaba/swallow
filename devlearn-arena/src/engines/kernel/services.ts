/**
 * サービス（systemd が管理する、裏で動き続けるプログラム）の模型。純粋な関数。
 * docs/lessons/linux.md の linux.i.01（サービスと systemd）の実戦が使う。
 *
 * - 状態は 2 つの軸: 今動いているか（active / inactive / failed）と、次の起動で自動で動くか（enabled）
 * - broken を持つサービスは、動かそうとすると失敗する（理由はログに出る）
 * - 待ち受けるポートと、応える中身を持てる（curl で確かめる。src/engines/http）
 */

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

function update(table: ServiceTable, s: Service, lines: string[]): ServiceTable {
  const services = new Map(table.services);
  const log = [...s.log, ...lines.map((l, i) => `${stamp(table.tick + i)} server systemd[1]: ${l}`)];
  services.set(s.name, { ...s, log });
  return { services, tick: table.tick + lines.length };
}

function find(table: ServiceTable, raw: string): Service | ServiceError {
  const s = table.services.get(unitName(raw));
  return s ?? { kind: 'not-found', unit: `${unitName(raw)}.service` };
}

const isError = (x: Service | ServiceError): x is ServiceError => 'kind' in x;

export function startService(table: ServiceTable, raw: string): ServiceResult {
  const s = find(table, raw);
  if (isError(s)) return { ok: false, table, error: s };
  if (s.active === 'active') return { ok: true, table };
  if (s.broken) {
    const t = update(table, { ...s, active: 'failed' }, [
      `Starting ${s.name}.service - ${s.description}...`,
      `${s.name}.service: ${s.broken}`,
      `${s.name}.service: Main process exited, code=exited, status=1/FAILURE`,
      `${s.name}.service: Failed with result 'exit-code'.`,
      `Failed to start ${s.name}.service - ${s.description}.`,
    ]);
    return { ok: false, table: t, error: { kind: 'failed', unit: `${s.name}.service` } };
  }
  return { ok: true, table: update(table, { ...s, active: 'active' }, [`Starting ${s.name}.service - ${s.description}...`, `Started ${s.name}.service - ${s.description}.`]) };
}

export function stopService(table: ServiceTable, raw: string): ServiceResult {
  const s = find(table, raw);
  if (isError(s)) return { ok: false, table, error: s };
  if (s.active === 'inactive') return { ok: true, table };
  return { ok: true, table: update(table, { ...s, active: 'inactive' }, [`Stopping ${s.name}.service - ${s.description}...`, `Stopped ${s.name}.service - ${s.description}.`]) };
}

export function restartService(table: ServiceTable, raw: string): ServiceResult {
  const stopped = stopService(table, raw);
  return stopped.ok ? startService(stopped.table, raw) : stopped;
}

export function setEnabled(table: ServiceTable, raw: string, enabled: boolean): ServiceResult {
  const s = find(table, raw);
  if (isError(s)) return { ok: false, table, error: s };
  const services = new Map(table.services);
  services.set(s.name, { ...s, enabled });
  return { ok: true, table: { ...table, services } };
}

/** 次の起動（サーバの再起動）。有効なサービスだけが動き出し、それ以外は止まったまま */
export function reboot(table: ServiceTable): ServiceTable {
  let t: ServiceTable = { ...table, services: new Map([...table.services].map(([k, s]) => [k, { ...s, active: 'inactive' as const }])) };
  for (const s of t.services.values()) if (s.enabled) t = startService(t, s.name).table;
  return t;
}

export function serviceOf(table: ServiceTable | null, raw: string): Service | undefined {
  return table?.services.get(unitName(raw));
}
