import { hostProcesses } from '@/engines/container/container';
import { resolve } from '../path';
import {
  findByPattern, killMany, normalizeSignal, signal, totalCpu, usedMemory, type Process,
} from '../process';
import type { CommandSpec, ShellState } from '../registry';
import { fileSize, list, stat } from '../vfs';
import { fromLines, humanSize, parseArgs } from './args';
import { unitValue } from '../services';
import { currentUser } from './perm';

function table(rows: string[][]): string {
  if (rows.length === 0) return '';
  const widths = (rows[0] ?? []).map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length)));
  return fromLines(
    rows.map((row) => row.map((cell, i) => cell.padEnd(widths[i] ?? 0)).join('  ').trimEnd()),
  );
}

function sorted(shell: ShellState): Process[] {
  return [...shell.procs.processes.values()].sort((a, b) => a.pid - b.pid);
}

/** ps の --sort の鍵（本物の procps と同じ名前）。先頭の - は多い順 */
const SORT_KEYS: Record<string, 'memory' | 'cpu' | 'pid'> = {
  '%mem': 'memory', pmem: 'memory', rss: 'memory', vsz: 'memory', '%cpu': 'cpu', pcpu: 'cpu', pid: 'pid',
};

function sortSpec(argv: readonly string[]): { key: 'memory' | 'cpu' | 'pid'; desc: boolean }[] {
  const i = argv.findIndex((a) => a === '--sort' || a.startsWith('--sort='));
  if (i < 0) return [];
  const raw = argv[i]?.startsWith('--sort=') ? argv[i].slice('--sort='.length) : (argv[i + 1] ?? '');
  return raw.split(',').flatMap((k) => {
    const desc = k.startsWith('-');
    const key = SORT_KEYS[k.replace(/^[-+]/, '').toLowerCase()];
    return key === undefined ? [] : [{ key, desc }];
  });
}

/** ユニットファイルで動くサービスの本体（ユニットの User= の利用者で動く。親は systemd） */
function serviceProcesses(shell: ShellState): { pid: number; ppid: number; user: string; cpu: number; memory: number; state: string; command: string }[] {
  return [...(shell.services?.services.values() ?? [])].flatMap((s, i) => {
    if (s.unit === undefined || s.active !== 'active') return [];
    const command = unitValue(s.unitLoaded ?? '', 'ExecStart') ?? `/usr/bin/${s.name}`;
    return [{ pid: 700 + i, ppid: 1, user: s.user ?? 'root', cpu: 0, memory: 24, state: 'S', command }];
  });
}

function psRows(shell: ShellState, wide: boolean, sort: readonly { key: 'memory' | 'cpu' | 'pid'; desc: boolean }[] = []): string {
  const head = wide
    ? ['USER', 'PID', 'PPID', '%CPU', '%MEM', 'STAT', 'COMMAND']
    : ['PID', 'STAT', 'COMMAND'];
  const rows = [head];
  // 動いているコンテナのプロセスも、機械のプロセスとして見える（名前空間で区切られているのは、中から見た時だけ）
  const all = [
    ...sorted(shell).map((p) => ({ pid: p.pid, ppid: p.ppid, user: p.user, cpu: p.cpu, memory: p.memory, state: p.state, command: p.command })),
    ...hostProcesses(shell.containers, shell.vars.get('USER')).map((p) => ({ ...p, cpu: 0, state: 'S' })),
    ...serviceProcesses(shell),
  ].sort((a, b) => {
    for (const s of sort) {
      const d = a[s.key] - b[s.key];
      if (d !== 0) return s.desc ? -d : d;
    }
    return a.pid - b.pid;
  });
  for (const p of all) {
    const memPercent = ((p.memory / shell.procs.totalMemory) * 100).toFixed(1);
    rows.push(
      wide
        ? [p.user, String(p.pid), String(p.ppid), p.cpu.toFixed(1), memPercent, p.state, p.command]
        : [String(p.pid), p.state, p.command],
    );
  }
  return table(rows);
}

/** スワップの量。プロセスの使用量の合計がメモリを超えた分を置く（スワップの無い機械は null） */
function swapOf(shell: ShellState): { total: number; used: number; free: number } | null {
  const total = shell.procs.totalSwap ?? 0;
  if (total <= 0) return null;
  const used = Math.min(total, Math.max(0, usedMemory(shell.procs) - shell.procs.totalMemory));
  return { total, used, free: total - used };
}

/** top の頭のスワップの行（スワップの無い機械は出さない） */
function swapLine(shell: ShellState): string {
  const swap = swapOf(shell);
  if (swap === null) return '';
  const n = (v: number) => String(v).padStart(6);
  return `MiB Swap: ${n(swap.total)} total, ${n(swap.free)} free, ${n(swap.used)} used\n`;
}

/** そのパス以下の合計バイト数 */
function sizeOf(shell: ShellState, path: string): number {
  const node = stat(shell.vfs, path);
  if (!node) return 0;
  if (node.kind === 'file') return fileSize(node);
  let total = 0;
  for (const name of list(shell.vfs, path)) {
    total += sizeOf(shell, path === '/' ? `/${name}` : `${path}/${name}`);
  }
  return total;
}

/** 掴まれたまま消されたファイルの分。消しても容量が戻らない状況を作る */
function heldBytes(shell: ShellState): number {
  let total = 0;
  for (const p of shell.procs.processes.values()) {
    for (const path of p.openFiles) {
      if (stat(shell.vfs, path) === undefined) total += p.held?.[path] ?? 200_000;
    }
  }
  return total;
}

export interface Meters { cpus: number; load: [number, number, number]; us: number; sy: number; id: number; wa: number; writeMBs: number; util: number }

/** 資源の計器（setup の meters）。無ければ null */
export function metersOf(shell: ShellState): Meters | null {
  const raw = shell.vars.get('__METERS');
  return raw === undefined ? null : (JSON.parse(raw) as Meters);
}

export const loadText = (m: Meters): string => `load average: ${m.load.map((n) => n.toFixed(2)).join(', ')}`;

/** ディスクの大きさと使っている量（df と同じ。機械のディスクの大きさは setup の disk。無ければ 20G） */
export function diskUse(shell: ShellState): { capacity: number; used: number } {
  const capacity = Number(shell.vars.get('__DISK_SIZE') ?? String(20 * 1024 ** 3));
  return { capacity, used: Math.min(capacity, sizeOf(shell, '/') + heldBytes(shell)) };
}

export const procCommands: CommandSpec[] = [
  {
    name: 'vmstat',
    summary: 'CPU・メモリ・入出力の様子を 1 行で見る（wa は入出力の待ち）',
    handler: ({ shell }) => {
      const m = metersOf(shell);
      const c = m ?? { us: 1, sy: 1, id: 98, wa: 0, writeMBs: 0 };
      const blocked = m ? Math.round(m.wa / 10) : 0;
      return { stdout: fromLines(['procs -----------memory---------- ---swap-- -----io---- -system-- ------cpu-----', ' r  b   swpd   free   buff  cache   si   so    bi    bo   in   cs us sy id wa st', `${' 1'.padStart(2)} ${String(blocked).padStart(2)}      0   2048    128   4096    0    0     8 ${String(c.writeMBs * 1024).padStart(5)}  900 1500 ${[c.us, c.sy, c.id, c.wa, 0].map(String).join(' ')}`]) };
    },
  },
  {
    name: 'iostat',
    summary: 'ディスクの混み具合を見る（-x の %util が 100 に近いと詰まっている）',
    handler: ({ shell }) => {
      const m = metersOf(shell);
      const w = m?.writeMBs ?? 0;
      const u = m?.util ?? 0;
      return { stdout: fromLines(['Device            r/s     w/s     rkB/s     wkB/s  %util', `${'vda'.padEnd(17)}${'4.0'.padStart(4)}${(w * 5).toFixed(1).padStart(8)}${'32.0'.padStart(10)}${(w * 1024).toFixed(1).padStart(10)}${u.toFixed(1).padStart(7)}`]) };
    },
  },
  {
    name: 'iotop',
    summary: 'どのプロセスがディスクに書いているかを見る（管理者だけ）',
    handler: ({ shell }) => {
      if (currentUser(shell) !== 'root') return { stderr: 'iotop requires root or the NET_ADMIN capability.\n', code: 1 };
      const m = metersOf(shell);
      const rows = sorted(shell).filter((p) => (p.ioMBs ?? 0) > 0).sort((a, b) => (b.ioMBs ?? 0) - (a.ioMBs ?? 0));
      return { stdout: fromLines([`Total DISK READ:         0.00 B/s | Total DISK WRITE:       ${(m?.writeMBs ?? 0).toFixed(2)} M/s`, '    PID  PRIO  USER     DISK READ  DISK WRITE  SWAPIN      IO    COMMAND', ...rows.map((p) => `${String(p.pid).padStart(7)}  be/4  ${p.user.padEnd(8)} 0.00 B/s  ${(p.ioMBs ?? 0).toFixed(2)} M/s  0.00 %  ${Math.min(99, Math.round((p.ioMBs ?? 0) / 2)).toFixed(2)} %  ${p.command}`)]) };
    },
  },
  {
    name: 'ps',
    summary: '動いているプロセスを見る（aux / -ef）',
    handler: ({ argv, shell }) => {
      const args = argv.slice(1);
      const wide = args.some((a) => !a.startsWith('--') && (a.includes('a') || a.includes('e')));
      return { stdout: psRows(shell, wide, sortSpec(args)) };
    },
  },

  {
    name: 'top',
    summary: '資源を食っている順に並べる',
    handler: ({ shell }) => {
      const used = usedMemory(shell.procs);
      const rows = [['PID', 'USER', '%CPU', 'MEM(MiB)', 'COMMAND']];
      for (const p of [...shell.procs.processes.values()].sort((a, b) => b.cpu - a.cpu || a.pid - b.pid)) {
        rows.push([String(p.pid), p.user, p.cpu.toFixed(1), String(p.memory), p.command]);
      }
      return {
        stdout:
          (metersOf(shell) ? `top - 09:00:30 up 1 day,  2:03,  1 user,  ${loadText(metersOf(shell) as Meters)}\n%Cpu(s): ${(metersOf(shell) as Meters).us.toFixed(1)} us,  ${(metersOf(shell) as Meters).sy.toFixed(1)} sy,  0.0 ni, ${(metersOf(shell) as Meters).id.toFixed(1)} id, ${(metersOf(shell) as Meters).wa.toFixed(1)} wa,  0.0 hi,  0.0 si,  0.0 st\n` : `%Cpu(s): ${totalCpu(shell.procs).toFixed(1)} us\n`) +
          `MiB Mem : ${String(shell.procs.totalMemory)} total, ${String(shell.procs.totalMemory - Math.min(used, shell.procs.totalMemory))} free, ${String(Math.min(used, shell.procs.totalMemory))} used\n` +
          swapLine(shell) +
          '\n' +
          table(rows),
      };
    },
  },

  {
    name: 'free',
    summary: 'メモリの空きを見る',
    handler: ({ shell }) => {
      const used = Math.min(usedMemory(shell.procs), shell.procs.totalMemory);
      const swap = swapOf(shell);
      return {
        stdout: table([
          ['', 'total', 'used', 'free'],
          ['Mem:', String(shell.procs.totalMemory), String(used), String(shell.procs.totalMemory - used)],
          ...(swap === null ? [] : [['Swap:', String(swap.total), String(swap.used), String(swap.free)]]),
        ]),
      };
    },
  },

  {
    name: 'pgrep',
    summary: '名前でプロセスを探す',
    handler: ({ argv, shell }) => {
      const pattern = argv[1];
      if (pattern === undefined) return { stderr: 'usage: pgrep <pattern>\n', code: 2 };
      const found = findByPattern(shell.procs, pattern);
      if (found.length === 0) return { code: 1 };
      return { stdout: fromLines(found.map((p) => String(p.pid))) };
    },
  },

  {
    name: 'kill',
    summary: 'プロセスに合図を送る（-9 / -TERM）',
    handler: ({ argv, shell }) => {
      const rest = argv.slice(1);
      const sigArg = rest.find((a) => a.startsWith('-'));
      const sig = normalizeSignal(sigArg);
      const pids = rest.filter((a) => !a.startsWith('-')).map(Number);
      if (pids.length === 0 || pids.some((n) => !Number.isInteger(n))) {
        return { stderr: 'usage: kill [-signal] <pid>\n', code: 2 };
      }
      const result = killMany(shell.procs, pids, sig, currentUser(shell));
      if (result.error !== null) return { stderr: `${result.error}\n`, code: 1 };
      return { patch: { procs: result.table } };
    },
  },

  {
    name: 'pkill',
    summary: '名前で選んで合図を送る',
    handler: ({ argv, shell }) => {
      const rest = argv.slice(1);
      // -f（命令の全体で探す）・-x（名前がちょうど同じ）などの旗は合図ではない。合図は -9・-TERM・-SIGTERM・--signal 名前
      const named = rest.findIndex((a) => a === '--signal');
      const sigArg = named >= 0 ? `-${rest[named + 1] ?? ''}` : rest.find((a) => /^-(\d+|[A-Z][A-Z0-9]*)$/.test(a));
      const sig = normalizeSignal(sigArg);
      const pattern = rest.find((a, i) => !a.startsWith('-') && (named < 0 || i !== named + 1));
      if (pattern === undefined) return { stderr: 'usage: pkill [-signal] <pattern>\n', code: 2 };
      const found = findByPattern(shell.procs, pattern);
      if (found.length === 0) return { code: 1 };
      let procs = shell.procs;
      let stderr = '';
      for (const p of found) {
        const r = signal(procs, p.pid, sig, currentUser(shell));
        if (r.error !== null) stderr += `pkill: killing pid ${String(p.pid)} failed: Operation not permitted\n`;
        procs = r.table;
      }
      return { patch: { procs }, ...(stderr !== '' ? { stderr, code: 1 } : {}) };
    },
  },

  {
    name: 'lsof',
    summary: 'どのプロセスが何を掴んでいるか見る',
    handler: ({ argv, shell }) => {
      const { operands } = parseArgs(argv);
      const filter = operands[0] === undefined ? null : resolve(shell.cwd, operands[0]);
      const rows = [['COMMAND', 'PID', 'USER', 'NAME']];
      for (const p of sorted(shell)) {
        for (const path of p.openFiles) {
          if (filter !== null && path !== filter) continue;
          const gone = stat(shell.vfs, path) === undefined;
          rows.push([p.command, String(p.pid), p.user, `${path}${gone ? ' (deleted)' : ''}`]);
        }
      }
      if (rows.length === 1) return { code: 1 };
      return { stdout: table(rows) };
    },
  },

  {
    name: 'df',
    summary: 'ディスクの使用量を見る',
    handler: ({ argv, shell }) => {
      const human = argv.slice(1).some((a) => /^-[a-zA-Z]*h/.test(a));
      // 機械のディスクの大きさ（実戦の setup の disk。無ければ 20G）
      const { capacity, used } = diskUse(shell);
      const free = capacity - used;
      const show = (n: number): string => (human ? humanSize(n) : String(Math.ceil(n / 1024)));
      const pcent = `${String(Math.ceil((used / capacity) * 100 - 1e-9))}%`;
      // --output=欄,欄 は、その欄だけを出す（スクリプトで数を取り出す時に使う）。値は見出しの幅に右寄せ
      const output = argv.find((a) => a.startsWith('--output='))?.slice('--output='.length);
      if (output !== undefined) {
        const fields: Record<string, [string, string]> = {
          source: ['Filesystem', '/dev/vda1'], size: [human ? 'Size' : '1K-blocks', show(capacity)], used: ['Used', show(used)],
          avail: ['Avail', show(free)], pcent: ['Use%', pcent], target: ['Mounted on', '/'],
        };
        const picked = output.split(',').map((f) => [f, fields[f]] as const);
        const unknown = picked.find(([, v]) => v === undefined);
        if (unknown) return { stderr: `df: option --output: field '${unknown[0]}' unknown\n`, code: 1 };
        const cols: [string, string][] = picked.map(([, v]) => v ?? ['', '']);
        const width = cols.map(([h, v]) => Math.max(h.length, v.length));
        return { stdout: `${cols.map(([h], i) => h.padEnd(width[i] ?? 0)).join(' ').trimEnd()}\n${cols.map(([, v], i) => v.padStart(width[i] ?? 0)).join(' ')}\n` };
      }
      return {
        stdout: table([
          ['Filesystem', human ? 'Size' : '1K-blocks', 'Used', 'Avail', 'Use%', 'Mounted on'],
          ['/dev/vda1', show(capacity), show(used), show(free), pcent, '/'],
        ]),
      };
    },
  },

  {
    name: 'du',
    summary: 'ディレクトリごとの大きさを見る（-s で合計だけ、-h で読みやすい単位）',
    handler: ({ argv, shell }) => {
      const { flags, operands } = parseArgs(argv);
      const human = flags.has('h');
      const summarize = flags.has('s');
      // ディスクの使用量は 4K の区切りで数える（本物と同じく、小さなファイルも 4.0K）
      const usage = (path: string): number => {
        const node = stat(shell.vfs, path);
        if (node?.kind === 'file') return Math.ceil(fileSize(node) / 4096) * 4096;
        return list(shell.vfs, path).reduce((a, name) => a + usage(path === '/' ? `/${name}` : `${path}/${name}`), 0);
      };
      const show = (n: number): string => (human ? (n === 0 ? '0' : humanSize(n)) : String(Math.ceil(n / 1024)));
      const rows: string[] = [];
      let stderr = '';
      for (const operand of operands.length > 0 ? operands : ['.']) {
        const root = resolve(shell.cwd, operand);
        if (stat(shell.vfs, root) === undefined) {
          stderr += `du: cannot access '${operand}': No such file or directory\n`;
          continue;
        }
        const walk = (path: string, shown: string): void => {
          if (stat(shell.vfs, path)?.kind === 'dir' && !summarize) {
            for (const name of list(shell.vfs, path)) {
              const child = path === '/' ? `/${name}` : `${path}/${name}`;
              if (stat(shell.vfs, child)?.kind === 'dir') walk(child, `${shown.replace(/\/$/, '')}/${name}`);
            }
          }
          rows.push(`${show(usage(path))}\t${shown}`);
        };
        walk(root, operand);
      }
      return { stdout: fromLines(rows), ...(stderr !== '' ? { stderr, code: 1 } : {}) };
    },
  },
];
