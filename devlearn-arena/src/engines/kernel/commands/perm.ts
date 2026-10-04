import { dirname, resolve } from '../path';
import {
  allows, applyModeSpec, BASE_DIR_MODE, BASE_FILE_MODE, formatMode, formatOctal, parseUmask,
  withUmask, type AccessKind,
} from '../perm';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { fileSize, list, metaOf, setMeta, stat } from '../vfs';
import { gidOf, groupsOfUser, readGroups, writeGroups } from '../users';
import { fromLines, parseArgs } from './args';

export function currentUser(shell: ShellState): string {
  return shell.vars.get('USER') ?? 'learner';
}

/**
 * 今のシェルが入っているグループ。GROUPS（空白区切り）が無ければ、利用者と同じ名前のグループだけ。
 * /etc/group を書き換えても、入り直す（newgrp）まで今のシェルには効かない（本物と同じ）
 */
export function currentGroups(shell: ShellState): string[] {
  const listed = (shell.vars.get('GROUPS') ?? '').split(/\s+/).filter((g) => g !== '');
  return listed.length > 0 ? listed : [currentUser(shell)];
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
  if (allows(metaOf(shell.vfs, full), currentUser(shell), kind, currentGroups(shell))) return null;
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
  if (allows(metaOf(shell.vfs, parent), currentUser(shell), 'write', currentGroups(shell))) return null;
  return { stderr: `${command}: ${shown}: Permission denied\n`, code: 1 };
}

function statLine(shell: ShellState, path: string): string[] {
  const full = resolve(shell.cwd, path);
  const node = stat(shell.vfs, full);
  if (!node) return [`stat: cannot statx '${path}': No such file or directory`];
  const meta = metaOf(shell.vfs, full);
  const isDir = node.kind === 'dir';
  const size = node.kind === 'file' ? fileSize(node) : 4096;
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
          // 権限を変えられるのは、持ち主と root だけ（本物と同じ）
          const user = currentUser(shell);
          if (user !== 'root' && meta.owner !== user) {
            return { stderr: `chmod: changing permissions of '${path}': Operation not permitted\n`, code: 1 };
          }
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
    summary: 'いまの利用者と、入っているグループを見る',
    handler: ({ argv, shell }) => {
      const asked = argv[1];
      const user = asked ?? currentUser(shell);
      const uid = user === 'root' ? 0 : 1000;
      const gid = gidOf(shell.vfs, user);
      // 名前を書けば /etc/group の今の値、書かなければ今のシェルが入っているグループ
      const groups = asked === undefined ? currentGroups(shell) : groupsOfUser(shell.vfs, user);
      const extra = groups.length > 1 || asked !== undefined || readGroups(shell.vfs).length > 0
        ? ` groups=${groups.map((g) => `${String(gidOf(shell.vfs, g))}(${g})`).join(',')}`
        : '';
      return { stdout: `uid=${String(uid)}(${user}) gid=${String(gid)}(${user})${extra}\n` };
    },
  },
  {
    name: 'groups',
    summary: '入っているグループを見る（名前を書くと /etc/group の今の値）',
    handler: ({ argv, shell }) => {
      const asked = argv[1];
      if (asked === undefined) return { stdout: `${currentGroups(shell).join(' ')}\n` };
      return { stdout: `${asked} : ${groupsOfUser(shell.vfs, asked).join(' ')}\n` };
    },
  },
  {
    name: 'usermod',
    summary: '利用者をグループに入れる（-aG グループ 利用者。root だけ）',
    handler: ({ argv, shell }) => {
      const { flags, operands } = parseArgs(argv, { withValue: ['G'] });
      if (currentUser(shell) !== 'root') return { stderr: 'usermod: Permission denied.\n', code: 1 };
      const g = argv.indexOf('-aG') >= 0 ? argv[argv.indexOf('-aG') + 1] : argv.indexOf('-G') >= 0 ? argv[argv.indexOf('-G') + 1] : undefined;
      const user = operands[operands.length - 1];
      if (g === undefined || user === undefined || user === g) return { stderr: 'usage: usermod -aG グループ 利用者\n', code: 2 };
      const append = argv.includes('-aG') || flags.has('a');
      let groups = readGroups(shell.vfs);
      for (const name of g.split(',')) {
        if (!groups.some((x) => x.name === name)) return { stderr: `usermod: group '${name}' does not exist\n`, code: 6 };
      }
      const wanted = new Set(g.split(','));
      groups = groups.map((x) => {
        const has = x.members.includes(user);
        if (wanted.has(x.name)) return has ? x : { ...x, members: [...x.members, user] };
        // -a が無いと、書かなかったグループからは外れる（本物と同じ落とし穴）
        if (!append && has) return { ...x, members: x.members.filter((m) => m !== user) };
        return x;
      });
      return { patch: { vfs: writeGroups(shell.vfs, groups) } };
    },
  },
  {
    name: 'newgrp',
    summary: '入り直して、新しく入ったグループを今のシェルで使えるようにする',
    handler: ({ argv, shell }) => {
      const group = argv[1];
      const user = currentUser(shell);
      const now = groupsOfUser(shell.vfs, user);
      if (group !== undefined && !now.includes(group) && user !== 'root') return { stderr: 'newgrp: Permission denied.\n', code: 1 };
      return { patch: { vars: new Map([...shell.vars, ['GROUPS', now.join(' ')]]) } };
    },
  },
  {
    name: 'chgrp',
    summary: 'グループを変える（root だけ）',
    handler: ({ argv, shell }) => {
      const { operands } = parseArgs(argv);
      const [group, ...paths] = operands;
      if (group === undefined || paths.length === 0) return { stderr: 'chgrp: missing operand\n', code: 1 };
      if (currentUser(shell) !== 'root') return { stderr: `chgrp: changing group of '${paths[0] ?? ''}': Operation not permitted\n`, code: 1 };
      let vfs = shell.vfs;
      for (const path of paths) {
        const full = resolve(shell.cwd, path);
        if (stat(vfs, full) === undefined) return { stderr: `chgrp: cannot access '${path}': No such file or directory\n`, code: 1 };
        vfs = setMeta(vfs, full, { ...metaOf(vfs, full), group });
      }
      return { patch: { vfs } };
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
          procs: outcome.state.procs,
          git: outcome.state.git,
          cluster: outcome.state.cluster,
          net: outcome.state.net,
          repo: outcome.state.repo,
          services: outcome.state.services,
          containers: outcome.state.containers,
        },
      };
    },
  },
];

/** 新しく作るものの権限。出発点から umask のぶんを落とす */
export function newFileMode(shell: ShellState, isDir: boolean): number {
  return withUmask(isDir ? BASE_DIR_MODE : BASE_FILE_MODE, currentUmask(shell));
}
