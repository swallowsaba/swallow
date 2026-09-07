import { isWorkflowError, parseWorkflow, runWorkflow } from '@/engines/github/actions';
import { closeLinkedIssues, ownerApprovalMissing } from '@/engines/github/issues';
import {
  addReview, canMerge, findPull, mergePull, openPull, protection, setChecks,
} from '@/engines/github/pr';
import type { MergeStrategy, Repo } from '@/engines/github/types';
import { fromLines } from './args';
import { pickWorkflow, statusMark, workflowLibrary, type GhHandler } from './ghShared';

/** Pull Request と保護ルール、そして CI の実行 */
export const prSubcommands: Record<string, GhHandler> = {
  pr: ({ repo, shell, operands, values, flags, rest }) => {
    const action = operands[0] ?? 'list';

    if (action === 'create') {
      const title = values.get('t') ?? '新しい変更';
      const head = values.get('b') ?? 'feature';
      const base = values.get('B') ?? repo.defaultBranch;
      const opened = openPull(repo, { title, head, base, body: values.get('body') ?? '' });
      const target = repo.upstream === null
        ? `${repo.owner}/${repo.name}`
        : `${repo.upstream.owner}/${repo.upstream.name}`;
      return {
        stdout: `https://github.com/${target}/pull/${String(opened.pull.number)}\n`,
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
    if (!pull) return { stderr: `no pull request found for #${String(number)}\n`, code: 1 };

    if (action === 'view') {
      const rule = protection(repo, pull.base);
      const lines = [
        `#${String(pull.number)} ${pull.title}`,
        `${pull.head} → ${pull.base}   状態: ${pull.state}   作成者: ${pull.author}`,
        repo.upstream === null
          ? ''
          : `fork からの Pull Request（元: ${repo.upstream.owner}/${repo.upstream.name}）`,
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
      const changed = (values.get('paths') ?? '').split(',').filter((p) => p !== '');
      if (repo.codeowners.length > 0 && changed.length > 0) {
        const missing = ownerApprovalMissing(repo, number, changed);
        lines.push(
          '',
          'CODEOWNERS:',
          missing.length === 0 ? '  所有者の承認は揃っています' : `  承認待ち: ${missing.join(' ')}`,
        );
      }
      const check = canMerge(repo, number);
      lines.push('', check.ok ? 'マージできます' : `マージできません:\n  - ${check.reasons.join('\n  - ')}`);
      return { stdout: fromLines(lines) };
    }

    if (action === 'review') {
      const reviewer = values.get('r') ?? 'mentor';
      const state = flags.has('approve') || rest.includes('--approve')
        ? 'approved'
        : rest.includes('--request-changes')
          ? 'changes_requested'
          : 'commented';
      const result = addReview(repo, number, { reviewer, state, body: values.get('m') ?? '' });
      if ('error' in result) return { stderr: `${result.error}\n`, code: 1 };
      return { stdout: `#${String(number)} に ${state} のレビューを付けました\n`, patch: { repo: result } };
    }

    if (action === 'checks') {
      const chosen = pickWorkflow(shell, values.get('w'));
      if (chosen === null) {
        return { stderr: '.github/workflows にワークフローがありません\n', code: 1 };
      }
      const parsed = parseWorkflow(chosen.content);
      if (isWorkflowError(parsed)) return { stderr: `${parsed.error}\n`, code: 1 };

      const failing = rest
        .filter((a) => a.startsWith('--fail='))
        .flatMap((a) => a.slice('--fail='.length).split(','));
      const result = runWorkflow(parsed, {
        failing,
        secrets: repo.secrets,
        cache: (values.get('cache') ?? '').split(',').filter((c) => c !== ''),
        library: workflowLibrary(shell),
      });

      const next = setChecks(repo, number, result.checks);
      const lines = result.checks.flatMap((run) => [
        `${statusMark(run.status)} ${run.name} (${run.status})${
          run.needs.length === 0 ? '' : `  needs: ${run.needs.join(', ')}`
        }`,
        ...run.logs.map((log) => `    ${log}`),
      ]);
      if (Object.keys(result.artifacts).length > 0) {
        lines.push('', `artifact: ${Object.keys(result.artifacts).join(', ')}`);
      }
      if (result.cache.length > 0) lines.push(`cache: ${result.cache.join(', ')}`);
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
      if (result.error !== undefined) return { stderr: `${result.error}\n`, code: 1 };

      // 本文に Closes #n と書いてあれば、その Issue も閉じる
      const merged: Repo = closeLinkedIssues(result.repo, number, pull.body);
      const closed = merged.issues.filter((i) => i.closedBy === number).map((i) => `#${String(i.number)}`);
      return {
        stdout:
          `#${String(number)} を ${strategy} でマージしました。${result.message}` +
          `（履歴に増えるコミット: ${String(result.commitsAdded)}）\n` +
          (closed.length === 0 ? '' : `${closed.join(' ')} を閉じました\n`),
        patch: { repo: merged },
      };
    }

    return { stderr: `unknown pr action: ${action}\n`, code: 1 };
  },

  protect: ({ repo, operands, values }) => {
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
  },

  workflow: ({ shell, values }) => {
    const chosen = pickWorkflow(shell, values.get('w'));
    if (chosen === null) return { stderr: '.github/workflows にワークフローがありません\n', code: 1 };
    const parsed = parseWorkflow(chosen.content);
    if (isWorkflowError(parsed)) return { stderr: `${parsed.error}\n`, code: 1 };

    const lines = [
      `name: ${parsed.name}`,
      `on: ${parsed.on.join(', ')}`,
      Object.keys(parsed.permissions).length === 0
        ? ''
        : `permissions: ${Object.entries(parsed.permissions).map(([k, v]) => `${k}=${v}`).join(' ')}`,
      'jobs:',
      ...parsed.jobs.map((job) => {
        const combos = Object.entries(job.matrix)
          .map(([k, v]) => `${k}=[${v.join(',')}]`)
          .join(' ');
        return (
          `  ${job.id} (${job.name})${job.needs.length === 0 ? '' : ` ← ${job.needs.join(', ')}`}` +
          `${job.condition === null ? '' : `  if: ${job.condition}`}` +
          `${combos === '' ? '' : `  matrix: ${combos}`}` +
          `${job.uses === null ? '' : `  uses: ${job.uses}`}`
        );
      }),
    ];
    return { stdout: fromLines(lines) };
  },
};
