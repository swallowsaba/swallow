import { resolve } from '../path';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { CHARSET_NAMES, charsetOf, decodeAs, encodeAs, fromBytes, guessCharset, isUtf8, toBytes } from '../bytes';
import { readFile, stat, writeFile } from '../vfs';
import { denied } from './perm';
import { fromLines, parseArgs } from './args';

/**
 * ファイルの 0 と 1 と文字コードを見る・変える命令（file・iconv・nkf・xxd）。
 * found.b.08（文字化け）の実戦が使う。中身の持ち方は ../bytes.ts
 */

type Read = { bytes: Uint8Array } | { error: CommandResult };

/** ファイルを 0 と 1 で読む。名前が無ければ標準入力 */
function readBytes(shell: ShellState, stdin: string, target: string | undefined, command: string): Read {
  if (target === undefined || target === '-') return { bytes: toBytes(stdin) };
  const path = resolve(shell.cwd, target);
  const node = stat(shell.vfs, path);
  if (node === undefined) return { error: { stderr: `${command}: ${target}: No such file or directory\n`, code: 1 } };
  if (node.kind === 'dir') return { error: { stderr: `${command}: ${target}: Is a directory\n`, code: 1 } };
  const blocked = denied(shell, target, 'read', command);
  if (blocked) return { error: blocked };
  return { bytes: toBytes(readFile(shell.vfs, path)) };
}

/** 中身の種類（本物の file の言い方） */
function describe(bytes: Uint8Array): { text: string; mime: string; charset: string } {
  if (bytes.length === 0) return { text: 'empty', mime: 'inode/x-empty', charset: 'binary' };
  // 文字に使わない制御のバイト（タブ・改行・改ページ・ESC などを除く）があれば、文字ではない
  if (bytes.some((b) => (b < 0x20 && ![7, 8, 9, 10, 11, 12, 13, 27].includes(b)) || b === 0x7f)) return { text: 'data', mime: 'application/octet-stream', charset: 'binary' };
  const ascii = bytes.every((b) => b < 0x80);
  const [kind, charset] = ascii
    ? ['ASCII text', 'us-ascii']
    : isUtf8(bytes)
      ? ['Unicode text, UTF-8 text', 'utf-8']
      : bytes.some((b) => b >= 0x80 && b <= 0x9f)
        ? ['Non-ISO extended-ASCII text', 'unknown-8bit']
        : ['ISO-8859 text', 'iso-8859-1'];
  const text = new TextDecoder('latin1').decode(bytes);
  const script = /^#!\s*(\S+)(?:\s+(\S+))?/.exec(text);
  const program = script ? ((script[1] ?? '').endsWith('/env') ? script[2] ?? '' : (script[1] ?? '').split('/').pop() ?? '') : '';
  const lead = { bash: 'Bourne-Again shell script, ', sh: 'POSIX shell script, ', python3: 'Python script, ', python: 'Python script, ' }[program] ?? '';
  const ends = !text.includes('\n') && !text.includes('\r')
    ? ', with no line terminators'
    : text.includes('\r\n')
      ? ', with CRLF line terminators'
      : '';
  return { text: `${lead}${kind}${lead === '' ? '' : ' executable'}${ends}`, mime: lead === '' ? 'text/plain' : program.startsWith('python') ? 'text/x-script.python' : 'text/x-shellscript', charset };
}

/** iconv の誤り（本物の glibc の文） */
const iconvUsage = "Try `iconv --help' or `iconv --usage' for more information.\n";

/** 書き出す。-o があればファイルへ、無ければ標準出力 */
function emit(shell: ShellState, output: string | undefined, text: string, extra: CommandResult = {}): CommandResult {
  if (output === undefined) return { stdout: text, ...extra };
  return { ...extra, patch: { vfs: writeFile(shell.vfs, resolve(shell.cwd, output), text) } };
}

const hex = (b: number, upper: boolean): string => {
  const h = b.toString(16).padStart(2, '0');
  return upper ? h.toUpperCase() : h;
};

/** xxd の 1 行（位置: 組 … 文字）。-b なら 0 と 1 */
function xxdLines(bytes: Uint8Array, start: number, cols: number, group: number, bits: boolean, upper: boolean): string[] {
  const unit = bits ? 8 : 2;
  const groups = group <= 0 ? 1 : Math.ceil(cols / group);
  const per = group <= 0 ? cols : group;
  const width = group <= 0 ? cols * unit + 1 : groups * (per * unit + 1);
  const lines: string[] = [];
  for (let at = 0; at < bytes.length; at += cols) {
    const row = bytes.subarray(at, at + cols);
    let area = '';
    row.forEach((b, i) => {
      area += bits ? b.toString(2).padStart(8, '0') : hex(b, upper);
      if ((i + 1) % per === 0) area += ' ';
    });
    const shown = [...row].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${(start + at).toString(16).padStart(8, '0')}: ${area.padEnd(width)} ${shown}`);
  }
  return lines;
}

const number = (text: string | undefined, fallback: number): number => {
  if (text === undefined) return fallback;
  const n = text.startsWith('0x') ? parseInt(text.slice(2), 16) : Number(text);
  return Number.isFinite(n) ? n : fallback;
};

export const encodingCommands: CommandSpec[] = [
  {
    name: 'file',
    summary: 'ファイルの中身の種類（文字コード）を見る',
    handler: ({ argv, shell }) => {
      const { flags, operands } = parseArgs(argv);
      if (operands.length === 0) return { stderr: 'Usage: file [-bchikLlNnprsSvzZ0] [--apple] [--extension] [--mime-encoding]\n            [--mime-type] [-e <testname>] [-F <separator>]  [-f <namefile>]\n            [-m <magicfiles>] [-P <parameter=value>] [--exclude-quiet]\n            <file> ...\n', code: 1 };
      const brief = flags.has('b') || flags.has('brief');
      const mime = flags.has('i') || flags.has('mime');
      const width = Math.max(...operands.map((o) => o.length)) + 1;
      const lines = operands.map((target) => {
        const node = stat(shell.vfs, resolve(shell.cwd, target));
        let desc: string;
        if (node === undefined) desc = `cannot open \`${target}' (No such file or directory)`;
        else if (node.kind === 'dir') desc = mime ? 'inode/directory; charset=binary' : flags.has('mime-encoding') ? 'binary' : 'directory';
        else {
          const d = describe(toBytes(readFile(shell.vfs, resolve(shell.cwd, target))));
          desc = mime ? `${d.mime}; charset=${d.charset}` : flags.has('mime-encoding') ? d.charset : d.text;
        }
        return brief ? desc : `${`${target}:`.padEnd(width)} ${desc}`;
      });
      return { stdout: fromLines(lines) };
    },
  },
  {
    name: 'iconv',
    summary: '文字コードを変えて読み直す（-f 元の文字コード -t 新しい文字コード）',
    handler: ({ argv, shell, stdin }) => {
      const { flags, values, operands } = parseArgs(argv, { withValue: ['f', 't', 'o', 'from-code', 'to-code', 'output'] });
      if (flags.has('l') || flags.has('list')) {
        return { stdout: `The following list contains all the coded character sets known.  This does\nnot necessarily mean that all combinations of these names can be used for\nthe FROM and TO command line parameters.  One coded character set can be\nlisted with several different names (aliases).\n\n  ${CHARSET_NAMES.map((n) => `${n}//`).join(', ')}\n` };
      }
      const fromName = values.get('f') ?? values.get('from-code') ?? 'UTF-8';
      const toName = values.get('t') ?? values.get('to-code') ?? 'UTF-8';
      const from = charsetOf(fromName);
      const to = charsetOf(toName);
      if (from === undefined && to === undefined) return { stderr: `iconv: conversions from \`${fromName}' and to \`${toName}' are not supported\n${iconvUsage}`, code: 1 };
      if (from === undefined) return { stderr: `iconv: conversion from \`${fromName}' is not supported\n${iconvUsage}`, code: 1 };
      if (to === undefined) return { stderr: `iconv: conversion to \`${toName}' is not supported\n${iconvUsage}`, code: 1 };
      const output = values.get('o') ?? values.get('output');
      let text = '';
      for (const target of operands.length === 0 ? [undefined] : operands) {
        const read = readBytes(shell, stdin, target, 'iconv');
        if ('error' in read) return emit(shell, output, text, read.error);
        // 読めない所・書けない所で止める。そこまでは書き出す（本物と同じ）
        const decoded = decodeAs(read.bytes, from);
        const encoded = encodeAs(decoded.value, to);
        text += fromBytes(encoded.value);
        const at = decoded.error ?? (encoded.error === undefined ? undefined : encodedAt(decoded.value, encoded.error, from));
        if (at !== undefined) return emit(shell, output, text, { stderr: `iconv: illegal input sequence at position ${String(at)}\n`, code: 1 });
      }
      return emit(shell, output, text);
    },
  },
  {
    name: 'nkf',
    summary: '日本語の文字コードを調べる（-g）・変える（-w は UTF-8、-s は Shift_JIS、-e は EUC-JP）',
    handler: ({ argv, shell, stdin }) => {
      const { flags, operands } = parseArgs(argv);
      const targets = operands.length === 0 ? [undefined] : operands;
      if (flags.has('g') || flags.has('guess')) {
        const lines: string[] = [];
        for (const target of targets) {
          const read = readBytes(shell, stdin, target, 'nkf');
          if ('error' in read) return { stdout: fromLines(lines), ...read.error };
          const guess = guessCharset(read.bytes);
          const raw = new TextDecoder('latin1').decode(read.bytes);
          const crlf = raw.includes('\r\n');
          const lf = /(^|[^\r])\n/.test(raw);
          const cr = /\r(?!\n)/.test(raw);
          const ends = [crlf, lf, cr].filter(Boolean).length > 1 ? 'MIXED NL' : crlf ? 'CRLF' : lf ? 'LF' : cr ? 'CR' : '';
          // --guess は改行の形も添える
          const shown = flags.has('guess') && ends !== '' ? `${guess} (${ends})` : guess;
          lines.push(targets.length > 1 && target !== undefined ? `${target}: ${shown}` : shown);
        }
        return { stdout: fromLines(lines) };
      }
      const to = flags.has('s') ? 'SHIFT_JIS' : flags.has('e') ? 'EUC-JP' : 'UTF-8';
      let text = '';
      for (const target of targets) {
        const read = readBytes(shell, stdin, target, 'nkf');
        if ('error' in read) return { stdout: text, ...read.error };
        const guess = guessCharset(read.bytes);
        const from = guess === 'Shift_JIS' ? 'SHIFT_JIS' : guess === 'EUC-JP' ? 'EUC-JP' : 'UTF-8';
        text += fromBytes(encodeAs(decodeAs(read.bytes, from).value, to).value);
      }
      return { stdout: text };
    },
  },
  {
    name: 'xxd',
    summary: 'ファイルの中身を 16 進数（-b なら 0 と 1）で見る',
    handler: ({ argv, shell, stdin }) => {
      const { flags, values, operands } = parseArgs(argv, { withValue: ['l', 'c', 'g', 's', 'len', 'cols', 'groupsize', 'seek'] });
      const read = readBytes(shell, stdin, operands[0], 'xxd');
      if ('error' in read) return read.error;
      const bits = flags.has('b') || flags.has('bits');
      const seek = Math.max(0, number(values.get('s') ?? values.get('seek'), 0));
      const len = number(values.get('l') ?? values.get('len'), Infinity);
      const bytes = read.bytes.subarray(seek, seek + len);
      if (flags.has('p') || flags.has('ps') || flags.has('postscript') || flags.has('plain')) {
        const all = [...bytes].map((b) => hex(b, flags.has('u'))).join('');
        return { stdout: fromLines(all.match(/.{1,60}/g) ?? []) };
      }
      const cols = Math.max(1, number(values.get('c') ?? values.get('cols'), bits ? 6 : 16));
      const group = number(values.get('g') ?? values.get('groupsize'), bits ? 1 : 2);
      return { stdout: fromLines(xxdLines(bytes, seek, cols, group, bits, flags.has('u'))) };
    },
  },
];

/** 書けない文字の位置を、元のファイルのバイトの位置にする（読んだ文字コードで、その文字までを書き直した長さ） */
function encodedAt(decoded: string, utf8At: number, from: Parameters<typeof encodeAs>[1]): number {
  const before = new TextDecoder('utf-8').decode(new TextEncoder().encode(decoded).subarray(0, utf8At));
  return encodeAs(before, from).value.length;
}
