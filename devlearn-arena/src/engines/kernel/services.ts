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
 * - ログインを覚えるアプリ（session）は、動かす時に php.ini を読み、札（Cookie）の決まりにする（src/engines/http/session.ts）
 * - DHCP のサーバ（dhcp）は、動かす時に dhcpd.conf を読み、待っている機械にアドレスを貸す（src/engines/net/dhcp.ts）。
 *   誤りのある設定では起動に失敗し、dhcpd の言い方でログに書く。貸した記録は dhcpLeases（リースのファイルの中身）に持つ
 */
import type { Route } from '@/engines/http/http';
import { readSessionIni, type SessionApp, type SessionCookie } from '@/engines/http/session';
import { DHCP_EPOCH, leasesText, parseDhcpConf, serveLeases, type DhcpClient } from '@/engines/net/dhcp';
import type { ConfigResult, Listen, ServerBlock } from './webConfig';

export type ActiveState = 'active' | 'inactive' | 'failed';

export interface Service {
  name: string;
  description: string;
  active: ActiveState;
  enabled: boolean;
  /** 動かそうとすると失敗する理由（ログに出す行） */
  broken?: string;
  /** 待ち受けるポート（TCP。動いている間だけ） */
  port?: number;
  /** UDP で待ち受けるポート（動いている間だけ。ss -u で見える） */
  udp?: readonly number[];
  /** ss -p に出るプログラムの名前（無ければサービスの名前。ssh のサービスの sshd など） */
  program?: string;
  /** 待ち受けるポートを、動かす時に設定ファイルの行（`Port 22` の形）から読む。行が無ければ fallback（sshd_config の Port など） */
  portConfig?: { file: string; key: string; fallback: number };
  /** 待ち受けるアドレス（無ければ 0.0.0.0 = 全ての口。127.0.0.1 なら、その機械の中からだけ届く） */
  address?: string;
  /** HTTP で応える中身 */
  body?: string;
  /** HTTP で応える状態の番号（無ければ 200。準備中の 503 など） */
  status?: number;
  /** 道ごとの答え（後ろのアプリ。「/path」か「POST /path」。書けば body・status より先に使う） */
  routes?: Readonly<Record<string, Route>>;
  /** 設定ファイルの場所（動かす時に読む） */
  config?: string;
  /** DNS のゾーンファイルの場所（動かす・読み直す時に読み、名前の答えになる。src/engines/kernel/dnsZones.ts） */
  zone?: string;
  /** 設定から決まった待ち受け（動いている間だけ意味がある） */
  listens?: readonly Listen[];
  /** 設定から読んだサイト（server。名前で振り分け、公開用のディレクトリ・転送・中継を決める） */
  servers?: readonly ServerBlock[];
  /** ログインを覚えるアプリ（HTTP で応える。routes・body より先に使う） */
  session?: SessionApp;
  /** 動かした時に php.ini から読んだ札の決まり（動いている間だけ意味がある） */
  cookie?: SessionCookie;
  /** DHCP のサーバ: 設定・リースのファイルの場所・待つ口・借りに来る機械・網で既に使われているアドレス */
  dhcp?: { config: string; leases: string; iface: string; clients: readonly DhcpClient[]; inUse: readonly string[] };
  /** 動かした時に貸した記録（リースのファイルの中身。systemctl がファイルに書く） */
  dhcpLeases?: string;
  /** 落ちた理由（状態が failed の時。systemctl status の Result。無ければ exit-code） */
  result?: 'exit-code' | 'oom-kill' | 'signal' | 'core-dump' | 'timeout';
  /** ユニットファイルの場所（User=・ExecStart= を読む）。読み込んだ中身は unitLoaded（daemon-reload で読み直す） */
  unit?: string;
  /** systemd が読み込んでいるユニットファイルの中身（ファイルを書き換えても、daemon-reload まで変わらない） */
  unitLoaded?: string;
  /** プログラムが書き込む場所。動かす利用者がそこに書けなければ、起動に失敗する */
  writes?: readonly string[];
  /** 動かしている利用者（ユニットの User=。無ければ root）。動いている間だけ意味がある */
  user?: string;
  /** API の鍵を受ける側: 受け付ける鍵の一覧のファイル（動かす時・読み直す時に読む）。sec.i.05 */
  keyGuard?: { file: string };
  /** 読み込んだ鍵の一覧 */
  validKeys?: readonly string[];
  /** API の鍵で頼む側: 環境のファイル・鍵の変数の名前・頼む先のポート（環境のファイルは動かす時に読む） */
  keyClient?: { envFile: string; name: string; upstream: number };
  /** 読み込んだ鍵 */
  heldKey?: string;
  /** ログ（journalctl で読む） */
  log: readonly string[];
}

/** 鍵の一覧のファイル（1 行 1 つ。# はコメント） */
export function readKeys(text: string): string[] {
  return text.split('\n').map((l) => l.replace(/#.*$/, '').trim()).filter((l) => l !== '');
}

/** 環境のファイルの変数の値 */
export function readEnvValue(text: string, name: string): string {
  return new RegExp(`^\\s*(?:export\\s+)?${name}=(.*)$`, 'm').exec(text)?.[1]?.trim().replace(/^["']|["']$/g, '') ?? '';
}

/** 利用者が居るか・その利用者が場所に書けるか（systemctl が仮想のファイルと /etc/passwd から決めて渡す） */
export interface ServiceAccess {
  userExists: (user: string) => boolean;
  canWrite: (user: string, path: string) => boolean;
}

/** ユニットファイルの [Service] の値（User=・ExecStart=） */
export function unitValue(text: string, key: string): string | undefined {
  const m = new RegExp(`^\\s*${key}=(\\S+)`, 'm').exec(text);
  return m?.[1];
}

export interface ServiceTable {
  services: ReadonlyMap<string, Service>;
  /** ログに書く時刻を進めるための数（同じ操作からは同じログ） */
  tick: number;
  /** ログの行に出す機械の名前（無ければ server） */
  host?: string;
}

/** log を書けば、それまでのログ（journalctl で読める行）を持って始める */
export function createServiceTable(seed: readonly (Omit<Service, 'log'> & { log?: readonly string[] })[] = [], host?: string): ServiceTable {
  return { services: new Map(seed.map((s) => [s.name, { ...s, log: s.log ?? [] }])), tick: 0, ...(host !== undefined ? { host } : {}) };
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
  const log = [...s.log, ...lines.map((l, i) => `${stamp(table.tick + i)} ${table.host ?? 'server'} ${typeof l === 'string' ? `systemd[1]: ${l}` : `${l.from}: ${l.text}`}`)];
  services.set(s.name, { ...s, log });
  return { ...table, services, tick: table.tick + lines.length };
}

/** 別名（Ubuntu の ssh.service は sshd.service、named.service は bind9.service とも呼べる） */
const ALIASES: Readonly<Record<string, string>> = { sshd: 'ssh', bind9: 'named' };

/** 名前か別名で引く */
const lookup = (table: ServiceTable | null, raw: string): Service | undefined => {
  const name = unitName(raw);
  return table?.services.get(name) ?? table?.services.get(ALIASES[name] ?? '');
};

function find(table: ServiceTable, raw: string): Service | ServiceError {
  return lookup(table, raw) ?? { kind: 'not-found', unit: `${unitName(raw)}.service` };
}

const isError = (x: Service | ServiceError): x is ServiceError => 'kind' in x;

/** 設定ファイルを読む関数（場所 → 結果）。systemctl が仮想のファイルから読んで渡す */
export type ConfigLoader = (path: string) => ConfigResult;

/** ファイルの中身を読む関数（無ければ null）。アプリの設定（php.ini）を読む */
export type TextReader = (path: string) => string | null;

/** 設定ファイルの `キー 数` の行から読んだポート（# の注釈は飛ばす。無ければ fallback） */
export function portFromConfig(spec: { key: string; fallback: number }, text: string | null): number {
  for (const raw of (text ?? '').split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    const [k, v] = line.split(/\s+/);
    if (k !== undefined && v !== undefined && k.toLowerCase() === spec.key.toLowerCase() && /^\d+$/.test(v)) return Number(v);
  }
  return spec.fallback;
}

/** サービスが待ち受けるポート（設定から決まった物と、初めから決まっている物） */
export function portsOf(s: Service): number[] {
  return [...(s.listens ?? []).map((l) => l.port), ...(s.port !== undefined && !s.config ? [s.port] : [])];
}

function fail(table: ServiceTable, s: Service, why: LogLine | LogLine[], status = '1/FAILURE'): ServiceResult {
  const t = update(table, { ...s, active: 'failed', result: 'exit-code' }, [
    `Starting ${s.name}.service - ${s.description}...`,
    ...(Array.isArray(why) ? why : [why]),
    `${s.name}.service: Main process exited, code=exited, status=${status}`,
    `${s.name}.service: Failed with result 'exit-code'.`,
    `Failed to start ${s.name}.service - ${s.description}.`,
  ]);
  return { ok: false, table: t, error: { kind: 'failed', unit: `${s.name}.service` } };
}

export function startService(table: ServiceTable, raw: string, load?: ConfigLoader, read?: TextReader, access?: ServiceAccess): ServiceResult {
  const s = find(table, raw);
  if (isError(s)) return { ok: false, table, error: s };
  if (s.active === 'active') return { ok: true, table };
  if (s.broken) return fail(table, s, `${s.name}.service: ${s.broken}`);
  let ready: Service = s;
  if (s.unit !== undefined) {
    // 読み込んであるユニットの User= の利用者で動かす（本物の systemd と同じく、居なければ 217/USER）
    const text = s.unitLoaded ?? (read ? read(s.unit) : null) ?? '';
    const user = unitValue(text, 'User') ?? 'root';
    const exec = unitValue(text, 'ExecStart') ?? `/usr/bin/${s.name}`;
    if (access && user !== 'root' && !access.userExists(user)) {
      return fail(table, s, [`${s.name}.service: Failed to determine user credentials: No such process`, `${s.name}.service: Failed at step USER spawning ${exec}: No such process`], '217/USER');
    }
    const program = `${exec.split('/').pop() ?? s.name}[${String(800 + table.tick)}]`;
    const blocked = access ? (s.writes ?? []).find((w) => !access.canWrite(user, w)) : undefined;
    if (blocked !== undefined) return fail(table, s, { from: program, text: `cannot write to ${blocked}: Permission denied` });
    ready = { ...ready, user };
  }
  if (s.config && load) {
    const conf = load(s.config);
    if (!conf.ok) return fail(table, s, { from: `${s.name}[${String(800 + table.tick)}]`, text: conf.error });
    ready = { ...s, listens: conf.listens, servers: conf.servers };
  }
  if (s.portConfig) ready = { ...ready, port: portFromConfig(s.portConfig, read ? read(s.portConfig.file) : null) };
  let served: LogLine[] = [];
  if (s.dhcp) {
    const from = `dhcpd[${String(800 + table.tick)}]`;
    const text = read ? read(s.dhcp.config) : null;
    if (text === null) return fail(table, s, { from, text: `Can't open ${s.dhcp.config}: No such file or directory` });
    const conf = parseDhcpConf(text, s.dhcp.config);
    if (!conf.ok) return fail(table, s, conf.lines.map((l) => ({ from, text: l })));
    const run = serveLeases(conf.config, s.dhcp.clients, s.dhcp.inUse, s.dhcp.iface);
    // 貸した時刻は、ログの時刻と同じ数え方（同じ操作からは同じ記録）
    ready = { ...ready, dhcpLeases: leasesText(run, conf.config.leaseTime, DHCP_EPOCH + table.tick) };
    served = [{ from, text: `Listening on LPF/${s.dhcp.iface}/02:42:c0:a8:01:05/192.168.1.0/24` }, ...run.log.map((l) => ({ from, text: l }))];
  }
  // php.ini が無ければ、PHP と同じく既定の決まりで動く
  if (s.keyGuard) ready = { ...ready, validKeys: readKeys((read ? read(s.keyGuard.file) : null) ?? '') };
  if (s.keyClient) ready = { ...ready, heldKey: readEnvValue((read ? read(s.keyClient.envFile) : null) ?? '', s.keyClient.name) };
  if (s.session) ready = { ...ready, cookie: readSessionIni((read ? read(s.session.ini) : null) ?? '') };
  for (const port of portsOf(ready)) {
    const other = [...table.services.values()].find((o) => o.name !== s.name && o.active === 'active' && portsOf(o).includes(port));
    if (other) return fail(table, s, { from: `${s.name}[${String(800 + table.tick)}]`, text: `${s.name}: [emerg] bind() to 0.0.0.0:${String(port)} failed (98: Address already in use)` });
  }
  return { ok: true, table: update(table, { ...ready, active: 'active' }, [`Starting ${s.name}.service - ${s.description}...`, `Started ${s.name}.service - ${s.description}.`, ...served]) };
}

export function stopService(table: ServiceTable, raw: string): ServiceResult {
  const s = find(table, raw);
  if (isError(s)) return { ok: false, table, error: s };
  if (s.active === 'inactive') return { ok: true, table };
  return { ok: true, table: update(table, { ...s, active: 'inactive' }, [`Stopping ${s.name}.service - ${s.description}...`, `Stopped ${s.name}.service - ${s.description}.`]) };
}

export function restartService(table: ServiceTable, raw: string, load?: ConfigLoader, read?: TextReader, access?: ServiceAccess): ServiceResult {
  const stopped = stopService(table, raw);
  return stopped.ok ? startService(stopped.table, raw, load, read, access) : stopped;
}

/**
 * 設定を読み直す（systemctl reload・nginx -s reload）。読み直しに失敗しても、本物と同じく、前の設定のまま動き続ける
 * （新しい設定の誤りを記録に残し、Reload failed とする。止まるのは restart の時）
 */
export function reloadService(table: ServiceTable, raw: string, load?: ConfigLoader, read?: TextReader): ServiceResult {
  const r = restartService(table, raw, load, read);
  const s = find(table, raw);
  if (r.ok || r.error.kind !== 'failed' || isError(s)) return r;
  // 試した起動の記録のうち、誤りの行（systemd 以外の行）だけを、読み直しの記録として残す
  const tried = (r.table.services.get(s.name)?.log ?? []).slice(s.log.length).filter((l) => !/ systemd\[1\]: /.test(l)).map((l) => l.replace(/^\S+ \S+ \S+ \S+ /, ''));
  const why: LogLine[] = tried.map((l) => ({ from: l.slice(0, l.indexOf(': ')), text: l.slice(l.indexOf(': ') + 2) }));
  const t = update(table, s, [
    `Reloading ${s.name}.service - ${s.description}...`,
    ...why,
    `${s.name}.service: Control process exited, code=exited, status=1/FAILURE`,
    `Reload failed for ${s.name}.service - ${s.description}.`,
  ]);
  return { ok: false, table: t, error: r.error };
}

export function setEnabled(table: ServiceTable, raw: string, enabled: boolean): ServiceResult {
  const s = find(table, raw);
  if (isError(s)) return { ok: false, table, error: s };
  const services = new Map(table.services);
  services.set(s.name, { ...s, enabled });
  return { ok: true, table: { ...table, services } };
}

/** 次の起動（サーバの再起動）。有効なサービスだけが動き出し、それ以外は止まったまま */
export function reboot(table: ServiceTable, load?: ConfigLoader, read?: TextReader): ServiceTable {
  let t: ServiceTable = { ...table, services: new Map([...table.services].map(([k, s]) => [k, { ...s, active: 'inactive' as const }])) };
  for (const s of t.services.values()) if (s.enabled) t = startService(t, s.name, load, read).table;
  return t;
}

export function serviceOf(table: ServiceTable | null, raw: string): Service | undefined {
  return lookup(table, raw);
}
