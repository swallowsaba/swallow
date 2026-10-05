import { globMatch } from '../glob';
import { basename, dirname, HOME, resolve } from '../path';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { allows, formatMode } from '../perm';
import { copy, fileSize, list, metaOf, mkdir, move, readFile, remove, setMeta, stat, touch, VfsError } from '../vfs';
import { fromLines, humanSize, parseArgs } from './args';
import { currentGroups, currentUser, denied, deniedInParent, newFileMode } from './perm';

interface TransferPlan {
  sources: string[];
  dest: string;
}

/**
 * cp / mv の引数を読む。
 * 本物と同じく、行き先がディレクトリなら元は何個でも受け取れる。
 */
function planTransfer(
  shell: ShellState,
  operands: readonly string[],
  command: string,
  what: string,
): TransferPlan | { error: CommandResult } {
  if (operands.length < 2) {
    const got = operands.length === 0 ? 'なし' : operands.join(' ');
    return {
      error: {
        stderr: `${command}: missing file operand\n${command}: ${what}の2つが要ります（受け取った引数: ${got}）\n`,
        code: 1,
      },
    };
  }
  const dest = resolve(shell.cwd, operands[operands.length - 1] ?? '');
  const sources = operands.slice(0, -1).map((p) => resolve(shell.cwd, p));
  const missing = operands.slice(0, -1).find((p) => stat(shell.vfs, resolve(shell.cwd, p)) === undefined);
  if (missing !== undefined) {
    return { error: { stderr: `${command}: cannot stat '${missing}': No such file or directory\n`, code: 1 } };
  }
  const destText = operands[operands.length - 1] ?? '';
  if (sources.length > 1 && stat(shell.vfs, dest)?.kind !== 'dir') {
    return { error: { stderr: `${command}: target '${destText}' is not a directory\n`, code: 1 } };
  }
  // 行き先が無く、その置き場所も無い（末尾の / は、無いディレクトリを指す）時は、本物と同じ文で断る
  if (stat(shell.vfs, dest) === undefined && (destText.endsWith('/') || stat(shell.vfs, dirname(dest))?.kind !== 'dir')) {
    const why = destText.endsWith('/') && stat(shell.vfs, dirname(dest))?.kind === 'dir' ? 'Not a directory' : 'No such file or directory';
    const source = operands[0] ?? '';
    const what = stat(shell.vfs, sources[0] ?? '')?.kind === 'dir' ? 'directory' : 'regular file';
    const stderr = command === 'mv' ? `mv: cannot move '${source}' to '${destText}': ${why}\n` : `${command}: cannot create ${what} '${destText}': ${why}\n`;
    return { error: { stderr, code: 1 } };
  }
  return { sources, dest };
}

export const fsCommands: CommandSpec[] = [
  {
    name: 'pwd',
    summary: '現在のディレクトリを表示する',
    handler: ({ shell }) => ({ stdout: `${shell.cwd}\n` }),
  },
  {
    name: 'cd',
    summary: 'ディレクトリを移動する',
    handler: ({ argv, shell }) => {
      const target = argv[1] ?? HOME;
      const path = resolve(shell.cwd, target);
      const node = stat(shell.vfs, path);
      if (!node) return { stderr: `cd: ${target}: No such file or directory\n`, code: 1 };
      if (node.kind === 'file') return { stderr: `cd: ${target}: Not a directory\n`, code: 1 };
      // ディレクトリに入るには実行権が要る
      const blocked = denied(shell, path, 'exec', 'cd', target);
      if (blocked) return blocked;
      const vars = new Map(shell.vars);
      vars.set('PWD', path);
      vars.set('OLDPWD', shell.cwd);
      return { patch: { cwd: path, vars } };
    },
  },
  {
    name: 'ls',
    summary: 'ディレクトリの中身を並べる',
    handler: ({ argv, shell }) => {
      const { flags, operands } = parseArgs(argv);
      const targets = operands.length > 0 ? operands : ['.'];
      const long = flags.has('l');
      const all = flags.has('a');
      const perLine = long || flags.has('1');
      const blocks: string[] = [];

      for (const target of targets) {
        const path = resolve(shell.cwd, target);
        const node = stat(shell.vfs, path);
        if (!node) return { stderr: `ls: cannot access '${target}': No such file or directory\n`, code: 2 };
        // -d はディレクトリの中身でなく、ディレクトリそのものを 1 行で出す
        const self = flags.has('d') || node.kind !== 'dir';
        // ディレクトリの中身を並べるには、そのディレクトリの読み権が要る。
        // ファイルそのもの（と -d）は、読めなくても権限の欄まで見える（本物と同じ）
        if (!self && denied(shell, path, 'read', 'ls', target)) {
          return { stderr: `ls: cannot open directory '${target}': Permission denied\n`, code: 2 };
        }
        let names = self ? [node.kind === 'dir' ? target : basename(path)] : list(shell.vfs, path);
        if (all && !self) names = ['.', '..', ...names];
        if (!all && !self) names = names.filter((n) => !n.startsWith('.'));

        const rows = names.map((name) => {
          const childPath = self ? path : resolve(path, name);
          const child = stat(shell.vfs, childPath);
          const dir = child?.kind === 'dir';
          if (!long) return dir ? `${name}/` : name;
          const size = child?.kind === 'file' ? fileSize(child) : 4096;
          const shown = flags.has('h') ? humanSize(size) : String(size);
          const meta = metaOf(shell.vfs, childPath);
          return `${formatMode(meta.mode, dir)} 1 ${meta.owner} ${meta.group} ${shown.padStart(6)} ${name}${dir ? '/' : ''}`;
        });

        const header = targets.length > 1 ? `${target}:\n` : '';
        blocks.push(header + (perLine ? fromLines(rows) : rows.length === 0 ? '' : `${rows.join('  ')}\n`));
      }
      return { stdout: blocks.join(targets.length > 1 ? '\n' : '') };
    },
  },
  {
    name: 'cat',
    summary: 'ファイルの中身を出力する',
    handler: ({ argv, shell, stdin }) => {
      const { operands } = parseArgs(argv);
      if (operands.length === 0) return { stdout: stdin };
      // 本物と同じく、読めないものがあっても残りは出す。終了コードだけ 1 にする
      let out = '';
      let err = '';
      for (const target of operands) {
        const path = resolve(shell.cwd, target);
        const node = stat(shell.vfs, path);
        if (node === undefined) {
          err += `cat: ${target}: No such file or directory\n`;
          continue;
        }
        if (node.kind === 'dir') {
          err += `cat: ${target}: Is a directory\n`;
          continue;
        }
        const blocked = denied(shell, target, 'read', 'cat');
        if (blocked) {
          err += blocked.stderr ?? '';
          continue;
        }
        out += readFile(shell.vfs, path);
      }
      return { stdout: out, stderr: err, code: err === '' ? 0 : 1 };
    },
  },
  {
    name: 'mkdir',
    summary: 'ディレクトリを作る',
    handler: ({ argv, shell }) => {
      const { flags, operands } = parseArgs(argv);
      if (operands.length === 0) return { stderr: 'mkdir: missing operand\n', code: 1 };
      let vfs = shell.vfs;
      for (const target of operands) {
        const blocked = deniedInParent(shell, target, 'mkdir', `cannot create directory '${target}'`);
        if (blocked) return blocked;
        const path = resolve(shell.cwd, target);
        vfs = mkdir(vfs, path, flags.has('p'));
        vfs = setMeta(vfs, path, { ...metaOf(vfs, path), mode: newFileMode(shell, true) });
      }
      return { patch: { vfs } };
    },
  },
  {
    name: 'touch',
    summary: '空ファイルを作る',
    handler: ({ argv, shell }) => {
      const { operands } = parseArgs(argv);
      if (operands.length === 0) return { stderr: 'touch: missing file operand\n', code: 1 };
      let vfs = shell.vfs;
      for (const target of operands) {
        const path = resolve(shell.cwd, target);
        if (stat(vfs, path) === undefined) {
          const blocked = deniedInParent(shell, target, 'touch', `cannot touch '${target}'`);
          if (blocked) return blocked;
          vfs = touch(vfs, path);
          vfs = setMeta(vfs, path, { ...metaOf(vfs, path), mode: newFileMode(shell, false) });
        }
      }
      return { patch: { vfs } };
    },
  },
  {
    name: 'rm',
    summary: 'ファイルやディレクトリを消す',
    handler: ({ argv, shell }) => {
      const { flags, operands } = parseArgs(argv);
      if (operands.length === 0) return { stderr: 'rm: missing operand\n', code: 1 };
      const recursive = flags.has('r') || flags.has('R');
      const force = flags.has('f');
      let vfs = shell.vfs;
      for (const target of operands) {
        const path = resolve(shell.cwd, target);
        if (stat(vfs, path) !== undefined) {
          const blocked = deniedInParent(shell, target, 'rm', `cannot remove '${target}'`);
          if (blocked) return blocked;
        }
        // ディレクトリは空でも -r が要る（本物と同じ）
        if (!recursive && stat(vfs, path)?.kind === 'dir') {
          return { stderr: `rm: cannot remove '${target}': Is a directory\n`, code: 1 };
        }
        try {
          vfs = remove(vfs, path, recursive);
        } catch (error) {
          if (force && error instanceof VfsError && error.code === 'ENOENT') continue;
          if (error instanceof VfsError && error.code === 'ENOTEMPTY') {
            return { stderr: `rm: cannot remove '${target}': Is a directory\n`, code: 1 };
          }
          throw error;
        }
      }
      return { patch: { vfs } };
    },
  },
  {
    name: 'cp',
    summary: 'コピーする',
    handler: ({ argv, shell }) => {
      const { flags, operands } = parseArgs(argv);
      const plan = planTransfer(shell, operands, 'cp', 'コピー元とコピー先');
      if ('error' in plan) return plan.error;
      const recursive = flags.has('r') || flags.has('R');
      const dir = operands.slice(0, -1).find((p) => stat(shell.vfs, resolve(shell.cwd, p))?.kind === 'dir');
      if (!recursive && dir !== undefined) return { stderr: `cp: -r not specified; omitting directory '${dir}'\n`, code: 1 };
      let vfs = shell.vfs;
      for (const source of plan.sources) {
        vfs = copy(vfs, source, plan.dest, flags.has('r') || flags.has('R'));
      }
      return { patch: { vfs } };
    },
  },
  {
    name: 'mv',
    summary: '移動・改名する',
    handler: ({ argv, shell }) => {
      const { operands } = parseArgs(argv);
      const plan = planTransfer(shell, operands, 'mv', '移動元と移動先');
      if ('error' in plan) return plan.error;
      let vfs = shell.vfs;
      for (const source of plan.sources) vfs = move(vfs, source, plan.dest);
      return { patch: { vfs } };
    },
  },
  {
    name: 'find',
    summary: 'パスを再帰的に探す',
    handler: ({ argv, shell }) => {
      const rest = argv.slice(1);
      const nameIndex = rest.indexOf('-name');
      const typeIndex = rest.indexOf('-type');
      const namePattern = nameIndex === -1 ? undefined : rest[nameIndex + 1];
      const typeFilter = typeIndex === -1 ? undefined : rest[typeIndex + 1];
      const start = rest.find((a) => !a.startsWith('-') && a !== namePattern && a !== typeFilter) ?? '.';
      const root = resolve(shell.cwd, start);
      if (!stat(shell.vfs, root)) {
        return { stderr: `find: '${start}': No such file or directory\n`, code: 1 };
      }

      const matches: string[] = [];
      const errors: string[] = [];
      const user = currentUser(shell);
      const groups = currentGroups(shell);
      const walk = (abs: string, display: string): void => {
        const node = stat(shell.vfs, abs);
        if (!node) return;
        const typeOk =
          typeFilter === undefined ||
          (typeFilter === 'f' && node.kind === 'file') ||
          (typeFilter === 'd' && node.kind === 'dir');
        const nameOk = namePattern === undefined || globMatch(namePattern, basename(abs));
        if (typeOk && nameOk) matches.push(display);
        if (node.kind !== 'dir') return;
        // 読めないディレクトリの中は探せない（本物と同じく、そう言って先へ進む）
        if (!allows(metaOf(shell.vfs, abs), user, 'read', groups)) {
          errors.push(`find: '${display}': Permission denied`);
          return;
        }
        for (const child of list(shell.vfs, abs)) {
          walk(`${abs === '/' ? '' : abs}/${child}`, `${display === '/' ? '' : display}/${child}`);
        }
      };
      walk(root, start);
      return {
        ...(matches.length > 0 ? { stdout: fromLines(matches) } : {}),
        ...(errors.length > 0 ? { stderr: fromLines(errors) } : {}),
        code: errors.length > 0 ? 1 : 0,
      };
    },
  },
];

