import { dirname, resolve } from '../path';
import {
  allows, applyModeSpec, BASE_DIR_MODE, BASE_FILE_MODE, formatMode, formatOctal, parseUmask,
  withUmask, type AccessKind,
} from '../perm';
import { changedState, type CommandResult, type CommandSpec, type ShellState } from '../registry';
import { exists, fileSize, list, metaOf, mkdir, readFile, setMeta, stat, writeFile } from '../vfs';
import { gidOf, groupsOfUser, PASSWD_FILE, readGroups, readPasswd, userExists, writeGroups } from '../users';
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
      const asked = argv.slice(1).find((a) => !a.startsWith('-'));
      const user = asked ?? currentUser(shell);
      if (asked !== undefined && !userExists(shell.vfs, asked, currentUser(shell))) return { stderr: `id: '${asked}': no such user\n`, code: 1 };
      const entry = readPasswd(shell.vfs).find((p) => p.name === user);
      const uid = entry?.uid ?? (user === 'root' ? 0 : 1000);
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
    name: 'useradd',
    summary: '利用者を作る（-r でサービス用の利用者。-s でログインのシェル。root だけ）',
    handler: ({ argv, shell }) => {
      if (currentUser(shell) !== 'root') return { stderr: 'useradd: Permission denied.\nuseradd: cannot lock /etc/passwd; try again later.\n', code: 1 };
      let system = false;
      let createHome = false;
      let login = '/bin/sh';
      let home: string | undefined;
      const names: string[] = [];
      const args = argv.slice(1);
      for (let i = 0; i < args.length; i += 1) {
        const a = args[i] ?? '';
        if (a === '-r' || a === '--system') system = true;
        else if (a === '-m' || a === '--create-home') createHome = true;
        else if (a === '-M' || a === '--no-create-home' || a === '-U' || a === '--user-group') continue;
        else if (a === '-s' || a === '--shell') { i += 1; login = args[i] ?? login; }
        else if (a === '-d' || a === '--home-dir') { i += 1; home = args[i]; }
        else if (a.startsWith('--shell=')) login = a.slice('--shell='.length);
        else if (a.startsWith('--home-dir=')) home = a.slice('--home-dir='.length);
        else if (a.startsWith('-')) return { stderr: `useradd: invalid option -- '${a.replace(/^-+/, '')}'\n`, code: 2 };
        else names.push(a);
      }
      const name = names[0];
      if (name === undefined || names.length > 1) return { stderr: 'Usage: useradd [options] LOGIN\n', code: 2 };
      if (userExists(shell.vfs, name, currentUser(shell))) return { stderr: `useradd: user '${name}' already exists\n`, code: 9 };
      // 本物と同じく、サービス用は 999 から下へ、ふつうの利用者は 1001 から上へ番号を振る
      const taken = readPasswd(shell.vfs).map((p) => p.uid);
      const uid = system ? Math.min(1000, ...taken.filter((n) => n < 1000 && n > 0)) - 1 : Math.max(1000, ...taken) + 1;
      const dir = home ?? `/home/${name}`;
      const base = taken.length > 0 ? readFile(shell.vfs, PASSWD_FILE) : 'root:x:0:0:root:/root:/bin/bash\nlearner:x:1000:1000::/home/learner:/bin/bash\n';
      let vfs = writeFile(shell.vfs, PASSWD_FILE, `${base}${name}:x:${String(uid)}:${String(uid)}::${dir}:${login}\n`);
      vfs = writeGroups(vfs, [...readGroups(vfs), { name, gid: uid, members: [] }]);
      if (createHome && !exists(vfs, dir)) {
        vfs = mkdir(vfs, dir, true);
        vfs = setMeta(vfs, dir, { ...metaOf(vfs, dir), owner: name, group: name });
      }
      return { patch: { vfs } };
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
    name: 'gpasswd',
    summary: '利用者をグループに入れる・外す（-a 利用者 グループ / -d 利用者 グループ。root だけ）',
    handler: ({ argv, shell }) => {
      const [flag, user, group] = argv.slice(1);
      if ((flag !== '-a' && flag !== '-d') || user === undefined || group === undefined) return { stderr: 'Usage: gpasswd [option] GROUP\n', code: 2 };
      if (currentUser(shell) !== 'root') return { stderr: 'gpasswd: Permission denied.\n', code: 1 };
      const groups = readGroups(shell.vfs);
      const g = groups.find((x) => x.name === group);
      if (!g) return { stderr: `gpasswd: group '${group}' does not exist in /etc/group\n`, code: 3 };
      if (flag === '-d' && !g.members.includes(user)) return { stderr: `gpasswd: user '${user}' is not a member of '${group}'\n`, code: 3 };
      const members = flag === '-a' ? (g.members.includes(user) ? g.members : [...g.members, user]) : g.members.filter((m) => m !== user);
      return {
        stdout: flag === '-a' ? `Adding user ${user} to group ${group}\n` : `Removing user ${user} from group ${group}\n`,
        patch: { vfs: writeGroups(shell.vfs, groups.map((x) => (x.name === group ? { ...x, members } : x))) },
      };
    },
  },
  {
    name: 'sg',
    summary: '入っているグループで 1 行だけ動かす（sg グループ -c "命令"。今のシェルのグループは変えない）',
    handler: ({ argv, shell, runLine }) => {
      const group = argv[1];
      const at = argv.indexOf('-c');
      const line = at >= 0 ? argv.slice(at + 1).join(' ') : argv.slice(2).join(' ');
      if (group === undefined || line === '') return { stderr: 'Usage: sg group [[-c] command]\n', code: 2 };
      const user = currentUser(shell);
      const now = groupsOfUser(shell.vfs, user);
      if (!now.includes(group) && user !== 'root') return { stderr: 'sg: Permission denied.\n', code: 1 };
      const r = runLine(line, { ...shell, vars: new Map([...shell.vars, ['GROUPS', [group, ...now.filter((g) => g !== group)].join(' ')]]) });
      return { stdout: r.stdout, stderr: r.stderr, code: r.code, patch: changedState(shell, { ...r.state, vars: shell.vars, cwd: shell.cwd }) };
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
    handler: ({ argv, shell, stdin, runLine }) => {
      const rest = argv.slice(1);
      if (rest.length === 0) return { stderr: 'usage: sudo <command>\n', code: 1 };
      // 分けた引数のまま渡す（空白や記号を含む引数を、もう一度分けない）
      const quoted = rest.map((a) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`));
      // USER を root にした状態で1行だけ実行し、終わったら元の利用者に戻す
      const asRoot: ShellState = { ...shell, vars: new Map([...shell.vars, ['USER', 'root']]) };
      const outcome = runLine(quoted.join(' '), asRoot, stdin);
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
