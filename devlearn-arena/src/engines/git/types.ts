import type { ObjectStore, Signature } from './objects';

export type Head =
  | { type: 'branch'; name: string }
  | { type: 'detached'; hash: string };

export interface IndexEntry {
  /** 作業ツリーのルートからの相対パス */
  path: string;
  mode: string;
  hash: string;
}

/**
 * リポジトリの状態。
 * objects は内容アドレスの追記専用なので、スナップショット間で共有してよい。
 * refs / index / HEAD は時点ごとに違うので、必ず新しい値として作り直す。
 */
export interface GitState {
  readonly root: string;
  readonly objects: ObjectStore;
  readonly head: Head;
  readonly refs: ReadonlyMap<string, string>;
  readonly index: ReadonlyMap<string, IndexEntry>;
  readonly author: Signature;
  /** 直前の HEAD。reset や checkout の取り消しに使う */
  readonly origHead: string | null;
  readonly reflog: readonly ReflogEntry[];
}

export interface ReflogEntry {
  hash: string;
  message: string;
}

export interface StatusEntry {
  path: string;
  state: 'added' | 'modified' | 'deleted';
}

export interface StatusReport {
  branch: string | null;
  detached: string | null;
  staged: StatusEntry[];
  unstaged: StatusEntry[];
  untracked: string[];
  clean: boolean;
}
