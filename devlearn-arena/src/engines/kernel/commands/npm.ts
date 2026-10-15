import { allMatch, bundleText, fill, lockText, readLock, readPackageJson, resolveVersion, type Files, type PackageJson } from '@/engines/cicd/project';
import type { ActionsSetup, ScriptModel } from '@/engines/cicd/setup';
import type { SiteState } from '@/engines/cicd/types';
import type { Forge } from '@/engines/github/forge';
import { resolve } from '../path';
import type { CommandContext, CommandResult, CommandSpec, GitServer, ShellState } from '../registry';
import { exists, isDir, list, mkdir, readFile, remove, writeFile, type VfsState } from '../vfs';
import { forgeServer } from './ghForge';
import { formatUtcTime, parseLocalTime } from './gitShared';
import { START_TIME } from '../cron';

/**
 * npm（docs/lessons/cicd.md）。本物の npm 10 の出し方で答える。
 * - npm ci は package-lock.json の版を、npm install は package.json の範囲に合う置き場の一番新しい版を node_modules に入れる
 * - npm run・npm test は、本物と同じく「> 名前@版 script」「> 中身」を出してから動かす。
 *   scripts が呼ぶ道具（tsc・esbuild・vitest・rsync など）の振る舞いは、Git のサーバの置き場の setup.actions.scripts の模型で決まる。
 *   模型に無い script は、中身をそのままシェルで動かす
 * 模型は、runner の中なら GITHUB_REPOSITORY の置き場、手元なら今いるリポジトリの origin の置き場から読む。どちらも無ければ npm は入っていない
 */

const CI_SECONDS = '__CI_SECONDS';

function modelOf(shell: ShellState): { server: GitServer; forge: Forge; actions: ActionsSetup } | null {
  const repo = shell.vars.get('GITHUB_REPOSITORY');
  const server = repo !== undefined
    ? [...(shell.gitServers?.values() ?? [])].find((g) => g.forge?.setup.repo === repo)
    : forgeServer(shell) ?? undefined;
  const forge = server?.forge;
  return server && forge?.setup.actions ? { server, forge, actions: forge.setup.actions } : null;
}

/** 今の時刻（runner の __NOW に、それまでにかかった秒を足す） */
const nowOf = (shell: ShellState): number =>
  (parseLocalTime(shell.vars.get('__NOW') ?? START_TIME) ?? 0) + (Number(shell.vars.get(CI_SECONDS) ?? '0') || 0);

const spent = (shell: ShellState, seconds: number): Partial<ShellState> => {
  const vars = new Map(shell.vars);
  vars.set(CI_SECONDS, String((Number(shell.vars.get(CI_SECONDS) ?? '0') || 0) + seconds));
  return { vars };
};

const logStamp = (shell: ShellState): string => `${formatUtcTime(nowOf(shell)).replace(/:/g, '_')}_000Z`;

const npmError = (shell: ShellState, lines: string[], code: number): CommandResult => ({
  stderr: `${[...lines, `A complete log of this run can be found in: ${shell.vars.get('HOME') ?? '/home/learner'}/.npm/_logs/${logStamp(shell)}-debug-0.log`].map((l) => `npm error ${l}`.trimEnd()).join('\n')}\n`,
  code,
});

function readPkg(shell: ShellState): PackageJson | CommandResult {
  const path = resolve(shell.cwd, 'package.json');
  if (!exists(shell.vfs, path) || isDir(shell.vfs, path)) {
    return npmError(shell, ['code ENOENT', 'syscall open', `path ${path}`, 'errno -2', `enoent Could not read package.json: Error: ENOENT: no such file or directory, open '${path}'`, 'enoent This is related to npm not being able to find a file.', 'enoent'], 254);
  }
  const pkg = readPackageJson(readFile(shell.vfs, path));
  if (!pkg) return npmError(shell, ['code EJSONPARSE', `path ${path}`, 'JSON.parse Invalid package.json'], 1);
  return pkg;
}

/** 作業の場所の下のファイル（場所 → 中身。node_modules と .git は除く） */
function workFiles(vfs: VfsState, root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string, rel: string): void => {
    for (const name of list(vfs, d)) {
      if (rel === '' && name === '.git') continue;
      const full = `${d}/${name}`;
      const r = rel === '' ? name : `${rel}/${name}`;
      if (isDir(vfs, full)) walk(full, r);
      else out[r] = readFile(vfs, full);
    }
  };
  if (isDir(vfs, root)) walk(root, '');
  return out;
}

/** 入れてある部品の版（node_modules/<名前>/package.json） */
function installed(shell: ShellState): Record<string, string> {
  const nm = resolve(shell.cwd, 'node_modules');
  if (!isDir(shell.vfs, nm)) return {};
  const out: Record<string, string> = {};
  for (const name of list(shell.vfs, nm)) {
    const p = `${nm}/${name}/package.json`;
    if (!exists(shell.vfs, p)) continue;
    const v = readPackageJson(readFile(shell.vfs, p))?.version;
    if (v !== undefined) out[name] = v;
  }
  return out;
}

function install({ shell, argv }: CommandContext, model: ActionsSetup, pkg: PackageJson): CommandResult {
  const ci = argv[1] === 'ci';
  const lockPath = resolve(shell.cwd, 'package-lock.json');
  const lock = exists(shell.vfs, lockPath) ? readLock(readFile(shell.vfs, lockPath)) : null;
  const wanted = { ...pkg.dependencies, ...pkg.devDependencies };
  if (ci && lock === null) {
    return npmError(shell, ['code EUSAGE', '', 'The `npm ci` command can only install with an existing package-lock.json or', 'npm-shrinkwrap.json with lockfileVersion >= 1. Run an install with npm@5 or', 'later to generate a package-lock.json file, then try again.', '', 'Clean install a project', '', 'Usage:', 'npm ci'], 1);
  }
  const now = nowOf(shell);
  const versions: Record<string, string> = {};
  for (const [name, range] of Object.entries(wanted)) {
    const locked = lock?.[name];
    if (ci) {
      if (locked === undefined) {
        return npmError(shell, ['code EUSAGE', '', '`npm ci` can only install packages when your package.json and package-lock.json or', 'npm-shrinkwrap.json are in sync. Please update your lock file with `npm install`', 'before continuing.', '', `Missing: ${name}@${range} from lock file`], 1);
      }
      versions[name] = locked;
      continue;
    }
    if (locked !== undefined) {
      versions[name] = locked;
      continue;
    }
    const v = resolveVersion(model, name, range, now, parseLocalTime);
    if (v === null) return npmError(shell, ['code ETARGET', `notarget No matching version found for ${name}@${range}.`, 'notarget In most cases you or one of your dependencies are requesting', "notarget a package version that doesn't exist."], 1);
    versions[name] = v;
  }
  const nm = resolve(shell.cwd, 'node_modules');
  let vfs = exists(shell.vfs, nm) ? remove(shell.vfs, nm, true) : shell.vfs;
  vfs = mkdir(vfs, nm, true);
  for (const [name, version] of Object.entries(versions)) {
    vfs = writeFile(vfs, `${nm}/${name}/package.json`, `${JSON.stringify({ name, version }, null, 2)}\n`, true);
  }
  if (!ci) vfs = writeFile(vfs, lockPath, lockText(pkg, versions));
  const n = Object.keys(versions).length;
  const secs = Math.max(1, model.installSeconds);
  return {
    stdout: `\nadded ${String(n)} package${n === 1 ? '' : 's'}, and audited ${String(n + 1)} packages in ${String(secs)}s\n\nfound 0 vulnerabilities\n`,
    patch: { vfs, ...spent(shell, model.installSeconds) },
  };
}

/** npm install 名前[@版]: package.json に書き足して（版の範囲は ^ 付き。--save-exact なら版そのもの）、まとめて入れ直す */
function addPackages(ctx: CommandContext, model: ActionsSetup, names: readonly string[], exact: boolean, dev: boolean): CommandResult {
  const { shell } = ctx;
  const path = resolve(shell.cwd, 'package.json');
  const raw = JSON.parse(readFile(shell.vfs, path)) as Record<string, unknown>;
  const field = dev ? 'devDependencies' : 'dependencies';
  const deps = { ...((raw[field] as Record<string, string> | undefined) ?? {}) };
  const now = nowOf(shell);
  for (const spec of names) {
    const at = spec.lastIndexOf('@');
    const name = at > 0 ? spec.slice(0, at) : spec;
    const range = at > 0 ? spec.slice(at + 1) : 'latest';
    const v = resolveVersion(model, name, range, now, parseLocalTime);
    if (v === null) return npmError(shell, ['code ETARGET', `notarget No matching version found for ${name}@${range}.`, 'notarget In most cases you or one of your dependencies are requesting', "notarget a package version that doesn't exist."], 1);
    deps[name] = exact ? v : `^${v}`;
  }
  raw[field] = deps;
  const text = `${JSON.stringify(raw, null, 2)}\n`;
  const next = readPackageJson(text);
  if (!next) return npmError(shell, ['code EJSONPARSE'], 1);
  // 書き足した部品の版は、前の package-lock.json の版にしばられない
  const lockPath = resolve(shell.cwd, 'package-lock.json');
  const lock = exists(shell.vfs, lockPath) ? readLock(readFile(shell.vfs, lockPath)) : null;
  const kept = Object.fromEntries(Object.entries(lock ?? {}).filter(([n]) => !names.some((s) => s === n || s.startsWith(`${n}@`))));
  const vfs = writeFile(writeFile(shell.vfs, path, text), lockPath, lockText(next, kept));
  return install({ ...ctx, shell: { ...shell, vfs }, argv: ['npm', 'install'] }, model, next);
}

/** 配る先の今（無ければ null） */
function siteIn(forge: Forge, host: string | undefined): { at: number; site: SiteState } | null {
  const at = (forge.sites ?? []).findIndex((s) => s.host === host);
  const site = forge.sites?.[at];
  return site ? { at, site } : null;
}

function withSite(shell: ShellState, server: GitServer, forge: Forge, at: number, site: SiteState): Partial<ShellState> {
  const servers = new Map(shell.gitServers);
  const sites = [...(forge.sites ?? [])];
  sites[at] = site;
  servers.set(server.url, { ...server, forge: { ...forge, sites } });
  return { gitServers: servers };
}

/** 模型のある script を動かす */
function runModel(shell: ShellState, m: { server: GitServer; forge: Forge }, pkg: PackageJson, s: ScriptModel, script: string, head: string): CommandResult {
  const tool = script.trim().split(/\s+/)[0] ?? script;
  // 道具の出力（tsc・vitest は失敗も標準出力に出す）。要る物が無い時の断り（rsync など）は標準エラー
  const done = (lines: string[], code: number, patch: Partial<ShellState> = {}, toErr = false): CommandResult => {
    const time = spent(shell, s.seconds);
    const text = lines.length === 0 ? '' : `${lines.join('\n')}\n`;
    if (code === 0) return { stdout: `${head}${text}`, patch: { ...patch, ...time } };
    return toErr ? { stdout: head, stderr: text, stderrLast: true, code, patch: time } : { stdout: `${head}${text}`, code, patch: time };
  };
  const vars = { version: pkg.version, name: pkg.name };
  // 道具は node_modules に入る（npm ci・npm install の前は無い）。rsync・ssh は機械に入っている
  const needsModules = s.kind === 'build' || s.kind === 'test';
  if (needsModules && !isDir(shell.vfs, resolve(shell.cwd, 'node_modules'))) return { stdout: head, stderr: `sh: 1: ${tool}: not found\n`, stderrLast: true, code: 127 };
  const out = s.out === undefined ? null : resolve(shell.cwd, s.out);
  if (out !== null && s.kind !== 'build' && !isDir(shell.vfs, out)) return done((s.missing?.log ?? [`${tool}: ${s.out ?? ''}: No such file or directory`]).map((l) => fill(l, vars)), s.missing?.code ?? 1, {}, true);
  const files: Files = { ...workFiles(shell.vfs, shell.cwd) };
  const fault = s.faults.find((f) => allMatch(files, f.when));
  if (fault) return done(fault.log.map((l) => fill(l, vars)), fault.code);

  if (s.kind === 'build') {
    if (s.bundle === undefined) return done(s.log.map((l) => fill(l, vars)), 0);
    const src = s.sources ?? 'src';
    const sources = Object.fromEntries(Object.entries(files).filter(([p]) => p.startsWith(`${src}/`)));
    const target = resolve(shell.cwd, s.bundle);
    const vfs = writeFile(shell.vfs, target, bundleText(pkg, installed(shell), sources), true);
    return done(s.log.map((l) => fill(l, vars)), 0, { vfs });
  }
  if (s.kind === 'test') return done(s.log.map((l) => fill(l, vars)), 0);

  const hit = siteIn(m.forge, s.site);
  if (!hit) return { stdout: head, stderr: `ssh: Could not resolve hostname ${s.site ?? ''}: Name or service not known\n`, stderrLast: true, code: 255 };
  const { at, site } = hit;
  if (s.kind === 'deploy') {
    const release = out === null ? files : workFiles(shell.vfs, out);
    const releases = [...site.releases.filter((r) => r.version !== pkg.version), { version: pkg.version, files: release }];
    return done(s.log.map((l) => fill(l, vars)), 0, withSite(shell, m.server, m.forge, at, { ...site, current: pkg.version, releases }));
  }
  if (s.kind === 'rollback') {
    const i = site.releases.findIndex((r) => r.version === site.current);
    const previous = i > 0 ? site.releases[i - 1] : undefined;
    if (!previous) return done((s.missing?.log ?? ['rollback: no previous release']).map((l) => fill(l, { ...vars, current: site.current })), s.missing?.code ?? 1, {}, true);
    return done(s.log.map((l) => fill(l, { ...vars, previous: previous.version, current: site.current })), 0, withSite(shell, m.server, m.forge, at, { ...site, current: previous.version }));
  }
  // prune: 今の版のほかを消す
  const removed = site.releases.filter((r) => r.version !== site.current).map((r) => r.version);
  const lines = s.log.flatMap((l) => (l.includes('{removed}') ? removed.map((v) => l.replace('{removed}', v)) : [fill(l, { ...vars, current: site.current })]));
  return done(lines, 0, withSite(shell, m.server, m.forge, at, { ...site, releases: site.releases.filter((r) => r.version === site.current) }));
}

function runScript(ctx: CommandContext, model: { server: GitServer; forge: Forge; actions: ActionsSetup }, pkg: PackageJson, name: string, extra: readonly string[]): CommandResult {
  const { shell } = ctx;
  const script = pkg.scripts[name];
  if (script === undefined) {
    return npmError(shell, [`Missing script: "${name}"`, '', 'To see a list of scripts, run:', '  npm run'], 1);
  }
  const body = extra.length === 0 ? script : `${script} ${extra.join(' ')}`;
  const head = `\n> ${pkg.name}@${pkg.version} ${name}\n> ${body}\n\n`;
  const s = model.actions.scripts[name];
  if (s) return runModel(shell, model, pkg, s, script, head);
  // 模型の無い script は、本物と同じく sh で動かす（npm_package_version などを渡す）
  const vars = new Map(shell.vars);
  vars.set('npm_package_name', pkg.name);
  vars.set('npm_package_version', pkg.version);
  vars.set('npm_lifecycle_event', name);
  const r = ctx.runLine(body, { ...shell, vars });
  return { stdout: `${head}${r.stdout}`, stderr: r.stderr, code: r.code, patch: { ...r.state, vars: shell.vars, cwd: shell.cwd } };
}

export const npmCommands: CommandSpec[] = [
  {
    name: 'npm',
    summary: 'Node.js の部品を入れ、package.json の scripts を動かす（ci / install / run / test）',
    complete: ({ prefix }) => ['ci', 'install', 'run', 'test'].filter((s) => s.startsWith(prefix)),
    handler: (ctx) => {
      const { shell, argv } = ctx;
      const model = modelOf(shell);
      if (!model) return { stderr: 'npm: command not found\n', code: 127 };
      const sub = argv[1];
      if (sub === '-v' || sub === '--version') return { stdout: '10.8.2\n' };
      if (sub === undefined) return { stdout: 'npm <command>\n\nUsage:\n\nnpm install        install all the dependencies in your project\nnpm ci             clean install a project\nnpm test           run this project\'s tests\nnpm run <foo>      run the script named <foo>\n' };
      const pkg = readPkg(shell);
      if (!('scripts' in pkg)) return pkg;
      if (sub === 'ci') return install(ctx, model.actions, pkg);
      if (sub === 'install' || sub === 'i') {
        const names = argv.slice(2).filter((a) => !a.startsWith('-'));
        if (names.length === 0) return install({ ...ctx, argv: ['npm', 'install'] }, model.actions, pkg);
        return addPackages(ctx, model.actions, names, argv.includes('--save-exact') || argv.includes('-E'), argv.includes('--save-dev') || argv.includes('-D'));
      }
      if (sub === 'test' || sub === 't' || sub === 'tst') return runScript(ctx, model, pkg, 'test', argv.slice(2).filter((a) => a !== '--'));
      if (sub === 'run' || sub === 'run-script') {
        const name = argv[2];
        if (name === undefined) {
          const names = Object.entries(pkg.scripts);
          return { stdout: names.length === 0 ? '' : `Lifecycle scripts included in ${pkg.name}@${pkg.version}:\n${names.map(([k, v]) => `  ${k}\n    ${v}`).join('\n')}\n` };
        }
        const rest = argv.slice(3);
        return runScript(ctx, model, pkg, name, rest[0] === '--' ? rest.slice(1) : rest);
      }
      return npmError(shell, [`Unknown command: "${sub}"`, '', 'To see a list of supported npm commands, run:', '  npm help'], 1);
    },
  },
];
