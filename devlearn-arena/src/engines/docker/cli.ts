import {
  findContainer, pull, remove, removeImage, run, start, stop, type Container, type ContainerError, type ContainerHost, type PortMap,
} from '@/engines/container/container';
import type { CommandResult, CommandSpec } from '@/engines/kernel/registry';

/**
 * Docker の CLI（コンテナの模型 src/engines/container の上に作る）。出力とエラーの文は本物に寄せる。
 * 対応: run（-d・--name・-p・-v・-e）・ps（-a）・images・pull・stop・start・restart・rm（-f）・rmi・logs
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
      const repo = e.ref.split(':')[0] ?? e.ref;
      const head = verb === 'run' ? `Unable to find image '${e.ref}' locally\n` : '';
      return { stderr: `${head}${prefix}Error response from daemon: pull access denied for ${repo}, repository does not exist or may require 'docker login'.\n`, code: verb === 'run' ? 125 : 1 };
    }
    case 'name-in-use':
      return { stderr: `${prefix}Error response from daemon: Conflict. The container name "/${e.name}" is already in use by container "${e.id}". You have to remove (or rename) that container to be able to reuse that name.\n`, code: 125 };
    case 'port-in-use':
      return { stderr: `${prefix}Error response from daemon: driver failed programming external connectivity on endpoint: Bind for 0.0.0.0:${String(e.port)} failed: port is already allocated.\n`, code: verb === 'run' ? 125 : 1 };
    case 'no-such-container':
      return { stderr: `Error response from daemon: No such container: ${e.ref}\n`, code: 1 };
    case 'container-running':
      return { stderr: `Error response from daemon: cannot remove container "/${e.name}": container is running: stop the container before removing or force remove\n`, code: 1 };
    case 'image-in-use':
      return { stderr: `Error response from daemon: conflict: unable to remove repository reference "${e.ref}" (must force) - container ${e.container} is using its referenced image\n`, code: 1 };
  }
}

function status(c: Container): string {
  if (c.state === 'running') return 'Up 2 seconds';
  if (c.state === 'created') return 'Created';
  return `Exited (${String(c.exitCode)}) 2 seconds ago`;
}

const portsOf = (c: Container): string => (c.state === 'running' ? c.ports.map((p) => `0.0.0.0:${String(p.host)}->${String(p.container)}/tcp`).join(', ') : '');

interface RunArgs {
  detach: boolean;
  name?: string;
  ports: PortMap[];
  volumes: { host: string; container: string }[];
  env: Record<string, string>;
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
    } else if (a.startsWith('-')) return { ...out, error: `unknown flag: ${a}` };
    else {
      out.image = a;
      break;
    }
  }
  return out;
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
          return { stdout: lines(['Usage:  docker COMMAND', '', 'Commands:', '  run     Create and run a new container from an image', '  ps      List containers', '  images  List images', '  pull    Download an image from a registry', '  stop    Stop one or more running containers', '  start   Start one or more stopped containers', '  rm      Remove one or more containers', '  rmi     Remove one or more images', '  logs    Fetch the logs of a container']) };
        case 'run': {
          const o = parseRun(rest);
          if (o.error) return { stderr: `docker: ${o.error}.\nSee 'docker run --help'.\n`, code: 125 };
          if (!o.image) return { stderr: '"docker run" requires at least 1 argument.\n', code: 125 };
          const had = host.images.some((i) => i.ref === o.image || i.ref === `${o.image ?? ''}:latest` || i.ref.startsWith(`${o.image ?? ''}:`));
          const r = run(host, { image: o.image, ports: o.ports, volumes: o.volumes, env: o.env, ...(o.name ? { name: o.name } : {}) });
          if (!r.ok) return { ...daemonError(r.error, 'run'), patch: { containers: r.host } };
          const pulled = had ? [] : [`Unable to find image '${r.value.image}' locally`, `${r.value.image.split(':')[1] ?? 'latest'}: Pulling from library/${r.value.image.split(':')[0] ?? ''}`, `Status: Downloaded newer image for ${r.value.image}`];
          const out = o.detach ? [...pulled, r.value.id.repeat(6).slice(0, 64)] : [...pulled, ...r.value.log];
          return set(r.host, { stdout: lines(out), code: r.value.state === 'exited' && r.value.exitCode !== 0 && !o.detach ? r.value.exitCode : 0 });
        }
        case 'ps': {
          const all = rest.includes('-a') || rest.includes('--all');
          const rows = host.containers.filter((c) => all || c.state === 'running').map((c) => [c.id, c.image, '"/entrypoint"', '2 seconds ago', status(c), portsOf(c), c.name]);
          return { stdout: table([['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES'], ...rows]) };
        }
        case 'images':
          return { stdout: table([['REPOSITORY', 'TAG', 'IMAGE ID', 'CREATED', 'SIZE'], ...host.images.map((i) => [i.ref.split(':')[0] ?? '', i.ref.split(':')[1] ?? '', i.id, '2 weeks ago', i.size])]) };
        case 'pull': {
          const ref = rest[0];
          if (!ref) return { stderr: '"docker pull" requires exactly 1 argument.\n', code: 1 };
          const r = pull(host, ref);
          if (!r.ok) return daemonError(r.error, 'pull');
          const [repo, tag] = r.value.ref.split(':');
          return set(r.host, { stdout: lines([`${tag ?? 'latest'}: Pulling from library/${repo ?? ''}`, `Status: Downloaded newer image for ${r.value.ref}`, `docker.io/library/${r.value.ref}`]) });
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
