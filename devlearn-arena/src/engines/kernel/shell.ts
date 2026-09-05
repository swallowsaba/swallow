import type { CommandList, SimpleCommand } from './ast';
import type { MutableClock } from './clock';
import { expandWord, expandWordFields, type ExpandContext } from './expand';
import { expandGlob, hasMagic } from './glob';
import { parse } from './parser';
import type { CommandRegistry, CommandResult, RunLineResult, ShellState } from './registry';
import { ParseError } from './tokenizer';
import { appendFile, at, readFile, VfsError, writeFile } from './vfs';

export interface OutputChunk {
  stream: 'stdout' | 'stderr';
  text: string;
}

export interface ExecOutcome {
  state: ShellState;
  chunks: OutputChunk[];
  exitCode: number;
}

export const EXIT_NOT_FOUND = 127;
export const EXIT_ERROR = 1;

function vfsMessage(command: string, error: VfsError): string {
  const map: Record<string, string> = {
    ENOENT: 'No such file or directory',
    EEXIST: 'File exists',
    ENOTDIR: 'Not a directory',
    EISDIR: 'Is a directory',
    ENOTEMPTY: 'Directory not empty',
  };
  return `${command}: ${error.path}: ${map[error.code] ?? error.code}`;
}

function makeExpandContext(state: ShellState, registry: CommandRegistry, clock: MutableClock): ExpandContext {
  return {
    vars: state.vars,
    lastExit: state.lastExit,
    runSubshell: (input) => {
      const result = runList(state, parse(input), registry, clock);
      return result.chunks
        .filter((c) => c.stream === 'stdout')
        .map((c) => c.text)
        .join('');
    },
  };
}

function applyPatch(state: ShellState, patch: Partial<ShellState> | undefined): ShellState {
  if (!patch) return state;
  return { ...state, ...patch };
}

function runCommand(
  command: SimpleCommand,
  state: ShellState,
  registry: CommandRegistry,
  clock: MutableClock,
  pipedStdin: string,
): { state: ShellState; result: CommandResult } {
  const expandCtx = makeExpandContext(state, registry, clock);

  // 展開 → 単語分割 → パス名展開 の順（bash と同じ順序）
  const argv: string[] = [];
  for (const word of command.words) {
    for (const field of expandWordFields(word, expandCtx)) {
      if (word.quoted || !hasMagic(field)) {
        argv.push(field);
        continue;
      }
      const matches = expandGlob(state.vfs, state.cwd, field);
      // 一致が無ければパターンをそのまま渡す（bash の既定動作）
      if (matches.length === 0) argv.push(field);
      else argv.push(...matches);
    }
  }
  const name = argv[0];

  // 代入のみの行（FOO=bar）
  if (name !== undefined && argv.length === 1 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(name)) {
    const eq = name.indexOf('=');
    const vars = new Map(state.vars);
    vars.set(name.slice(0, eq), name.slice(eq + 1));
    return { state: { ...state, vars }, result: { code: 0 } };
  }

  if (name === undefined) return { state, result: { code: 0 } };

  const spec = registry.get(name);
  if (!spec) {
    return { state, result: { stderr: `${name}: command not found\n`, code: EXIT_NOT_FOUND } };
  }

  // 標準入力: << > < > パイプ の順で決める
  let stdin = pipedStdin;
  if (command.heredoc !== undefined) stdin = command.heredoc;
  const inputRedirect = command.redirects.find((r) => r.kind === '<');
  if (inputRedirect) {
    const path = at(state.cwd, expandWord(inputRedirect.target, expandCtx));
    try {
      stdin = readFile(state.vfs, path);
    } catch (error) {
      if (error instanceof VfsError) {
        return { state, result: { stderr: `${vfsMessage(name, error)}\n`, code: EXIT_ERROR } };
      }
      throw error;
    }
  }

  const runLine = (line: string, from: ShellState = state): RunLineResult => {
    const outcome = runList(from, parse(line), registry, clock);
    const pick = (stream: 'stdout' | 'stderr'): string =>
      outcome.chunks.filter((c) => c.stream === stream).map((c) => c.text).join('');
    return { stdout: pick('stdout'), stderr: pick('stderr'), code: outcome.exitCode, state: outcome.state };
  };

  let result: CommandResult;
  try {
    result = spec.handler({ argv, stdin, shell: state, clock, registry, runLine });
  } catch (error) {
    if (error instanceof VfsError) {
      return { state, result: { stderr: `${vfsMessage(name, error)}\n`, code: EXIT_ERROR } };
    }
    const message = error instanceof Error ? error.message : String(error);
    return { state, result: { stderr: `${name}: ${message}\n`, code: EXIT_ERROR } };
  }

  let nextState = applyPatch(state, result.patch);

  // 出力リダイレクト
  const outRedirect = command.redirects.find((r) => r.kind === '>' || r.kind === '>>');
  if (outRedirect) {
    const path = at(nextState.cwd, expandWord(outRedirect.target, expandCtx));
    const text = result.stdout ?? '';
    try {
      const vfs =
        outRedirect.kind === '>'
          ? writeFile(nextState.vfs, path, text)
          : appendFile(nextState.vfs, path, text);
      nextState = { ...nextState, vfs };
      result = { ...result, stdout: '' };
    } catch (error) {
      if (error instanceof VfsError) {
        return { state: nextState, result: { stderr: `${vfsMessage(name, error)}\n`, code: EXIT_ERROR } };
      }
      throw error;
    }
  }

  return { state: nextState, result };
}

function runList(
  initial: ShellState,
  list: CommandList,
  registry: CommandRegistry,
  clock: MutableClock,
): ExecOutcome {
  let state = initial;
  const chunks: OutputChunk[] = [];
  let exitCode = 0;
  let skipNext = false;

  for (const item of list.items) {
    if (!skipNext) {
      let pipedStdin = '';
      // パイプの各段はサブシェル。ファイルシステムへの変更は残るが、
      // cwd と変数はパイプライン全体の外へ漏らさない（bash と同じ）
      const isPipeline = item.pipeline.commands.length > 1;
      const entryCwd = state.cwd;
      const entryVars = state.vars;
      for (const [index, command] of item.pipeline.commands.entries()) {
        const isLast = index === item.pipeline.commands.length - 1;
        const step = runCommand(command, state, registry, clock, pipedStdin);
        state = isPipeline ? { ...step.state, cwd: entryCwd, vars: entryVars } : step.state;
        exitCode = step.result.code ?? 0;
        if (step.result.stderr !== undefined && step.result.stderr !== '') {
          chunks.push({ stream: 'stderr', text: step.result.stderr });
        }
        const stdout = step.result.stdout ?? '';
        if (isLast) {
          if (stdout !== '') chunks.push({ stream: 'stdout', text: stdout });
        } else {
          pipedStdin = stdout;
        }
        state = { ...state, lastExit: exitCode };
      }
    }
    if (item.connector === '&&') skipNext = exitCode !== 0;
    else if (item.connector === '||') skipNext = exitCode === 0;
    else skipNext = false;
  }

  return { state, chunks, exitCode };
}

/** 1行（またはヒアドキュメント付き複数行）を実行する。 */
export function execute(
  state: ShellState,
  input: string,
  registry: CommandRegistry,
  clock: MutableClock,
): ExecOutcome {
  const trimmed = input.trim();
  const history = trimmed === '' ? state.history : [...state.history, input];
  const withHistory: ShellState = { ...state, history };
  if (trimmed === '') return { state: withHistory, chunks: [], exitCode: state.lastExit };

  let list: CommandList;
  try {
    list = parse(input);
  } catch (error) {
    const message = error instanceof ParseError ? error.message : String(error);
    return {
      state: { ...withHistory, lastExit: EXIT_ERROR },
      chunks: [{ stream: 'stderr', text: `syntax error: ${message}\n` }],
      exitCode: EXIT_ERROR,
    };
  }

  const outcome = runList(withHistory, list, registry, clock);
  return { ...outcome, state: { ...outcome.state, lastExit: outcome.exitCode } };
}
