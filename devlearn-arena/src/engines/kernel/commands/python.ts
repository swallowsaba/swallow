import { runPython } from '@/engines/python/interp';
import { resolve } from '../path';
import type { CommandContext, CommandResult, CommandSpec } from '../registry';
import { exists, isDir, readFile, writeFile } from '../vfs';

/** python3（docs/learning-design.md 6 章）。ファイルか -c の文を動かす。対話の入口は端末に無いので、入力が無ければ本物と同じく何もせず終わる */

function python3({ argv, shell, stdin }: CommandContext): CommandResult {
  const args = argv.slice(1);
  if (args[0] === '--version' || args[0] === '-V') return { stdout: 'Python 3.13.1\n' };
  let source: string;
  let file: string;
  if (args[0] === '-c') {
    if (args[1] === undefined) return { stderr: 'Argument expected for the -c option\nusage: python3 [option] ... [-c cmd | -m mod | file | -] [arg] ...\nTry `python -h\' for more information.\n', code: 2 };
    source = args[1];
    file = '<string>';
  } else if (args[0] === undefined || args[0] === '-') {
    source = stdin;
    file = '<stdin>';
  } else {
    const path = resolve(shell.cwd, args[0]);
    if (!exists(shell.vfs, path)) return { stderr: `python3: can't open file '${path}': [Errno 2] No such file or directory\n`, code: 2 };
    if (isDir(shell.vfs, path)) return { stderr: `python3: can't find '__main__' module in '${path}'\n`, code: 1 };
    source = readFile(shell.vfs, path);
    file = path;
  }
  let vfs = shell.vfs;
  const r = runPython(source, file, {
    read: (p) => {
      const at = resolve(shell.cwd, p);
      return exists(vfs, at) && !isDir(vfs, at) ? readFile(vfs, at) : null;
    },
    write: (p, content) => { vfs = writeFile(vfs, resolve(shell.cwd, p), content); },
  });
  return { stdout: r.stdout, stderr: r.stderr, code: r.code, ...(vfs === shell.vfs ? {} : { patch: { vfs } }), stderrLast: true };
}

export const pythonCommands: CommandSpec[] = [
  { name: 'python3', summary: 'Python のプログラムを動かす', handler: python3 },
];
