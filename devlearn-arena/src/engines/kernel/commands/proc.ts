import { resolve } from '../path';
import {
  findByPattern, killMany, normalizeSignal, signal, totalCpu, usedMemory, type Process,
} from '../process';
import type { CommandSpec, ShellState } from '../registry';
import { list, stat } from '../vfs';
import { fromLines, parseArgs } from './args';

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

function psRows(shell: ShellState, wide: boolean): string {
  const head = wide
    ? ['USER', 'PID', 'PPID', '%CPU', '%MEM', 'STAT', 'COMMAND']
    : ['PID', 'STAT', 'COMMAND'];
  const rows = [head];
  for (const p of sorted(shell)) {
    const memPercent = ((p.memory / shell.procs.totalMemory) * 100).toFixed(1);
    rows.push(
      wide
        ? [p.user, String(p.pid), String(p.ppid), p.cpu.toFixed(1), memPercent, p.state, p.command]
        : [String(p.pid), p.state, p.command],
    );
  }
  return table(rows);
}

/** バイト数を読みやすい単位にする */
function human(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return String(bytes);
}

/** そのパス以下の合計バイト数 */
function sizeOf(shell: ShellState, path: string): number {
  const node = stat(shell.vfs, path);
  if (!node) return 0;
  if (node.kind === 'file') return node.content.length;
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
      if (stat(shell.vfs, path) === undefined) total += 200_000;
    }
  }
  return total;
}

export const procCommands: CommandSpec[] = [
  {
    name: 'ps',
    summary: '動いているプロセスを見る（aux / -ef）',
    handler: ({ argv, shell }) => {
      const wide = argv.slice(1).some((a) => a.includes('a') || a.includes('e'));
      return { stdout: psRows(shell, wide) };
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
          `%Cpu(s): ${totalCpu(shell.procs).toFixed(1)} us\n` +
          `MiB Mem : ${String(shell.procs.totalMemory)} total, ${String(shell.procs.totalMemory - used)} free, ${String(used)} used\n\n` +
          table(rows),
      };
    },
  },

  {
    name: 'free',
    summary: 'メモリの空きを見る',
    handler: ({ shell }) => {
      const used = usedMemory(shell.procs);
      return {
        stdout: table([
          ['', 'total', 'used', 'free'],
          ['Mem:', String(shell.procs.totalMemory), String(used), String(shell.procs.totalMemory - used)],
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
      const result = killMany(shell.procs, pids, sig);
      if (result.error !== null) return { stderr: `${result.error}\n`, code: 1 };
      return { patch: { procs: result.table } };
    },
  },

  {
    name: 'pkill',
    summary: '名前で選んで合図を送る',
    handler: ({ argv, shell }) => {
      const rest = argv.slice(1);
      const sig = normalizeSignal(rest.find((a) => a.startsWith('-')));
      const pattern = rest.find((a) => !a.startsWith('-'));
      if (pattern === undefined) return { stderr: 'usage: pkill [-signal] <pattern>\n', code: 2 };
      const found = findByPattern(shell.procs, pattern);
      if (found.length === 0) return { code: 1 };
      let procs = shell.procs;
      for (const p of found) procs = signal(procs, p.pid, sig).table;
      return { patch: { procs } };
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
      const human_ = argv.slice(1).some((a) => a.includes('h'));
      const capacity = 1024 * 1024 * 20;
      const used = sizeOf(shell, '/') + heldBytes(shell);
      const free = Math.max(0, capacity - used);
      const show = (n: number) => (human_ ? human(n) : String(Math.ceil(n / 1024)));
      return {
        stdout: table([
          ['Filesystem', 'Size', 'Used', 'Avail', 'Use%', 'Mounted on'],
          [
            '/dev/vda1',
            show(capacity),
            show(used),
            show(free),
            `${String(Math.round((used / capacity) * 100))}%`,
            '/',
          ],
        ]),
      };
    },
  },

  {
    name: 'du',
    summary: 'ディレクトリごとの大きさを見る',
    handler: ({ argv, shell }) => {
      const { flags, operands } = parseArgs(argv);
      const human_ = flags.has('h');
      const summarize = flags.has('s');
      const root = resolve(shell.cwd, operands[0] ?? '.');
      if (stat(shell.vfs, root) === undefined) {
        return { stderr: `du: cannot access '${operands[0] ?? '.'}': No such file or directory\n`, code: 1 };
      }
      const rows: string[][] = [];
      const walk = (path: string): void => {
        if (stat(shell.vfs, path)?.kind === 'dir' && !summarize) {
          for (const name of list(shell.vfs, path)) {
            const child = path === '/' ? `/${name}` : `${path}/${name}`;
            if (stat(shell.vfs, child)?.kind === 'dir') walk(child);
          }
        }
        const size = sizeOf(shell, path);
        rows.push([human_ ? human(size) : String(Math.ceil(size / 1024)), path]);
      };
      walk(root);
      return { stdout: fromLines(rows.map((r) => `${(r[0] ?? '').padEnd(7)}${r[1] ?? ''}`)) };
    },
  },
];
