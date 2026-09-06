import { ObjectStore, type GitObjectType } from './objects';
import { defaultAuthor } from './repository';
import type { GitState, Head, IndexEntry, ReflogEntry, StashEntry } from './types';

/** バイト列を保存できる文字列にする（tree は binary を含むため base64） */
function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export interface GitSnapshotBase {
  root: string;
  head: Head;
  refs: [string, string][];
  index: IndexEntry[];
  reflog: ReflogEntry[];
  stash: StashEntry[];
  author: { name: string; email: string; timestamp: number; timezone: string };
  origHead: string | null;
  objects: { type: GitObjectType; body: string }[];
}

export interface GitSnapshot extends GitSnapshotBase {
  remotes: { name: string; url: string; state: GitSnapshotBase }[];
}

function snapshotBase(git: GitState): GitSnapshotBase {
  const objects: { type: GitObjectType; body: string }[] = [];
  for (const hash of git.objects.hashes()) {
    const object = git.objects.read(hash);
    if (object) objects.push({ type: object.type, body: toBase64(object.body) });
  }
  return {
    root: git.root,
    head: git.head,
    refs: [...git.refs.entries()],
    index: [...git.index.values()],
    reflog: [...git.reflog],
    stash: [...git.stash],
    author: git.author,
    origHead: git.origHead,
    objects,
  };
}

export function snapshotGit(git: GitState): GitSnapshot {
  return {
    ...snapshotBase(git),
    remotes: [...git.remotes.values()].map((r) => ({
      name: r.name,
      url: r.url,
      state: snapshotBase(r.state),
    })),
  };
}

function restoreBase(snapshot: GitSnapshotBase): GitState {
  const objects = new ObjectStore();
  for (const object of snapshot.objects) objects.write(object.type, fromBase64(object.body));
  return {
    root: snapshot.root,
    objects,
    head: snapshot.head,
    refs: new Map(snapshot.refs),
    index: new Map(snapshot.index.map((e) => [e.path, e])),
    reflog: snapshot.reflog,
    stash: snapshot.stash,
    author: { ...defaultAuthor, ...snapshot.author },
    origHead: snapshot.origHead,
    remotes: new Map(),
  };
}

export function restoreGit(snapshot: GitSnapshot): GitState {
  const base = restoreBase(snapshot);
  const remotes = new Map(
    snapshot.remotes.map((r) => [r.name, { name: r.name, url: r.url, state: restoreBase(r.state) }]),
  );
  return { ...base, remotes };
}
