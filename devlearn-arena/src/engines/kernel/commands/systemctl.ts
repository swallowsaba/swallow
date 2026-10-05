import type { CommandResult, CommandSpec, ShellState } from '../registry';
import {
  restartService, serviceOf, setEnabled, startService, stopService, unitName, type ConfigLoader, type ServiceResult, type ServiceTable,
} from '../services';
import { exists, isDir, readFile } from '../vfs';
import { withZones } from '../dnsZones';
import { readWebConfig } from '../webConfig';
import { fromLines } from './args';

/**
 * systemctl と journalctl（src/engines/kernel/services.ts の模型を操作する）。
 * 出力の形は本物に寄せる（状態の表示の Loaded と Active の行・失敗の時の案内）。
 */

/** apt で nginx を入れると置かれる実行ファイル */
const NGINX_BIN = '/usr/sbin/nginx';

const NO_SYSTEMD ='System has not been booted with systemd as init system (PID 1). Can\'t operate.\n';

/** この機械の今日（ログの時刻の年は書かれないので、月と日で比べる） */
const TODAY = '10-03';
const YESTERDAY = '10-02';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ログの行の先頭の時刻（Oct 03 02:13:44）を、比べられる形（10-03 02:13:44）にする。読めなければ空 */
function lineTime(line: string): string {
  const m = /^([A-Z][a-z]{2}) +(\d{1,2}) (\d{2}:\d{2}:\d{2})/.exec(line);
  const month = m ? MONTHS.indexOf(m[1] ?? '') : -1;
  if (!m || month < 0) return '';
  return `${String(month + 1).padStart(2, '0')}-${(m[2] ?? '').padStart(2, '0')} ${m[3] ?? ''}`;
}

/** --since・--until の時刻（today・yesterday・now・時:分[:秒]・年-月-日[ 時:分[:秒]]。時刻を書かなければ 0 時）。読めなければ null */
function parseJournalTime(raw: string): string | null {
  const t = raw.trim();
  if (t === 'today') return `${TODAY} 00:00:00`;
  if (t === 'yesterday') return `${YESTERDAY} 00:00:00`;
  if (t === 'now') return `${TODAY} 23:59:59`;
  const clock = (hm: string, s: string | undefined): string => `${hm}:${s ?? '00'}`;
  const time = /^(\d{2}:\d{2})(?::(\d{2}))?$/.exec(t);
  if (time) return `${TODAY} ${clock(time[1] ?? '00:00', time[2])}`;
  const date = /^\d{4}-(\d{2}-\d{2})(?: (\d{2}:\d{2})(?::(\d{2}))?)?$/.exec(t);
  if (date) return `${date[1] ?? ''} ${date[2] === undefined ? '00:00:00' : clock(date[2], date[3])}`;
  return null;
}

function unitOf(raw: string): string {
  return `${unitName(raw)}.service`;
}

function status(table: ServiceTable, raw: string): CommandResult {
  const s = serviceOf(table, raw);
  if (!s) return { stderr: `Unit ${unitOf(raw)} could not be found.\n`, code: 4 };
  const active = s.active === 'active'
    ? 'active (running)'
    : s.active === 'failed' ? 'failed (Result: exit-code)' : 'inactive (dead)';
  const lines = [
    `${s.active === 'active' ? '●' : s.active === 'failed' ? '×' : '○'} ${s.name}.service - ${s.description}`,
    `     Loaded: loaded (/etc/systemd/system/${s.name}.service; ${s.enabled ? 'enabled' : 'disabled'}; preset: disabled)`,
    `     Active: ${active}`,
  ];
  if (s.active === 'active') {
    for (const l of s.listens ?? []) lines.push(`     Listen: 0.0.0.0:${String(l.port)}${l.ssl ? ' (ssl)' : ''}`);
    if (!s.config && s.port !== undefined) lines.push(`     Listen: 0.0.0.0:${String(s.port)}`);
  }
  const tail = s.log.slice(-3);
  if (tail.length > 0) lines.push('', ...tail);
  // 本物と同じく、動いていなければ終了の値は 3
  return { stdout: fromLines(lines), code: s.active === 'active' ? 0 : 3 };
}

function failure(verb: string, r: Extract<ServiceResult, { ok: false }>): CommandResult {
  if (r.error.kind === 'not-found') return { stderr: `Failed to ${verb} ${r.error.unit}: Unit ${r.error.unit} not found.\n`, code: 5, patch: { services: r.table } };
  return {
    stderr: `Job for ${r.error.unit} failed because the control process exited with error code.\nSee "systemctl status ${r.error.unit}" and "journalctl -xeu ${r.error.unit}" for details.\n`,
    code: 1,
    patch: { services: r.table },
  };
}

function run(shell: ShellState, verb: string, units: readonly string[], op: (t: ServiceTable, u: string) => ServiceResult, say?: (u: string) => string): CommandResult {
  let table = shell.services as ServiceTable;
  const out: string[] = [];
  for (const u of units) {
    const r = op(table, u);
    if (!r.ok) return { ...failure(verb, r), ...(out.length ? { stdout: fromLines(out) } : {}) };
    table = r.table;
    const said = say?.(u);
    if (said) out.push(said);
  }
  // DNS のサーバを動かした・読み直した時は、ゾーンファイルを読んで名前の答えにする
  const net = withZones({ ...shell, services: table }).net;
  return { patch: { services: table, ...(net !== shell.net ? { net } : {}) }, ...(out.length ? { stdout: fromLines(out) } : {}) };
}

/** サービスの設定ファイルを、仮想のファイルから読む */
function loaderOf(shell: ShellState): ConfigLoader {
  return (path) => readWebConfig(path, (p) => (exists(shell.vfs, p) && !isDir(shell.vfs, p) ? readFile(shell.vfs, p) : null));
}

export const systemctlCommands: CommandSpec[] = [
  {
    name: 'systemctl',
    summary: 'サービスの状態を見る・動かす・止める・起動時に動くようにする',
    handler: ({ argv, shell }) => {
      if (shell.services === null) return { stderr: NO_SYSTEMD, code: 1 };
      const args = argv.slice(1).filter((a) => a !== '--no-pager');
      const now = args.includes('--now');
      const [verb, ...units] = args.filter((a) => a !== '--now');
      if (verb === undefined) return { stderr: 'usage: systemctl <status|start|stop|restart|reload|enable|disable|is-active|is-enabled> <サービス>\n', code: 1 };
      if (verb === 'daemon-reload') return {};
      if (verb === 'list-units') {
        const rows = [...shell.services.services.values()].map((s) => `${`${s.name}.service`.padEnd(20)} loaded ${s.active.padEnd(8)} ${s.description}`);
        return { stdout: fromLines(['UNIT                 LOAD   ACTIVE   DESCRIPTION', ...rows]) };
      }
      if (units.length === 0) return { stderr: `Too few arguments.\n`, code: 1 };
      switch (verb) {
        case 'status': {
          const parts = units.map((u) => status(shell.services as ServiceTable, u));
          return {
            stdout: parts.map((p) => p.stdout ?? '').filter(Boolean).join('\n'),
            stderr: parts.map((p) => p.stderr ?? '').join(''),
            code: Math.max(...parts.map((p) => p.code ?? 0)),
          };
        }
        case 'start':
          return run(shell, 'start', units, (t, u) => startService(t, u, loaderOf(shell)));
        case 'stop':
          return run(shell, 'stop', units, stopService);
        case 'restart':
          return run(shell, 'restart', units, (t, u) => restartService(t, u, loaderOf(shell)));
        case 'reload': {
          // 設定を読み直す。動いていなければ読み直せない（本物と同じ）
          const idle = units.find((u) => serviceOf(shell.services, u)?.active !== 'active');
          if (idle !== undefined && serviceOf(shell.services, idle)) return { stderr: `${unitOf(idle)} is not active, cannot reload.\n`, code: 1 };
          return run(shell, 'reload', units, (t, u) => restartService(t, u, loaderOf(shell)));
        }
        case 'enable':
        case 'disable': {
          const on = verb === 'enable';
          const link = (u: string): string => on
            ? `Created symlink /etc/systemd/system/multi-user.target.wants/${unitOf(u)} → /etc/systemd/system/${unitOf(u)}.`
            : `Removed "/etc/systemd/system/multi-user.target.wants/${unitOf(u)}".`;
          const set = run(shell, verb, units, (t, u) => {
            const s = serviceOf(t, u);
            // 既に同じなら何も言わない（本物と同じ）
            return s && s.enabled === on ? { ok: true, table: t } : setEnabled(t, u, on);
          }, (u) => (serviceOf(shell.services, u)?.enabled === on ? '' : link(u)));
          if ((set.code ?? 0) !== 0 || !now) return { ...set, stdout: (set.stdout ?? '').replace(/^\n+/gm, '') };
          const after: ShellState = { ...shell, services: (set.patch?.services ?? shell.services) };
          const next = run(after, on ? 'start' : 'stop', units, on ? (t, u) => startService(t, u, loaderOf(shell)) : stopService);
          return { ...next, stdout: `${(set.stdout ?? '').replace(/^\n+/gm, '')}${next.stdout ?? ''}` };
        }
        case 'is-active': {
          const s = serviceOf(shell.services, units[0] ?? '');
          const state = s?.active ?? 'inactive';
          return { stdout: `${state}\n`, code: state === 'active' ? 0 : 3 };
        }
        case 'is-enabled': {
          const s = serviceOf(shell.services, units[0] ?? '');
          if (!s) return { stderr: `Failed to get unit file state for ${unitOf(units[0] ?? '')}: No such file or directory\n`, code: 1 };
          return { stdout: `${s.enabled ? 'enabled' : 'disabled'}\n`, code: s.enabled ? 0 : 1 };
        }
        default:
          return { stderr: `Unknown command verb '${verb}'.\n`, code: 1 };
      }
    },
  },
  {
    name: 'journalctl',
    summary: 'サービスのログ（記録）を読む',
    handler: ({ argv, shell }) => {
      if (shell.services === null) return { stderr: NO_SYSTEMD, code: 1 };
      const args = argv.slice(1);
      const units: string[] = [];
      let n: number | null = null;
      let reverse = false;
      const range: { since?: string; until?: string } = {};
      for (let i = 0; i < args.length; i += 1) {
        const a = args[i] ?? '';
        if (a === '-u' || a === '--unit') units.push(args[(i += 1)] ?? '');
        else if (a.startsWith('-u') && a.length > 2) units.push(a.slice(2));
        else if (/^-[a-z]*u$/.test(a)) units.push(args[(i += 1)] ?? '');
        else if (a === '-n') n = Number(args[(i += 1)] ?? '10');
        else if (a === '-r' || a === '--reverse') reverse = true;
        else if (a === '-S' || a === '--since' || a === '-U' || a === '--until') {
          const raw = args[(i += 1)] ?? '';
          const key = parseJournalTime(raw);
          if (key === null) return { stderr: `Failed to parse timestamp: ${raw}\n`, code: 1 };
          range[a === '-S' || a === '--since' ? 'since' : 'until'] = key;
        }
      }
      const services = [...shell.services.services.values()].filter((s) => units.length === 0 || units.some((u) => unitName(u) === s.name));
      // 時刻の順に並べ、--since から --until までに絞る（同じ時刻は書かれた順のまま）
      let lines = services.flatMap((s) => s.log)
        .map((line, i) => ({ line, i, key: lineTime(line) }))
        .sort((x, y) => (x.key < y.key ? -1 : x.key > y.key ? 1 : x.i - y.i))
        .filter((x) => (range.since === undefined || x.key >= range.since) && (range.until === undefined || x.key <= range.until))
        .map((x) => x.line);
      if (n !== null) lines = lines.slice(-n);
      if (reverse) lines = [...lines].reverse();
      if (lines.length === 0) return { stdout: '-- No entries --\n' };
      return { stdout: fromLines(lines) };
    },
  },
  {
    name: 'nginx',
    summary: 'Web サーバ nginx の設定を確かめる（nginx -t。動かす・読み直すのは systemctl）',
    handler: ({ argv, shell, runLine }) => {
      // 入っていない機械には無い（apt で入れると /usr/sbin/nginx が置かれる。src/engines/kernel/packages.ts）
      const installed = exists(shell.vfs, NGINX_BIN);
      const service = serviceOf(shell.services, 'nginx');
      if (!installed && !service) return { stderr: 'nginx: command not found\n', code: 127 };
      if (!argv.slice(1).includes('-t')) {
        // -v などは、入れた実行ファイルに任せる
        if (installed) {
          const r = runLine([NGINX_BIN, ...argv.slice(1)].join(' '));
          return { stdout: r.stdout, stderr: r.stderr, code: r.code };
        }
        return { stderr: 'nginx: この模擬では、動かす・止める・読み直すは systemctl で行う（設定を確かめるのは nginx -t）\n', code: 1 };
      }
      const config = service?.config ?? '/etc/nginx/nginx.conf';
      const r = loaderOf(shell)(config);
      if (!r.ok) return { stderr: `${r.error}\nnginx: configuration file ${config} test failed\n`, code: 1 };
      // 本物は成功の知らせも標準エラーに出すが、ここでは出力に出す（成功にエラーの解説を当てない）
      return { stdout: `nginx: the configuration file ${config} syntax is ok\nnginx: configuration file ${config} test is successful\n` };
    },
  },
];
