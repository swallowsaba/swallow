import { exists, readFile, writeFile, type VfsState } from './vfs';

/**
 * 利用者とグループ（/etc/group）。本物と同じ形の 1 行 1 グループ（名前:x:番号:入っている利用者,…）。
 * /etc/group を書き換えても、今のシェルが入っているグループ（GROUPS）は入り直すまで変わらない
 */

export const GROUP_FILE = '/etc/group';

export interface GroupEntry {
  name: string;
  gid: number;
  members: string[];
}

export function readGroups(vfs: VfsState): GroupEntry[] {
  if (!exists(vfs, GROUP_FILE)) return [];
  return readFile(vfs, GROUP_FILE)
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => {
      const [name = '', , gid = '0', members = ''] = line.split(':');
      return { name, gid: Number(gid), members: members.split(',').filter((m) => m !== '') };
    });
}

export function writeGroups(vfs: VfsState, groups: readonly GroupEntry[]): VfsState {
  return writeFile(vfs, GROUP_FILE, groups.map((g) => `${g.name}:x:${String(g.gid)}:${g.members.join(',')}\n`).join(''));
}

/** その利用者が入っているグループ（自分と同じ名前のグループが先頭）。/etc/group を今読んだ値 */
export function groupsOfUser(vfs: VfsState, user: string): string[] {
  const extra = readGroups(vfs).filter((g) => g.name !== user && g.members.includes(user)).map((g) => g.name);
  return [user, ...extra];
}

/** グループの番号。/etc/group に無ければ、root は 0、それ以外は 1000 */
export function gidOf(vfs: VfsState, group: string): number {
  return readGroups(vfs).find((g) => g.name === group)?.gid ?? (group === 'root' ? 0 : 1000);
}

/** setup の groups（グループ → 入っている利用者）から /etc/group の中身を作る。番号は 1001 から順に振る */
export function groupFileOf(groups: Readonly<Record<string, readonly string[]>>, user: string): string {
  const base: GroupEntry[] = [{ name: 'root', gid: 0, members: [] }];
  if (user !== 'root') base.push({ name: user, gid: 1000, members: [] });
  const custom = Object.entries(groups).map(([name, members], i) => ({ name, gid: 1001 + i, members: [...members] }));
  return [...base, ...custom].map((g) => `${g.name}:x:${String(g.gid)}:${g.members.join(',')}\n`).join('');
}
