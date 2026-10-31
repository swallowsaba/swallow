import {
  badCommit, candidates, goodCommits, isBisecting, mark, nextProbe, remainingSteps,
  reset as resetBisect, start as startBisect, START_REF,
} from '@/engines/git/bisect';
import { parseCommit } from '@/engines/git/objects';
import { resolveRef } from '@/engines/git/refs';
import { headCommit, indexOf } from '@/engines/git/repository';
import type { GitState } from '@/engines/git/types';
import { checkoutWorktree } from '@/engines/git/worktree';
import type { CommandResult, ShellState } from '../registry';
import { fromLines } from './args';
import { formatGitDate, short, type GitContext, type GitHandler } from './gitShared';

/** 始めた時の枝の控え（refs/bisect/branch/枝） */
const BRANCH_REF = 'refs/bisect/branch/';

/** 最初に壊した記録の知らせ（本物と同じく、記録の中身も出す） */
function firstBad(git: GitState, hash: string): string {
  const object = git.objects.read(hash);
  if (!object) return `${hash} is the first bad commit
`;
  const c = parseCommit(object.body);
  return fromLines([`${hash} is the first bad commit`, `commit ${hash}`, `Author: ${c.author.name} <${c.author.email}>`, `Date:   ${formatGitDate(c.author.timestamp, c.author.timezone)}`, '', ...c.message.trimEnd().split('\n').map((l) => `    ${l}`)]);
}

/** 調べる先へ HEAD を移し、作業ツリーもそこへ揃える */
function moveTo(ctx: GitContext, git: GitState, hash: string, message: string): CommandResult {
  const before = headCommit(ctx.git);
  const moved: GitState = indexOf({ ...git, head: { type: 'detached', hash } }, hash);
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
      // 元の枝も控える（reset で枝に戻る。本物の BISECT_START と同じ）
      const tip = headCommit(git);
      const marked: GitState = git.head.type === 'branch' && tip !== null ? { ...started, refs: new Map([...started.refs, [`${BRANCH_REF}${git.head.name}`, tip]]) } : started;
      return {
        stdout: 'status: waiting for both good and bad commits\n',
        patch: { git: marked },
      };
    }

    if (action === 'reset') {
      if (!isBisecting(git)) return { stderr: 'fatal: bisect を開始していません\n', code: 1 };
      const origin = git.refs.get(START_REF) ?? '';
      const branch = [...git.refs.keys()].find((r) => r.startsWith(BRANCH_REF))?.slice(BRANCH_REF.length);
      const cleared = resetBisect(git);
      // 元いた場所へ戻す。開始前の HEAD は refs/bisect/start に控えてある
      const back: GitState = origin === ''
        ? cleared
        : { ...cleared, head: branch !== undefined ? { type: 'branch', name: branch } : git.head.type === 'detached' ? { type: 'detached', hash: origin } : git.head };
      const vfs = origin === ''
        ? shell.vfs
        : checkoutWorktree(shell.vfs, back, headCommit(git), origin);
      return { patch: { git: origin === '' ? back : indexOf(back, origin), vfs } };
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
        return { stdout: firstBad(step.git, step.culprit), patch: { git: step.git } };
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

    if (action === 'run') {
      if (!isBisecting(git) || badCommit(git) === null || goodCommits(git).length === 0) {
        return { stderr: "You need to start by \"git bisect start\".\n'bisect run' failed: no command provided or good/bad not set\n", code: 1 };
      }
      const line = rest.slice(1).join(' ');
      if (line === '') return { stderr: 'bisect run failed: No command provided.\n', code: 1 };
      // 本物と同じく、今の版でテストを動かし、終了の値で良い・悪いを伝えることを、決まるまで繰り返す
      let state: ShellState = shell;
      let said = '';
      for (let round = 0; round < 32; round += 1) {
        const r = ctx.runLine(line, state);
        const now = r.state.git ?? git;
        said += `running  ${rest.slice(1).map((a) => `'${a}'`).join(' ')}\n${r.stdout}`;
        const verdict = r.code === 0 ? 'good' : 'bad';
        const tip = headCommit(now) ?? '';
        const step = mark(now, verdict, tip);
        if (step.culprit !== null) {
          return { stdout: `${said}${firstBad(step.git, step.culprit)}`, patch: { git: step.git, vfs: r.state.vfs } };
        }
        if (step.probe === null) return { stdout: said, stderr: `bisect run failed: ${step.message}\n`, code: 1, patch: { git: step.git, vfs: r.state.vfs } };
        const moved: GitState = indexOf({ ...step.git, head: { type: 'detached', hash: step.probe } }, step.probe);
        said += `${step.message}\n[${step.probe}] を調べています\n`;
        state = { ...r.state, git: moved, vfs: checkoutWorktree(r.state.vfs, moved, tip, step.probe) };
      }
      return { stdout: said, stderr: 'bisect run failed: too many rounds\n', code: 1 };
    }

    return { stderr: 'usage: git bisect <start|bad|good|status|reset|run>\n', code: 129 };
  },
};
