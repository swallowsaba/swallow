import { branches, currentBranch, headCommit, log } from '@/engines/git/repository';
import { resolveRef } from '@/engines/git/refs';
import type { GitState } from '@/engines/git/types';
import type { AssertContext } from '../types';
import type { Check } from '../authoring/assert';

export function withGit(check: (git: GitState, ctx: AssertContext) => boolean): Check {
  return (ctx) => {
    const git = ctx.shell.git;
    return git !== null && check(git, ctx);
  };
}

export function repoInitialized(): Check {
  return withGit(() => true);
}

export function commitCountIs(n: number): Check {
  return withGit((git) => (headCommit(git) === null ? n === 0 : log(git).length === n));
}

export function commitCountAtLeast(n: number): Check {
  return withGit((git) => (headCommit(git) === null ? n === 0 : log(git).length >= n));
}

export function headMessageIs(message: string): Check {
  return withGit((git) => (log(git)[0]?.message ?? '').split('\n')[0] === message);
}

export function headMessageContains(text: string): Check {
  return withGit((git) => (log(git)[0]?.message ?? '').includes(text));
}

export function branchExists(name: string): Check {
  return withGit((git) => branches(git).includes(name));
}

export function branchAbsent(name: string): Check {
  return withGit((git) => !branches(git).includes(name));
}

export function onBranch(name: string): Check {
  return withGit((git) => currentBranch(git) === name);
}

export function tagExists(name: string): Check {
  return withGit((git) => git.refs.has(`refs/tags/${name}`));
}

/** そのファイルがインデックスに載っているか（add 済みか） */
export function staged(path: string): Check {
  return withGit((git) => git.index.has(path));
}

export function notStaged(path: string): Check {
  return withGit((git) => !git.index.has(path));
}

/** 追跡されているファイルの中身が、その commit 時点でどうなっているか */
export function committedContains(path: string, text: string): Check {
  return withGit((git) => {
    const head = headCommit(git);
    if (head === null) return false;
    const entry = git.index.get(path);
    if (entry === undefined) return false;
    const object = git.objects.read(entry.hash);
    return object !== undefined && new TextDecoder().decode(object.body).includes(text);
  });
}

/** 2つの参照が同じコミットを指しているか */
export function sameCommit(a: string, b: string): Check {
  return withGit((git) => {
    const left = resolveRef(git, a);
    const right = resolveRef(git, b);
    return left !== undefined && left === right;
  });
}

export function refIsAncestorCount(ref: string, n: number): Check {
  return withGit((git) => {
    const target = resolveRef(git, ref);
    if (target === undefined) return false;
    return log(git).findIndex((e) => e.hash === target) === n;
  });
}

/** stash に何件積まれているか */
export function stashCountIs(n: number): Check {
  return withGit((git) => git.stash.length === n);
}

/** 衝突の目印がファイルに残っていないか */
export function noConflictMarkers(path: string): Check {
  return (ctx) => {
    const node = ctx.shell.vfs.nodes.get(`${ctx.shell.git?.root ?? ''}/${path}`);
    if (node?.kind !== 'file') return false;
    return !node.content.includes('<<<<<<<') && !node.content.includes('>>>>>>>');
  };
}

export function mergeInProgress(): Check {
  return withGit((git) => git.mergeHead !== null);
}

export function mergeFinished(): Check {
  return withGit((git) => git.mergeHead === null);
}
