/**
 * プロセス表。
 *
 * 実際に何かを走らせるわけではないが、
 * 「誰が資源を食っているか」「止めるとどうなるか」を
 * 状態として持ち、そこから ps / top / kill のふるまいを導く。
 */
export type ProcState = 'R' | 'S' | 'D' | 'Z' | 'T';

export interface Process {
  pid: number;
  ppid: number;
  user: string;
  command: string;
  /** CPU 使用率（%） */
  cpu: number;
  /** 常駐メモリ（MiB） */
  memory: number;
  state: ProcState;
  /** SIGTERM を無視する。-9 でしか落ちない相手を再現する */
  ignoresTerm: boolean;
  /** 掴んでいるファイル。消しても容量が戻らない状況を再現する */
  openFiles: readonly string[];
  startedAt: number;
}

export interface ProcessTable {
  readonly processes: ReadonlyMap<number, Process>;
  readonly nextPid: number;
  /** 積んでいるメモリの総量（MiB） */
  readonly totalMemory: number;
}

export interface ProcSeed {
  command: string;
  cpu?: number;
  memory?: number;
  user?: string;
  state?: ProcState;
  ignoresTerm?: boolean;
  openFiles?: readonly string[];
  ppid?: number;
}

export function createProcessTable(seeds: readonly ProcSeed[] = [], totalMemory = 8192): ProcessTable {
  const processes = new Map<number, Process>();
  processes.set(1, {
    pid: 1, ppid: 0, user: 'root', command: '/sbin/init', cpu: 0, memory: 8,
    state: 'S', ignoresTerm: true, openFiles: [], startedAt: 0,
  });
  processes.set(2, {
    pid: 2, ppid: 1, user: 'learner', command: '/bin/devsh', cpu: 0, memory: 12,
    state: 'S', ignoresTerm: false, openFiles: [], startedAt: 0,
  });
  let pid = 100;
  for (const seed of seeds) {
    processes.set(pid, {
      pid,
      ppid: seed.ppid ?? 1,
      user: seed.user ?? 'learner',
      command: seed.command,
      cpu: seed.cpu ?? 0,
      memory: seed.memory ?? 16,
      state: seed.state ?? 'S',
      ignoresTerm: seed.ignoresTerm ?? false,
      openFiles: seed.openFiles ?? [],
      startedAt: 0,
    });
    pid += 1;
  }
  return { processes, nextPid: pid, totalMemory };
}

export function usedMemory(table: ProcessTable): number {
  let total = 0;
  for (const p of table.processes.values()) total += p.memory;
  return total;
}

export function totalCpu(table: ProcessTable): number {
  let total = 0;
  for (const p of table.processes.values()) total += p.cpu;
  return total;
}

/** 名前で探す。pgrep / pkill が使う */
export function findByPattern(table: ProcessTable, pattern: string): Process[] {
  return [...table.processes.values()]
    .filter((p) => p.pid > 2 && p.command.includes(pattern))
    .sort((a, b) => a.pid - b.pid);
}

export interface SignalResult {
  table: ProcessTable;
  /** 落ちた pid */
  killed: number[];
  error: string | null;
}

const TERMINATING = new Set(['TERM', 'KILL', 'INT', 'HUP', 'QUIT', '9', '15', '2', '1', '3']);

export function normalizeSignal(raw: string | undefined): string {
  if (raw === undefined) return 'TERM';
  const text = raw.replace(/^-/, '').replace(/^SIG/i, '').toUpperCase();
  const byNumber: Record<string, string> = { '1': 'HUP', '2': 'INT', '3': 'QUIT', '9': 'KILL', '15': 'TERM' };
  return byNumber[text] ?? text;
}

/**
 * 合図を送る。
 * SIGKILL は必ず効く。SIGTERM は受け取り側が無視することがある。
 */
export function signal(table: ProcessTable, pid: number, sig: string): SignalResult {
  const target = table.processes.get(pid);
  if (!target) {
    return { table, killed: [], error: `kill: (${String(pid)}) - No such process` };
  }
  if (pid === 1) {
    return { table, killed: [], error: 'kill: (1) - Operation not permitted' };
  }
  if (!TERMINATING.has(sig)) {
    return { table, killed: [], error: null };
  }
  if (sig !== 'KILL' && target.ignoresTerm) {
    // 受け取ったが終わらない。状態からそう見えるようにする
    return { table, killed: [], error: null };
  }
  const processes = new Map(table.processes);
  processes.delete(pid);
  // 子は init に引き取られる
  for (const [id, p] of processes) {
    if (p.ppid === pid) processes.set(id, { ...p, ppid: 1 });
  }
  return { table: { ...table, processes }, killed: [pid], error: null };
}

export function killMany(table: ProcessTable, pids: readonly number[], sig: string): SignalResult {
  let current = table;
  const killed: number[] = [];
  let error: string | null = null;
  for (const pid of pids) {
    const result = signal(current, pid, sig);
    current = result.table;
    killed.push(...result.killed);
    if (result.error !== null && error === null) error = result.error;
  }
  return { table: current, killed, error };
}
