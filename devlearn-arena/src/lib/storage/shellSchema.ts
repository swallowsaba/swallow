import { z } from 'zod';
import { clusterSnapshotSchema } from './clusterSchema';
import { gitSnapshotSchema } from './gitSchema';
import { topologySnapshotSchema } from './netSchema';
import { repoSnapshotSchema } from './repoSchema';

/**
 * シェルの状態そのもののスキーマ。
 * エンジンの直列化（`snapshotShell`）が返す形と 1 対 1 で対応させる。
 * ここを通らないデータは保存にも復元にも使わない。
 * 資源ごとの中身は、エンジンの区切りに合わせて別ファイルに分けてある。
 */
export { clusterSnapshotSchema } from './clusterSchema';
export { gitSnapshotSchema } from './gitSchema';
export { topologySnapshotSchema } from './netSchema';
export { repoSnapshotSchema } from './repoSchema';

export const shellSnapshotSchema = z.object({
  cwd: z.string().min(1),
  vars: z.record(z.string(), z.string()),
  files: z.record(
    z.string(),
    z.object({
      kind: z.enum(['dir', 'file']),
      content: z.string().optional(),
      // 既定と違う権限を持つものだけに付く
      meta: z
        .object({ mode: z.number().int(), owner: z.string(), group: z.string() })
        .optional(),
    }),
  ),
  history: z.array(z.string()).default([]),
  procs: z
    .object({
      processes: z.array(
        z.object({
          pid: z.number().int(),
          ppid: z.number().int(),
          user: z.string(),
          command: z.string(),
          cpu: z.number(),
          memory: z.number(),
          state: z.enum(['R', 'S', 'D', 'Z', 'T']),
          ignoresTerm: z.boolean(),
          openFiles: z.array(z.string()).readonly(),
          startedAt: z.number().int(),
        }),
      ),
      nextPid: z.number().int(),
      totalMemory: z.number(),
    })
    .default({ processes: [], nextPid: 100, totalMemory: 8192 }),
  git: gitSnapshotSchema.nullable().default(null),
  cluster: clusterSnapshotSchema.nullable().default(null),
  net: topologySnapshotSchema.nullable().default(null),
  repo: repoSnapshotSchema.nullable().default(null),
});
export type ShellSnapshot = z.infer<typeof shellSnapshotSchema>;
