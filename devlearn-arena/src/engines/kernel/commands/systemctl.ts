import type { CommandResult, CommandSpec, ShellState } from '../registry';
import {
  restartService, serviceOf, setEnabled, startService, stopService, unitName, type ServiceResult, type ServiceTable,
} from '../services';
import { fromLines } from './args';

/**
 * systemctl と journalctl（src/engines/kernel/services.ts の模型を操作する）。
 * 出力の形は本物に寄せる（状態の表示の Loaded と Active の行・失敗の時の案内）。
 */

const NO_SYSTEMD = 'System has not been booted with systemd as init system (PID 1). Can\'t operate.\n';

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
  if (s.active === 'active' && s.port !== undefined) lines.push(`     Listen: 0.0.0.0:${String(s.port)}`);
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
  return { patch: { services: table }, ...(out.length ? { stdout: fromLines(out) } : {}) };
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
      if (verb === undefined) return { stderr: 'usage: systemctl <status|start|stop|restart|enable|disable|is-active|is-enabled> <サービス>\n', code: 1 };
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
          return run(shell, 'start', units, startService);
        case 'stop':
          return run(shell, 'stop', units, stopService);
        case 'restart':
          return run(shell, 'restart', units, restartService);
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
          const next = run(after, on ? 'start' : 'stop', units, on ? startService : stopService);
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
      for (let i = 0; i < args.length; i += 1) {
        const a = args[i] ?? '';
        if (a === '-u' || a === '--unit') units.push(args[(i += 1)] ?? '');
        else if (a.startsWith('-u') && a.length > 2) units.push(a.slice(2));
        else if (/^-[a-z]*u$/.test(a)) units.push(args[(i += 1)] ?? '');
        else if (a === '-n') n = Number(args[(i += 1)] ?? '10');
      }
      const services = [...shell.services.services.values()].filter((s) => units.length === 0 || units.some((u) => unitName(u) === s.name));
      const lines = services.flatMap((s) => s.log);
      if (lines.length === 0) return { stdout: '-- No entries --\n' };
      return { stdout: fromLines(n === null ? lines : lines.slice(-n)) };
    },
  },
];
