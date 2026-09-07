import { parseCommit, parseTree, serialize } from '@/engines/git/objects';
import { peel } from '@/engines/git/refs';
import type { GitState } from '@/engines/git/types';
import { fromLines } from './args';
import { short, type GitHandler } from './gitShared';

/** 参照から辿り着ける全てのオブジェクト（コミット・ツリー・blob） */
function reachable(git: GitState): Set<string> {
  const seen = new Set<string>();
  const stack: string[] = [];
  for (const hash of git.refs.values()) {
    if (hash !== '') stack.push(hash);
  }
  if (git.head.type === 'detached') stack.push(git.head.hash);
  for (const entry of git.index.values()) stack.push(entry.hash);
  while (stack.length > 0) {
    const hash = stack.pop();
    if (hash === undefined || seen.has(hash)) continue;
    const object = git.objects.read(hash);
    if (!object) continue;
    seen.add(hash);
    if (object.type === 'tag') {
      stack.push(peel(git, hash));
      continue;
    }
    if (object.type === 'commit') {
      const parsed = parseCommit(object.body);
      stack.push(parsed.tree, ...parsed.parents);
      continue;
    }
    if (object.type === 'tree') {
      for (const entry of parseTree(object.body)) stack.push(entry.hash);
    }
  }
  return seen;
}

/**
 * オブジェクトDB そのものを覗く道具。
 * 数も大きさも、作り置きせずその場で数える。
 */
export const plumbingSubcommands: Record<string, GitHandler> = {
  'count-objects': ({ git, rest }) => {
    const hashes = git.objects.hashes();
    let bytes = 0;
    for (const hash of hashes) {
      const object = git.objects.read(hash);
      if (object) bytes += serialize(object.type, object.body).length;
    }
    if (!rest.includes('-v')) {
      return { stdout: `${String(hashes.length)} objects, ${String(bytes)} bytes\n` };
    }
    const live = reachable(git);
    return {
      stdout: fromLines([
        `count: ${String(hashes.length)}`,
        `size: ${String(bytes)}`,
        `reachable: ${String(live.size)}`,
        `dangling: ${String(hashes.length - live.size)}`,
      ]),
    };
  },

  fsck: ({ git }) => {
    const live = reachable(git);
    const rows: string[] = [];
    for (const hash of git.objects.hashes().sort()) {
      if (live.has(hash)) continue;
      const object = git.objects.read(hash);
      if (!object) continue;
      rows.push(`dangling ${object.type} ${hash}`);
    }
    return { stdout: fromLines(rows) };
  },

  'show-ref': ({ git }) => {
    const rows = [...git.refs.entries()]
      .filter(([, hash]) => hash !== '')
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([ref, hash]) => `${hash} ${ref}`);
    return { stdout: fromLines(rows) };
  },

  describe: ({ git, rest }) => {
    void rest;
    const head = git.head.type === 'detached'
      ? git.head.hash
      : (git.refs.get(`refs/heads/${git.head.name}`) ?? null);
    if (head === null) return { stderr: 'fatal: No names found, cannot describe anything.\n', code: 128 };
    for (const [ref, hash] of git.refs) {
      if (ref.startsWith('refs/tags/') && peel(git, hash) === head) {
        return { stdout: `${ref.slice('refs/tags/'.length)}\n` };
      }
    }
    return { stdout: `${short(head)}\n` };
  },
};
