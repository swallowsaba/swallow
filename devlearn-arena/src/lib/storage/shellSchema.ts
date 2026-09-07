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
    z.object({ kind: z.enum(['dir', 'file']), content: z.string().optional() }),
  ),
  history: z.array(z.string()).default([]),
  git: gitSnapshotSchema.nullable().default(null),
  cluster: clusterSnapshotSchema.nullable().default(null),
  net: topologySnapshotSchema.nullable().default(null),
  repo: repoSnapshotSchema.nullable().default(null),
});
export type ShellSnapshot = z.infer<typeof shellSnapshotSchema>;
