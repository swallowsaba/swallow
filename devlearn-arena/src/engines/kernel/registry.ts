import type { MutableClock } from './clock';
import type { VfsState } from './vfs';

export interface ShellState {
  vfs: VfsState;
  cwd: string;
  vars: ReadonlyMap<string, string>;
  lastExit: number;
  history: readonly string[];
}

export interface RunLineResult {
  stdout: string;
  stderr: string;
  code: number;
  state: ShellState;
}

export interface CommandContext {
  /** argv[0] はコマンド名 */
  argv: readonly string[];
  stdin: string;
  shell: ShellState;
  /** sleep など、仮想時計を進めるコマンドがあるので可変で渡す */
  clock: MutableClock;
  /** xargs のように別のコマンドを起動するコマンドのための入口 */
  runLine: (line: string, from?: ShellState) => RunLineResult;
  /** 補完やヘルプのために自分自身を参照できるようにする */
  registry: CommandRegistry;
}

export interface CommandResult {
  stdout?: string;
  stderr?: string;
  /** 省略時は 0 */
  code?: number;
  /** 変更したシェル状態（差分） */
  patch?: Partial<ShellState>;
}

export type CommandHandler = (ctx: CommandContext) => CommandResult;

export interface CommandSpec {
  name: string;
  summary: string;
  handler: CommandHandler;
  /** 引数位置の補完候補を出す（省略時はパス補完） */
  complete?: (ctx: { shell: ShellState; argv: readonly string[]; prefix: string }) => string[];
}

export class CommandRegistry {
  private readonly specs = new Map<string, CommandSpec>();

  register(spec: CommandSpec): this {
    this.specs.set(spec.name, spec);
    return this;
  }

  registerAll(specs: readonly CommandSpec[]): this {
    for (const spec of specs) this.register(spec);
    return this;
  }

  get(name: string): CommandSpec | undefined {
    return this.specs.get(name);
  }

  has(name: string): boolean {
    return this.specs.has(name);
  }

  names(): string[] {
    return [...this.specs.keys()].sort();
  }

  all(): CommandSpec[] {
    return this.names().map((n) => this.specs.get(n)).filter((s): s is CommandSpec => s !== undefined);
  }
}
