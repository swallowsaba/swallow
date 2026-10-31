import { globMatch } from '@/engines/kernel/glob';
import { fromRegistry, hexOf, normalizeRef, sizeInMb, type ContainerHost, type Image } from './container';

/**
 * docker build（Dockerfile からイメージを作る。docs/lessons/docker.md docker.i.01・i.02）。純粋な関数。
 *
 * - 命令: FROM・WORKDIR・COPY（ADD も同じ）・RUN・CMD・ENV・EXPOSE・USER・LABEL・ARG。FROM と、ファイルを変える WORKDIR・COPY・RUN が段になる
 * - 段ごとに、前の段と命令と写す中身から鍵を作る。同じ鍵の段は前に作った物を使い回す（CACHED。ctr.b.04 のレイヤ）
 * - RUN は、よく使う物だけを模す: npm install（i・instal などの別名も）/ npm ci（package.json の dependencies を node_modules に入れる。知らない npm の命令は Unknown command で止まる）・apk add・mkdir・echo。ほかは /bin/sh が見つからないと言う
 * - 誤りは本物（BuildKit）と同じ言い方: 知らない命令・FROM が無い・土台が無い・写す物が無い・RUN の失敗・Dockerfile が無い
 */

export interface BuildInput {
  /** Dockerfile の中身（無ければ null） */
  dockerfile: string | null;
  /** 置き場所（コンテキスト）の中のファイル（置き場所からの相対パス → 中身） */
  context: Readonly<Record<string, string>>;
  /** -t で付ける名前 */
  tags: readonly string[];
  /** 前の段で作った物（段の名前か番号 → その段のファイル）。COPY --from で読む */
  stages?: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

export interface BuildOutput {
  ok: boolean;
  host: ContainerHost;
  /** 進みの表示（[+] Building …） */
  stdout: string[];
  /** 失敗の文（ERROR: failed to solve: …） */
  error?: string;
  image?: Image;
  /** 命令ごとの記録（道具ごとの出し方で出す。podman は Buildah の STEP n/m の形） */
  trace: BuildTrace;
}

/** 命令ごとの記録 */
export interface BuildTrace {
  /** FROM の名前（土台の名前） */
  base?: string;
  /** FROM の後の命令（CMD・ENV などの、ファイルを変えない命令も）。cached は前に作った物を使い回したか。out は RUN の出力 */
  steps: { raw: string; cached: boolean; out: string[]; id: string }[];
  /** 失敗（parse: 書き方の誤り・no-from: FROM が無い・no-base: 土台が取れない・copy: 写す物が無い・run: RUN の失敗） */
  failure?: { kind: 'parse' | 'no-from' | 'no-base' | 'copy' | 'run'; raw?: string; detail: string };
}

const INSTRUCTIONS = ['FROM', 'WORKDIR', 'COPY', 'ADD', 'RUN', 'CMD', 'ENTRYPOINT', 'ENV', 'EXPOSE', 'USER', 'LABEL', 'ARG'];
const STEP_KINDS = new Set(['WORKDIR', 'COPY', 'ADD', 'RUN']);

interface Line {
  no: number;
  op: string;
  args: string;
  raw: string;
}

/** 文字の違いの数（打ち間違いの候補を出す） */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j += 1) (d[0] as number[])[j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const row = d[i] as number[];
      const prev = d[i - 1] as number[];
      row[j] = Math.min((prev[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
  }
  return (d[a.length] as number[])[b.length] ?? 0;
}

/** Dockerfile を命令の行に分ける（行末の \ で続く行をつなぐ。# の行と空行は飛ばす） */
function parse(text: string): Line[] | string {
  const out: Line[] = [];
  const rows = text.split('\n');
  for (let i = 0; i < rows.length; i += 1) {
    let raw = (rows[i] ?? '').trim();
    const no = i + 1;
    if (raw === '' || raw.startsWith('#')) continue;
    while (raw.endsWith('\\') && i + 1 < rows.length) {
      i += 1;
      raw = `${raw.slice(0, -1).trimEnd()} ${(rows[i] ?? '').trim()}`;
    }
    const m = /^(\S+)\s*(.*)$/.exec(raw);
    const op = (m?.[1] ?? '').toUpperCase();
    if (!INSTRUCTIONS.includes(op)) {
      const near = INSTRUCTIONS.find((k) => distance(op, k) <= 2);
      return `dockerfile parse error on line ${String(no)}: unknown instruction: ${m?.[1] ?? raw}${near ? ` (did you mean ${near}?)` : ''}`;
    }
    out.push({ no, op, args: (m?.[2] ?? '').trim(), raw: `${op} ${(m?.[2] ?? '').trim()}` });
  }
  return out;
}

/** 文字列の鍵（FNV。同じ物からは同じ鍵） */
function keyOf(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) h = Math.imul(h ^ text.charCodeAt(i), 16777619) >>> 0;
  return h;
}

const join = (dir: string, path: string): string => {
  const parts = (path.startsWith('/') ? path : `${dir.replace(/\/$/, '')}/${path}`).split('/');
  const out: string[] = [];
  for (const p of parts) {
    if (p === '' || p === '.') continue;
    if (p === '..') out.pop();
    else out.push(p);
  }
  return `/${out.join('/')}`;
};

/** CMD・ENTRYPOINT の書き方（["node", "server.js"] か、シェルの形） */
function commandOf(args: string): string[] {
  if (args.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(args);
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) return parsed;
    } catch {
      // 書き方が JSON でなければ、シェルの形として読む（本物と同じ）
    }
  }
  return ['/bin/sh', '-c', args];
}

interface Stage {
  files: Record<string, string>;
  workdir: string;
  env: Record<string, string>;
  cmd: readonly string[];
  installed: boolean;
  user?: string;
}

/** npm で部品を入れる命令と、その別名（本物の npm と同じ） */
const NPM_INSTALL = new Set(['install', 'i', 'in', 'ins', 'inst', 'insta', 'instal', 'isnt', 'isnta', 'isntal', 'isntall', 'add', 'ci', 'clean-install', 'ic', 'install-clean', 'isntall-clean']);
/** 部品を入れない、よく使う npm の命令（何もしないで終わる） */
const NPM_OTHER = new Set(['run', 'run-script', 'test', 't', 'start', 'prune', 'cache', 'config', 'set', 'audit', 'version', '--version', '-v']);

/** RUN の 1 つの命令。出力と終わりの番号 */
function runOne(stage: Stage, line: string, alpine: boolean): { out: string[]; code: number } {
  const [bin = '', ...args] = line.trim().split(/\s+/);
  switch (bin) {
    case 'npm': {
      const sub = args[0] ?? '';
      // npm run build: 成果物を作る。src の中身を dist に写す（模擬の束ね方）
      if (sub === 'run' && args[1] === 'build') {
        const from = join(stage.workdir, 'src');
        const made = Object.entries(stage.files).filter(([p]) => p.startsWith(`${from}/`));
        for (const [p, c] of made) stage.files[join(stage.workdir, `dist/${p.slice(from.length + 1)}`)] = c;
        return { out: [`✓ built in 1.2s (${String(made.length)} files)`], code: 0 };
      }
      if (!NPM_INSTALL.has(sub)) {
        if (NPM_OTHER.has(sub)) return { out: [], code: 0 };
        // 本物の npm と同じく、知らない命令は Unknown command で止まる
        return { out: [`Unknown command: "${sub}"`, '', 'To see a list of supported npm commands, run:', '  npm help'], code: 1 };
      }
      const path = join(stage.workdir, 'package.json');
      const pkg = stage.files[path];
      if (pkg === undefined) {
        return {
          out: [
            'npm error code ENOENT', 'npm error syscall open', `npm error path ${path}`, 'npm error errno -2',
            `npm error enoent Could not read package.json: Error: ENOENT: no such file or directory, open '${path}'`,
            'npm error enoent This is related to npm not being able to find a file.',
          ],
          code: 254,
        };
      }
      let deps: string[] = [];
      try {
        const parsed = JSON.parse(pkg) as { dependencies?: Record<string, string> };
        deps = Object.keys(parsed.dependencies ?? {});
      } catch {
        return { out: ['npm error code EJSONPARSE', `npm error JSON.parse Invalid package.json: ${path}`], code: 1 };
      }
      for (const d of deps) stage.files[join(stage.workdir, `node_modules/${d}/package.json`)] = `{ "name": "${d}" }\n`;
      stage.installed = true;
      return { out: [`added ${String(deps.length === 0 ? 0 : 64 + deps.length)} packages, and audited ${String(deps.length === 0 ? 1 : 65 + deps.length)} packages in 2s`, '', 'found 0 vulnerabilities'], code: 0 };
    }
    case 'apk':
      return alpine ? { out: [`(1/1) Installing ${args.filter((a) => !a.startsWith('-')).slice(1).join(' ')}`, 'OK: 12 MiB in 18 packages'], code: 0 } : { out: ['/bin/sh: 1: apk: not found'], code: 127 };
    case 'mkdir':
      for (const a of args.filter((x) => !x.startsWith('-'))) stage.files[join(join(stage.workdir, a), '.keep')] = '';
      return { out: [], code: 0 };
    case 'echo':
    case 'true':
      return { out: [], code: 0 };
    default:
      return { out: [alpine ? `/bin/sh: ${bin}: not found` : `/bin/sh: 1: ${bin}: not found`], code: 127 };
  }
}

/** 段を前から順に作る。最後の段の結果を返す（進みの表示はつなげる） */
function buildStages(host: ContainerHost, input: BuildInput, lines: readonly Line[], froms: readonly Line[]): BuildOutput {
  const stages: Record<string, Readonly<Record<string, string>>> = { ...input.stages };
  const said: string[] = [];
  let now = host;
  for (const [i, from] of froms.entries()) {
    const at = lines.indexOf(from);
    const end = froms[i + 1] ? lines.indexOf(froms[i + 1] as Line) : lines.length;
    const text = lines.slice(at, end).map((l) => l.raw).join('\n');
    const last = i === froms.length - 1;
    const r = build(now, { dockerfile: `${text}\n`, context: input.context, tags: last ? input.tags : [], stages });
    said.push(...r.stdout);
    if (!r.ok || !r.image) return { ...r, stdout: said };
    if (last) return { ...r, stdout: said };
    const files = r.image.files ?? {};
    stages[String(i)] = files;
    const name = /\sAS\s+(\S+)/i.exec(from.args)?.[1];
    if (name !== undefined) stages[name] = files;
    // 途中の段は、名前の無いイメージとして残さない
    now = { ...r.host, images: r.host.images.filter((x) => x.ref !== '<none>:<none>') };
  }
  return { ok: false, host, stdout: said, error: 'no build stage in current context', trace: { steps: [] } };
}

const pad = (text: string, time: string): string => `${text.padEnd(72)} ${time}`;

/** Dockerfile からイメージを作る */
export function build(host: ContainerHost, input: BuildInput): BuildOutput {
  const head = (n: number, total: number, done: boolean, secs: number): string => `[+] Building ${secs.toFixed(1)}s (${String(n)}/${String(total)})${done ? ' FINISHED' : ''}`.padEnd(72) + ' docker:default';
  if (input.dockerfile === null) {
    return { ok: false, host, stdout: [head(0, 1, false, 0), pad(' => ERROR [internal] load build definition from Dockerfile', '0.0s')], error: 'failed to read dockerfile: open Dockerfile: no such file or directory', trace: { steps: [] } };
  }
  const lines = parse(input.dockerfile);
  const def = pad(' => [internal] load build definition from Dockerfile', '0.0s');
  if (typeof lines === 'string') return { ok: false, host, stdout: [head(1, 1, false, 0), def], error: lines, trace: { steps: [], failure: { kind: 'parse', detail: lines } } };
  // 段が 2 つ以上あれば、前の段から順に作る。イメージになるのは最後の段だけ
  const froms = lines.filter((l) => l.op === 'FROM');
  if (froms.length > 1) return buildStages(host, input, lines, froms);
  const first = lines.find((l) => l.op !== 'ARG');
  if (first?.op !== 'FROM') return { ok: false, host, stdout: [head(1, 1, false, 0), def], error: 'no build stage in current context', trace: { steps: [], failure: { kind: 'no-from', detail: 'no FROM statement found' } } };

  // 置き場の住所まで書いた名前（docker.io/library/node:20-alpine）も、同じイメージを指す
  const baseRef = normalizeRef((first.args.split(/\s+/)[0] ?? '').replace(/^docker\.io\/library\//, '').replace(/^docker\.io\//, ''));
  const base = host.images.find((i) => i.ref === baseRef) ?? fromRegistry(baseRef);
  const qualified = baseRef.includes('/') ? `docker.io/${baseRef}` : `docker.io/library/${baseRef}`;
  const meta = pad(` => [internal] load metadata for ${qualified}`, '0.4s');
  if (!base) {
    return {
      ok: false, host, stdout: [head(1, 2, false, 0.4), def, pad(` => ERROR [internal] load metadata for ${qualified}`, '0.4s')], error: `${baseRef}: failed to resolve source metadata for ${qualified}: ${qualified}: not found`,
      trace: { base: baseRef, steps: [], failure: { kind: 'no-base', detail: baseRef } },
    };
  }

  const steps = lines.filter((l) => STEP_KINDS.has(l.op));
  const total = steps.length + 1;
  const out = [def, meta, pad(` => [1/${String(total)}] FROM ${qualified}`, '0.0s')];
  const cache = new Set(host.buildCache ?? []);
  const added: string[] = [];
  // 命令ごとの記録。ファイルを変えない命令は、それより前に作り直した段が無ければ使い回した物と数える
  const trace: BuildTrace = { base: baseRef, steps: [] };
  let rebuilt = false;
  let key = keyOf(`FROM ${base.id}`);
  const stage: Stage = { files: { ...(base.files ?? {}) }, workdir: base.workdir ?? '/', env: { ...(base.env ?? {}) }, cmd: base.cmd ?? [], installed: false };
  const alpine = /alpine/.test(base.ref) || base.tools === true;
  let n = 0;
  let runOut: string[] = [];
  let secs = 0.4;
  let size = sizeInMb(base.size);
  for (const l of lines.slice(lines.indexOf(first) + 1)) {
    switch (l.op) {
      case 'ENV': {
        const m = /^(\S+?)(?:=|\s+)(.*)$/.exec(l.args);
        if (m?.[1]) stage.env[m[1]] = (m[2] ?? '').replace(/^"(.*)"$/, '$1');
        break;
      }
      case 'CMD':
      case 'ENTRYPOINT':
        stage.cmd = commandOf(l.args);
        break;
      case 'USER':
        stage.user = l.args;
        break;
      default:
        break;
    }
    if (!STEP_KINDS.has(l.op)) {
      trace.steps.push({ raw: l.raw, cached: !rebuilt, out: [], id: hexOf(keyOf(`${String(key)}|${l.raw}`), 64) });
      continue;
    }
    n += 1;
    const label = `[${String(n + 1)}/${String(total)}] ${l.raw}`;
    if (l.op === 'WORKDIR') {
      stage.workdir = join(stage.workdir, l.args);
      key = keyOf(`${String(key)}|${l.raw}`);
    } else if (l.op === 'COPY' || l.op === 'ADD') {
      const parts = l.args.split(/\s+/).filter((a) => !a.startsWith('--'));
      const dest = parts.pop() ?? '.';
      // COPY --from=段: 前の段のファイルから写す（元の場所は段の中の絶対の場所）
      const fromStage = /--from=(\S+)/.exec(l.args)?.[1];
      const stageFiles = fromStage === undefined ? undefined : input.stages?.[fromStage];
      if (fromStage !== undefined && !stageFiles) {
        out.push(pad(` => ERROR ${label}`, '0.0s'));
        trace.failure = { kind: 'copy', raw: l.raw, detail: fromStage };
        return { ok: false, host, stdout: [head(n + 2, total + 2, false, secs), ...out], error: `invalid from flag value ${fromStage}: pull access denied, repository does not exist or may require authorization`, trace };
      }
      const source: Readonly<Record<string, string>> = stageFiles ? Object.fromEntries(Object.entries(stageFiles).map(([p, c]) => [p.replace(/^\//, ''), c])) : input.context;
      const srcs = parts;
      const copied: [string, string][] = [];
      for (const src of srcs) {
        const rel = src.replace(/^\.\/?/, '').replace(/^\//, '').replace(/\/$/, '');
        const all = Object.entries(source);
        // * ? [ を含む元（package*.json）は、合うファイルをそれぞれの名前で写す
        const hits = rel === ''
          ? all.map(([p, c]) => [p, c, p] as const)
          : /[*?[]/.test(rel)
            ? all.filter(([p]) => globMatch(rel, p)).map(([p, c]) => [p, c, p.split('/').pop() ?? p] as const)
            : all.filter(([p]) => p === rel || p.startsWith(`${rel}/`)).map(([p, c]) => [p, c, p === rel ? (p.split('/').pop() ?? p) : p.slice(rel.length + 1)] as const);
        if (hits.length === 0) {
          out.push(pad(` => ERROR ${label}`, '0.0s'));
          const ref = `${hexOf(key, 25)}::${hexOf(key + 1, 25)}`;
          trace.failure = { kind: 'copy', raw: l.raw, detail: rel };
          return { ok: false, host, stdout: [head(n + 2, total + 2, false, secs), ...out], error: `failed to compute cache key: failed to calculate checksum of ref ${ref}: "/${rel}": not found`, trace };
        }
        const intoDir = dest.endsWith('/') || dest === '.' || srcs.length > 1 || rel === '' || hits.length > 1 || hits[0]?.[0] !== rel;
        for (const [, content, name] of hits) copied.push([intoDir ? join(join(stage.workdir, dest), name) : join(stage.workdir, dest), content]);
      }
      for (const [p, c] of copied) stage.files[p] = c;
      key = keyOf(`${String(key)}|${l.raw}|${copied.map(([p, c]) => `${p}=${c}`).join('\n')}`);
    } else {
      key = keyOf(`${String(key)}|${l.raw}`);
      const cached = cache.has(String(key));
      let failed: { out: string[]; code: number } | null = null;
      const said: string[] = [];
      for (const part of l.args.split('&&')) {
        const r = runOne(stage, part, alpine);
        if (r.code !== 0) {
          failed = { out: r.out, code: r.code };
          break;
        }
        said.push(...r.out);
      }
      if (failed) {
        out.push(pad(` => ERROR ${label}`, '0.5s'));
        out.push('------', ` > ${label}:`, ...failed.out.map((x) => `0.512 ${x}`), '------');
        trace.steps.push({ raw: l.raw, cached: false, out: [...said, ...failed.out], id: hexOf(key, 64) });
        trace.failure = { kind: 'run', raw: l.raw, detail: String(failed.code) };
        return { ok: false, host, stdout: [head(n + 2, total + 2, false, secs + 0.5), ...out], error: `process "/bin/sh -c ${l.args}" did not complete successfully: exit code: ${String(failed.code)}`, trace };
      }
      runOut = cached ? [] : said;
      if (!cached) secs += 2.1;
      if (stage.installed) size += 4.9;
    }
    const cached = cache.has(String(key));
    if (!cached) added.push(String(key));
    if (!cached) rebuilt = true;
    trace.steps.push({ raw: l.raw, cached, out: runOut, id: hexOf(key, 64) });
    runOut = [];
    out.push(pad(` => ${cached ? 'CACHED ' : ''}${label}`, cached || l.op !== 'RUN' ? '0.0s' : '2.1s'));
  }
  out.push(pad(' => exporting to image', '0.1s'));
  const tags = input.tags.map(normalizeRef);
  for (const t of tags) out.push(pad(` => => naming to ${t.includes('/') && t.split('/')[0]?.includes('.') ? t : t.includes('/') ? `docker.io/${t}` : `docker.io/library/${t}`}`, '0.0s'));
  secs += 0.1;
  const id = hexOf(key, 12);
  const argv = stage.cmd[0] === '/bin/sh' && stage.cmd[1] === '-c' ? stage.cmd[2] ?? '' : stage.cmd.join(' ');
  const made = (ref: string): Image => ({
    ref, id, size: size >= 1000 ? `${(size / 1000).toFixed(2)}GB` : `${String(Math.round(size * 10) / 10)}MB`, startLog: [], files: stage.files, cmd: stage.cmd, workdir: stage.workdir, env: stage.env,
    ...(base.vulns !== undefined ? { vulns: base.vulns } : {}),
    ...(stage.user ?? base.user ? { user: stage.user ?? base.user } : {}),
    // Web サーバの土台は、そのまま待ち受け、公開の場所の頁を答える（動かす命令を替えていない時）
    ...(base.serves && stage.cmd === (base.cmd ?? stage.cmd) ? { serves: { ...base.serves, root: '/usr/share/nginx/html' }, startLog: base.startLog } : {}),
    ...(base.tools ? { tools: true } : {}), command: argv === '' ? (base.command ?? 'node') : argv, procs: [{ command: argv === '' ? 'node' : argv, memory: 41.6 }],
    local: true, built: trace.steps.map((x) => ({ step: x.raw, cached: x.cached })),
  });
  const refs = tags.length > 0 ? tags : ['<none>:<none>'];
  const images = [...host.images.filter((i) => !refs.includes(i.ref)), ...refs.map(made)];
  const next: ContainerHost = { ...host, images, buildCache: [...(host.buildCache ?? []), ...added] };
  const steps2 = out.filter((x) => !x.startsWith(' => => ')).length;
  return { ok: true, host: next, stdout: [head(steps2, steps2, true, secs), ...out], image: made(refs[0] ?? '<none>:<none>'), trace };
}

