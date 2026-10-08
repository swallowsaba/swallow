import { z } from 'zod';

/** GitHub のリポジトリ状態のスキーマ。`snapshotRepo` が返す形と 1 対 1 で対応させる。 */

export const repoSnapshotSchema = z.object({
  owner: z.string(),
  name: z.string(),
  defaultBranch: z.string(),
  protections: z.array(
    z.object({
      branch: z.string(),
      requiredApprovals: z.number().int(),
      requiredChecks: z.array(z.string()),
      blockDirectPush: z.boolean(),
    }),
  ),
  pulls: z.array(
    z.object({
      number: z.number().int(),
      title: z.string(),
      body: z.string(),
      author: z.string(),
      head: z.string(),
      base: z.string(),
      state: z.enum(['open', 'merged', 'closed']),
      reviews: z.array(
        z.object({
          reviewer: z.string(),
          state: z.enum(['approved', 'changes_requested', 'commented']),
          body: z.string(),
        }),
      ),
      labels: z.array(z.string()),
      checks: z.array(
        z.object({
          name: z.string(),
          status: z.enum(['queued', 'running', 'success', 'failure', 'skipped']),
          needs: z.array(z.string()),
          logs: z.array(z.string()),
        }),
      ),
    }),
  ),
  workflows: z.array(z.tuple([z.string(), z.string()])),
  nextPullNumber: z.number().int(),
  issues: z.array(
    z.object({
      number: z.number().int(),
      title: z.string(),
      body: z.string(),
      author: z.string(),
      state: z.enum(['open', 'closed']),
      labels: z.array(z.string()),
      assignees: z.array(z.string()),
      milestone: z.string().nullable(),
      closedBy: z.number().int().nullable(),
    }),
  ),
  nextIssueNumber: z.number().int(),
  projects: z.array(
    z.object({
      name: z.string(),
      columns: z.array(z.object({ name: z.string(), items: z.array(z.number().int()) })),
    }),
  ),
  codeowners: z.array(z.object({ pattern: z.string(), owners: z.array(z.string()) })),
  secrets: z.record(z.string(), z.string()),
  upstream: z.object({ owner: z.string(), name: z.string() }).nullable(),
  forks: z.array(z.object({ owner: z.string(), name: z.string() })),
  releases: z.array(
    z.object({
      tag: z.string(),
      title: z.string(),
      notes: z.string(),
      prerelease: z.boolean(),
    }),
  ),
});
