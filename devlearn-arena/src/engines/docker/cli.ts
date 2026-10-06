import {
  filesInside, findContainer, hexOf, memoryOf, normalizeRef, procsOf, pull, remove, removeImage, repoOf, run, start, stop, tagOf, type Container, type ContainerError, type ContainerHost, type Image, type PortMap,
} from '@/engines/container/container';
import type { CommandResult, CommandSpec } from '@/engines/kernel/registry';

/**
 * Docker の CLI（コンテナの模型 src/engines/container の上に作る）。出力とエラーの文は本物に寄せる。
 * 対応: run（-d・--name・-p・-v・-e・-m / --memory）・ps（-a）・images・pull・stop・start・restart・rm（-f）・rmi・logs・
 * exec（ps・cat・hostname）・stats・inspect（-f / --format）
 */

const NO_DOCKER = 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock. Is the docker daemon running?\n';
const lines = (xs: readonly string[]): string => (xs.length === 0 ? '' : `${xs.join('\n')}\n`);

function table(rows: string[][]): string {
  const widths = (rows[0] ?? []).map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length)));
  return lines(rows.map((r) => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd((widths[i] ?? 0) + 3))).join('').trimEnd()));
}

function daemonError(e: ContainerError, verb: string): CommandResult {
  const prefix = verb === 'run' ? 'docker: ' : '';
  switch (e.kind) {
    case 'image-not-found': {
      const head = verb === 'run' ? `Unable to find image '${e.ref}' locally\n` : '';
      // 名前はあるがタグが無い時は manifest unknown、名前も無い時は repository does not exist（本物と同じ）
      const why = e.known
        ? `manifest for ${e.ref} not found: manifest unknown: manifest unknown`
        : `pull access denied for ${repoOf(e.ref)}, repository does not exist or may require 'docker login': denied: requested access to the resource is denied`;
      return { stderr: `${head}${prefix}Error response from daemon: ${why}${verb === 'run' ? ".\nSee 'docker run --help'." : ''}\n`, code: verb === 'run' ? 125 : 1 };
    }
    case 'name-in-use':
      return { stderr: `${prefix}Error response from daemon: Conflict. The container name "/${e.name}" is already in use by container "${e.id}". You have to remove (or rename) that container to be able to reuse that name.\n`, code: 125 };
    case 'port-in-use':
      return {
        stderr: `${prefix}Error response from daemon: driver failed programming external connectivity on endpoint${e.name !== undefined && e.id !== undefined ? ` ${e.name} (${e.id.repeat(6).slice(0, 64)})` : ''}: Bind for 0.0.0.0:${String(e.port)} failed: port is already allocated.\n`,
        code: verb === 'run' ? 125 : 1,
      };
    case 'no-such-container':
      return { stderr: `Error response from daemon: No such container: ${e.ref}\n`, code: 1 };
    case 'container-running':
      return { stderr: `Error response from daemon: cannot remove container "/${e.name}": container is running: stop the container before removing or force remove\n`, code: 1 };
    case 'image-in-use':
      return { stderr: `Error response from daemon: conflict: unable to remove repository reference "${e.ref}" (must force) - container ${e.container} is using its referenced image\n`, code: 1 };
  }
}

/** 置き場の名前（docker.io/library/nginx:1.27。自分の置き場の名前はそのまま） */
const qualified = (ref: string): string => (repoOf(ref).includes('/') ? (repoOf(ref).split('/')[0]?.includes('.') ? ref : `docker.io/${ref}`) : `docker.io/library/${ref}`);

/** pull の出力（層ごとの Pull complete と digest。層と digest はイメージの ID から決める） */
function pullLines(image: Image, had: boolean, layersHad = had): string[] {
  const seed = Number.parseInt(image.id.slice(0, 8), 16);
  const repo = qualified(image.ref).replace(/^docker\.io\//, '').replace(/:[^:/]+$/, '');
  const layers = layersHad ? [] : Array.from({ length: image.size.endsWith('kB') ? 1 : 3 }, (_, i) => `${hexOf(seed + i, 12)}: Pull complete`);
  return [
    `${tagOf(image.ref)}: Pulling from ${repo}`, ...layers, `Digest: sha256:${hexOf(seed + 99, 64)}`,
    had ? `Status: Image is up to date for ${image.ref}` : `Status: Downloaded newer image for ${image.ref}`, qualified(image.ref),
  ];
}

/** docker ps の IMAGE の欄（latest のタグは名前だけで出す） */
const shownImage = (ref: string): string => (tagOf(ref) === 'latest' ? repoOf(ref) : ref);

/** docker ps の COMMAND の欄（20 字を超えると 19 字と … に詰める。本物と同じ） */
function commandOf(host: ContainerHost, c: Container): string {
  const command = host.images.find((i) => i.ref === c.image)?.command ?? '/entrypoint';
  return `"${command.length > 20 ? `${command.slice(0, 19)}…` : command}"`;
}

function status(c: Container): string {
  if (c.state === 'running') return 'Up 2 seconds';
  if (c.state === 'created') return 'Created';
  return `Exited (${String(c.exitCode)}) 2 seconds ago`;
}

const portsOf = (c: Container): string => (c.state === 'running' ? c.ports.map((p) => `0.0.0.0:${String(p.host)}->${String(p.container)}/tcp`).join(', ') : '');

/** 64 字の ID（模型の ID は 12 字。run -d が出す物と同じ） */
export const fullId = (c: Container): string => c.id.repeat(6).slice(0, 64);

/** 大きさの読み方（-m 256m など。単位は b・k・m・g・t。docker の RAMInBytes と同じく 1024 倍ずつ） */
function parseBytes(raw: string): number | null {
  const m = /^(\d+(?:\.\d+)?) ?([kmgtp])?i?b?$/i.exec(raw);
  if (!m) return null;
  const power = { k: 1, m: 2, g: 3, t: 4, p: 5 }[(m[2] ?? '').toLowerCase()] ?? 0;
  return Math.round(Number(m[1]) * 1024 ** power);
}

/** バイト数を、有効数字 4 桁と 2 進の単位で（docker stats の 182.4MiB・256MiB・8GiB） */
function bytesSize(bytes: number): string {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let x = bytes;
  let i = 0;
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024;
    i += 1;
  }
  return `${String(Number(x.toPrecision(4)))}${units[i] ?? 'B'}`;
}

interface RunArgs {
  detach: boolean;
  name?: string;
  ports: PortMap[];
  volumes: { host: string; container: string }[];
  env: Record<string, string>;
  memory?: number;
  image?: string;
  error?: string;
}

function parseRun(args: readonly string[]): RunArgs {
  const out: RunArgs = { detach: false, ports: [], volumes: [], env: {} };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? '';
    const value = (flag: string): string => (a.includes('=') && a.startsWith(flag) ? a.slice(a.indexOf('=') + 1) : (args[(i += 1)] ?? ''));
    if (a === '-d' || a === '--detach') out.detach = true;
    else if (a === '--rm' || a === '-it' || a === '-i' || a === '-t') continue;
    else if (a === '--name' || a.startsWith('--name=')) out.name = value('--name');
    else if (a === '-p' || a === '--publish' || a.startsWith('--publish=')) {
      const m = /^(?:[\d.]+:)?(\d+):(\d+)(?:\/tcp)?$/.exec(value('--publish'));
      if (!m) return { ...out, error: 'invalid publish' };
      out.ports.push({ host: Number(m[1]), container: Number(m[2]) });
    } else if (a === '-v' || a === '--volume') {
      const [h = '', c = ''] = value('--volume').split(':');
      out.volumes.push({ host: h, container: c });
    } else if (a === '-e' || a === '--env' || a.startsWith('--env=')) {
      const kv = value('--env');
      const eq = kv.indexOf('=');
      if (eq > 0) out.env[kv.slice(0, eq)] = kv.slice(eq + 1);
    } else if (a === '-m' || a === '--memory' || a.startsWith('--memory=')) {
      const raw = value('--memory');
      const bytes = parseBytes(raw);
      if (bytes === null) return { ...out, error: `invalid argument "${raw}" for "-m, --memory" flag: invalid size: '${raw}'` };
      out.memory = bytes;
    } else if (a.startsWith('-')) return { ...out, error: `unknown flag: ${a}` };
    else {
      out.image = a;
      break;
    }
  }
  return out;
}

/** docker の最小のメモリの上限（6MB） */
const MIN_MEMORY = 6 * 1024 * 1024;

/**
 * コンテナの中で打つ（docker exec）。名前空間の中なので、ps は自分のプロセスだけを見せ、主のプロセスは PID 1。
 * 中の道具は busybox（alpine）の物。道具の無いイメージで ps を打つと、実行するファイルが無いと言う
 */
function execIn(host: ContainerHost, c: Container, cmd: readonly string[]): CommandResult {
  const image = host.images.find((i) => i.ref === c.image);
  const [bin = '', ...args] = cmd;
  const missing = (): CommandResult => ({
    stderr: `OCI runtime exec failed: exec failed: unable to start container process: exec: "${bin}": executable file not found in $PATH: unknown\n`, code: 127,
  });
  if (bin === 'sh' || bin === 'bash' || bin === '/bin/sh' || bin === '/bin/bash') {
    return { stderr: 'この練習の端末では、コンテナの中の対話の端末は開けない。docker exec 名前 コマンド の形で、1 つずつ打つ\n', code: 1 };
  }
  switch (bin) {
    case 'ps': {
      if (!image?.tools) return missing();
      const procs = procsOf(image);
      const pids = procs.map((_, i) => (i === 0 ? 1 : 29 + i));
      const own = (pids[pids.length - 1] ?? 1) + 7;
      const row = (pid: number, user: string, command: string): string => `${String(pid).padStart(5)} ${user.padEnd(8)} ${'0:00'.padStart(5)} ${command}`;
      return { stdout: lines(['PID   USER     TIME  COMMAND', ...procs.map((p, i) => row(pids[i] ?? 1, p.user ?? 'root', p.command)), row(own, 'root', cmd.join(' '))]) };
    }
    case 'cat': {
      const path = args[0] ?? '';
      // cgroups（v2）のメモリの上限。上限が無ければ max
      if (path === '/sys/fs/cgroup/memory.max') return { stdout: `${c.memoryLimit === undefined ? 'max' : String(c.memoryLimit)}\n` };
      const content = filesInside(host, c)[path];
      if (content !== undefined) return { stdout: content };
      return { stderr: image?.tools ? `cat: can't open '${path}': No such file or directory\n` : `cat: ${path}: No such file or directory\n`, code: 1 };
    }
    case 'ls': {
      const dir = (args.find((a) => !a.startsWith('-')) ?? '/').replace(/(.)\/+$/, '$1');
      const prefix = dir === '/' ? '/' : `${dir}/`;
      const names = [...new Set(Object.keys(filesInside(host, c)).filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length).split('/')[0] ?? ''))].sort();
      if (names.length === 0) return { stderr: image?.tools ? `ls: ${dir}: No such file or directory\n` : `ls: cannot access '${dir}': No such file or directory\n`, code: image?.tools ? 1 : 2 };
      return { stdout: lines(names) };
    }
    case 'hostname':
      return { stdout: `${c.id}\n` };
    default:
      return missing();
  }
}

/** docker stats の 1 行（止まったコンテナは 0B / 0B） */
function statsRow(host: ContainerHost, c: Container, totalMiB: number): string[] {
  if (c.state !== 'running') return [c.id, c.name, '0.00%', '0B / 0B', '0.00%', '0B / 0B', '0B / 0B', '0'];
  const image = host.images.find((i) => i.ref === c.image);
  const used = memoryOf(image) * 1024 * 1024;
  const limit = c.memoryLimit ?? totalMiB * 1024 * 1024;
  return [c.id, c.name, '0.15%', `${bytesSize(used)} / ${bytesSize(limit)}`, `${((used / limit) * 100).toFixed(2)}%`, '1.25kB / 648B', '0B / 0B', String(procsOf(image).length)];
}

/** docker inspect の値（-f の {{.State.Pid}} などで読む物） */
function inspectFields(c: Container): Record<string, string> {
  return {
    '.Id': fullId(c),
    '.Name': `/${c.name}`,
    '.Config.Image': c.image,
    '.State.Status': c.state,
    '.State.Running': String(c.state === 'running'),
    '.State.ExitCode': String(c.exitCode),
    '.State.OOMKilled': String(c.oomKilled === true),
    '.State.Pid': String(c.state === 'running' ? c.pid : 0),
    '.HostConfig.Memory': String(c.memoryLimit ?? 0),
  };
}

function inspect(host: ContainerHost, args: readonly string[]): CommandResult {
  let format: string | null = null;
  const refs: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? '';
    if (a === '-f' || a === '--format') format = args[(i += 1)] ?? '';
    else if (a.startsWith('--format=')) format = a.slice('--format='.length);
    else refs.push(a);
  }
  if (refs.length === 0) return { stderr: '"docker inspect" requires at least 1 argument.\n', code: 1 };
  const out: string[] = [];
  const found: Container[] = [];
  for (const ref of refs) {
    const c = findContainer(host, ref);
    if (!c) return { ...(out.length ? { stdout: lines(out) } : {}), stderr: `Error: No such object: ${ref}\n`, code: 1 };
    found.push(c);
    if (format === null) continue;
    const fields = inspectFields(c);
    const unknown: string[] = [];
    const text = format.replace(/\{\{\s*(\.[A-Za-z.]+)\s*\}\}/g, (_, key: string) => {
      const v = fields[key];
      if (v === undefined) unknown.push(key);
      return v ?? '';
    });
    const bad = unknown[0];
    if (bad !== undefined) return { stderr: `template parsing error: template: :1: executing "" at <${bad}>: map has no entry for key "${bad.split('.').pop() ?? ''}"\n`, code: 1 };
    out.push(text);
  }
  if (format !== null) return { stdout: lines(out) };
  const json = found.map((c) => {
    const f = inspectFields(c);
    return {
      Id: f['.Id'], Name: f['.Name'],
      State: { Status: c.state, Running: c.state === 'running', OOMKilled: c.oomKilled === true, ExitCode: c.exitCode, Pid: Number(f['.State.Pid']) },
      Config: { Image: c.image },
      HostConfig: { Memory: c.memoryLimit ?? 0 },
    };
  });
  return { stdout: `${JSON.stringify(json, null, 4)}\n` };
}

export const dockerCommands: CommandSpec[] = [
  {
    name: 'docker',
    summary: 'コンテナを動かす・止める・一覧する（Docker）',
    handler: ({ argv, shell }) => {
      const host = shell.containers;
      if (host === null) return { stderr: NO_DOCKER, code: 1 };
      const [verb, ...rest] = argv.slice(1);
      const set = (h: ContainerHost, extra: CommandResult = {}): CommandResult => ({ ...extra, patch: { containers: h } });
      switch (verb) {
        case undefined:
        case '--help':
          return {
            stdout: lines([
              'Usage:  docker COMMAND', '', 'Commands:', '  run      Create and run a new container from an image', '  exec     Execute a command in a running container',
              '  ps       List containers', '  images   List images', '  pull     Download an image from a registry', '  stop     Stop one or more running containers',
              '  start    Start one or more stopped containers', '  rm       Remove one or more containers', '  rmi      Remove one or more images', '  logs     Fetch the logs of a container',
              '  stats    Display a live stream of container(s) resource usage statistics', '  inspect  Return low-level information on Docker objects',
            ]),
          };
        case 'run': {
          const o = parseRun(rest);
          if (o.error) return { stderr: `${o.error.startsWith('invalid argument') ? '' : 'docker: '}${o.error}${o.error.startsWith('invalid argument') ? '' : '.'}\nSee 'docker run --help'.\n`, code: 125 };
          if (!o.image) return { stderr: '"docker run" requires at least 1 argument.\n', code: 125 };
          if (o.memory !== undefined && o.memory < MIN_MEMORY) return { stderr: 'docker: Error response from daemon: Minimum memory limit allowed is 6MB.\n', code: 125 };
          const had = host.images.some((i) => i.ref === o.image || i.ref === `${o.image ?? ''}:latest` || i.ref.startsWith(`${o.image ?? ''}:`));
          const r = run(host, { image: o.image, ports: o.ports, volumes: o.volumes, env: o.env, ...(o.name ? { name: o.name } : {}), ...(o.memory !== undefined ? { memory: o.memory } : {}) });
          if (!r.ok) return { ...daemonError(r.error, 'run'), patch: { containers: r.host } };
          const image = r.host.images.find((i) => i.ref === r.value.image);
          const pulled = had || !image ? [] : [`Unable to find image '${r.value.image}' locally`, ...pullLines(image, false).slice(0, -1)];
          const out = o.detach ? [...pulled, fullId(r.value)] : [...pulled, ...r.value.log];
          return set(r.host, { stdout: lines(out), code: r.value.state === 'exited' && r.value.exitCode !== 0 && !o.detach ? r.value.exitCode : 0 });
        }
        case 'exec': {
          const args = [...rest];
          while (args[0]?.startsWith('-')) args.shift();
          const [ref, ...cmd] = args;
          if (!ref || cmd.length === 0) return { stderr: '"docker exec" requires at least 2 arguments.\n', code: 1 };
          const c = findContainer(host, ref);
          if (!c) return daemonError({ kind: 'no-such-container', ref }, 'exec');
          if (c.state !== 'running') return { stderr: `Error response from daemon: container ${fullId(c)} is not running\n`, code: 1 };
          return execIn(host, c, cmd);
        }
        case 'stats': {
          const refs = rest.filter((a) => !a.startsWith('-'));
          const picked: Container[] = [];
          for (const ref of refs) {
            const c = findContainer(host, ref);
            if (!c) return daemonError({ kind: 'no-such-container', ref }, 'stats');
            picked.push(c);
          }
          const list = refs.length > 0 ? picked : host.containers.filter((c) => c.state === 'running');
          const head = ['CONTAINER ID', 'NAME', 'CPU %', 'MEM USAGE / LIMIT', 'MEM %', 'NET I/O', 'BLOCK I/O', 'PIDS'];
          return { stdout: table([head, ...list.map((c) => statsRow(host, c, shell.procs.totalMemory))]) };
        }
        case 'inspect':
          return inspect(host, rest);
        case 'ps': {
          const all = rest.includes('-a') || rest.includes('--all');
          const rows = host.containers.filter((c) => all || c.state === 'running').map((c) => [c.id, shownImage(c.image), commandOf(host, c), '2 seconds ago', status(c), portsOf(c), c.name]);
          return { stdout: table([['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES'], ...rows]) };
        }
        case 'images':
          return { stdout: table([['REPOSITORY', 'TAG', 'IMAGE ID', 'CREATED', 'SIZE'], ...host.images.map((i) => [i.ref.split(':')[0] ?? '', i.ref.split(':')[1] ?? '', i.id, '2 weeks ago', i.size])]) };
        case 'pull': {
          const ref = rest[0];
          if (!ref) return { stderr: '"docker pull" requires exactly 1 argument.\n', code: 1 };
          const had = host.images.some((i) => i.ref === normalizeRef(ref));
          const ids = new Set(host.images.map((i) => i.id));
          const r = pull(host, ref);
          const defaultTag = ref.lastIndexOf(':') > ref.lastIndexOf('/') ? [] : ['Using default tag: latest'];
          if (!r.ok) return { ...daemonError(r.error, 'pull'), ...(defaultTag.length ? { stdout: lines(defaultTag) } : {}) };
          return set(r.host, { stdout: lines([...defaultTag, ...pullLines(r.value, had, ids.has(r.value.id))]) });
        }
        case 'stop':
        case 'start':
        case 'restart':
        case 'rm': {
          const force = rest.includes('-f') || rest.includes('--force');
          const refs = rest.filter((a) => !a.startsWith('-'));
          if (refs.length === 0) return { stderr: `"docker ${verb}" requires at least 1 argument.\n`, code: 1 };
          let h = host;
          const out: string[] = [];
          for (const ref of refs) {
            const r = verb === 'stop' ? stop(h, ref)
              : verb === 'start' ? start(h, ref)
                : verb === 'rm' ? remove(h, ref, force)
                  : (() => {
                    const s = stop(h, ref);
                    return s.ok ? start(s.host, ref) : s;
                  })();
            if (!r.ok) return { ...daemonError(r.error, verb), patch: { containers: r.host }, ...(out.length ? { stdout: lines(out) } : {}) };
            h = r.host;
            out.push(ref);
          }
          return set(h, { stdout: lines(out) });
        }
        case 'rmi': {
          const ref = rest[0];
          if (!ref) return { stderr: '"docker rmi" requires at least 1 argument.\n', code: 1 };
          const r = removeImage(host, ref);
          if (!r.ok) return daemonError(r.error, 'rmi');
          return set(r.host, { stdout: lines([`Untagged: ${r.value.ref}`, `Deleted: sha256:${r.value.id}`]) });
        }
        case 'logs': {
          const ref = rest.filter((a) => !a.startsWith('-'))[0] ?? '';
          const c = findContainer(host, ref);
          if (!c) return daemonError({ kind: 'no-such-container', ref }, 'logs');
          return { stdout: lines(c.log) };
        }
        default:
          return { stderr: `docker: '${verb}' is not a docker command.\nSee 'docker --help'\n`, code: 1 };
      }
    },
  },
];
