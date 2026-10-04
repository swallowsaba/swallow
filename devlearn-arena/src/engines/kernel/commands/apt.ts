import {
  installed, listsText, LISTS_FILE, localIndex, resolveInstall, STATUS_FILE, statusText, upgradable, type PackageInfo,
} from '../packages';
import type { CommandResult, CommandSpec, ShellState } from '../registry';
import { exists, remove, setMeta, writeFile, type VfsState } from '../vfs';
import { fromLines } from './args';
import { currentUser } from './perm';

/**
 * apt と dpkg -l（src/engines/kernel/packages.ts の模型を操作する）。出力の形は Ubuntu の apt に寄せる。
 * 確かめの問い（Do you want to continue?）は出さず、続ける答えをした時と同じに進める
 */

const READING = ['Reading package lists... Done', 'Building dependency tree... Done', 'Reading state information... Done'];

const lockError = (file: string, what: string): CommandResult => ({
  stderr: `E: Could not open lock file ${file} - open (13: Permission denied)\nE: ${what}\n`,
  code: 100,
});

function withStatus(vfs: VfsState, list: ReadonlyMap<string, string>): VfsState {
  return writeFile(vfs, STATUS_FILE, statusText(list), true);
}

/** パッケージを入れる（実行ファイルを置き、記録に書く） */
function place(vfs: VfsState, list: Map<string, string>, p: PackageInfo): VfsState {
  list.set(p.name, p.version);
  if (!p.bin) return vfs;
  const next = writeFile(vfs, p.bin.path, p.bin.content, true);
  return setMeta(next, p.bin.path, { mode: 0o755, owner: 'root', group: 'root' });
}

function update(shell: ShellState): CommandResult {
  if (currentUser(shell) !== 'root') return lockError('/var/lib/apt/lists/lock', 'Unable to lock directory /var/lib/apt/lists/');
  const vfs = writeFile(shell.vfs, LISTS_FILE, listsText(), true);
  const n = upgradable(vfs).length;
  return {
    stdout: fromLines([
      'Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease',
      'Get:2 http://archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]',
      'Get:3 http://archive.ubuntu.com/ubuntu noble/main amd64 Packages [1401 kB]',
      'Fetched 1527 kB in 1s (1527 kB/s)',
      ...READING,
      n === 0 ? 'All packages are up to date.' : `${String(n)} package${n === 1 ? '' : 's'} can be upgraded. Run 'apt list --upgradable' to see them.`,
    ]),
    patch: { vfs },
  };
}

function install(shell: ShellState, names: string[]): CommandResult {
  if (names.length === 0) return { stderr: 'E: No packages found\n', code: 100 };
  if (currentUser(shell) !== 'root') {
    return lockError('/var/lib/dpkg/lock-frontend', 'Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?');
  }
  const index = localIndex(shell.vfs);
  const plan = resolveInstall(index, names);
  if ('missing' in plan) return { stdout: fromLines(READING), stderr: `E: Unable to locate package ${plan.missing}\n`, code: 100 };
  const list = installed(shell.vfs);
  const fresh = plan.order.filter((p) => list.get(p.name) !== p.version);
  const already = names.filter((n) => list.get(n) === index.get(n)?.version);
  if (fresh.length === 0) {
    return { stdout: fromLines([...READING, ...already.map((n) => `${n} is already the newest version (${list.get(n) ?? ''}).`), '0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.']) };
  }
  const extra = fresh.filter((p) => !names.includes(p.name));
  const upgraded = fresh.filter((p) => list.has(p.name));
  const added = fresh.filter((p) => !list.has(p.name));
  let vfs = shell.vfs;
  for (const p of fresh) vfs = place(vfs, list, p);
  vfs = withStatus(vfs, list);
  const kb = fresh.reduce((a, p) => a + p.size, 0);
  return {
    stdout: fromLines([
      ...READING,
      ...(extra.length > 0 ? ['The following additional packages will be installed:', `  ${extra.map((p) => p.name).join(' ')}`] : []),
      ...(added.length > 0 ? ['The following NEW packages will be installed:', `  ${added.map((p) => p.name).join(' ')}`] : []),
      `${String(upgraded.length)} upgraded, ${String(added.length)} newly installed, 0 to remove and ${String(upgradable(vfs).length)} not upgraded.`,
      `Need to get ${String(kb)} kB of archives.`,
      ...fresh.map((p, i) => `Get:${String(i + 1)} http://archive.ubuntu.com/ubuntu noble/main amd64 ${p.name} amd64 ${p.version} [${String(p.size)} kB]`),
      ...fresh.map((p) => `Setting up ${p.name} (${p.version}) ...`),
    ]),
    patch: { vfs },
  };
}

function upgrade(shell: ShellState): CommandResult {
  if (currentUser(shell) !== 'root') {
    return lockError('/var/lib/dpkg/lock-frontend', 'Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?');
  }
  const todo = upgradable(shell.vfs);
  if (todo.length === 0) return { stdout: fromLines([...READING, 'Calculating upgrade... Done', '0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.']) };
  const list = installed(shell.vfs);
  let vfs = shell.vfs;
  for (const p of todo) vfs = place(vfs, list, p);
  vfs = withStatus(vfs, list);
  return {
    stdout: fromLines([
      ...READING,
      'Calculating upgrade... Done',
      'The following packages will be upgraded:',
      `  ${todo.map((p) => p.name).join(' ')}`,
      `${String(todo.length)} upgraded, 0 newly installed, 0 to remove and 0 not upgraded.`,
      ...todo.map((p) => `Setting up ${p.name} (${p.version}) ...`),
    ]),
    patch: { vfs },
  };
}

function removePackages(shell: ShellState, names: string[]): CommandResult {
  if (currentUser(shell) !== 'root') {
    return lockError('/var/lib/dpkg/lock-frontend', 'Unable to acquire the dpkg frontend lock (/var/lib/dpkg/lock-frontend), are you root?');
  }
  const list = installed(shell.vfs);
  const gone = names.filter((n) => list.has(n));
  const missing = names.filter((n) => !list.has(n));
  if (gone.length === 0) {
    return { stdout: fromLines([...READING, ...missing.map((n) => `Package '${n}' is not installed, so not removed`), '0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.']) };
  }
  let vfs = shell.vfs;
  const index = new Map([...localIndex(shell.vfs)]);
  for (const n of gone) {
    list.delete(n);
    const bin = index.get(n)?.bin;
    if (bin && exists(vfs, bin.path)) vfs = remove(vfs, bin.path);
  }
  vfs = withStatus(vfs, list);
  return {
    stdout: fromLines([
      ...READING,
      'The following packages will be REMOVED:',
      `  ${gone.join(' ')}`,
      `0 upgraded, 0 newly installed, ${String(gone.length)} to remove and 0 not upgraded.`,
      ...gone.map((n) => `Removing ${n} ...`),
    ]),
    patch: { vfs },
  };
}

function listPackages(shell: ShellState, flags: string[]): CommandResult {
  const list = installed(shell.vfs);
  if (flags.includes('--upgradable')) {
    const rows = upgradable(shell.vfs).map((p) => `${p.name}/noble-updates ${p.version} amd64 [upgradable from: ${list.get(p.name) ?? ''}]`);
    return { stdout: fromLines(['Listing... Done', ...rows]) };
  }
  if (flags.includes('--installed')) {
    const rows = [...list].sort(([a], [b]) => a.localeCompare(b)).map(([n, v]) => `${n}/noble,now ${v} amd64 [installed]`);
    return { stdout: fromLines(['Listing... Done', ...rows]) };
  }
  const rows = [...localIndex(shell.vfs).values()].map((p) => `${p.name}/noble ${p.version} amd64${list.has(p.name) ? ' [installed]' : ''}`);
  return { stdout: fromLines(['Listing... Done', ...rows]) };
}

function apt(argv: readonly string[], shell: ShellState, name: string): CommandResult {
  const args = argv.slice(1).filter((a) => a !== '-y' && a !== '--yes' && a !== '-q');
  const [verb, ...rest] = args;
  const names = rest.filter((a) => !a.startsWith('-'));
  switch (verb) {
    case 'update':
      return update(shell);
    case 'install':
      return install(shell, names);
    case 'upgrade':
    case 'full-upgrade':
      return upgrade(shell);
    case 'remove':
    case 'purge':
      return removePackages(shell, names);
    case 'list':
      if (name !== 'apt') return { stderr: `E: Invalid operation list\n`, code: 100 };
      return listPackages(shell, rest);
    case 'show': {
      const p = localIndex(shell.vfs).get(names[0] ?? '');
      if (!p) return { stderr: `E: No packages found\n`, code: 100 };
      return { stdout: fromLines([`Package: ${p.name}`, `Version: ${p.version}`, ...(p.depends.length > 0 ? [`Depends: ${p.depends.join(', ')}`] : []), `Description: ${p.description}`]) };
    }
    case undefined:
      return { stdout: `${name} 2.7.14 (amd64)\nUsage: ${name} [options] command\n` };
    default:
      return { stderr: `E: Invalid operation ${verb}\n`, code: 100 };
  }
}

export const aptCommands: CommandSpec[] = [
  {
    name: 'apt',
    summary: 'パッケージを入れる・更新する・消す（update / install / upgrade / remove / list）',
    handler: ({ argv, shell }) => apt(argv, shell, 'apt'),
  },
  {
    name: 'apt-get',
    summary: 'apt と同じ（台本向けの古い形）',
    handler: ({ argv, shell }) => apt(argv, shell, 'apt-get'),
  },
  {
    name: 'dpkg',
    summary: '入っているパッケージの一覧（-l）',
    handler: ({ argv, shell }) => {
      if (argv[1] !== '-l') return { stderr: 'dpkg: error: need an action option\n', code: 2 };
      const want = argv[2];
      const rows = [...installed(shell.vfs)].filter(([n]) => want === undefined || n === want).sort(([a], [b]) => a.localeCompare(b))
        .map(([n, v]) => `ii  ${n.padEnd(14)} ${v.padEnd(20)} amd64`);
      if (rows.length === 0) return { stderr: `dpkg-query: no packages found matching ${want ?? ''}\n`, code: 1 };
      return { stdout: fromLines(['||/ Name           Version              Architecture', ...rows]) };
    },
  },
];
