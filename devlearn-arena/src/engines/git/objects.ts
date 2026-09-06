import { sha1 } from '@noble/hashes/sha1';

/**
 * Git のオブジェクト。
 * 出力を作り置きせず、本物と同じ形式でシリアライズして SHA-1 を計算する。
 * ヘッダは `"{type} {byteLength}\0"`。これが本物と一致することが前提条件。
 */
export type GitObjectType = 'blob' | 'tree' | 'commit' | 'tag';

export interface TreeEntry {
  /** '100644'(通常) '100755'(実行可) '040000'(ディレクトリ) '120000'(symlink) */
  mode: string;
  name: string;
  /** 40桁の16進 */
  hash: string;
}

export interface CommitData {
  tree: string;
  parents: readonly string[];
  author: Signature;
  committer: Signature;
  message: string;
}

export interface Signature {
  name: string;
  email: string;
  /** UNIX 秒。仮想時計から渡す */
  timestamp: number;
  /** '+0900' の形式 */
  timezone: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encode(text: string): Uint8Array {
  return encoder.encode(text);
}

export function decode(bytes: Uint8Array): string {
  return decoder.decode(bytes);
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/** `{type} {size}\0{body}` を組み立てる */
export function serialize(type: GitObjectType, body: Uint8Array): Uint8Array {
  return concat([encode(`${type} ${String(body.length)}\0`), body]);
}

/** 本物の git hash-object と同じ値を返す */
export function hashObject(type: GitObjectType, body: Uint8Array): string {
  return toHex(sha1(serialize(type, body)));
}

export function hashBlob(content: string): string {
  return hashObject('blob', encode(content));
}

/**
 * tree の本体。エントリは `{mode} {name}\0{20バイトのSHA}` を連結したもの。
 * 並び順は名前の昇順（ディレクトリは名前の後ろに '/' を補って比較する）。
 */
export function serializeTree(entries: readonly TreeEntry[]): Uint8Array {
  const sorted = [...entries].sort((a, b) => {
    const ka = a.mode === '040000' ? `${a.name}/` : a.name;
    const kb = b.mode === '040000' ? `${b.name}/` : b.name;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });
  return concat(
    sorted.flatMap((e) => [encode(`${e.mode} ${e.name}\0`), fromHex(e.hash)]),
  );
}

export function parseTree(body: Uint8Array): TreeEntry[] {
  const entries: TreeEntry[] = [];
  let i = 0;
  while (i < body.length) {
    const nul = body.indexOf(0, i);
    if (nul === -1) break;
    const header = decode(body.slice(i, nul));
    const space = header.indexOf(' ');
    const mode = header.slice(0, space);
    const name = header.slice(space + 1);
    const hash = toHex(body.slice(nul + 1, nul + 21));
    entries.push({ mode, name, hash });
    i = nul + 21;
  }
  return entries;
}

function formatSignature(s: Signature): string {
  return `${s.name} <${s.email}> ${String(s.timestamp)} ${s.timezone}`;
}

export function serializeCommit(commit: CommitData): Uint8Array {
  const lines = [`tree ${commit.tree}`];
  for (const parent of commit.parents) lines.push(`parent ${parent}`);
  lines.push(`author ${formatSignature(commit.author)}`);
  lines.push(`committer ${formatSignature(commit.committer)}`);
  lines.push('');
  lines.push(commit.message.endsWith('\n') ? commit.message : `${commit.message}\n`);
  return encode(lines.join('\n'));
}

export function parseCommit(body: Uint8Array): CommitData {
  const text = decode(body);
  const separator = text.indexOf('\n\n');
  const header = separator === -1 ? text : text.slice(0, separator);
  const message = separator === -1 ? '' : text.slice(separator + 2);

  let tree = '';
  const parents: string[] = [];
  let author: Signature | null = null;
  let committer: Signature | null = null;

  for (const line of header.split('\n')) {
    const space = line.indexOf(' ');
    if (space === -1) continue;
    const key = line.slice(0, space);
    const value = line.slice(space + 1);
    if (key === 'tree') tree = value;
    else if (key === 'parent') parents.push(value);
    else if (key === 'author') author = parseSignature(value);
    else if (key === 'committer') committer = parseSignature(value);
  }

  const fallback: Signature = { name: '', email: '', timestamp: 0, timezone: '+0000' };
  return { tree, parents, author: author ?? fallback, committer: committer ?? fallback, message };
}

function parseSignature(value: string): Signature {
  const match = /^(.*) <([^>]*)> (\d+) ([+-]\d{4})$/.exec(value);
  if (!match) return { name: value, email: '', timestamp: 0, timezone: '+0000' };
  return {
    name: match[1] ?? '',
    email: match[2] ?? '',
    timestamp: Number(match[3] ?? '0'),
    timezone: match[4] ?? '+0000',
  };
}

/** オブジェクトDB。内容が同じなら同じ鍵になる（content addressing） */
export class ObjectStore {
  private readonly objects = new Map<string, { type: GitObjectType; body: Uint8Array }>();

  write(type: GitObjectType, body: Uint8Array): string {
    const hash = hashObject(type, body);
    if (!this.objects.has(hash)) this.objects.set(hash, { type, body });
    return hash;
  }

  has(hash: string): boolean {
    return this.objects.has(hash);
  }

  read(hash: string): { type: GitObjectType; body: Uint8Array } | undefined {
    return this.objects.get(hash);
  }

  size(): number {
    return this.objects.size;
  }

  hashes(): string[] {
    return [...this.objects.keys()];
  }

  /** 短縮ハッシュから一意に定まるものを引く */
  resolve(prefix: string): string | undefined {
    if (this.objects.has(prefix)) return prefix;
    const hits = [...this.objects.keys()].filter((h) => h.startsWith(prefix));
    return hits.length === 1 ? hits[0] : undefined;
  }

  /** git cat-file -p 相当の表示 */
  pretty(hash: string): string | undefined {
    const object = this.objects.get(hash);
    if (!object) return undefined;
    if (object.type === 'tree') {
      return parseTree(object.body)
        .map((e) => {
          const type = e.mode === '040000' ? 'tree' : 'blob';
          return `${e.mode} ${type} ${e.hash}\t${e.name}`;
        })
        .join('\n')
        .concat('\n');
    }
    return decode(object.body);
  }
}
