import { parseWorkflow, runWorkflow } from '@/engines/github/actions';
import {
  addReview, canMerge, findPull, mergePull, openPull, protection, setChecks,
} from '@/engines/github/pr';
import type { MergeStrategy, Repo } from '@/engines/github/types';
import { readFile, stat } from '../vfs';
import { resolve } from '../path';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { fromLines, parseArgs } from './args';

const NO_REPO = 'リモートのリポジトリがありません。GitHub の任務を選んでください。\n';

function statusMark(status: string): string {
  return status === 'success' ? '✓' : status === 'failure' ? '✗' : status === 'skipped' ? '−' : '…';
}

function findWorkflowFile(shell: ShellState): string | null {
  const dir = resolve(shell.cwd, '.github/workflows');
  const node = stat(shell.vfs, dir);
  if (node?.kind !== 'dir') return null;
  for (const [path, entry] of shell.vfs.nodes) {
    if (entry.kind === 'file' && path.startsWith(`${dir}/`)) return path;
  }
  return null;
}

function runSub(sub: string, argv: readonly string[], shell: ShellState): CommandResult {
  const repo = shell.repo;
  if (repo === null) return { stderr: NO_REPO, code: 1 };
  const rest = argv.slice(2);
  const { values, operands, flags } = parseArgs([sub, ...rest], {
    withValue: ['t', 'b', 'B', 'm', 'r'],
  });

  switch (sub) {
    case 'pr': {
      const action = operands[0] ?? 'list';

      if (action === 'create') {
        const title = values.get('t') ?? '新しい変更';
        const head = values.get('b') ?? 'feature';
        const base = values.get('B') ?? repo.defaultBranch;
        const opened = openPull(repo, { title, head, base });
        return {
          stdout: `https://github.com/${repo.owner}/${repo.name}/pull/${String(opened.pull.number)}\n`,
          patch: { repo: opened.repo },
        };
      }

      if (action === 'list') {
        if (repo.pulls.length === 0) return { stdout: 'no open pull requests\n' };
        return {
          stdout: fromLines(
            repo.pulls.map(
              (p) => `#${String(p.number)}\t${p.title}\t${p.head} → ${p.base}\t${p.state}`,
            ),
          ),
        };
      }

      const number = Number(operands[1]);
      if (!Number.isFinite(number)) {
        return { stderr: 'usage: gh pr <view|review|merge|checks> <番号>\n', code: 1 };
      }
      const pull = findPull(repo, number);
      if (!pull) {
        return { stderr: `no pull request found for #${String(number)}\n`, code: 1 };
      }

      if (action === 'view') {
        const rule = protection(repo, pull.base);
        const lines = [
          `#${String(pull.number)} ${pull.title}`,
          `${pull.head} → ${pull.base}   状態: ${pull.state}   作成者: ${pull.author}`,
          '',
          'レビュー:',
          ...(pull.reviews.length === 0
            ? ['  （まだありません）']
            : pull.reviews.map((r) => `  ${r.reviewer}: ${r.state}${r.body === '' ? '' : ` — ${r.body}`}`)),
          '',
          'チェック:',
          ...(pull.checks.length === 0
            ? ['  （まだ実行されていません）']
            : pull.checks.map((c) => `  ${statusMark(c.status)} ${c.name} (${c.status})`)),
        ];
        if (rule) {
          lines.push(
            '',
            '保護ルール:',
            `  必要な承認: ${String(rule.requiredApprovals)}`,
            `  必須チェック: ${rule.requiredChecks.join(', ') || 'なし'}`,
          );
        }
        const check = canMerge(repo, number);
        lines.push('', check.ok ? 'マージできます' : `マージできません:\n  - ${check.reasons.join('\n  - ')}`);
        return { stdout: fromLines(lines) };
      }

      if (action === 'review') {
        const reviewer = values.get('r') ?? 'mentor';
        const state = flags.has('approve')
          ? 'approved'
          : rest.includes('--approve')
            ? 'approved'
            : rest.includes('--request-changes')
              ? 'changes_requested'
              : 'commented';
        const result = addReview(repo, number, {
          reviewer,
          state,
          body: values.get('m') ?? '',
        });
        if ('error' in result) return { stderr: `${result.error}\n`, code: 1 };
        return { stdout: `#${String(number)} に ${state} のレビューを付けました\n`, patch: { repo: result } };
      }

      if (action === 'checks') {
        const path = findWorkflowFile(shell);
        if (path === null) {
          return { stderr: '.github/workflows にワークフローがありません\n', code: 1 };
        }
        const parsed = parseWorkflow(readFile(shell.vfs, path));
        if ('error' in parsed) return { stderr: `${parsed.error}\n`, code: 1 };
        const failing = rest
          .filter((a) => a.startsWith('--fail='))
          .flatMap((a) => a.slice('--fail='.length).split(','));
        const runs = runWorkflow(parsed, { failing });
        const next = setChecks(repo, number, runs);
        const lines = runs.flatMap((run) => [
          `${statusMark(run.status)} ${run.name} (${run.status})${
            run.needs.length === 0 ? '' : `  needs: ${run.needs.join(', ')}`
          }`,
          ...run.logs.map((log) => `    ${log}`),
        ]);
        return { stdout: fromLines(lines), patch: { repo: next } };
      }

      if (action === 'merge') {
        const strategy: MergeStrategy = rest.includes('--squash')
          ? 'squash'
          : rest.includes('--rebase')
            ? 'rebase'
            : 'merge';
        const commits = Number(values.get('commits') ?? 3);
        const result = mergePull(repo, number, strategy, Number.isFinite(commits) ? commits : 3);
        if (result.error !== undefined) {
          return { stderr: `${result.error}\n`, code: 1 };
        }
        return {
          stdout: `#${String(number)} を ${strategy} でマージしました。${result.message}（履歴に増えるコミット: ${String(result.commitsAdded)}）\n`,
          patch: { repo: result.repo },
        };
      }

      return { stderr: `unknown pr action: ${action}\n`, code: 1 };
    }

    case 'protect': {
      const branch = operands[0] ?? repo.defaultBranch;
      const approvals = Number(values.get('approvals') ?? 1);
      const checks = (values.get('checks') ?? '').split(',').filter((c) => c !== '');
      const protections = [
        ...repo.protections.filter((p) => p.branch !== branch),
        {
          branch,
          requiredApprovals: Number.isFinite(approvals) ? approvals : 1,
          requiredChecks: checks,
          blockDirectPush: true,
        },
      ];
      return {
        stdout: `${branch} を保護しました\n`,
        patch: { repo: { ...repo, protections } satisfies Repo },
      };
    }

    case 'workflow': {
      const path = findWorkflowFile(shell);
      if (path === null) return { stderr: '.github/workflows にワークフローがありません\n', code: 1 };
      const parsed = parseWorkflow(readFile(shell.vfs, path));
      if ('error' in parsed) return { stderr: `${parsed.error}\n`, code: 1 };
      const lines = [
        `name: ${parsed.name}`,
        `on: ${parsed.on.join(', ')}`,
        'jobs:',
        ...parsed.jobs.map(
          (job) =>
            `  ${job.id} (${job.name})${job.needs.length === 0 ? '' : ` ← ${job.needs.join(', ')}`}` +
            `${job.condition === null ? '' : `  if: ${job.condition}`}`,
        ),
      ];
      return { stdout: fromLines(lines) };
    }

    default:
      return { stderr: `unknown command: gh ${sub}\n`, code: 1 };
  }
}

export const ghCommands: CommandSpec[] = [
  {
    name: 'gh',
    summary: 'GitHub を操作する（pr / protect / workflow）',
    complete: ({ prefix }) => ['pr', 'protect', 'workflow'].filter((s) => s.startsWith(prefix)),
    handler: ({ argv, shell }) => {
      const sub = argv[1];
      if (sub === undefined) {
        return {
          stdout:
            'usage: gh <command>\n' +
            '  pr create|list|view|review|checks|merge\n' +
            '  protect <branch> --approvals=N --checks=A,B\n' +
            '  workflow\n',
        };
      }
      return runSub(sub, argv, shell);
    },
  },
];
