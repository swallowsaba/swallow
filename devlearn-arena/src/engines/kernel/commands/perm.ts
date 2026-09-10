import { dirname, resolve } from '../path';
import {
  allows, applyModeSpec, BASE_DIR_MODE, BASE_FILE_MODE, formatMode, formatOctal, parseUmask,
  withUmask, type AccessKind,
} from '../perm';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { list, metaOf, setMeta, stat } from '../vfs';
import { fromLines, parseArgs } from './args';

export function currentUser(shell: ShellState): string {
  return shell.vars.get('USER') ?? 'learner';
}

export function currentUmask(shell: ShellState): number {
  return parseUmask(shell.vars.get('UMASK') ?? '022') ?? 0o022;
}

/**
 * その操作が許されるか。
 * 許されなければ本物と同じ文言を返す。
 */
export function denied(
  shell: ShellState,
  path: string,
  kind: AccessKind,
  command: string,
  shown = path,
): CommandResult | null {
  const full = resolve(shell.cwd, path);
  if (stat(shell.vfs, full) === undefined) return null;
  if (allows(metaOf(shell.vfs, full), currentUser(shell), kind)) return null;
  return { stderr: `${command}: ${shown}: Permission denied\n`, code: 1 };
}

/** 親ディレクトリに書き込めるか。作る・消す・名前を変える操作で使う */
export function deniedInParent(
  shell: ShellState,
  path: string,
  command: string,
  shown = path,
): CommandResult | null {
  const parent = dirname(resolve(shell.cwd, path));
  if (allows(metaOf(shell.vfs, parent), currentUser(shell), 'write')) return null;
  return { stderr: `${command}: ${shown}: Permission denied\n`, code: 1 };
}

function statLine(shell: ShellState, path: string): string[] {
  const full = resolve(shell.cwd, path);
  const node = stat(shell.vfs, full);
  if (!node) return [`stat: cannot statx '${path}': No such file or directory`];
  const meta = metaOf(shell.vfs, full);
  const isDir = node.kind === 'dir';
  const size = node.kind === 'file' ? node.content.length : 4096;
  return [
    `  File: ${full}`,
    `  Size: ${String(size)}\t${isDir ? 'directory' : 'regular file'}`,
    `Access: (${formatOctal(meta.mode)}/${formatMode(meta.mode, isDir)})  Uid: (${meta.owner})   Gid: (${meta.group})`,
  ];
}

/** 再帰対象を集める（自身と子孫） */
function targetsOf(shell: ShellState, path: string, recursive: boolean): string[] {
  const full = resolve(shell.cwd, path);
  if (!recursive || stat(shell.vfs, full)?.kind !== 'dir') return [full];
  const out = [full];
  const walk = (dir: string): void => {
    for (const name of list(shell.vfs, dir)) {
      const child = dir === '/' ? `/${name}` : `${dir}/${name}`;
      out.push(child);
      if (stat(shell.vfs, child)?.kind === 'dir') walk(child);
    }
  };
  walk(full);
  return out;
}

export const permCommands: CommandSpec[] = [
  {
    name: 'chmod',
    summary: '権限を変える（755 / u+x / go-w）',
    handler: ({ argv, shell }) => {
      const { operands, flags } = parseArgs(argv);
      const spec = operands[0];
      const paths = operands.slice(1);
      if (spec === undefined || paths.length === 0) {
        return { stderr: "chmod: missing operand\nTry 'chmod --help' for more information.\n", code: 1 };
      }
      const recursive = flags.has('R') || flags.has('r');
      let vfs = shell.vfs;
      for (const path of paths) {
        const full = resolve(shell.cwd, path);
        if (stat(shell.vfs, full) === undefined) {
          return { stderr: `chmod: cannot access '${path}': No such file or directory\n`, code: 1 };
        }
        for (const target of targetsOf(shell, path, recursive)) {
          const meta = metaOf(vfs, target);
          const isDir = stat(vfs, target)?.kind === 'dir';
          const mode = applyModeSpec(meta.mode, spec, isDir);
          if (mode === null) {
            return { stderr: `chmod: invalid mode: '${spec}'\n`, code: 1 };
          }
          vfs = setMeta(vfs, target, { ...meta, mode });
        }
      }
      return { patch: { vfs } };
    },
  },

  {
    name: 'chown',
    summary: '所有者を変える（root だけができる）',
    handler: ({ argv, shell }) => {
      const { operands, flags } = parseArgs(argv);
      const spec = operands[0];
      const paths = operands.slice(1);
      if (spec === undefined || paths.length === 0) {
        return { stderr: 'chown: missing operand\n', code: 1 };
      }
      if (currentUser(shell) !== 'root') {
        return { stderr: `chown: changing ownership of '${paths[0] ?? ''}': Operation not permitted\n`, code: 1 };
      }
      const [owner = '', group] = spec.split(':');
      const recursive = flags.has('R');
      let vfs = shell.vfs;
      for (const path of paths) {
        if (stat(shell.vfs, resolve(shell.cwd, path)) === undefined) {
          return { stderr: `chown: cannot access '${path}': No such file or directory\n`, code: 1 };
        }
        for (const target of targetsOf(shell, path, recursive)) {
          const meta = metaOf(vfs, target);
          vfs = setMeta(vfs, target, {
            ...meta,
            owner: owner === '' ? meta.owner : owner,
            group: group === undefined || group === '' ? (owner === '' ? meta.group : owner) : group,
          });
        }
      }
      return { patch: { vfs } };
    },
  },

  {
    name: 'stat',
    summary: 'ファイルの詳しい情報を見る',
    handler: ({ argv, shell }) => {
      const { operands } = parseArgs(argv);
      if (operands.length === 0) return { stderr: 'stat: missing operand\n', code: 1 };
      const lines = operands.flatMap((p) => statLine(shell, p));
      const missing = lines.some((l) => l.startsWith('stat: cannot'));
      return { stdout: fromLines(lines), code: missing ? 1 : 0 };
    },
  },

  {
    name: 'umask',
    summary: '新しく作るファイルから落とす権限を見る / 変える',
    handler: ({ argv, shell }) => {
      const spec = argv[1];
      if (spec === undefined) return { stdout: `${formatOctal(currentUmask(shell)).padStart(4, '0')}\n` };
      const parsed = parseUmask(spec);
      if (parsed === null) return { stderr: `umask: ${spec}: invalid symbolic mode\n`, code: 1 };
      return { patch: { vars: new Map([...shell.vars, ['UMASK', formatOctal(parsed)]]) } };
    },
  },

  {
    name: 'id',
    summary: 'いまの利用者を見る',
    handler: ({ shell }) => {
      const user = currentUser(shell);
      return { stdout: `uid=${user === 'root' ? '0' : '1000'}(${user}) gid=${user === 'root' ? '0' : '1000'}(${user})\n` };
    },
  },

  {
    name: 'sudo',
    summary: 'root として1行だけ実行する',
    handler: ({ argv, shell, runLine }) => {
      const rest = argv.slice(1);
      if (rest.length === 0) return { stderr: 'usage: sudo <command>\n', code: 1 };
      // USER を root にした状態で1行だけ実行し、終わったら元の利用者に戻す
      const asRoot: ShellState = { ...shell, vars: new Map([...shell.vars, ['USER', 'root']]) };
      const outcome = runLine(rest.join(' '), asRoot);
      return {
        stdout: outcome.stdout,
        stderr: outcome.stderr,
        code: outcome.code,
        patch: {
          vfs: outcome.state.vfs,
          git: outcome.state.git,
          cluster: outcome.state.cluster,
          net: outcome.state.net,
          repo: outcome.state.repo,
        },
      };
    },
  },
];

/** 新しく作るものの権限。出発点から umask のぶんを落とす */
export function newFileMode(shell: ShellState, isDir: boolean): number {
  return withUmask(isDir ? BASE_DIR_MODE : BASE_FILE_MODE, currentUmask(shell));
}
