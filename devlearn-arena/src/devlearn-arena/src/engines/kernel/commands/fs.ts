import { globMatch } from '../glob';
import { basename, HOME, resolve } from '../path';
import type { CommandSpec } from '../registry';
import { copy, list, mkdir, move, readFile, remove, stat, touch, VfsError } from '../vfs';
import { fromLines, parseArgs } from './args';

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
        let names = node.kind === 'dir' ? list(shell.vfs, path) : [basename(path)];
        if (all && node.kind === 'dir') names = ['.', '..', ...names];
        if (!all) names = names.filter((n) => !n.startsWith('.'));

        const rows = names.map((name) => {
          const childPath = node.kind === 'dir' ? resolve(path, name) : path;
          const child = stat(shell.vfs, childPath);
          const dir = child?.kind === 'dir';
          if (!long) return dir ? `${name}/` : name;
          const size = child?.kind === 'file' ? child.content.length : 0;
          const mode = dir ? 'drwxr-xr-x' : '-rw-r--r--';
          return `${mode} 1 learner learner ${String(size).padStart(6)} ${name}${dir ? '/' : ''}`;
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
      let out = '';
      for (const target of operands) {
        out += readFile(shell.vfs, resolve(shell.cwd, target));
      }
      return { stdout: out };
    },
  },
  {
    name: 'mkdir',
    summary: 'ディレクトリを作る',
    handler: ({ argv, shell }) => {
      const { flags, operands } = parseArgs(argv);
      if (operands.length === 0) return { stderr: 'mkdir: missing operand\n', code: 1 };
      let vfs = shell.vfs;
      for (const target of operands) vfs = mkdir(vfs, resolve(shell.cwd, target), flags.has('p'));
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
      for (const target of operands) vfs = touch(vfs, resolve(shell.cwd, target));
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
      const source = operands[0];
      const dest = operands[1];
      if (source === undefined || dest === undefined) return { stderr: 'cp: missing file operand\n', code: 1 };
      const vfs = copy(shell.vfs, resolve(shell.cwd, source), resolve(shell.cwd, dest), flags.has('r') || flags.has('R'));
      return { patch: { vfs } };
    },
  },
  {
    name: 'mv',
    summary: '移動・改名する',
    handler: ({ argv, shell }) => {
      const { operands } = parseArgs(argv);
      const source = operands[0];
      const dest = operands[1];
      if (source === undefined || dest === undefined) return { stderr: 'mv: missing file operand\n', code: 1 };
      const vfs = move(shell.vfs, resolve(shell.cwd, source), resolve(shell.cwd, dest));
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
        for (const child of list(shell.vfs, abs)) {
          walk(`${abs === '/' ? '' : abs}/${child}`, `${display === '/' ? '' : display}/${child}`);
        }
      };
      walk(root, start);
      return { stdout: fromLines(matches) };
    },
  },
];

