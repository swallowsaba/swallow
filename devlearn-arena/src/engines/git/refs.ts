import { decode, encode, parseCommit, type Signature } from './objects';
import { headCommit } from './repository';
import type { GitState } from './types';

export const TAG_PREFIX = 'refs/tags/';

/**
 * 参照の解決。本物の `git rev-parse` が受ける形をひと通り扱う。
 *
 * HEAD / ブランチ名 / タグ名 / リモート追跡 / 生のハッシュ（短縮可）、
 * それに `~n`（第1親をn回たどる）と `^n`（n番目の親）を後置できる。
 */
export function resolveRef(git: GitState, ref: string): string | undefined {
  const match = /^(.*?)((?:[~^]\d*)*)$/.exec(ref);
  const base = match?.[1] ?? ref;
  const suffix = match?.[2] ?? '';

  const found = resolveBase(git, base);
  if (found === undefined) return undefined;

  let hash: string = found;
  for (const step of suffix.matchAll(/([~^])(\d*)/g)) {
    const kind = step[1];
    const count = step[2] === undefined || step[2] === '' ? 1 : Number(step[2]);
    const steps = kind === '~' ? count : 1;
    for (let i = 0; i < steps; i += 1) {
      const list = parentsOf(git, hash);
      const parent = kind === '~' ? list[0] : list[count - 1];
      if (parent === undefined) return undefined;
      hash = parent;
    }
  }
  return hash;
}

/** 参照が指しているオブジェクトそのもの。注釈付きタグは剥がさない */
export function resolveObject(git: GitState, ref: string): string | undefined {
  if (ref === 'HEAD') return headCommit(git) ?? undefined;
  for (const key of [ref, `refs/heads/${ref}`, `${TAG_PREFIX}${ref}`, `refs/remotes/${ref}`]) {
    const hit = git.refs.get(key);
    if (hit !== undefined) return hit;
  }
  return git.objects.resolve(ref);
}

function resolveBase(git: GitState, ref: string): string | undefined {
  if (ref === '' || ref === 'HEAD') return headCommit(git) ?? undefined;
  const candidates = [
    ref,
    `refs/heads/${ref}`,
    `${TAG_PREFIX}${ref}`,
    `refs/remotes/${ref}`,
  ];
  for (const key of candidates) {
    const hit = git.refs.get(key);
    if (hit !== undefined) return peel(git, hit);
  }
  const object = git.objects.resolve(ref);
  return object === undefined ? undefined : peel(git, object);
}

function parentsOf(git: GitState, hash: string): string[] {
  const object = git.objects.read(hash);
  if (!object || object.type !== 'commit') return [];
  return [...parseCommit(object.body).parents];
}

/** 注釈付きタグを指していたら、その先のコミットまで剥がす */
export function peel(git: GitState, hash: string): string {
  let current = hash;
  for (let i = 0; i < 10; i += 1) {
    const object = git.objects.read(current);
    if (!object || object.type !== 'tag') return current;
    const parsed = parseTag(object.body);
    if (parsed.object === '') return current;
    current = parsed.object;
  }
  return current;
}

export interface TagData {
  object: string;
  type: string;
  tag: string;
  tagger: Signature;
  message: string;
}

/** 本物と同じ形式（`object`/`type`/`tag`/`tagger` の行 + 空行 + 本文） */
export function serializeTag(data: TagData): Uint8Array {
  const { tagger } = data;
  const lines = [
    `object ${data.object}`,
    `type ${data.type}`,
    `tag ${data.tag}`,
    `tagger ${tagger.name} <${tagger.email}> ${String(tagger.timestamp)} ${tagger.timezone}`,
    '',
    data.message.endsWith('\n') ? data.message : `${data.message}\n`,
  ];
  return encode(lines.join('\n'));
}

export function parseTag(body: Uint8Array): TagData {
  const text = decode(body);
  const separator = text.indexOf('\n\n');
  const header = separator === -1 ? text : text.slice(0, separator);
  const message = separator === -1 ? '' : text.slice(separator + 2);
  const fields = new Map<string, string>();
  for (const line of header.split('\n')) {
    const space = line.indexOf(' ');
    if (space === -1) continue;
    fields.set(line.slice(0, space), line.slice(space + 1));
  }
  const tagger = /^(.*) <([^>]*)> (\d+) ([+-]\d{4})$/.exec(fields.get('tagger') ?? '');
  return {
    object: fields.get('object') ?? '',
    type: fields.get('type') ?? 'commit',
    tag: fields.get('tag') ?? '',
    tagger: {
      name: tagger?.[1] ?? '',
      email: tagger?.[2] ?? '',
      timestamp: Number(tagger?.[3] ?? '0'),
      timezone: tagger?.[4] ?? '+0000',
    },
    message,
  };
}

export interface TagResult {
  git: GitState;
  error?: string;
}

/** 軽量タグはただの参照、注釈付きタグは tag オブジェクトを1つ作ってそれを指す */
export function createTag(
  git: GitState,
  name: string,
  target: string,
  options: { message?: string; now: number; force?: boolean },
): TagResult {
  const key = `${TAG_PREFIX}${name}`;
  if (git.refs.has(key) && options.force !== true) {
    return { git, error: `fatal: tag '${name}' already exists` };
  }
  const hash = resolveRef(git, target);
  if (hash === undefined) return { git, error: `fatal: Failed to resolve '${target}' as a valid ref.` };

  const refs = new Map(git.refs);
  if (options.message === undefined) {
    refs.set(key, hash);
    return { git: { ...git, refs } };
  }
  const tagHash = git.objects.write(
    'tag',
    serializeTag({
      object: hash,
      type: 'commit',
      tag: name,
      tagger: { ...git.author, timestamp: options.now },
      message: options.message,
    }),
  );
  refs.set(key, tagHash);
  return { git: { ...git, refs } };
}

export function deleteTag(git: GitState, name: string): TagResult {
  const key = `${TAG_PREFIX}${name}`;
  if (!git.refs.has(key)) return { git, error: `error: tag '${name}' not found.` };
  const refs = new Map(git.refs);
  refs.delete(key);
  return { git: { ...git, refs } };
}

export function tagNames(git: GitState): string[] {
  return [...git.refs.keys()]
    .filter((r) => r.startsWith(TAG_PREFIX))
    .map((r) => r.slice(TAG_PREFIX.length))
    .sort();
}
