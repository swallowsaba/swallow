import type { Command, CommandList, CompoundCommand, SimpleCommand, Word } from './ast';
import type { MutableClock } from './clock';
import { expandWord, expandWordFields, type ExpandContext } from './expand';
import { expandBraces } from './brace';
import { expandGlob, hasMagic } from './glob';
import { parse } from './parser';
import type { CommandRegistry, CommandResult, EditorRequest, RunLineResult, ShellState } from './registry';
import { findScript, scriptText, withoutPositional, withPositional } from './script';
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
  /** 画面側にエディタを開かせる要求 */
  editor: EditorRequest | null;
}

export const EXIT_NOT_FOUND = 127;
/** 書いた物を捨て、読むと空のファイル */
export const DEV_NULL = '/dev/null';
/** スクリプトの中で入れ子に呼び出せる深さ。無限再帰を止めるため */
const MAX_SCRIPT_DEPTH = 8;
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

const isCompound = (c: Command): c is CompoundCommand => c.kind !== undefined;

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

/** 語を、展開 → 単語分割 → ブレース展開 → パス名展開 の順（bash と同じ順序）で引数の並びにする */
function expandArgs(words: readonly Word[], state: ShellState, expandCtx: ExpandContext): string[] {
  const argv: string[] = [];
  for (const word of words) {
    for (const field of expandWordFields(word, expandCtx)) {
      const braced = word.quoted ? [field] : expandBraces(field);
      for (const item of braced) {
        if (word.quoted || !hasMagic(item)) {
          argv.push(item);
          continue;
        }
        const matches = expandGlob(state.vfs, state.cwd, item);
        // 一致が無ければパターンをそのまま渡す（bash の既定動作）
        if (matches.length === 0) argv.push(item);
        else argv.push(...matches);
      }
    }
  }
  return argv;
}

/** 終わりの印。exit を打った（その終了コード）。スクリプトと組み立ての形を、そこで抜ける */
const EXIT_VAR = '__EXIT';
/** set -e の印。スクリプトの中で、失敗したらそこで止まる */
const ERREXIT_VAR = '__ERREXIT';
/** 繰り返しの上限（止まらない while を止める） */
const MAX_LOOP = 1000;

const exiting = (state: ShellState): boolean => state.vars.has(EXIT_VAR);

function withoutVars(state: ShellState, names: readonly string[]): ShellState {
  if (names.every((n) => !state.vars.has(n))) return state;
  const vars = new Map(state.vars);
  for (const n of names) vars.delete(n);
  return { ...state, vars };
}

/** 組み立ての形（if・for・while）を動かす。中の出力はまとめて返し、最後にリダイレクトを当てる */
function runCompound(
  command: CompoundCommand,
  initial: ShellState,
  registry: CommandRegistry,
  clock: MutableClock,
): { state: ShellState; result: CommandResult } {
  let state = initial;
  let stdout = '';
  let stderr = '';
  let code = 0;
  const take = (outcome: ExecOutcome): number => {
    state = outcome.state;
    for (const c of outcome.chunks) {
      if (c.stream === 'stdout') stdout += c.text;
      else stderr += c.text;
    }
    return outcome.exitCode;
  };
  if (command.kind === 'if') {
    let ran = false;
    for (const clause of command.clauses) {
      const ok = take(runList(state, clause.cond, registry, clock, true)) === 0;
      if (exiting(state)) break;
      if (!ok) continue;
      code = take(runList(state, clause.body, registry, clock));
      ran = true;
      break;
    }
    if (!ran && !exiting(state) && command.otherwise) code = take(runList(state, command.otherwise, registry, clock));
  } else if (command.kind === 'for') {
    const values = command.words === null
      ? (state.vars.get('@') ?? '').split(' ').filter((v) => v !== '')
      : expandArgs(command.words, state, makeExpandContext(state, registry, clock));
    for (const value of values.slice(0, MAX_LOOP)) {
      state = { ...state, vars: new Map([...state.vars, [command.name, value]]) };
      code = take(runList(state, command.body, registry, clock));
      if (exiting(state)) break;
    }
  } else {
    for (let n = 0; n < MAX_LOOP; n += 1) {
      const holds = take(runList(state, command.cond, registry, clock, true)) === 0;
      if (exiting(state) || holds === command.until) break;
      code = take(runList(state, command.body, registry, clock));
      if (exiting(state)) break;
    }
  }
  const shim: SimpleCommand = { words: [], redirects: command.redirects };
  return applyRedirects(state, shim, makeExpandContext(state, registry, clock), { stdout, stderr, code }, command.kind);
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

  let argv: string[];
  try {
    argv = expandArgs(command.words, state, expandCtx);
  } catch (error) {
    // 展開の誤り（閉じていない ${・0 で割った $(( )) など）は、その行のエラーにする
    return { state, result: { stderr: `bash: ${error instanceof Error ? error.message : String(error)}\n`, code: EXIT_ERROR } };
  }
  const name = argv[0];

  // 代入のみの行（FOO=bar）
  if (name !== undefined && argv.length === 1 && /^[A-Za-z_][A-Za-z0-9_]*=/.test(name)) {
    const eq = name.indexOf('=');
    const vars = new Map(state.vars);
    vars.set(name.slice(0, eq), name.slice(eq + 1));
    return { state: { ...state, vars }, result: { code: 0 } };
  }

  // コマンドの無い `> file` は、ファイルを空にする（実シェルと同じ）
  if (name === undefined) {
    const only = command.redirects.find((r) => r.kind === '>' || r.kind === '>>');
    if (!only) return { state, result: { code: 0 } };
    const path = at(state.cwd, expandWord(only.target, expandCtx));
    try {
      const vfs = only.kind === '>' ? writeFile(state.vfs, path, '') : appendFile(state.vfs, path, '');
      return { state: { ...state, vfs }, result: { code: 0 } };
    } catch (error) {
      if (error instanceof VfsError) {
        return { state, result: { stderr: `${vfsMessage('bash', error)}\n`, code: EXIT_ERROR } };
      }
      throw error;
    }
  }

  const spec = registry.get(name);
  // 組み込みに無ければ、実行できるファイルを探して走らせる
  const script = spec ? null : findScript(state, name);
  // 起動そのものに失敗した場合。この文言もリダイレクトの対象になる（本物と同じ）
  const launchError: CommandResult | null =
    !spec && script === null
      ? { stderr: `${name}: command not found\n`, code: EXIT_NOT_FOUND }
      : script?.denied === true
        ? { stderr: `${name}: Permission denied\n`, code: 126 }
        : null;
  if (launchError !== null) {
    return applyRedirects(state, command, expandCtx, launchError, name);
  }

  // 標準入力: << > < > パイプ の順で決める
  let stdin = pipedStdin;
  if (command.heredoc !== undefined) stdin = command.heredoc;
  const inputRedirect = command.redirects.find((r) => r.kind === '<');
  if (inputRedirect) {
    const path = at(state.cwd, expandWord(inputRedirect.target, expandCtx));
    try {
      stdin = path === DEV_NULL ? '' : readFile(state.vfs, path);
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
  let scriptState: ShellState | null = null;
  try {
    if (script !== null) {
      const ran = runScript(state, script.path, script.content, argv.slice(1), registry, clock);
      result = ran.result;
      scriptState = ran.state;
    } else if (spec) {
      result = spec.handler({ argv, stdin, shell: state, clock, registry, runLine });
    } else {
      result = { code: EXIT_NOT_FOUND };
    }
  } catch (error) {
    // 失敗の文言もリダイレクトの対象になる
    const message =
      error instanceof VfsError
        ? vfsMessage(name, error)
        : `${name}: ${error instanceof Error ? error.message : String(error)}`;
    return applyRedirects(
      state,
      command,
      expandCtx,
      { stderr: `${message}\n`, code: EXIT_ERROR },
      name,
    );
  }

  return applyRedirects(
    applyPatch(scriptState ?? state, result.patch),
    command,
    expandCtx,
    result,
    name,
  );
}

/**
 * 出力リダイレクトを書いた順に処理する。
 * `> a 2> b` も `&> c` も、起動に失敗したときの文言も、同じ道を通る。
 */
function applyRedirects(
  initial: ShellState,
  command: SimpleCommand,
  expandCtx: ExpandContext,
  initialResult: CommandResult,
  name: string,
): { state: ShellState; result: CommandResult } {
  let nextState = initial;
  let result = initialResult;
  for (const redirect of command.redirects) {
    if (redirect.kind === '<') continue;
    const append = redirect.kind.endsWith('>>');
    const takesOut = redirect.kind !== '2>' && redirect.kind !== '2>>';
    const takesErr = redirect.kind.startsWith('2') || redirect.kind.startsWith('&');
    const path = at(nextState.cwd, expandWord(redirect.target, expandCtx));
    if (path === DEV_NULL) {
      // 書いた物は捨てる
      result = { ...result, ...(takesOut ? { stdout: '' } : {}), ...(takesErr ? { stderr: '' } : {}) };
      continue;
    }
    const text = `${takesOut ? (result.stdout ?? '') : ''}${takesErr ? (result.stderr ?? '') : ''}`;
    try {
      const vfs = append
        ? appendFile(nextState.vfs, path, text)
        : writeFile(nextState.vfs, path, text);
      nextState = { ...nextState, vfs };
      result = {
        ...result,
        ...(takesOut ? { stdout: '' } : {}),
        ...(takesErr ? { stderr: '' } : {}),
      };
    } catch (error) {
      if (error instanceof VfsError) {
        return { state: nextState, result: { stderr: `${vfsMessage(name, error)}\n`, code: EXIT_ERROR } };
      }
      throw error;
    }
  }

  return { state: nextState, result };
}

/**
 * ファイルに書かれた手順を上から順に実行する。
 * 位置パラメータ（$1, $2, $#）はスクリプトの中だけで見えるようにする。
 */
function runScript(
  state: ShellState,
  path: string,
  content: string,
  args: readonly string[],
  registry: CommandRegistry,
  clock: MutableClock,
): { state: ShellState; result: CommandResult } {
  const depth = Number(state.vars.get('SHLVL') ?? '0');
  if (depth >= MAX_SCRIPT_DEPTH) {
    return { state, result: { stderr: `${path}: 呼び出しが深すぎます\n`, code: EXIT_ERROR } };
  }

  let inner = withPositional(state, path, args);
  inner = { ...inner, vars: new Map([...inner.vars, ['SHLVL', String(depth + 1)]]) };

  let stdout = '';
  let stderr = '';
  let code = 0;
  try {
    const outcome = runList(inner, parse(scriptText(content)), registry, clock);
    inner = outcome.state;
    for (const chunk of outcome.chunks) {
      if (chunk.stream === 'stdout') stdout += chunk.text;
      else stderr += chunk.text;
    }
    code = outcome.exitCode;
  } catch (error) {
    if (!(error instanceof ParseError)) throw error;
    stderr += `${path}: syntax error: ${error.message}\n`;
    code = 2;
  }
  // exit で抜けたなら、その番号で終わる。終わりの印と set -e は、呼んだ側に持ち出さない
  const exited = inner.vars.get(EXIT_VAR);
  if (exited !== undefined) code = Number(exited);
  inner = withoutVars(inner, [EXIT_VAR, ERREXIT_VAR]);

  const after = withoutPositional(inner, state);
  const vars = new Map(after.vars);
  if (state.vars.has('SHLVL')) vars.set('SHLVL', state.vars.get('SHLVL') ?? '0');
  else vars.delete('SHLVL');
  // スクリプトの中で移動しても、呼び出し元の場所は変わらない
  return { state: { ...after, vars, cwd: state.cwd }, result: { stdout, stderr, code } };
}

/** condition は if・while の条件の中（set -e で止めない） */
function runList(
  initial: ShellState,
  list: CommandList,
  registry: CommandRegistry,
  clock: MutableClock,
  condition = false,
): ExecOutcome {
  let state = initial;
  const chunks: OutputChunk[] = [];
  let exitCode = 0;
  let skipNext = false;
  let editor: EditorRequest | null = null;

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
        const step = isCompound(command)
          ? runCompound(command, state, registry, clock)
          : runCommand(command, state, registry, clock, pipedStdin);
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
        if (step.result.editor !== undefined) editor = step.result.editor;
        state = { ...state, lastExit: exitCode };
        if (exiting(state)) break;
      }
      if (exiting(state)) {
        exitCode = Number(state.vars.get(EXIT_VAR));
        break;
      }
      // set -e: && や || の途中でなく、条件の中でもない所で失敗したら、そこで止まる
      const chainEnd = item.connector !== '&&' && item.connector !== '||';
      if (chainEnd && !condition && exitCode !== 0 && state.vars.get(ERREXIT_VAR) === '1') {
        state = { ...state, vars: new Map([...state.vars, [EXIT_VAR, String(exitCode)]]) };
        break;
      }
    }
    if (item.connector === '&&') skipNext = exitCode !== 0;
    else if (item.connector === '||') skipNext = exitCode === 0;
    else skipNext = false;
  }

  return { state, chunks, exitCode, editor };
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
  if (trimmed === '') return { state: withHistory, chunks: [], exitCode: state.lastExit, editor: null };

  let list: CommandList;
  try {
    list = parse(input);
  } catch (error) {
    const message = error instanceof ParseError ? error.message : String(error);
    return {
      state: { ...withHistory, lastExit: EXIT_ERROR },
      chunks: [{ stream: 'stderr', text: `syntax error: ${message}\n` }],
      exitCode: EXIT_ERROR,
      editor: null,
    };
  }

  const outcome = runList(withHistory, list, registry, clock);
  // 端末で打った exit と set -e は、その行で終わるだけにする（端末は閉じない）
  const settled = withoutVars(outcome.state, [EXIT_VAR, ERREXIT_VAR]);
  return { ...outcome, state: appendHistoryFile({ ...settled, lastExit: outcome.exitCode }, input) };
}

/**
 * HISTFILE（~/.bash_history）があれば、打った行を足す。
 * 実戦の「打ったことが記録される」を、端末の状態（ファイル）で確かめるため。本物は終わる時にまとめて書くが、ここでは打つたびに書く
 */
function appendHistoryFile(state: ShellState, input: string): ShellState {
  const file = state.vars.get('HISTFILE');
  if (file === undefined || file === '') return state;
  try {
    return { ...state, vfs: appendFile(state.vfs, at(state.cwd, file), `${input.trim()}\n`) };
  } catch (error) {
    if (error instanceof VfsError) return state;
    throw error;
  }
}
