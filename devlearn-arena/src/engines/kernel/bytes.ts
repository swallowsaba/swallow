/**
 * ファイルの中身の 0 と 1（バイト）と、文字コード。純粋な関数。
 *
 * 模擬のファイルの中身は文字列で持つ。UTF-8 として読めないバイト（Shift_JIS で書いたファイルなど）は、
 * 1 バイトを U+DC80〜U+DCFF の 1 文字（対になる片割れの無いサロゲート）に置いて持つ（Python の surrogateescape と同じ考え）。
 * こうすると、パイプ・cp・保存を通しても元のバイトに戻せる。端末に出す時は、読めない 1 バイトを 1 文字の印にする（forDisplay）
 */

const ESCAPE = 0xdc00;

/** 文字列を、ファイルの 0 と 1 にする（UTF-8。置いておいた読めないバイトは元のバイトに戻す） */
export function toBytes(text: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const unit = text.charCodeAt(i);
    if (unit >= 0xdc80 && unit <= 0xdcff) {
      out.push(unit - ESCAPE);
      continue;
    }
    const cp = text.codePointAt(i) ?? unit;
    if (cp > 0xffff) i += 1;
    pushUtf8(out, cp >= 0xd800 && cp <= 0xdfff ? 0xfffd : cp);
  }
  return Uint8Array.from(out);
}

function pushUtf8(out: number[], cp: number): void {
  if (cp < 0x80) out.push(cp);
  else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
  else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
  else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
}

/** ファイルの大きさ（バイト） */
export const byteLength = (text: string): number => toBytes(text).length;

/** 先頭から読める UTF-8 の 1 文字の長さ（読めなければ 0） */
function utf8Length(bytes: Uint8Array, i: number): number {
  const b = bytes[i] ?? 0;
  const cont = (k: number, lo = 0x80, hi = 0xbf): boolean => {
    const c = bytes[i + k];
    return c !== undefined && c >= lo && c <= hi;
  };
  if (b < 0x80) return 1;
  if (b >= 0xc2 && b <= 0xdf) return cont(1) ? 2 : 0;
  if (b === 0xe0) return cont(1, 0xa0) && cont(2) ? 3 : 0;
  // ED の後ろが A0 以上はサロゲート（UTF-8 では書けない）
  if (b === 0xed) return cont(1, 0x80, 0x9f) && cont(2) ? 3 : 0;
  if (b >= 0xe1 && b <= 0xef) return cont(1) && cont(2) ? 3 : 0;
  if (b === 0xf0) return cont(1, 0x90) && cont(2) && cont(3) ? 4 : 0;
  if (b >= 0xf1 && b <= 0xf3) return cont(1) && cont(2) && cont(3) ? 4 : 0;
  if (b === 0xf4) return cont(1, 0x80, 0x8f) && cont(2) && cont(3) ? 4 : 0;
  return 0;
}

/** 0 と 1 を UTF-8 として読む。読めないバイトは、元に戻せる印の文字に置く */
export function fromBytes(bytes: Uint8Array): string {
  let out = '';
  const decoder = new TextDecoder('utf-8');
  for (let i = 0; i < bytes.length; ) {
    const n = utf8Length(bytes, i);
    if (n === 0) {
      out += String.fromCharCode(ESCAPE + (bytes[i] ?? 0));
      i += 1;
      continue;
    }
    out += decoder.decode(bytes.subarray(i, i + n));
    i += n;
  }
  return out;
}

/** UTF-8 として正しく読めるか */
export function isUtf8(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; ) {
    const n = utf8Length(bytes, i);
    if (n === 0) return false;
    i += n;
  }
  return true;
}

/**
 * 端末に出す形。置いておいた読めないバイトは、1 バイトを ? の 1 文字にする（端末によって ? か � で出す）。
 * � は多くの書体に無く、代わりの書体の幅の広い字で描かれて隣の升目に重なるので、升目に収まる ? にする
 */
export const forDisplay = (text: string): string => text.replace(/(?<![\ud800-\udbff])[\udc80-\udcff]/g, '?');

/** 扱える文字コード（iconv の名前） */
export type Charset = 'UTF-8' | 'SHIFT_JIS' | 'EUC-JP' | 'ASCII';

const ALIASES: Readonly<Record<string, Charset>> = {
  'UTF-8': 'UTF-8', UTF8: 'UTF-8',
  SHIFT_JIS: 'SHIFT_JIS', 'SHIFT-JIS': 'SHIFT_JIS', SJIS: 'SHIFT_JIS', MS_KANJI: 'SHIFT_JIS', CSSHIFTJIS: 'SHIFT_JIS', CP932: 'SHIFT_JIS', 'WINDOWS-31J': 'SHIFT_JIS',
  'EUC-JP': 'EUC-JP', EUCJP: 'EUC-JP', UJIS: 'EUC-JP',
  ASCII: 'ASCII', 'US-ASCII': 'ASCII', 'ANSI_X3.4-1968': 'ASCII',
};

/** iconv の名前一覧（iconv -l） */
export const CHARSET_NAMES: readonly string[] = Object.keys(ALIASES).sort();

/** 名前から文字コード。//TRANSLIT などの後ろの印は外す。知らなければ undefined */
export function charsetOf(name: string): Charset | undefined {
  return ALIASES[name.replace(/\/\/.*$/, '').toUpperCase()];
}

/** 2 バイトで書く日本語の文字コードの表（バイトの並び ⇔ 文字）。ブラウザの読み方から、初めて使う時に作る */
interface Table {
  decode: Map<number, string>;
  encode: Map<string, number[]>;
}

const tables = new Map<Charset, Table>();

function buildTable(label: string, singles: [number, number][], leads: [number, number][], trails: [number, number][]): Table {
  const decode = new Map<number, string>();
  const encode = new Map<string, number[]>();
  const tryAdd = (seq: number[]): void => {
    let text: string;
    try {
      text = new TextDecoder(label, { fatal: true }).decode(Uint8Array.from(seq));
    } catch {
      return;
    }
    if ([...text].length !== 1 || text === '\ufffd') return;
    decode.set(seq.reduce((k, b) => k * 256 + b, 0), text);
    if (!encode.has(text)) encode.set(text, seq);
  };
  const within = (b: number, ranges: [number, number][]): boolean => ranges.some(([lo, hi]) => b >= lo && b <= hi);
  for (let b = 0; b < 0x80; b += 1) {
    decode.set(b, String.fromCharCode(b));
    encode.set(String.fromCharCode(b), [b]);
  }
  for (let b = 0x80; b < 0x100; b += 1) if (within(b, singles)) tryAdd([b]);
  for (let a = 0x80; a < 0x100; a += 1) {
    if (!within(a, leads)) continue;
    for (let b = 0x40; b < 0x100; b += 1) if (within(b, trails)) tryAdd([a, b]);
  }
  return { decode, encode };
}

function tableOf(charset: 'SHIFT_JIS' | 'EUC-JP'): Table {
  const known = tables.get(charset);
  if (known) return known;
  const made = charset === 'SHIFT_JIS'
    ? buildTable('shift_jis', [[0xa1, 0xdf]], [[0x81, 0x9f], [0xe0, 0xfc]], [[0x40, 0x7e], [0x80, 0xfc]])
    : buildTable('euc-jp', [], [[0x8e, 0x8e], [0xa1, 0xfe]], [[0xa1, 0xfe]]);
  tables.set(charset, made);
  return made;
}

/** 変換の結果。読めない・書けない所があれば、その手前までの結果と位置（バイト） */
export interface Converted<T> {
  value: T;
  error?: number;
}

/** 0 と 1 を、その文字コードで読む */
export function decodeAs(bytes: Uint8Array, charset: Charset): Converted<string> {
  if (charset === 'UTF-8') {
    let i = 0;
    while (i < bytes.length) {
      const n = utf8Length(bytes, i);
      if (n === 0) break;
      i += n;
    }
    const value = new TextDecoder('utf-8').decode(bytes.subarray(0, i));
    return i < bytes.length ? { value, error: i } : { value };
  }
  if (charset === 'ASCII') {
    const end = bytes.findIndex((b) => b >= 0x80);
    const value = String.fromCharCode(...bytes.subarray(0, end === -1 ? bytes.length : end));
    return end === -1 ? { value } : { value, error: end };
  }
  const { decode } = tableOf(charset);
  let value = '';
  for (let i = 0; i < bytes.length; ) {
    const one = decode.get(bytes[i] ?? 0);
    if (one !== undefined) {
      value += one;
      i += 1;
      continue;
    }
    const two = i + 1 < bytes.length ? decode.get((bytes[i] ?? 0) * 256 + (bytes[i + 1] ?? 0)) : undefined;
    if (two === undefined) return { value, error: i };
    value += two;
    i += 2;
  }
  return { value };
}

/** 文字列を、その文字コードの 0 と 1 にする。書けない文字があれば、その手前まで（位置は元の文字列の UTF-8 のバイト） */
export function encodeAs(text: string, charset: Charset): Converted<Uint8Array> {
  if (charset === 'UTF-8') return { value: new TextEncoder().encode(text) };
  const out: number[] = [];
  let at = 0;
  for (const ch of text) {
    const seq = charset === 'ASCII' ? (ch.charCodeAt(0) < 0x80 ? [ch.charCodeAt(0)] : undefined) : tableOf(charset).encode.get(ch);
    if (seq === undefined) return { value: Uint8Array.from(out), error: at };
    out.push(...seq);
    at += new TextEncoder().encode(ch).length;
  }
  return { value: Uint8Array.from(out) };
}

/** 日本語の文字コードの見当を付ける（nkf -g と同じ考え）。どれでも読めなければ BINARY */
export function guessCharset(bytes: Uint8Array): 'ASCII' | 'UTF-8' | 'Shift_JIS' | 'EUC-JP' | 'BINARY' {
  if (bytes.every((b) => b < 0x80)) return 'ASCII';
  if (isUtf8(bytes)) return 'UTF-8';
  const sjis = decodeAs(bytes, 'SHIFT_JIS').error === undefined;
  const euc = decodeAs(bytes, 'EUC-JP').error === undefined;
  // どちらでも読める時は、Shift_JIS にしか無い先頭のバイト（0x81〜0x9F。ひらがなは 0x82）で決める
  if (sjis && (!euc || bytes.some((b) => b >= 0x81 && b <= 0x9f))) return 'Shift_JIS';
  if (euc) return 'EUC-JP';
  return 'BINARY';
}
