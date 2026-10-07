import { load, YAMLException } from 'js-yaml';
import {
  createNetwork, createVolume, findContainer, findNetwork, isVolumeName, remove, removeNetwork, run, start, type Container, type ContainerError, type ContainerHost, type PortMap,
} from '@/engines/container/container';
import { resolve } from '@/engines/kernel/path';
import type { CommandResult, ShellState } from '@/engines/kernel/registry';
import { exists, isDir, readFile } from '@/engines/kernel/vfs';

/**
 * docker compose（docs/lessons/docker.md docker.i.06）。compose.yaml に書いた複数のコンテナの構成を、一度に動かす・止める。
 * 対応: up（-d）・down（-v）・ps（-a）・logs（サービス）。-f でファイルを選ぶ。
 * 構成の名前は置き場所のディレクトリの名前。網 <構成>_default を作り、各サービスを <構成>-<サービス>-1 として入れる。
 * サービス名は、その網の中で引ける別名になる（web から db という名前で届く）。名前付きボリュームは <構成>_<名前>。
 * 動かす順は depends_on（先に動かす物）、それ以外は書いた順。もう一度 up すると、設定の変わったサービスだけ作り直す。
 * 出す文は本物（Compose v2）に寄せる。本物は進みの表示を標準エラーに出すが、練習の端末では成功の表示を標準出力に出す
 */

const FILES = ['compose.yaml', 'compose.yml', 'docker-compose.yaml', 'docker-compose.yml'];
/** サービスに書ける項目（練習で模す物） */
const SERVICE_KEYS = new Set(['image', 'ports', 'environment', 'volumes', 'depends_on', 'restart', 'container_name']);

interface Service {
  name: string;
  image: string;
  ports: PortMap[];
  env: Record<string, string>;
  volumes: { host: string; container: string }[];
  dependsOn: string[];
  containerName?: string;
}

interface Project {
  name: string;
  dir: string;
  services: Service[];
  volumes: string[];
}

const lines = (xs: readonly string[]): string => (xs.length === 0 ? '' : `${xs.join('\n')}\n`);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 構成の名前（ディレクトリの名前を小文字にし、使えない字を除く。本物と同じ） */
const projectName = (dir: string): string => (dir.split('/').filter(Boolean).pop() ?? 'project').toLowerCase().replace(/[^a-z0-9_-]/g, '');

function readProject(shell: ShellState, file: string | undefined): Project | { error: string } {
  const dir = shell.cwd;
  const path = file !== undefined ? resolve(dir, file) : FILES.map((f) => resolve(dir, f)).find((p) => exists(shell.vfs, p) && !isDir(shell.vfs, p));
  if (path === undefined || !exists(shell.vfs, path)) return { error: file !== undefined ? `open ${path ?? file}: no such file or directory` : 'no configuration file provided: not found' };
  let doc: unknown;
  try {
    doc = load(readFile(shell.vfs, path));
  } catch (e) {
    if (e instanceof YAMLException) return { error: `yaml: line ${String((e.mark?.line ?? 0) + 1)}: ${e.reason}` };
    throw e;
  }
  const where = `validating ${path}: `;
  if (!isRecord(doc) || !isRecord(doc.services)) return { error: `${where}services must be a mapping` };
  const declared = isRecord(doc.volumes) ? Object.keys(doc.volumes) : [];
  const services: Service[] = [];
  for (const [name, raw] of Object.entries(doc.services)) {
    if (!isRecord(raw)) return { error: `${where}services.${name} must be a mapping` };
    const unknown = Object.keys(raw).find((k) => !SERVICE_KEYS.has(k));
    if (unknown !== undefined) return { error: `${where}services.${name} additional properties '${unknown}' not allowed` };
    if (typeof raw.image !== 'string') return { error: `service "${name}" has neither an image nor a build context specified: invalid compose project` };
    const ports: PortMap[] = [];
    for (const p of Array.isArray(raw.ports) ? raw.ports : []) {
      const m = /^(?:[\d.]+:)?(\d+):(\d+)(?:\/tcp)?$/.exec(String(p));
      if (!m) return { error: `${where}services.${name}.ports: invalid port "${String(p)}"` };
      ports.push({ host: Number(m[1]), container: Number(m[2]) });
    }
    const env: Record<string, string> = {};
    if (isRecord(raw.environment)) {
      for (const [k, v] of Object.entries(raw.environment)) env[k] = typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
    }
    else if (Array.isArray(raw.environment)) {
      for (const kv of raw.environment.map(String)) {
        const eq = kv.indexOf('=');
        if (eq > 0) env[kv.slice(0, eq)] = kv.slice(eq + 1);
      }
    }
    const volumes: { host: string; container: string }[] = [];
    for (const v of Array.isArray(raw.volumes) ? raw.volumes.map(String) : []) {
      const [h = '', c = ''] = v.split(':');
      if (isVolumeName(h)) {
        if (!declared.includes(h)) return { error: `service "${name}" refers to undefined volume ${h}: invalid compose project` };
        volumes.push({ host: h, container: c });
      } else volumes.push({ host: resolve(dir, h), container: c });
    }
    const dependsOn = Array.isArray(raw.depends_on) ? raw.depends_on.map(String) : isRecord(raw.depends_on) ? Object.keys(raw.depends_on) : [];
    services.push({ name, image: raw.image, ports, env, volumes, dependsOn, ...(typeof raw.container_name === 'string' ? { containerName: raw.container_name } : {}) });
  }
  for (const s of services) {
    const missing = s.dependsOn.find((d) => !services.some((x) => x.name === d));
    if (missing !== undefined) return { error: `service "${s.name}" depends on undefined service "${missing}": invalid compose project` };
  }
  return { name: projectName(dir), dir, services: ordered(services), volumes: declared };
}

/** 動かす順（depends_on の相手を先に。ほかは書いた順） */
function ordered(services: readonly Service[]): Service[] {
  const out: Service[] = [];
  const visit = (s: Service, seen: Set<string>): void => {
    if (out.includes(s) || seen.has(s.name)) return;
    seen.add(s.name);
    for (const d of s.dependsOn) {
      const dep = services.find((x) => x.name === d);
      if (dep) visit(dep, seen);
    }
    out.push(s);
  };
  for (const s of services) visit(s, new Set());
  return out;
}

const containerOf = (p: Project, s: Service): string => s.containerName ?? `${p.name}-${s.name}-1`;
const networkOf = (p: Project): string => `${p.name}_default`;
/** 設定の指紋（変わったサービスだけ作り直すため） */
const hashOf = (s: Service): string => JSON.stringify([s.image, s.ports, s.env, s.volumes]);

/** 進みの表示（[+] Running n/n と、1 つずつの行） */
function progress(items: readonly [string, string][]): string {
  const width = Math.max(30, ...items.map(([label]) => label.length + 2));
  return lines([`[+] Running ${String(items.length)}/${String(items.length)}`, ...items.map(([label, state]) => ` ✔ ${label.padEnd(width)}${state}`)]);
}

function failed(e: ContainerError): string {
  switch (e.kind) {
    case 'image-not-found':
      return e.known ? `Error response from daemon: manifest for ${e.ref} not found: manifest unknown: manifest unknown` : `Error response from daemon: pull access denied for ${e.ref.replace(/:[^:/]+$/, '')}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied`;
    case 'port-in-use':
      return `Error response from daemon: driver failed programming external connectivity on endpoint ${e.name ?? ''}: Bind for 0.0.0.0:${String(e.port)} failed: port is already allocated`;
    case 'name-in-use':
      return `Error response from daemon: Conflict. The container name "/${e.name}" is already in use by container "${e.id}". You have to remove (or rename) that container to be able to reuse that name.`;
    default:
      return `Error response from daemon: ${e.kind}`;
  }
}

function up(host0: ContainerHost, p: Project): CommandResult {
  let host = host0;
  const items: [string, string][] = [];
  const net = networkOf(p);
  if (!findNetwork(host, net)) {
    const r = createNetwork(host, net);
    if (r.ok) host = r.host;
    items.push([`Network ${net}`, 'Created']);
  }
  for (const v of p.volumes) {
    const name = `${p.name}_${v}`;
    if (!host.volumes?.some((x) => x.name === name)) {
      host = createVolume(host, name).host;
      items.push([`Volume "${name}"`, 'Created']);
    }
  }
  for (const s of p.services) {
    const name = containerOf(p, s);
    const have = findContainer(host, name);
    if (have && have.labels?.['com.docker.compose.config-hash'] === hashOf(s)) {
      if (have.state === 'running') {
        items.push([`Container ${name}`, 'Running']);
        continue;
      }
      const r = start(host, name);
      if (!r.ok) return { stdout: progress(items), stderr: `${failed(r.error)}\n`, code: 1, patch: { containers: host } };
      host = r.host;
      items.push([`Container ${name}`, 'Started']);
      continue;
    }
    if (have) host = remove(host, name, true).host;
    const r = run(host, {
      image: s.image, name, ports: s.ports, env: s.env, network: net, aliases: [s.name],
      volumes: s.volumes.map((v) => (isVolumeName(v.host) ? { host: `${p.name}_${v.host}`, container: v.container } : v)),
      labels: { 'com.docker.compose.project': p.name, 'com.docker.compose.service': s.name, 'com.docker.compose.config-hash': hashOf(s) },
    });
    host = r.host;
    if (!r.ok) return { stdout: progress(items), stderr: ` ✘ Container ${name}  Error\n${failed(r.error)}\n`, code: 1, patch: { containers: host } };
    items.push([`Container ${name}`, 'Started']);
  }
  return { stdout: progress(items), patch: { containers: host } };
}

function down(host0: ContainerHost, p: Project, volumes: boolean): CommandResult {
  let host = host0;
  const items: [string, string][] = [];
  for (const s of [...p.services].reverse()) {
    const name = containerOf(p, s);
    if (!findContainer(host, name)) continue;
    host = remove(host, name, true).host;
    items.push([`Container ${name}`, 'Removed']);
  }
  const net = networkOf(p);
  if (findNetwork(host, net)) {
    const r = removeNetwork(host, net);
    if (r.ok) {
      host = r.host;
      items.push([`Network ${net}`, 'Removed']);
    }
  }
  if (volumes) {
    for (const v of p.volumes) {
      const name = `${p.name}_${v}`;
      if (!host.volumes?.some((x) => x.name === name)) continue;
      host = { ...host, volumes: (host.volumes ?? []).filter((x) => x.name !== name) };
      items.push([`Volume ${name}`, 'Removed']);
    }
  }
  return { stdout: items.length > 0 ? progress(items) : '', patch: { containers: host } };
}

/** この構成のコンテナ（サービスの順） */
const members = (host: ContainerHost, p: Project): { s: Service; c: Container }[] =>
  p.services.flatMap((s) => {
    const c = findContainer(host, containerOf(p, s));
    return c ? [{ s, c }] : [];
  });

export function composeCommand(host: ContainerHost, args: readonly string[], shell: ShellState, describe: (c: Container) => string[]): CommandResult {
  let file: string | undefined;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? '';
    if (a === '-f' || a === '--file') file = args[(i += 1)];
    else rest.push(a);
  }
  const [sub, ...opts] = rest;
  if (sub === undefined || sub === '--help') {
    return {
      stdout: lines(['Usage:  docker compose [OPTIONS] COMMAND', '', 'Define and run multi-container applications with Docker', '', 'Commands:', '  down        Stop and remove containers, networks', '  logs        View output from containers', '  ps          List containers', '  up          Create and start containers']),
    };
  }
  if (!['up', 'down', 'ps', 'logs'].includes(sub)) return { stderr: `unknown docker command: "compose ${sub}"\n`, code: 1 };
  const p = readProject(shell, file);
  if ('error' in p) return { stderr: `${p.error}\n`, code: 1 };
  switch (sub) {
    case 'up':
      return up(host, p);
    case 'down':
      return down(host, p, opts.includes('-v') || opts.includes('--volumes'));
    case 'ps': {
      const all = opts.includes('-a') || opts.includes('--all');
      const rows = members(host, p).filter(({ c }) => all || c.state === 'running').map(({ s, c }) => {
        const [image = '', command = '', status = '', ports = ''] = describe(c);
        return [c.name, image, command, s.name, '2 seconds ago', status, ports];
      });
      const table = [['NAME', 'IMAGE', 'COMMAND', 'SERVICE', 'CREATED', 'STATUS', 'PORTS'], ...rows];
      const widths = (table[0] ?? []).map((_, i) => Math.max(10, ...table.map((r) => (r[i] ?? '').length + 3)));
      return { stdout: lines(table.map((r) => r.map((cell, i) => (i === r.length - 1 ? cell : cell.padEnd(widths[i] ?? 0))).join('').trimEnd())) };
    }
    case 'logs': {
      const wanted = opts.filter((o) => !o.startsWith('-'));
      const unknown = wanted.find((w) => !p.services.some((s) => s.name === w));
      if (unknown !== undefined) return { stderr: `no such service: ${unknown}\n`, code: 1 };
      const picked = members(host, p).filter(({ s }) => wanted.length === 0 || wanted.includes(s.name));
      const width = Math.max(...picked.map(({ s }) => `${s.name}-1`.length));
      return { stdout: lines(picked.flatMap(({ s, c }) => c.log.map((l) => `${`${s.name}-1`.padEnd(width)}  | ${l}`.trimEnd()))) };
    }
    default:
      return { stderr: `unknown docker command: "compose ${sub}"\n`, code: 1 };
  }
}
