import {
  badCommit, candidates, goodCommits, isBisecting, mark, nextProbe, remainingSteps,
  reset as resetBisect, start as startBisect, START_REF,
} from '@/engines/git/bisect';
import { resolveRef } from '@/engines/git/refs';
import { headCommit } from '@/engines/git/repository';
import type { GitState } from '@/engines/git/types';
import { checkoutWorktree } from '@/engines/git/worktree';
import type { CommandResult } from '../registry';
import { fromLines } from './args';
import { short, type GitContext, type GitHandler } from './gitShared';

/** 調べる先へ HEAD を移し、作業ツリーもそこへ揃える */
function moveTo(ctx: GitContext, git: GitState, hash: string, message: string): CommandResult {
  const before = headCommit(ctx.git);
  const moved: GitState = { ...git, head: { type: 'detached', hash } };
  const vfs = checkoutWorktree(ctx.shell.vfs, moved, before, hash);
  return {
    stdout: `${message}\n[${hash}] を調べています\n`,
    patch: { git: moved, vfs },
  };
}

/**
 * git bisect。
 * 良い版と悪い版の間を半分ずつ潰していく。
 * 何回で終わるかは候補数だけで決まるので、当てずっぽうより速いことがその場で見える。
 */
export const bisectSubcommands: Record<string, GitHandler> = {
  bisect: (ctx) => {
    const { git, shell, rest } = ctx;
    const action = rest[0] ?? 'status';

    if (action === 'start') {
      const started = startBisect(git);
      return {
        stdout: 'status: waiting for both good and bad commits\n',
        patch: { git: started },
      };
    }

    if (action === 'reset') {
      if (!isBisecting(git)) return { stderr: 'fatal: bisect を開始していません\n', code: 1 };
      const origin = git.refs.get(START_REF) ?? '';
      const cleared = resetBisect(git);
      // 元いた場所へ戻す。開始前の HEAD は refs/bisect/start に控えてある
      const back: GitState = origin === ''
        ? cleared
        : { ...cleared, head: git.head.type === 'detached' ? { type: 'detached', hash: origin } : git.head };
      const vfs = origin === ''
        ? shell.vfs
        : checkoutWorktree(shell.vfs, back, headCommit(git), origin);
      return { patch: { git: back, vfs } };
    }

    if (action === 'bad' || action === 'good') {
      if (!isBisecting(git)) {
        return { stderr: 'fatal: 先に git bisect start を実行してください\n', code: 1 };
      }
      const target = rest[1] ?? 'HEAD';
      const hash = resolveRef(git, target);
      if (hash === undefined) return { stderr: `fatal: Bad rev input: ${target}\n`, code: 128 };

      const step = mark(git, action, hash);
      if (step.culprit !== null) {
        return { stdout: `${step.culprit} is the first bad commit\n`, patch: { git: step.git } };
      }
      if (step.probe === null) {
        return { stdout: `status: ${step.message}\n`, patch: { git: step.git } };
      }
      return moveTo(ctx, step.git, step.probe, step.message);
    }

    if (action === 'status' || action === 'log') {
      if (!isBisecting(git)) return { stdout: 'bisect は動いていません\n' };
      const bad = badCommit(git);
      const good = goodCommits(git);
      const rest2 = candidates(git);
      return {
        stdout: fromLines([
          `bad:  ${bad === null ? '(未指定)' : short(bad)}`,
          `good: ${good.length === 0 ? '(未指定)' : good.map(short).join(' ')}`,
          `残り候補 ${String(rest2.length)} 件 / 最大 ${String(remainingSteps(rest2.length))} 回`,
          `次に調べる: ${nextProbe(git) === null ? '(なし)' : short(nextProbe(git) ?? '')}`,
        ]),
      };
    }

    return { stderr: 'usage: git bisect <start|bad|good|status|reset>\n', code: 129 };
  },
};
