import type { CommandSpec, ShellState } from '../registry';
import { exists, isDir, readFile, writeFile, type VfsState } from '../vfs';
import { fromLines } from './args';
import { currentUser } from './perm';

/**
 * 記憶装置とマウント（linux.a.03）。setup の blockDevices の装置を、mkfs でファイルシステムにし、mount で木に取り付ける。
 * 再起動すると、/etc/fstab に書いた物だけが取り付く（本物と同じ）。fstab の誤りで取り付かない時は、緊急モードで止まる
 */

export interface BlockDevice {
  name: string;
  size: string;
  fs?: string;
  uuid?: string;
  mount?: string;
}

/** 装置の今の状態を置く場所（本物の /proc/mounts と /dev の代わり） */
const STATE = '/run/.blockdevices';
const FSTAB = '/etc/fstab';
const SUPPORTED = new Set(['ext4', 'xfs']);

export const devicesOf = (vfs: VfsState): BlockDevice[] => (exists(vfs, STATE) ? (JSON.parse(readFile(vfs, STATE)) as BlockDevice[]) : []);
const saved = (vfs: VfsState, list: readonly BlockDevice[]): VfsState => writeFile(vfs, STATE, JSON.stringify(list), true);
export const blockStateFile = (list: readonly BlockDevice[]): [string, string] => [STATE, JSON.stringify(list)];

const devOf = (list: readonly BlockDevice[], arg: string): BlockDevice | undefined => list.find((d) => `/dev/${d.name}` === arg || (d.uuid !== undefined && `UUID=${d.uuid}` === arg));

/** /etc/fstab の行（コメントと空の行を除く） */
function fstabLines(vfs: VfsState): { dev: string; dir: string; type: string }[] {
  if (!exists(vfs, FSTAB)) return [];
  return readFile(vfs, FSTAB).split('\n').map((l) => l.replace(/#.*$/, '').trim()).filter((l) => l !== '').flatMap((l) => {
    const [dev, dir, type] = l.split(/\s+/);
    return dev !== undefined && dir !== undefined && type !== undefined ? [{ dev, dir, type }] : [];
  });
}

/** 取り付けを試す。誤りの文を返す（無ければ null） */
function tryMount(vfs: VfsState, list: BlockDevice[], dev: string, dir: string): string | null {
  const d = devOf(list, dev);
  if (!d) return `mount: ${dir}: special device ${dev} does not exist.`;
  if (!exists(vfs, dir) || !isDir(vfs, dir)) return `mount: ${dir}: mount point does not exist.`;
  if (d.fs === undefined || !SUPPORTED.has(d.fs)) return `mount: ${dir}: wrong fs type, bad option, bad superblock on /dev/${d.name}, missing codepage or helper program, or other error.`;
  d.mount = dir;
  return null;
}

/** 再起動: 全てを外し、fstab の物だけを取り付ける。fstab の誤りは、緊急モードの知らせになる */
export function remountAfterReboot(vfs: VfsState): { vfs: VfsState; failed: string | null } {
  const list = devicesOf(vfs);
  for (const d of list) delete d.mount;
  if (list.length === 0) return { vfs, failed: null };
  let failed: string | null = null;
  for (const e of fstabLines(vfs)) failed = tryMount(vfs, list, e.dev, e.dir) ?? failed;
  const log = list.filter((d) => d.mount !== undefined).map((d) => `[  OK  ] Mounted ${d.mount ?? ''}.\n`).join('');
  return { vfs: writeFile(saved(vfs, list), '/var/log/boot.log', log, true), failed };
}

const denied = (shell: ShellState): boolean => currentUser(shell) !== 'root';

const SSHD_KEYS = new Set(['port', 'addressfamily', 'listenaddress', 'hostkey', 'permitrootlogin', 'passwordauthentication', 'pubkeyauthentication', 'kbdinteractiveauthentication', 'challengeresponseauthentication', 'usepam', 'x11forwarding', 'printmotd', 'acceptenv', 'subsystem', 'allowusers', 'denyusers', 'maxauthtries', 'clientaliveinterval', 'clientalivecountmax', 'authorizedkeysfile', 'permitemptypasswords', 'allowtcpforwarding', 'include', 'loglevel', 'syslogfacility', 'logingracetime']);

export const blockCommands: CommandSpec[] = [
  {
    name: 'sshd',
    summary: 'SSH の受け口。sshd -t で設定（/etc/ssh/sshd_config）を検査する',
    handler: ({ argv, shell }) => {
      if (!argv.includes('-t')) return { stderr: 'sshd re-exec requires execution with an absolute path\n', code: 255 };
      const path = '/etc/ssh/sshd_config';
      if (!exists(shell.vfs, path)) return { stderr: `${path}: No such file or directory\n`, code: 255 };
      const bad = readFile(shell.vfs, path).split('\n').flatMap((l, i) => {
        const key = l.replace(/#.*$/, '').trim().split(/\s+/)[0] ?? '';
        return key !== '' && !SSHD_KEYS.has(key.toLowerCase()) ? [`${path}: line ${String(i + 1)}: Bad configuration option: ${key}`] : [];
      });
      if (bad.length === 0) return {};
      return { stderr: `${bad.join('\n')}\n${path}: terminating, ${String(bad.length)} bad configuration options\n`, code: 255 };
    },
  },
  {
    name: 'lsblk',
    summary: '記憶装置の一覧を見る（-f でファイルシステムも）',
    handler: ({ argv, shell }) => {
      const list = devicesOf(shell.vfs);
      if (argv.includes('-f')) {
        const rows = [['NAME', 'FSTYPE', 'UUID', 'MOUNTPOINTS'], ['vda', 'ext4', '9f0c2a1e-1111-4a2b-8c3d-000000000001', '/'], ...list.map((d) => [d.name, d.fs ?? '', d.uuid ?? '', d.mount ?? ''])];
        return { stdout: fromLines(rows.map((r) => r.map((c, i) => c.padEnd([7, 7, 37, 0][i] ?? 0)).join('').trimEnd())) };
      }
      const line = (n: string, min: number, size: string, m: string): string => `${n.padEnd(7)}253:${String(min).padEnd(4)}  0 ${size.padStart(5)}  0 disk ${m}`.trimEnd();
      return { stdout: fromLines(['NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS', line('vda', 0, '20G', '/'), ...list.map((d, i) => line(d.name, 16 * (i + 1), d.size, d.mount ?? ''))]) };
    },
  },
  {
    name: 'mkfs.ext4',
    summary: '装置にファイルシステムを作る（中身は消える）',
    handler: ({ argv, shell }) => makeFs(argv.slice(1), 'ext4', shell),
  },
  {
    name: 'mkfs',
    summary: '装置にファイルシステムを作る（-t ext4）',
    handler: ({ argv, shell }) => {
      const at = argv.indexOf('-t');
      const type = at >= 0 ? argv[at + 1] : 'ext2';
      return makeFs(argv.slice(1).filter((a, i) => a !== '-t' && argv.slice(1)[i - 1] !== '-t'), type ?? 'ext2', shell);
    },
  },
  {
    name: 'blkid',
    summary: '装置の UUID とファイルシステムの種類を見る',
    handler: ({ argv, shell }) => {
      const list = devicesOf(shell.vfs).filter((d) => d.fs !== undefined && (argv.length < 2 || argv.includes(`/dev/${d.name}`)));
      if (list.length === 0) return { code: 2 };
      return { stdout: fromLines(list.map((d) => `/dev/${d.name}: UUID="${d.uuid ?? ''}" BLOCK_SIZE="4096" TYPE="${d.fs ?? ''}"`)) };
    },
  },
  {
    name: 'mount',
    summary: '装置を木に取り付ける（mount 装置 場所。-a で /etc/fstab の全て）',
    handler: ({ argv, shell }) => {
      const args = argv.slice(1).filter((a) => a !== '-v');
      const list = devicesOf(shell.vfs);
      if (args.length === 0) return { stdout: fromLines(['/dev/vda on / type ext4 (rw,relatime)', ...list.filter((d) => d.mount).map((d) => `/dev/${d.name} on ${d.mount ?? ''} type ${d.fs ?? ''} (rw,relatime)`)]) };
      if (denied(shell)) return { stderr: `mount: ${args[args.length - 1] ?? ''}: must be superuser to use mount.\n`, code: 32 };
      if (args.includes('-a')) {
        for (const e of fstabLines(shell.vfs)) {
          if (e.dir === '/' || e.type === 'swap') continue;
          const err = list.some((d) => d.mount === e.dir) ? null : tryMount(shell.vfs, list, e.dev, e.dir);
          if (err) return { stderr: `${err}\n`, code: 32 };
        }
        return { patch: { vfs: saved(shell.vfs, list) } };
      }
      const [dev, dir] = args;
      if (dev === undefined || dir === undefined) return { stderr: `mount: ${dev ?? ''}: can't find in /etc/fstab.\n`, code: 1 };
      const err = tryMount(shell.vfs, list, dev, dir);
      if (err) return { stderr: `${err}\n`, code: 32 };
      return { patch: { vfs: saved(shell.vfs, list) } };
    },
  },
  {
    name: 'umount',
    summary: '装置を木から外す',
    handler: ({ argv, shell }) => {
      const arg = argv[1] ?? '';
      if (denied(shell)) return { stderr: `umount: ${arg}: must be superuser to unmount.\n`, code: 32 };
      const list = devicesOf(shell.vfs);
      const d = list.find((x) => x.mount === arg || `/dev/${x.name}` === arg);
      if (!d?.mount) return { stderr: `umount: ${arg}: not mounted.\n`, code: 32 };
      delete d.mount;
      return { patch: { vfs: saved(shell.vfs, list) } };
    },
  },
  {
    name: 'findmnt',
    summary: 'その場所に何が取り付いているかを見る',
    handler: ({ argv, shell }) => {
      const dir = argv.slice(1).find((a) => !a.startsWith('-'));
      const d = devicesOf(shell.vfs).find((x) => x.mount === dir);
      if (!d) return { code: 1 };
      return { stdout: fromLines(['TARGET SOURCE    FSTYPE OPTIONS', `${d.mount ?? ''} /dev/${d.name} ${d.fs ?? ''}   rw,relatime`]) };
    },
  },
];

function makeFs(args: readonly string[], type: string, shell: ShellState): { stdout?: string; stderr?: string; code?: number; patch?: Partial<ShellState> } {
  const dev = args.find((a) => !a.startsWith('-'));
  if (dev === undefined) return { stderr: 'Usage: mkfs.ext4 [-F] device\n', code: 1 };
  if (denied(shell)) return { stderr: `mke2fs 1.47.0 (5-Feb-2023)\nCould not open ${dev}: Permission denied\n`, code: 1 };
  const list = devicesOf(shell.vfs);
  const d = devOf(list, dev);
  if (!d) return { stderr: `mke2fs 1.47.0 (5-Feb-2023)\nThe file ${dev} does not exist and no size was specified.\n`, code: 1 };
  if (d.mount) return { stderr: `mke2fs 1.47.0 (5-Feb-2023)\n${dev} contains a ext4 file system\n\t/dev/${d.name} is mounted; will not make a filesystem here!\n`, code: 1 };
  d.fs = type;
  d.uuid = `7c3e1a90-2b4d-4f6e-9a10-${String(list.indexOf(d) + 1).padStart(12, '0')}`;
  return { stdout: fromLines(['mke2fs 1.47.0 (5-Feb-2023)', `Creating filesystem with 26214400 4k blocks and 6553600 inodes`, `Filesystem UUID: ${d.uuid}`, 'Writing superblocks and filesystem accounting information: done']), patch: { vfs: saved(shell.vfs, list) } };
}
