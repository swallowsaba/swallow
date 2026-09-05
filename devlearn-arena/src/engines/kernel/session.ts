import { createClock, type MutableClock } from './clock';
import { createDefaultRegistry } from './commands';
import { CommandRegistry, type ShellState } from './registry';
import { HOME } from './path';
import { createVfs, type VfsState } from './vfs';

export interface SessionOptions {
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

export function createSession(options: SessionOptions = {}): Session {
  return {
    state: createShellState(options),
    registry: options.registry ?? createDefaultRegistry(),
    clock: createClock(options.tickDurationMs ?? 500),
  };
}
