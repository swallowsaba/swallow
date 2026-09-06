import { createClock, type MutableClock } from './clock';
import { createDefaultRegistry } from './commands';
import type { CommandRegistry, ShellState } from './registry';
import { HOME } from './path';
import { createVfs, type VfsNode, type VfsState } from './vfs';

export interface SessionOptions {
  /** 保存から復元する場合の初期状態 */
  restore?: ShellState;
  files?: Readonly<Record<string, string | null>>;
  cwd?: string;
  vars?: Readonly<Record<string, string>>;
  tickDurationMs?: number;
  registry?: CommandRegistry;
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
  return { vfs, cwd, vars, lastExit: 0, history: [] };
}

export interface ShellSnapshotData {
  cwd: string;
  vars: Record<string, string>;
  files: Record<string, { kind: 'dir' | 'file'; content?: string }>;
  history: string[];
}

/** 保存できる素のデータに落とす */
export function snapshotShell(state: ShellState): ShellSnapshotData {
  const files: Record<string, { kind: 'dir' | 'file'; content?: string }> = {};
  for (const [path, node] of state.vfs.nodes) {
    files[path] = node.kind === 'dir' ? { kind: 'dir' } : { kind: 'file', content: node.content };
  }
  return {
    cwd: state.cwd,
    vars: Object.fromEntries(state.vars),
    files,
    history: [...state.history],
  };
}

/** 保存したデータからシェルの状態を組み立て直す */
export function restoreShell(snapshot: ShellSnapshotData): ShellState {
  const nodes = new Map<string, VfsNode>();
  for (const [path, node] of Object.entries(snapshot.files)) {
    nodes.set(path, node.kind === 'dir' ? { kind: 'dir' } : { kind: 'file', content: node.content ?? '' });
  }
  if (!nodes.has('/')) nodes.set('/', { kind: 'dir' });
  return {
    vfs: { nodes },
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
