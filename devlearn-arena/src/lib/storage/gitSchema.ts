import { z } from 'zod';

/**
 * Git のリポジトリ状態のスキーマ。
 * `snapshotGit` が返す形と 1 対 1 で対応させる。
 */

const headSchema = z.union([
  z.object({ type: z.literal('branch'), name: z.string() }),
  z.object({ type: z.literal('detached'), hash: z.string() }),
]);

const gitSnapshotBaseSchema = z.object({
  root: z.string(),
  head: headSchema,
  refs: z.array(z.tuple([z.string(), z.string()])),
  index: z.array(z.object({ path: z.string(), mode: z.string(), hash: z.string() })),
  reflog: z.array(z.object({ hash: z.string(), message: z.string() })),
  stash: z
    .array(z.object({ message: z.string(), files: z.array(z.tuple([z.string(), z.string()])) }))
    .default([]),
  author: z.object({
    name: z.string(),
    email: z.string(),
    timestamp: z.number(),
    timezone: z.string(),
  }),
  origHead: z.string().nullable(),
  mergeHead: z.string().nullable().default(null),
  objects: z.array(
    z.object({ type: z.enum(['blob', 'tree', 'commit', 'tag']), body: z.string() }),
  ),
});

export const gitSnapshotSchema = gitSnapshotBaseSchema.extend({
  remotes: z
    .array(z.object({ name: z.string(), url: z.string(), state: gitSnapshotBaseSchema }))
    .default([]),
});
