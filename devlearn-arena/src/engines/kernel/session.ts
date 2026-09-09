import { createClock, type MutableClock } from './clock';
import { createDefaultRegistry } from './commands';
import type { CommandRegistry, ShellState } from './registry';
import { HOME } from './path';
import { restoreGit, snapshotGit, type GitSnapshot } from '@/engines/git/serialize';
import { restoreCluster, snapshotCluster, type ClusterSnapshot } from '@/engines/k8s/serialize';
import type { ClusterState } from '@/engines/k8s/types';
import { restoreRepo, snapshotRepo, type RepoSnapshot } from '@/engines/github/serialize';
import type { Repo } from '@/engines/github/types';
import { restoreTopology, snapshotTopology, type TopologySnapshot } from '@/engines/net/serialize';
import type { Topology } from '@/engines/net/types';
import type { FileMeta } from './perm';
import { createProcessTable, type ProcSeed, type Process, type ProcessTable } from './process';
import { createVfs, type VfsNode, type VfsState } from './vfs';

export interface SessionOptions {
  /** 保存から復元する場合の初期状態 */
  restore?: ShellState;
  /** Kubernetes の任務で使う初期クラスタ */
  cluster?: ClusterState;
  /** ネットワークの任務で使う初期構成 */
  net?: Topology;
  /** GitHub の任務で使う初期リポジトリ */
  repo?: Repo;
  files?: Readonly<Record<string, string | null>>;
  cwd?: string;
  vars?: Readonly<Record<string, string>>;
  tickDurationMs?: number;
  registry?: CommandRegistry;
  /** 最初から動いているプロセス */
  processes?: readonly ProcSeed[];
  /** 積んでいるメモリ（MiB） */
  totalMemory?: number;
}

export interface Session {
  state: ShellState;
  registry: CommandRegistry;
  clock: MutableClock;
}

const DEFAULT_FILES: Readonly<Record<string, string | null>> = {
  [HOME]: null,
  [`${HOME}/README.txt`]: [
    'DevLearn Arena サンドボックス',
    '',
    'help で使えるコマンドの一覧が出ます。',
    'ls / cd / cat / grep / パイプ / リダイレクトが動きます。',
    'kubectl と git は、それぞれのトラックを実装したときに増えます。',
    '',
  ].join('\n'),
  '/etc/hosts': '127.0.0.1\tlocalhost\n10.0.0.10\tapi.internal\n',
  '/etc/os-release': 'NAME="DevLearn Linux"\nVERSION="1.0"\n',
};

export function createShellState(options: SessionOptions = {}): ShellState {
  if (options.restore) return options.restore;
  const cwd = options.cwd ?? HOME;
  const vfs: VfsState = createVfs(options.files ?? DEFAULT_FILES);
  const vars = new Map<string, string>(
    Object.entries({
      HOME,
      PWD: cwd,
      USER: 'learner',
      SHELL: '/bin/devsh',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      ...options.vars,
    }),
  );
  return {
    vfs,
    procs: createProcessTable(options.processes ?? [], options.totalMemory ?? 8192),
    git: null,
    cluster: options.cluster ?? null,
    net: options.net ?? null,
    repo: options.repo ?? null,
    cwd,
    vars,
    lastExit: 0,
    history: [],
  };
}

export interface ShellSnapshotData {
  cwd: string;
  vars: Record<string, string>;
  files: Record<string, { kind: 'dir' | 'file'; content?: string; meta?: FileMeta }>;
  history: string[];
  procs: { processes: Process[]; nextPid: number; totalMemory: number };
  git: GitSnapshot | null;
  cluster: ClusterSnapshot | null;
  net: TopologySnapshot | null;
  repo: RepoSnapshot | null;
}

/** 保存できる素のデータに落とす */
export function snapshotShell(state: ShellState): ShellSnapshotData {
  const files: Record<string, { kind: 'dir' | 'file'; content?: string; meta?: FileMeta }> = {};
  for (const [path, node] of state.vfs.nodes) {
    const meta = state.vfs.meta.get(path);
    files[path] = {
      ...(node.kind === 'dir' ? { kind: 'dir' as const } : { kind: 'file' as const, content: node.content }),
      // 既定と違う権限だけを残す
      ...(meta ? { meta } : {}),
    };
  }
  return {
    cwd: state.cwd,
    vars: Object.fromEntries(state.vars),
    files,
    history: [...state.history],
    procs: {
      processes: [...state.procs.processes.values()],
      nextPid: state.procs.nextPid,
      totalMemory: state.procs.totalMemory,
    },
    git: state.git === null ? null : snapshotGit(state.git),
    cluster: state.cluster === null ? null : snapshotCluster(state.cluster),
    net: state.net === null ? null : snapshotTopology(state.net),
    repo: state.repo === null ? null : snapshotRepo(state.repo),
  };
}

function restoreProcs(saved: ShellSnapshotData['procs'] | undefined): ProcessTable {
  if (!saved) return createProcessTable();
  return {
    processes: new Map(saved.processes.map((p) => [p.pid, p])),
    nextPid: saved.nextPid,
    totalMemory: saved.totalMemory,
  };
}

/** 保存したデータからシェルの状態を組み立て直す */
export function restoreShell(snapshot: ShellSnapshotData): ShellState {
  const nodes = new Map<string, VfsNode>();
  const meta = new Map<string, FileMeta>();
  for (const [path, node] of Object.entries(snapshot.files)) {
    nodes.set(path, node.kind === 'dir' ? { kind: 'dir' } : { kind: 'file', content: node.content ?? '' });
    if (node.meta) meta.set(path, node.meta);
  }
  if (!nodes.has('/')) nodes.set('/', { kind: 'dir' });
  return {
    vfs: { nodes, meta },
    procs: restoreProcs(snapshot.procs),
    git: snapshot.git === null ? null : restoreGit(snapshot.git),
    cluster: snapshot.cluster === null ? null : restoreCluster(snapshot.cluster),
    net: snapshot.net === null ? null : restoreTopology(snapshot.net),
    repo: snapshot.repo === null ? null : restoreRepo(snapshot.repo),
    cwd: snapshot.cwd,
    vars: new Map(Object.entries(snapshot.vars)),
    lastExit: 0,
    history: [...snapshot.history],
  };
}

export function createSession(options: SessionOptions = {}): Session {
  return {
    state: createShellState(options),
    registry: options.registry ?? createDefaultRegistry(),
    clock: createClock(options.tickDurationMs ?? 500),
  };
}
