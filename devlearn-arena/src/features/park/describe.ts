import type { VfsState } from '@/engines/kernel/vfs';
import { diffVfs } from '@/visual/iso';

export interface Change {
  kind: 'created-dir' | 'created-file' | 'updated' | 'removed' | 'moved-cwd' | 'none';
  text: string;
}

function isDirIn(vfs: VfsState, path: string): boolean {
  return vfs.nodes.get(path)?.kind === 'dir';
}

function short(path: string): string {
  return path.replace('/home/learner', '~');
}

/**
 * 「コマンドを打った → 何が起きたか」を言葉で返す。
 * 絵が変わるだけでは学びにならないので、変化を必ず説明する。
 */
export function describeChange(
  previous: VfsState | undefined,
  current: VfsState,
  previousCwd: string | undefined,
  currentCwd: string,
  exitCode: number,
): Change {
  if (previous === undefined) return { kind: 'none', text: '' };

  const diff = diffVfs(previous, current);

  const createdDirs = diff.added.filter((p) => isDirIn(current, p));
  const createdFiles = diff.added.filter((p) => !isDirIn(current, p));

  if (createdDirs.length > 0) {
    const head = createdDirs[0] ?? '';
    const extra = createdDirs.length > 1 ? ` ほか ${String(createdDirs.length - 1)} 件` : '';
    return { kind: 'created-dir', text: `ディレクトリ ${short(head)} を作りました${extra}` };
  }
  if (createdFiles.length > 0) {
    const head = createdFiles[0] ?? '';
    const extra = createdFiles.length > 1 ? ` ほか ${String(createdFiles.length - 1)} 件` : '';
    return { kind: 'created-file', text: `ファイル ${short(head)} ができました${extra}` };
  }
  if (diff.removed.length > 0) {
    const head = diff.removed[0] ?? '';
    const extra = diff.removed.length > 1 ? ` ほか ${String(diff.removed.length - 1)} 件` : '';
    return { kind: 'removed', text: `${short(head)} を削除しました${extra}` };
  }
  if (diff.changed.length > 0) {
    const head = diff.changed[0] ?? '';
    return { kind: 'updated', text: `${short(head)} の中身が書き換わりました` };
  }
  if (previousCwd !== undefined && previousCwd !== currentCwd) {
    return { kind: 'moved-cwd', text: `現在地が ${short(currentCwd)} に移りました` };
  }
  if (exitCode !== 0) {
    return { kind: 'none', text: 'コマンドが失敗したので、状態は変わっていません' };
  }
  return { kind: 'none', text: '状態は変わっていません（表示や確認のコマンド）' };
}
