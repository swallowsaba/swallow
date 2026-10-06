import { dirname, resolve } from '../path';
import { formatOctal } from '../perm';
import type { CommandContext, CommandResult, CommandSpec, ShellState, SshHost } from '../registry';
import { createShellState } from '../session';
import { exists, isDir, list, metaOf, mkdir, readFile, setMeta, stat, writeFile } from '../vfs';
import { parseArgs } from './args';
import { currentUser } from './perm';

/**
 * SSH の鍵（docs/lessons/sec.md sec.b.04、docs/decisions.md D-17）。
 * ssh-keygen で鍵の対を作り、ssh-copy-id で公開鍵だけをサーバの ~/.ssh/authorized_keys に登録し、ssh で鍵を使って入る。
 * サーバ（setup の sshHosts）は、登録された公開鍵と、鍵で入った記録だけを持つ。
 * パスワードは打てないので、パスワードで入れるサーバでは、練習の端末が仮のパスワードを代わりに入れる（聞かれた行は出す）
 */

const TYPES = {
  ed25519: { name: 'ssh-ed25519', blob: 'AAAAC3NzaC1lZDI1NTE5AAAAI', mark: 'QyNTUxOQAAACA', file: 'id_ed25519', label: 'ED25519 256' },
  rsa: { name: 'ssh-rsa', blob: 'AAAAB3NzaC1yc2EAAAADAQABAAABgQ', mark: 'c3NoLXJzYQAAAAMBAAEAAAGB', file: 'id_rsa', label: 'RSA 3072' },
} as const;
type KeyType = keyof typeof TYPES;

/** ssh が試す秘密鍵（~/.ssh の中。本物と同じ順） */
const DEFAULT_IDENTITIES = ['id_rsa', 'id_ecdsa', 'id_ed25519'];

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** 文字列から決まる、見かけの base64 の並び（乱数は使わない。同じ機械・同じ場所なら同じ鍵） */
function digest(seed: string, length: number): string {
  let h = 0x811c9dc5;
  let out = '';
  for (let i = 0; out.length < length; i += 1) {
    const c = seed.charCodeAt(i % seed.length) + i;
    h = Math.imul(h ^ c, 0x01000193) >>> 0;
    out += B64[h % 64] ?? 'A';
  }
  return out;
}

const homeOf = (shell: ShellState): string => shell.vars.get('HOME') ?? `/home/${currentUser(shell)}`;
const hostnameOf = (shell: ShellState): string => shell.vars.get('HOSTNAME') ?? 'arena';

/** 公開鍵の行から、種類と中身（コメントを除く）。公開鍵でなければ null */
export function publicBlob(line: string): string | null {
  const m = /^(ssh-ed25519|ssh-rsa)\s+(AAAA[A-Za-z0-9+/=]+)/.exec(line.trim());
  return m ? `${m[1] ?? ''} ${m[2] ?? ''}` : null;
}

/** 秘密鍵のファイルの中身から、対になる公開鍵（種類と中身）。秘密鍵の形でなければ null */
export function privateToPublic(text: string): string | null {
  if (!text.startsWith('-----BEGIN OPENSSH PRIVATE KEY-----')) return null;
  for (const t of Object.values(TYPES)) {
    const at = text.indexOf(t.mark);
    if (at >= 0) return `${t.name} ${t.blob}${text.slice(at + t.mark.length, at + t.mark.length + 43)}`;
  }
  return null;
}

/** 鍵の対の中身。秘密鍵の中に公開鍵が入っている（本物の OpenSSH の形と同じ） */
function makePair(type: KeyType, seed: string, comment: string): { privateText: string; publicLine: string; fingerprint: string } {
  const t = TYPES[type];
  const body = digest(seed, 43);
  const secret = digest(`${seed}#secret`, 64);
  const privateText = [
    '-----BEGIN OPENSSH PRIVATE KEY-----',
    'b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtzc2gtZW',
    `${t.mark}${body}AAAAJ${secret.slice(0, 20)}`,
    secret.slice(20),
    '-----END OPENSSH PRIVATE KEY-----',
    '',
  ].join('\n');
  return { privateText, publicLine: `${t.name} ${t.blob}${body} ${comment}\n`, fingerprint: `SHA256:${digest(`${seed}#fp`, 43)}` };
}

/* ---------- ssh-keygen ---------- */

function keygen({ argv, shell }: CommandContext): CommandResult {
  let parsed;
  try {
    parsed = parseArgs(argv, { withValue: ['t', 'f', 'N', 'C', 'b'] });
  } catch (e) {
    return { stderr: `ssh-keygen: ${e instanceof Error ? e.message : String(e)}\n`, code: 1 };
  }
  const { values, flags } = parsed;
  const type = (values.get('t') ?? 'ed25519').toLowerCase();
  if (!(type in TYPES)) return { stderr: `unknown key type ${type}\n`, code: 1 };
  const t = TYPES[type as KeyType];
  const user = currentUser(shell);
  const home = homeOf(shell);
  const sshDir = `${home}/.ssh`;
  const given = values.get('f');
  const path = given !== undefined ? resolve(shell.cwd, given) : `${sshDir}/${t.file}`;
  const out: string[] = [];
  const quiet = flags.has('q');
  if (!quiet) out.push(`Generating public/private ${type} key pair.`);
  if (given === undefined && !quiet) out.push(`Enter file in which to save the key (${path}): `);
  let vfs = shell.vfs;
  if (exists(vfs, path)) return { stdout: out.map((l) => `${l}\n`).join(''), stderr: `${path} already exists.\nOverwrite (y/n)? \n`, code: 1 };
  if (given === undefined && !exists(vfs, sshDir)) {
    vfs = mkdir(vfs, sshDir, true);
    vfs = setMeta(vfs, sshDir, { mode: 0o700, owner: user, group: user });
    if (!quiet) out.push(`Created directory '${sshDir}'.`);
  }
  if (!isDir(vfs, dirname(path))) return { stdout: out.map((l) => `${l}\n`).join(''), stderr: `Saving key "${path}" failed: No such file or directory\n`, code: 1 };
  if (!values.has('N') && !quiet) out.push('Enter passphrase (empty for no passphrase): ', 'Enter same passphrase again: ');
  const comment = values.get('C') ?? `${user}@${hostnameOf(shell)}`;
  const pair = makePair(type as KeyType, `${user}@${hostnameOf(shell)}:${path}:${type}`, comment);
  vfs = writeFile(vfs, path, pair.privateText);
  vfs = setMeta(vfs, path, { mode: 0o600, owner: user, group: user });
  vfs = writeFile(vfs, `${path}.pub`, pair.publicLine);
  vfs = setMeta(vfs, `${path}.pub`, { mode: 0o644, owner: user, group: user });
  if (!quiet) {
    out.push(
      `Your identification has been saved in ${path}`,
      `Your public key has been saved in ${path}.pub`,
      'The key fingerprint is:',
      `${pair.fingerprint} ${comment}`,
    );
  }
  return { stdout: out.map((l) => `${l}\n`).join(''), patch: { vfs } };
}

/* ---------- 宛先と鍵 ---------- */

interface Target { user: string; host: SshHost }

/** 「利用者@名前」を、setup の sshHosts から引く。引けなければ本物と同じ文 */
function targetOf(shell: ShellState, dest: string, loginUser?: string): Target | { error: string } {
  const at = dest.lastIndexOf('@');
  const name = at >= 0 ? dest.slice(at + 1) : dest;
  const user = at >= 0 ? dest.slice(0, at) : (loginUser ?? currentUser(shell));
  const host = shell.sshHosts?.get(name);
  if (!host) return { error: `ssh: Could not resolve hostname ${name}: Name or service not known\n` };
  return { user, host };
}

/** 秘密鍵を試す。権限が広すぎる鍵は、本物と同じ警告を出して使わない */
function tryKeys(shell: ShellState, explicit: string | undefined, target: Target): { ok: boolean; warnings: string } {
  const sshDir = `${homeOf(shell)}/.ssh`;
  const paths = [
    ...(explicit !== undefined ? [resolve(shell.cwd, explicit)] : []),
    ...DEFAULT_IDENTITIES.map((f) => `${sshDir}/${f}`),
  ].filter((p, i, all) => all.indexOf(p) === i && stat(shell.vfs, p)?.kind === 'file');
  let warnings = '';
  for (const path of paths) {
    const blob = privateToPublic(readFile(shell.vfs, path));
    if (blob === null) {
      if (path === resolve(shell.cwd, explicit ?? '')) warnings += `Load key "${path}": invalid format\n`;
      continue;
    }
    const mode = metaOf(shell.vfs, path).mode;
    if ((mode & 0o077) !== 0) {
      warnings += [
        '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
        '@         WARNING: UNPROTECTED PRIVATE KEY FILE!          @',
        '@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@',
        `Permissions ${formatOctal(mode).padStart(4, '0')} for '${path}' are too open.`,
        'It is required that your private key files are NOT accessible by others.',
        'This private key will be ignored.',
        `Load key "${path}": bad permissions`,
        '',
      ].join('\n');
      continue;
    }
    if (target.user === target.host.user && target.host.authorized.some((line) => publicBlob(line) === blob)) return { ok: true, warnings };
  }
  return { ok: false, warnings };
}

/** 鍵で入れるか（判定の net の式 `ssh 利用者@名前`）: 鍵で入った記録があり、今も手元の秘密鍵で入れて、サーバに秘密鍵が置かれていない */
export function sshHolds(shell: ShellState, dest: string): boolean {
  const target = targetOf(shell, dest);
  if ('error' in target) return false;
  const leaked = target.host.authorized.some((line) => line.includes('PRIVATE KEY'));
  return target.host.keyLogins.includes(target.user) && !leaked && tryKeys(shell, undefined, target).ok;
}

const withHost = (shell: ShellState, host: SshHost): Partial<ShellState> => ({ sshHosts: new Map([...(shell.sshHosts ?? []), [host.host, host]]) });

/** サーバの中の機械（ホームと authorized_keys だけ）を作り、1 つのコマンドを打つ。authorized_keys の変更は残す */
function runRemote(ctx: CommandContext, target: Target, command: string): { result: CommandResult; host: SshHost } {
  const { user, host } = target;
  const home = `/home/${user}`;
  const keys = `${home}/.ssh/authorized_keys`;
  let remote = createShellState({
    files: { [home]: null, [`${home}/.ssh`]: null, [keys]: host.authorized.map((l) => `${l}\n`).join('') },
    cwd: home,
    vars: { USER: user, HOME: home, HOSTNAME: host.host },
  });
  let vfs = remote.vfs;
  for (const [p, mode] of [[home, 0o755], [`${home}/.ssh`, 0o700], [keys, 0o600]] as const) vfs = setMeta(vfs, p, { mode, owner: user, group: user });
  remote = { ...remote, vfs };
  const r = ctx.runLine(command, remote);
  const after = exists(r.state.vfs, keys) ? readFile(r.state.vfs, keys).split('\n').filter((l) => l.trim() !== '') : [];
  return { result: { stdout: r.stdout, stderr: r.stderr, code: r.code }, host: { ...host, authorized: after } };
}

/* ---------- ssh ---------- */

function ssh(ctx: CommandContext): CommandResult {
  const { argv, shell } = ctx;
  let parsed;
  try {
    parsed = parseArgs(argv, { withValue: ['i', 'p', 'o', 'l'] });
  } catch (e) {
    return { stderr: `ssh: ${e instanceof Error ? e.message : String(e)}\n`, code: 255 };
  }
  const [dest, ...command] = parsed.operands;
  if (dest === undefined) return { stderr: 'usage: ssh [-i identity_file] [-l login_name] [-p port] destination [command [argument ...]]\n', code: 255 };
  const target = targetOf(shell, dest, parsed.values.get('l'));
  if ('error' in target) return { stderr: target.error, code: 255 };
  const keyTry = tryKeys(shell, parsed.values.get('i'), target);
  let stderr = keyTry.warnings;
  let host = target.host;
  if (keyTry.ok) {
    if (!host.keyLogins.includes(target.user)) host = { ...host, keyLogins: [...host.keyLogins, target.user] };
  } else if (host.password && target.user === host.user) {
    // 鍵で入れず、パスワードで入った（練習の端末が仮のパスワードを入れる）
    stderr += `${target.user}@${host.host}'s password: \n`;
  } else {
    return { stderr: `${stderr}${target.user}@${host.host}: Permission denied (publickey${host.password ? ',password' : ''}).\n`, code: 255 };
  }
  if (command.length === 0) {
    const motd = host.motd !== undefined ? `${host.motd}\n\n` : '';
    return { stdout: `${motd}logout\nConnection to ${host.host} closed.\n`, ...(stderr ? { stderr } : {}), patch: withHost(shell, host) };
  }
  const remote = runRemote(ctx, { user: target.user, host }, command.join(' '));
  return {
    stdout: remote.result.stdout ?? '',
    stderr: stderr + (remote.result.stderr ?? ''),
    code: remote.result.code ?? 0,
    patch: withHost(shell, remote.host),
  };
}

/* ---------- ssh-copy-id ---------- */

const COPY_ID = '/usr/bin/ssh-copy-id';

function copyId({ argv, shell }: CommandContext): CommandResult {
  let parsed;
  try {
    parsed = parseArgs(argv, { withValue: ['i', 'p', 'o'] });
  } catch (e) {
    return { stderr: `${COPY_ID}: ERROR: ${e instanceof Error ? e.message : String(e)}\n`, code: 1 };
  }
  const dest = parsed.operands[0];
  if (dest === undefined) return { stderr: `Usage: ${COPY_ID} [-i [identity_file]] [-p port] [-o ssh_option] [user@]hostname\n`, code: 1 };
  const sshDir = `${homeOf(shell)}/.ssh`;
  // -i に秘密鍵を書いても、送るのは .pub（本物と同じ。秘密鍵は送らない）
  const given = parsed.values.get('i');
  let pub: string | undefined;
  if (given !== undefined) pub = resolve(shell.cwd, given.endsWith('.pub') ? given : `${given}.pub`);
  else if (isDir(shell.vfs, sshDir)) {
    const found = list(shell.vfs, sshDir).filter((f) => /^id_.*\.pub$/.test(f)).sort();
    if (found[0] !== undefined) pub = `${sshDir}/${found[0]}`;
  }
  if (pub === undefined) return { stderr: `${COPY_ID}: ERROR: No identities found\n`, code: 1 };
  if (stat(shell.vfs, pub)?.kind !== 'file') return { stderr: `${COPY_ID}: ERROR: failed to open ID file '${pub}': No such file or directory\n`, code: 1 };
  const line = readFile(shell.vfs, pub).trim();
  const blob = publicBlob(line);
  const target = targetOf(shell, dest);
  if ('error' in target) return { stderr: target.error, code: 1 };
  const { user, host } = target;
  const info = [
    `${COPY_ID}: INFO: Source of key(s) to be installed: "${pub}"`,
    `${COPY_ID}: INFO: attempting to log in with the new key(s), to filter out any that are already installed`,
  ];
  if (blob !== null && user === host.user && host.authorized.some((l) => publicBlob(l) === blob)) {
    return { stdout: `${info.join('\n')}\n`, stderr: `\n${COPY_ID}: WARNING: All keys were skipped because they already exist on the remote system.\n\t\t(if you think this is a mistake, you may want to use -f option)\n\n` };
  }
  // 登録の時は、仮のパスワードで入る（練習の端末が代わりに入れる）。パスワードで入れないサーバや、違う利用者は断られる
  if (!host.password || user !== host.user) {
    return { stdout: `${info.join('\n')}\n`, stderr: `${user}@${host.host}: Permission denied (publickey${host.password ? ',password' : ''}).\n`, code: 1 };
  }
  const next: SshHost = { ...host, authorized: [...host.authorized, line] };
  const out = [
    ...info,
    `${COPY_ID}: INFO: 1 key(s) remain to be installed -- if you are prompted now it is to install the new keys`,
    `${user}@${host.host}'s password: `,
    '',
    'Number of key(s) added: 1',
    '',
    `Now try logging into the machine, with:   "ssh '${user}@${host.host}'"`,
    'and check to make sure that only the key(s) you wanted were added.',
    '',
  ];
  return { stdout: out.join('\n'), patch: withHost(shell, next) };
}

export const sshCommands: CommandSpec[] = [
  { name: 'ssh-keygen', summary: 'SSH の鍵の対（秘密鍵と公開鍵）を作る', handler: keygen },
  { name: 'ssh-copy-id', summary: '公開鍵を、サーバの ~/.ssh/authorized_keys に登録する', handler: copyId },
  { name: 'ssh', summary: '鍵（またはパスワード）でサーバに入る。後ろにコマンドを書くと、サーバで打つ', handler: ssh },
];

