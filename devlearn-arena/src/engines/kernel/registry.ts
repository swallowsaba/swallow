import type { GitState } from '@/engines/git/types';
import type { ClusterState } from '@/engines/k8s/types';
import type { Repo } from '@/engines/github/types';
import type { Topology } from '@/engines/net/types';
import type { MutableClock } from './clock';
import type { ProcessTable } from './process';
import type { ServiceTable } from './services';
import type { ContainerHost } from '@/engines/container/container';
import type { Site } from '@/engines/http/http';
import type { Cert } from '@/engines/tls/tls';
import type { VfsState } from './vfs';

export interface ShellState {
  vfs: VfsState;
  /** プロセス表。ps / kill / top はここから導く */
  procs: ProcessTable;
  /** git リポジトリ。まだ init していなければ null */
  git: GitState | null;
  /** 手元の外のサーバにあるリポジトリ（git clone・push・fetch の相手。URL → リポジトリ）。無ければ undefined */
  gitServers?: ReadonlyMap<string, GitServer>;
  /** SSH で入るサーバ（名前 → サーバ）。無ければ undefined */
  sshHosts?: ReadonlyMap<string, SshHost>;
  /** Kubernetes クラスタ。用意されていなければ null */
  cluster: ClusterState | null;
  /** ネットワークの構成。用意されていなければ null */
  net: Topology | null;
  /** GitHub のリポジトリ。用意されていなければ null */
  repo: Repo | null;
  /** systemd が管理するサービス。用意されていなければ null（systemctl が使えない） */
  services: ServiceTable | null;
  /** コンテナの動く手元（docker が使う）。用意されていなければ null */
  containers: ContainerHost | null;
  /** 名前で引ける Web のサイトと、手元が信頼するルート証明書・今日の日付（curl が使う）。用意されていなければ null */
  web: WebWorld | null;
  cwd: string;
  vars: ReadonlyMap<string, string>;
  lastExit: number;
  history: readonly string[];
}

/** サーバにあるリポジトリ。https の URL で読め、SSH の URL は登録した公開鍵の持ち主だけが使える */
export interface GitServer {
  url: string;
  ssh?: string;
  /** 登録された公開鍵（~/.ssh/id_*.pub の中身の 1 行） */
  keys: readonly string[];
  state: GitState;
}

/** SSH で入るサーバ（setup の sshHosts）。登録された公開鍵と、鍵で入った記録だけを持つ */
export interface SshHost {
  host: string;
  /** 入れる利用者 */
  user: string;
  /** 初めの登録の時のために、仮のパスワードでも入れる（練習の端末が代わりに入れる） */
  password: boolean;
  /** その利用者の ~/.ssh/authorized_keys の行 */
  authorized: readonly string[];
  /** 鍵で入った利用者 */
  keyLogins: readonly string[];
  /** 入った時の案内 */
  motd?: string;
}

export interface WebWorld {
  sites: readonly Site[];
  roots: readonly Cert[];
  /** 証明書の期限を見る日（YYYY-MM-DD） */
  today: string;
  /** 自分（この機械）の名前。localhost と同じく手元を指す */
  hostname: string;
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
  /** 標準エラーを標準出力の後に出す（進みの行を出してから、最後に断る命令。kubectl rollout status など） */
  stderrLast?: boolean;
  /** 変更したシェル状態（差分） */
  patch?: Partial<ShellState>;
  /** 画面側にエディタを開かせる要求 */
  editor?: EditorRequest;
}

export interface EditorRequest {
  path: string;
  content: string;
  /** 表示に使う名前（vi / nano） */
  tool: string;
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
