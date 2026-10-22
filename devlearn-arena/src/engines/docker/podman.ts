import {
  allNetworks, connectNetwork, createNetwork, createVolume, disconnectNetwork, findContainer, findNetwork, hexOf, isVolumeName, login, logout, longId, networksOf, normalizeRef,
  pull, push, REGISTRY, remove, removeImage, removeNetwork, removeVolume, repoOf, run, serverOf, start, stop, tagOf,
  type Container, type ContainerError, type ContainerHost, type Image, type Network,
} from '@/engines/container/container';
import { build, type BuildTrace } from '@/engines/container/build';
import { resolve } from '@/engines/kernel/path';
import type { CommandResult, CommandSpec, ShellState } from '@/engines/kernel/registry';
import { exists, isDir, readFile } from '@/engines/kernel/vfs';
import { contextFiles, diffLines, execIn, lines, MIN_MEMORY, operandsOf, parseRun, portLines, portsOf, qualified, shortForm, status, tailOf, topLines, VALUED } from './cli';
import { composeCommand } from './compose';

/**
 * Podman の CLI（コンテナの模型 src/engines/container の上に作る。ctr の実戦が使う）。
 * Docker と同じ形の命令で、同じ OCI のイメージを動かす。違いは本物に寄せる:
 * - 本体（デーモン）を持たず、利用者の権限で動かす（rootless）。止まる本体が無いので、つながらないという誤りは無い
 * - イメージは置き場の住所まで書いた名前で出す（docker.io/library/nginx:1.27）。手元で作った物は localhost/ を付ける
 * - podman build は Buildah の形（STEP n/m・--> Using cache・COMMIT）。設計図の名前は Containerfile（無ければ Dockerfile）
 * - 既定の網の名前は podman。表の欄は中身 + 2 字（12 字より狭くしない）。誤りは「Error: 」で始まり、多くは終わりの番号 125
 * - compose は外の compose の道具（docker-compose）に任せる（本物の podman compose と同じく、その旨を先に言う）
 * 対応: version・run・exec・ps・images・pull・search（--list-tags）・stop・start・restart・rm・rmi・logs・inspect・diff・port・build・tag・push・login・logout・
 * volume（create・ls・inspect・rm）・network（create・ls・inspect・connect・disconnect・rm）・compose
 */

const VERSION = '4.9.3';

/** 表（本物の podman と同じく、欄の幅は中身 + 2 字で、12 字より狭くしない） */
function table(rows: string[][]): string {
  const widths = (rows[0] ?? []).map((_, i) => Math.max(12, ...rows.map((r) => (r[i] ?? '').length + 2)));
  return lines(rows.map((r) => r.map((c, i) => (i === r.length - 1 ? c : c.padEnd(widths[i] ?? 0))).join('').trimEnd()));
}

/** 打った名前を模型の名前にする（docker.io/library/・docker.io/・localhost/ を外す） */
export function modelRef(raw: string): string {
  return normalizeRef(raw.replace(/^docker\.io\/library\//, '').replace(/^docker\.io\//, '').replace(/^localhost\//, ''));
}

/** podman が出す名前（手元で作った、置き場の住所の無い物は localhost/、置き場の物は住所まで書く） */
export function fullName(host: ContainerHost, ref: string): string {
  return host.images.find((i) => i.ref === ref)?.local === true && serverOf(ref) === null ? `localhost/${ref}` : qualified(ref);
}

/** 短い名前の別名（本物の /etc/containers/registries.conf.d/shortnames.conf にある物） */
const ALIASES = new Set(['nginx', 'httpd', 'redis', 'postgres', 'node', 'alpine', 'hello-world']);

/** 大きさ（podman は数と単位の間をあける。192MB → 192 MB） */
const sizeOf = (size: string): string => size.replace(/^([\d.]+)\s*([kMG]?B)$/, '$1 $2');

/** 置き場から取る時の出力（本物の containers/image の形） */
function pullLines(host: ContainerHost, raw: string, image: Image, had: boolean): string[] {
  const seed = Number.parseInt(image.id.slice(0, 8), 16);
  const name = fullName(host, image.ref);
  const first = repoOf(raw).split('/')[0] ?? '';
  const alias = !raw.includes('/') && ALIASES.has(first) ? [`Resolved "${first}" as an alias (/etc/containers/registries.conf.d/shortnames.conf)`] : [];
  const blobs = Array.from({ length: image.size.endsWith('kB') ? 1 : 3 }, (_, i) => `Copying blob ${hexOf(seed + i, 12)} ${had ? 'skipped: already exists' : 'done'}`);
  return [...alias, `Trying to pull ${name}...`, 'Getting image source signatures', ...blobs, `Copying config ${image.id} done`, 'Writing manifest to image destination', `${image.id}${hexOf(seed + 3, 52)}`];
}

/** 置き場の誤り（本物の containers/image の文） */
function sourceError(host: ContainerHost, ref: string, why: string): string {
  const name = fullName(host, ref);
  return `Error: initializing source docker://${name}: ${why}`;
}

/** 誤りの文（本物の podman の形） */
function podmanError(host: ContainerHost, e: ContainerError, verb: string): CommandResult {
  const fail = (text: string, code = 125): CommandResult => ({ stderr: `${text}\n`, code });
  switch (e.kind) {
    case 'image-not-found': {
      const name = fullName(host, e.ref);
      const repo = name.replace(/:[^:/]+$/, '');
      const server = serverOf(e.ref);
      const why = server !== null && host.logins?.[server] === undefined
        ? `reading manifest ${tagOf(e.ref)} in ${repo}: unauthorized: authentication required`
        : e.known === true
          ? `reading manifest ${tagOf(e.ref)} in ${repo}: manifest unknown`
          : server !== null
            ? `reading manifest ${tagOf(e.ref)} in ${repo}: name unknown: repository name not known to registry`
            : `reading manifest ${tagOf(e.ref)} in ${repo}: requested access to the resource is denied`;
      if (verb === 'rmi') return fail(`Error: ${e.ref}: image not known`);
      return { stderr: `Trying to pull ${name}...\n${sourceError(host, e.ref, why)}\n`, code: 125 };
    }
    case 'name-in-use':
      return fail(`Error: creating container storage: the container name "${e.name}" is already in use by ${longId(e.id)}. You have to remove that container to be able to reuse that name: that name is already in use`);
    case 'port-in-use':
      return fail(`Error: rootlessport listen tcp 0.0.0.0:${String(e.port)}: bind: address already in use`, 126);
    case 'no-such-container':
      return fail(`Error: no container with name or ID "${e.ref}" found: no such container`);
    case 'container-running': {
      const c = findContainer(host, e.name);
      return fail(`Error: cannot remove container ${c ? longId(c.id) : e.name} as it is running - running or paused containers cannot be removed without force: container state improper`, 2);
    }
    case 'image-in-use':
      return fail(`Error: image used by ${longId(e.container)}: image is in use by a container: consider listing external containers and force-removing image`, 2);
    case 'no-such-volume':
      return fail(`Error: no volume with name "${e.name}" found: no such volume`);
    case 'volume-in-use':
      return fail(`Error: volume ${e.name} is being used by the following container(s): ${e.ids.join(', ')}: volume is being used`, 2);
    case 'no-such-network':
      return fail(`Error: unable to find network with name or ID ${e.ref}: network not found`);
    case 'network-exists':
      return fail(`Error: network name ${e.name} already used: network already exists`);
    case 'network-builtin':
      return fail(`Error: default network ${e.name === 'bridge' ? 'podman' : e.name} cannot be removed`);
    case 'network-in-use':
      return fail(`Error: "${e.name}" has associated containers with it. Use -f to forcibly delete containers and pods: network is being used`, 2);
    case 'already-connected':
      return fail(`Error: container ${e.name} is already connected to network "${e.network}": network is already connected`);
    case 'not-connected':
      return fail(`Error: container ${e.id} is not connected to network ${e.network}: network is not connected`);
    case 'registry-unknown':
      return fail(`Error: initializing source docker://${e.server}: pinging container registry ${e.server}: Get "https://${e.server}/v2/": dial tcp: lookup ${e.server}: no such host`);
    case 'login-failed':
      return fail(`Error: logging into "${e.server}": invalid username/password`);
    case 'push-no-image':
      return fail(`Error: ${repoOf(e.ref)}:${tagOf(e.ref)}: image not known`);
    case 'push-denied':
      return fail(`Error: writing blob: initiating layer upload to /v2/${repoOf(qualified(e.ref)).replace(/^docker\.io\//, '')}/blobs/uploads/ in registry-1.docker.io: requested access to the resource is denied`);
    case 'push-unauthorized':
      return fail(`Error: writing blob: initiating layer upload to /v2/${repoOf(e.ref).slice((serverOf(e.ref) ?? '').length + 1)}/blobs/uploads/ in ${serverOf(e.ref) ?? ''}: authentication required`);
  }
}

/** ps の COMMAND の欄（起動の台本を除いた命令。17 字を超えると … に詰める） */
function commandOf(host: ContainerHost, c: Container): string {
  const raw = (host.images.find((i) => i.ref === c.image)?.command ?? '/entrypoint').replace(/^\/?docker-entrypoint\.sh\s+/, '').replace(/'/g, '');
  return raw.length > 20 ? `${raw.slice(0, 17)}...` : raw;
}

/** 網の名前（既定の網は podman） */
const netName = (n: string): string => (n === 'bridge' ? 'podman' : n);

/** podman の網のアドレス（既定の網は 10.88.0.0/16、作った網は 10.89.<番号>.0/24。模型の 172.<網>.0.<n> から決める） */
function podAddress(subnet: number, ip: string | undefined): string {
  const host = ip?.split('.').pop() ?? '';
  return subnet === 17 ? `10.88.0.${host}` : `10.89.${String(subnet - 18)}.${host}`;
}

const podSubnet = (n: Network): { subnet: string; gateway: string } => (n.subnet === 17
  ? { subnet: '10.88.0.0/16', gateway: '10.88.0.1' }
  : { subnet: `10.89.${String(n.subnet - 18)}.0/24`, gateway: `10.89.${String(n.subnet - 18)}.1` });

/** 網の命令 */
function networkCommand(host: ContainerHost, args: readonly string[]): CommandResult {
  const [sub, ...rest] = args;
  const names = operandsOf(rest, VALUED.network ?? []).map((n) => (n === 'podman' ? 'bridge' : n));
  const set = (h: ContainerHost, stdout: string): CommandResult => ({ stdout, patch: { containers: h } });
  // 一覧は podman での名前の順（既定の網は podman）
  const nets = (): Network[] => allNetworks(host).filter((n) => n.driver === 'bridge').sort((a, b) => netName(a.name).localeCompare(netName(b.name)));
  switch (sub) {
    case 'create': {
      const name = names[0];
      if (!name) return { stderr: 'Error: network name must be specified\n', code: 125 };
      const r = createNetwork(host, name);
      return r.ok ? set(r.host, `${name}\n`) : podmanError(host, r.error, 'network');
    }
    case 'ls':
    case 'list':
      return { stdout: table([['NETWORK ID', 'NAME', 'DRIVER'], ...nets().map((n) => [n.id.slice(0, 12), netName(n.name), 'bridge'])]) };
    case 'inspect': {
      if (names.length === 0) return { stderr: 'Error: requires at least 1 arg(s), only received 0\n', code: 125 };
      const found = [];
      for (const ref of names) {
        const n = findNetwork(host, ref);
        if (!n || n.driver !== 'bridge') return podmanError(host, { kind: 'no-such-network', ref }, 'network');
        const members = host.containers.filter((c) => c.state === 'running' && networksOf(c).includes(n.name));
        found.push({
          name: netName(n.name), id: n.id, driver: 'bridge', network_interface: n.subnet === 17 ? 'podman0' : `podman${String(n.subnet - 17)}`,
          subnets: [podSubnet(n)], ipv6_enabled: false, internal: false, dns_enabled: n.name !== 'bridge',
          containers: Object.fromEntries(members.map((c) => [longId(c.id), { name: c.name, interfaces: { eth0: { subnets: [{ ipnet: `${podAddress(n.subnet, c.addresses?.[n.name])}/${n.subnet === 17 ? '16' : '24'}` }] } } }])),
        });
      }
      return { stdout: `${JSON.stringify(found, null, 5)}\n` };
    }
    case 'connect':
    case 'disconnect': {
      const [net, ref] = names;
      if (!net || !ref) return { stderr: 'Error: requires exactly 2 arg(s)\n', code: 125 };
      const r = sub === 'connect' ? connectNetwork(host, net, ref) : disconnectNetwork(host, net, ref);
      return r.ok ? set(r.host, '') : podmanError(host, r.error, 'network');
    }
    case 'rm':
    case 'remove': {
      if (names.length === 0) return { stderr: 'Error: requires at least 1 arg(s), only received 0\n', code: 125 };
      let h = host;
      const out: string[] = [];
      for (const ref of names) {
        const r = removeNetwork(h, ref);
        if (!r.ok) return { ...podmanError(h, r.error, 'network'), ...(out.length ? { stdout: lines(out), patch: { containers: h } } : {}) };
        h = r.host;
        out.push(ref);
      }
      return set(h, lines(out));
    }
    default:
      return {
        stdout: lines(['Manage networks', '', 'Description:', '  Manage networks', '', 'Usage:', '  podman network [command]', '', 'Available Commands:',
          '  connect     Add container to a network', '  create      Create networks for containers and pods', '  disconnect  Disconnect a container from a network',
          '  inspect     Inspect network', '  ls          List networks', '  rm          Remove networks']),
        ...(sub === undefined ? {} : { stderr: `Error: unrecognized command \`podman network ${sub}\`\n`, code: 125 }),
      };
  }
}

/** 名前付きボリュームの置き場所（利用者の権限で動かすので、自分の家の下） */
const volumePath = (shell: ShellState, name: string): string => `${shell.vars.get('HOME') ?? '/home/learner'}/.local/share/containers/storage/volumes/${name}/_data`;

/** ボリュームの命令 */
function volumeCommand(host: ContainerHost, args: readonly string[], shell: ShellState): CommandResult {
  const [sub, ...rest] = args;
  const names = rest.filter((a) => !a.startsWith('-'));
  const set = (h: ContainerHost, stdout: string): CommandResult => ({ stdout, patch: { containers: h } });
  switch (sub) {
    case 'create': {
      const name = names[0] ?? hexOf(host.seq + 501, 64);
      if (!isVolumeName(name)) return { stderr: `Error: volume name "${name}" must match [a-zA-Z0-9][a-zA-Z0-9_.-]*: invalid argument\n`, code: 125 };
      if (host.volumes?.some((v) => v.name === name)) return { stderr: `Error: volume with name ${name} already exists: volume already exists\n`, code: 125 };
      const r = createVolume(host, name);
      return r.ok ? set(r.host, `${name}\n`) : podmanError(host, r.error, 'volume');
    }
    case 'ls':
    case 'list':
      return { stdout: table([['DRIVER', 'VOLUME NAME'], ...(host.volumes ?? []).map((v) => ['local', v.name])]) };
    case 'inspect': {
      if (names.length === 0) return { stderr: 'Error: provide one or more volume names or use --all\n', code: 125 };
      const found = [];
      for (const name of names) {
        if (!host.volumes?.some((v) => v.name === name)) return podmanError(host, { kind: 'no-such-volume', name }, 'volume');
        const users = host.containers.filter((c) => c.state === 'running' && c.volumes.some((m) => m.host === name)).length;
        found.push({ Name: name, Driver: 'local', Mountpoint: volumePath(shell, name), Labels: {}, Scope: 'local', Options: {}, MountCount: users, NeedsCopyUp: true });
      }
      return { stdout: `${JSON.stringify(found, null, 5)}\n` };
    }
    case 'rm':
    case 'remove': {
      if (names.length === 0) return { stderr: 'Error: choose either one or more volumes or all\n', code: 125 };
      let h = host;
      const out: string[] = [];
      for (const name of names) {
        const r = removeVolume(h, name);
        if (!r.ok) return { ...podmanError(h, r.error, 'volume'), ...(out.length ? { stdout: lines(out), patch: { containers: h } } : {}) };
        h = r.host;
        out.push(name);
      }
      return set(h, lines(out));
    }
    default:
      return {
        stdout: lines(['Manage volumes', '', 'Description:', '  Volumes are created in and can be shared between containers', '', 'Usage:', '  podman volume [command]', '', 'Available Commands:',
          '  create      Create a new volume', '  inspect     Display detailed information on one or more volumes', '  ls          List volumes', '  rm          Remove one or more volumes']),
        ...(sub === undefined ? {} : { stderr: `Error: unrecognized command \`podman volume ${sub}\`\n`, code: 125 }),
      };
  }
}

/** inspect で読める値（-f の {{.State.Status}} など） */
function inspectFields(host: ContainerHost, c: Container): Record<string, string> {
  return {
    '.Id': longId(c.id),
    '.Name': c.name,
    '.ImageName': fullName(host, c.image),
    '.State.Status': c.state,
    '.State.Running': String(c.state === 'running'),
    '.State.ExitCode': String(c.exitCode),
    '.State.OOMKilled': String(c.oomKilled === true),
    '.State.Pid': String(c.state === 'running' ? c.pid : 0),
    '.HostConfig.Memory': String(c.memoryLimit ?? 0),
  };
}

function inspect(host: ContainerHost, args: readonly string[], shell: ShellState): CommandResult {
  let format: string | null = null;
  const refs: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? '';
    if (a === '-f' || a === '--format') format = args[(i += 1)] ?? '';
    else if (a.startsWith('--format=')) format = a.slice('--format='.length);
    else if (!a.startsWith('-')) refs.push(a);
  }
  if (refs.length === 0) return { stderr: 'Error: no names or ids specified\n', code: 125 };
  const found: Container[] = [];
  const out: string[] = [];
  for (const ref of refs) {
    const c = findContainer(host, ref);
    if (!c) return { ...(out.length ? { stdout: lines(out) } : {}), stderr: `Error: no such object: "${ref}"\n`, code: 125 };
    found.push(c);
    if (format === null) continue;
    const fields = inspectFields(host, c);
    const unknown: string[] = [];
    const text = format.replace(/\{\{\s*(\.[A-Za-z.]+)\s*\}\}/g, (_, key: string) => {
      const v = fields[key];
      if (v === undefined) unknown.push(key);
      return v ?? '';
    });
    const bad = unknown[0];
    if (bad !== undefined) return { stderr: `Error: template: inspect:1:2: executing "inspect" at <${bad}>: can't evaluate field ${bad.split('.').pop() ?? ''} in type *define.InspectContainerData\n`, code: 125 };
    out.push(text);
  }
  if (format !== null) return { stdout: lines(out) };
  const json = found.map((c) => {
    const f = inspectFields(host, c);
    return {
      Id: f['.Id'], Name: c.name, ImageName: f['.ImageName'],
      State: { Status: c.state, Running: c.state === 'running', OOMKilled: c.oomKilled === true, ExitCode: c.exitCode, Pid: Number(f['.State.Pid']) },
      HostConfig: { Memory: c.memoryLimit ?? 0 },
      NetworkSettings: { Networks: Object.fromEntries(networksOf(c).map((n) => [netName(n), { IPAddress: podAddress(findNetwork(host, n)?.subnet ?? 17, c.addresses?.[n]) }])) },
      Mounts: c.volumes.map((m) => (isVolumeName(m.host)
        ? { Type: 'volume', Name: m.host, Source: volumePath(shell, m.host), Destination: m.container, RW: true }
        : { Type: 'bind', Source: m.host, Destination: m.container, RW: true })),
    };
  });
  return { stdout: `${JSON.stringify(json, null, 5)}\n` };
}

/** 作った時の出力（Buildah の形） */
function buildLines(trace: BuildTrace, tags: readonly string[], id: string | null): string[] {
  const total = trace.steps.length + 1;
  const out = [`STEP 1/${String(total)}: FROM ${qualified(normalizeRef(trace.base ?? ''))}`];
  trace.steps.forEach((s, i) => {
    const n = i + 2;
    out.push(`STEP ${String(n)}/${String(total)}: ${s.raw}`);
    // 使い回した段は、前に作った層の ID を言う（同じ段なら、どの作り直しでも同じ ID）
    if (s.cached) out.push(`--> Using cache ${s.id}`);
    out.push(...s.out);
    const last = n === total;
    if (last && id !== null) {
      out.push(`COMMIT ${tags[0] ?? ''}`.trimEnd());
      out.push(`--> ${id}`);
    } else if (!(trace.failure && i === trace.steps.length - 1)) out.push(`--> ${s.id.slice(0, 12)}`);
  });
  if (trace.steps.length === 0 && id !== null) out.push(`COMMIT ${tags[0] ?? ''}`.trimEnd(), `--> ${id}`);
  return out;
}

/** 作る（podman build） */
function buildCommand(host: ContainerHost, args: readonly string[], shell: ShellState): CommandResult {
  const tags: string[] = [];
  let file: string | null = null;
  const operands: string[] = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? '';
    if (a === '-t' || a === '--tag') tags.push(args[(i += 1)] ?? '');
    else if (a.startsWith('--tag=')) tags.push(a.slice('--tag='.length));
    else if (a === '-f' || a === '--file') file = args[(i += 1)] ?? null;
    else if (a.startsWith('-')) continue;
    else operands.push(a);
  }
  const dir = resolve(shell.cwd, operands[0] ?? '.');
  if (!exists(shell.vfs, dir) || !isDir(shell.vfs, dir)) return { stderr: `Error: no context directory and no Containerfile specified\n`, code: 125 };
  const pick = file !== null ? resolve(dir, file) : ['Containerfile', 'Dockerfile'].map((f) => resolve(dir, f)).find((p) => exists(shell.vfs, p) && !isDir(shell.vfs, p));
  if (pick === undefined || !exists(shell.vfs, pick)) {
    return { stderr: `Error: no Containerfile or Dockerfile specified or found in context directory, ${dir}: no such file or directory\n`, code: 125 };
  }
  const refs = tags.map(modelRef);
  const r = build(host, { dockerfile: readFile(shell.vfs, pick), context: contextFiles(shell.vfs, dir), tags: refs });
  const f = r.trace.failure;
  if (!r.ok || !r.image) {
    const head = f?.kind === 'parse' || f?.kind === 'no-from' ? [] : buildLines(r.trace, refs, null);
    const why = f?.kind === 'copy'
      ? `building at STEP "${f.raw ?? ''}": checking on sources under "${dir}": copier: stat: "/${f.detail}": no such file or directory`
      : f?.kind === 'run'
        ? `building at STEP "${f.raw ?? ''}": while running runtime: exit status ${f.detail}`
        : f?.kind === 'no-base'
          ? `creating build container: initializing source docker://${qualified(normalizeRef(f.detail))}: reading manifest ${tagOf(normalizeRef(f.detail))} in ${repoOf(qualified(normalizeRef(f.detail)))}: manifest unknown`
          : f?.kind === 'no-from'
            ? 'no FROM statement found'
            : `parsing containerfile: ${f?.detail ?? r.error ?? ''}`;
    return { stderr: `${lines(head)}Error: ${why}\n`, code: f?.kind === 'run' ? 1 : 125 };
  }
  const id = r.image.id;
  const named = refs.map((t) => `Successfully tagged localhost/${t}`);
  return { stdout: lines([...buildLines(r.trace, tags, id), ...named, `${id}${hexOf(Number.parseInt(id.slice(0, 8), 16) + 5, 52)}`]), patch: { containers: r.host } };
}

/**
 * 置き場を探す（podman search）。--list-tags は、その名前の置き場にあるタグを全て並べる（置き場の API と同じく、文字の順）。
 * 自分たちの置き場は、ログインしていなければ断られる。--list-tags が無ければ、名前に語を含むイメージを並べる
 */
function searchCommand(host: ContainerHost, args: readonly string[]): CommandResult {
  const term = args.find((a) => !a.startsWith('-'));
  if (term === undefined) return { stderr: 'Error: requires exactly 1 arg(s), only received 0\n', code: 125 };
  const server = serverOf(term);
  const reg = server === null ? null : host.registries?.find((r) => r.server === server);
  if (reg === undefined) return podmanError(host, { kind: 'registry-unknown', server: server ?? '' }, 'search');
  if (server !== null && host.logins?.[server] === undefined) {
    return { stderr: `Error: ${args.includes('--list-tags') ? 'getting repository tags: fetching tags list' : `couldn't search registry "${server}"`}: authentication required\n`, code: 125 };
  }
  const refs = reg ? reg.images.map((i) => i.ref) : REGISTRY.map((i) => i.ref);
  if (!args.includes('--list-tags')) {
    const repos = [...new Set(refs.map((r) => qualified(repoOf(r))))].filter((r) => r.includes(term)).sort();
    return { stdout: table([['NAME', 'DESCRIPTION'], ...repos.map((r) => [r, ''])]) };
  }
  if (tagOf(term) !== 'latest' || /:latest$/.test(term)) return { stderr: `Error: reference "${term}" must be only a name and not include a tag\n`, code: 125 };
  const repo = modelRef(term).replace(/:latest$/, '');
  const tags = refs.filter((r) => repoOf(r) === repo).map(tagOf);
  // 公開の置き場は、どの名前にも latest がある（置き場の一番新しい版と同じ物）
  if (!reg && tags.length > 0) tags.push('latest');
  if (tags.length === 0) return { stderr: 'Error: getting repository tags: fetching tags list: repository name not known to registry\n', code: 125 };
  return { stdout: table([['NAME', 'TAG'], ...[...new Set(tags)].sort().map((t) => [qualified(repo), t])]) };
}

/** 1 つの命令を打つ */
function podmanOn(host: ContainerHost, verb: string | undefined, rest: readonly string[], shell: ShellState): CommandResult {
  const set = (h: ContainerHost, extra: CommandResult = {}): CommandResult => ({ ...extra, patch: { containers: h } });
  switch (verb) {
    case undefined:
    case '--help':
    case 'help':
      return {
        stdout: lines([
          'Manage pods, containers and images', '', 'Usage:', '  podman [options] [command]', '', 'Available Commands:',
          '  build       Build an image using instructions from Containerfiles', '  compose     Run compose workloads via an external provider such as docker-compose or podman-compose',
          '  diff        Display the changes to the object\'s file system', '  exec        Run a process in a running container', '  images      List images in local storage',
          '  inspect     Display the configuration of object denoted by ID', '  login       Log in to a container registry', '  logs        Fetch the logs of one or more containers',
          '  network     Manage networks', '  port        List port mappings or a specific mapping for the container', '  ps          List containers',
          '  pull        Pull an image from a registry', '  push        Push an image to a specified destination', '  restart     Restart one or more containers',
          '  rm          Remove one or more containers', '  rmi         Remove one or more images from local storage', '  run         Run a command in a new container',
          '  search      Search registry for image',
          '  start       Start one or more containers', '  stop        Stop one or more containers', '  tag         Add an additional name to a local image',
          '  version     Display the Podman version information', '  volume      Manage volumes',
        ]),
      };
    case 'version':
    case '--version':
      return verb === '--version'
        ? { stdout: `podman version ${VERSION}\n` }
        : { stdout: lines([`Client:       Podman Engine`, `Version:      ${VERSION}`, `API Version:  ${VERSION}`, 'Go Version:   go1.22.2', 'Built:        Thu Jan  1 00:00:00 1970', 'OS/Arch:      linux/amd64']) };
    case 'run': {
      const o = parseRun(rest);
      if (o.error) return { stderr: `Error: ${o.error}\nSee 'podman run --help'\n`, code: 125 };
      if (!o.image) return { stderr: 'Error: requires at least 1 arg(s), only received 0\n', code: 125 };
      if (o.memory !== undefined && o.memory < MIN_MEMORY) return { stderr: 'Error: minimum memory limit allowed is 6MB\n', code: 125 };
      const ref = modelRef(o.image);
      const had = host.images.some((i) => i.ref === ref);
      const network = o.network === 'podman' ? 'bridge' : o.network;
      const r = run(host, { image: ref, ports: o.ports, volumes: o.volumes, env: o.env, ...(o.name ? { name: o.name } : {}), ...(o.memory !== undefined ? { memory: o.memory } : {}), ...(network !== undefined ? { network } : {}) });
      if (!r.ok) return { ...podmanError(r.host, r.error, 'run'), patch: { containers: r.host } };
      const image = r.host.images.find((i) => i.ref === r.value.image);
      const pulled = had || !image ? [] : pullLines(r.host, o.image, image, false);
      const out = o.detach ? [...pulled, longId(r.value.id)] : [...pulled, ...r.value.log];
      return set(r.host, { stdout: lines(out), code: r.value.state === 'exited' && r.value.exitCode !== 0 && !o.detach ? r.value.exitCode : 0 });
    }
    case 'exec': {
      const args = [...rest];
      while (args[0]?.startsWith('-')) args.shift();
      const [ref, ...cmd] = args;
      if (!ref || cmd.length === 0) return { stderr: 'Error: must provide a non-empty command to start an exec session: invalid argument\n', code: 125 };
      const c = findContainer(host, ref);
      if (!c) return podmanError(host, { kind: 'no-such-container', ref }, 'exec');
      if (c.state !== 'running') return { stderr: 'Error: can only create exec sessions on running containers: container state improper\n', code: 125 };
      return execIn(host, c, cmd, 'podman');
    }
    case 'ps': {
      const all = rest.includes('-a') || rest.includes('--all');
      const rows = host.containers.filter((c) => all || c.state === 'running').map((c) => [c.id, fullName(host, c.image), commandOf(host, c), '2 seconds ago', status(c), portsOf(c), c.name]);
      return { stdout: table([['CONTAINER ID', 'IMAGE', 'COMMAND', 'CREATED', 'STATUS', 'PORTS', 'NAMES'], ...rows]) };
    }
    case 'images':
      return {
        stdout: table([['REPOSITORY', 'TAG', 'IMAGE ID', 'CREATED', 'SIZE'], ...host.images.map((i) => {
          const name = fullName(host, i.ref);
          return [repoOf(name), tagOf(name), i.id, i.local === true ? '2 seconds ago' : '2 weeks ago', sizeOf(i.size)];
        })]),
      };
    case 'pull': {
      const raw = rest.find((a) => !a.startsWith('-'));
      if (!raw) return { stderr: 'Error: requires exactly 1 arg(s), only received 0\n', code: 125 };
      const r = pull(host, modelRef(raw));
      if (!r.ok) return podmanError(host, r.error, 'pull');
      // 同じ中身（同じ ID）が手元にあれば、層は取り直さない
      return set(r.host, { stdout: lines(pullLines(r.host, raw, r.value, host.images.some((i) => i.id === r.value.id))) });
    }
    case 'search':
      return searchCommand(host, rest);
    case 'stop':
    case 'start':
    case 'restart':
    case 'rm': {
      const force = rest.includes('-f') || rest.includes('--force');
      const refs = operandsOf(rest, VALUED[verb] ?? []);
      if (refs.length === 0) return { stderr: 'Error: specify one or more containers to remove\n', code: 125 };
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
        if (!r.ok) return { ...podmanError(h, r.error, verb), patch: { containers: r.host }, ...(out.length ? { stdout: lines(out) } : {}) };
        h = r.host;
        out.push(ref);
      }
      return set(h, { stdout: lines(out) });
    }
    case 'rmi': {
      const raws = rest.filter((a) => !a.startsWith('-'));
      if (raws.length === 0) return { stderr: 'Error: image name or ID must be specified\n', code: 125 };
      let h = host;
      const out: string[] = [];
      for (const raw of raws) {
        const r = removeImage(h, /^[0-9a-f]{3,}$/.test(raw) ? raw : modelRef(raw));
        if (!r.ok) return { ...podmanError(h, r.error, 'rmi'), ...(out.length ? { stdout: lines(out), patch: { containers: h } } : {}) };
        out.push(`Untagged: ${fullName(h, r.value.ref)}`);
        // 同じ中身にほかの名前が残っていれば、名前を外すだけで中身は消さない
        const seed = Number.parseInt(r.value.id.slice(0, 8), 16);
        if (!r.host.images.some((i) => i.id === r.value.id)) out.push(`Deleted: ${r.value.id}${hexOf(seed + 3, 52)}`);
        h = r.host;
      }
      return set(h, { stdout: lines(out) });
    }
    case 'logs': {
      const ref = operandsOf(rest, VALUED.logs ?? [])[0] ?? '';
      const c = findContainer(host, ref);
      if (!c) return podmanError(host, { kind: 'no-such-container', ref }, 'logs');
      return { stdout: lines(tailOf(c.log, rest)) };
    }
    case 'top': {
      const ref = rest.find((a) => !a.startsWith('-'));
      if (!ref) return { stderr: 'Error: you must provide the name or id of a running container\n', code: 125 };
      const c = findContainer(host, ref);
      if (!c) return podmanError(host, { kind: 'no-such-container', ref }, 'top');
      if (c.state !== 'running') return { stderr: `Error: top can only be used on running containers: container state improper\n`, code: 125 };
      return { stdout: lines(topLines(host, c)) };
    }
    case 'inspect':
      return inspect(host, rest, shell);
    case 'diff':
    case 'port': {
      const ref = rest.filter((a) => !a.startsWith('-'))[0];
      if (!ref) return { stderr: `Error: ${verb === 'diff' ? 'requires exactly 1 arg(s), only received 0' : 'you must supply a running container name or ID'}\n`, code: 125 };
      const c = findContainer(host, ref);
      if (!c) return podmanError(host, { kind: 'no-such-container', ref }, verb);
      return { stdout: lines(verb === 'diff' ? diffLines(host, c) : portLines(c)) };
    }
    case 'build':
      return buildCommand(host, rest, shell);
    case 'tag': {
      const [src, target] = rest.filter((a) => !a.startsWith('-'));
      if (!src || !target) return { stderr: 'Error: image name or ID must be specified\n', code: 125 };
      const image = host.images.find((i) => i.ref === modelRef(src) || i.id.startsWith(src));
      if (!image) return { stderr: `Error: ${src}: image not known\n`, code: 125 };
      const ref = modelRef(target);
      // 置き場の住所の無い名前は、手元の物（localhost/）として付く
      const local = serverOf(ref) === null;
      return set({ ...host, images: [...host.images.filter((i) => i.ref !== ref), { ...image, ref, ...(local ? { local: true } : {}) }] });
    }
    case 'push': {
      const raw = rest.filter((a) => !a.startsWith('-'))[0];
      if (!raw) return { stderr: 'Error: requires at least 1 arg(s), only received 0\n', code: 125 };
      const r = push(host, modelRef(raw));
      if (!r.ok) return podmanError(host, r.error, 'push');
      const seed = Number.parseInt(r.value.id.slice(0, 8), 16);
      return set(r.host, { stdout: lines(['Getting image source signatures', ...[0, 1, 2].map((i) => `Copying blob ${hexOf(seed + 50 + i, 12)} done`), `Copying config ${r.value.id} done`, 'Writing manifest to image destination']) });
    }
    case 'login':
    case 'logout': {
      let user: string | undefined;
      const operands: string[] = [];
      for (let i = 0; i < rest.length; i += 1) {
        const a = rest[i] ?? '';
        if (a === '-u' || a === '--username') user = rest[(i += 1)];
        else if (a.startsWith('--username=')) user = a.slice('--username='.length);
        else if (a === '-p' || a === '--password') i += 1;
        else if (!a.startsWith('-')) operands.push(a);
      }
      const server = operands[0];
      if (server === undefined) return { stderr: 'Error: please provide a registry to log in to\n', code: 125 };
      if (verb === 'logout') return { stdout: `Removed login credentials for ${server}\n`, patch: { containers: logout(host, server) } };
      const r = login(host, server, user);
      if (!r.ok) return podmanError(host, r.error, 'login');
      return { stdout: `${user === undefined ? `Username: ${r.value}\n` : ''}Password: \nLogin Succeeded!\n`, patch: { containers: r.host } };
    }
    case 'volume':
      return volumeCommand(host, rest, shell);
    case 'network':
      return networkCommand(host, rest);
    case 'compose': {
      // 本物の podman compose は、外の compose の道具に任せ、そのことを先に言う（本物は標準エラーに出す。練習の端末では誤りの赤にしない）
      const r = composeCommand(host, rest, shell, (c) => [fullName(host, c.image), commandOf(host, c), status(c), portsOf(c)]);
      const note = '>>>> Executing external compose provider "/usr/libexec/docker/cli-plugins/docker-compose". Please refer to the documentation for details. <<<<\n\n';
      return { ...r, stdout: `${note}${r.stdout ?? ''}` };
    }
    default:
      return { stderr: `Error: unrecognized command \`podman ${verb}\`\nTry 'podman --help' for more information\n`, code: 125 };
  }
}

export const podmanCommands: CommandSpec[] = [
  {
    name: 'podman',
    summary: 'コンテナを動かす・止める・一覧する（Podman。本体を持たず、利用者の権限で動かす）',
    handler: ({ argv, shell }) => {
      const world = shell.containers;
      // podman を入れていない機械には無い
      if (world?.cli !== 'podman') return { stderr: 'podman: command not found\n', code: 127 };
      const [verb, rest] = shortForm(argv[1], argv.slice(2));
      return podmanOn(world, verb, rest, shell);
    },
  },
];
