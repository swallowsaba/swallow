import { ciHolds } from '@/engines/cicd/check';
import { alertHolds } from '@/engines/monitor/check';
import { dnat } from '@/engines/net/firewall';
import type { CheckSpec, ErrorGuide, Practice, PracticeStep } from '@/content/schema';
import { parseRich } from '@/content/rich';
import { createClock, type MutableClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { gitHolds } from '@/engines/git/check';
import { clusterHolds } from '@/engines/k8s/check';
import { containerHolds } from '@/engines/container/check';
import { httpEnvOf } from '@/engines/kernel/commands/httpLocal';
import { resolve } from '@/engines/kernel/path';
import { matchesExpected, type ExecOutcome, type SqlDb } from '@/engines/db/check';
import type { CommandRegistry, ShellState } from '@/engines/kernel/registry';
import { portsOf, serviceOf } from '@/engines/kernel/services';
import { execute, lineCommands, type CommandPart } from '@/engines/kernel/shell';
import { sshHolds } from '@/engines/kernel/commands/ssh';
import { exists, isDir, metaOf, readFile, writeFile } from '@/engines/kernel/vfs';
import { initialShell, resolveSetup } from '@/engines/environments';
import { request } from '@/engines/http/http';
import { resolveName, roundTrip } from '@/engines/net/probe';
import { applyAction, createSim, describeAction, holds, settledAfter } from '@/engines/sim/sim';
import type { SimAction, SimState } from '@/engines/sim/types';
import { verify } from '@/engines/tls/tls';
import type { PracticeAttempt } from '@/game/types';

/**
 * 実戦の進み（docs/learning-design.md 6・7 章、docs/content-spec.md 2.4・2.5）。純粋な計算。
 *
 * - 判定は出力の文字列ではなく、模擬環境の状態で行う（checkState）。数える・探す・取り出す端末の手順は、
 *   打った行で決めた道具を使い、正しい結果が出た時点で満たす（ran）。答えの欄はコマンドでは得られない値だけ
 * - 1 つの操作で手順を続けて満たしてもよい（満たした手順は先へ進む）
 * - ヒントは手順ごとに 3 段（方向 → 具体 → そのまま通る答え）。使っても失敗にはしない。
 *   画面で操作する実戦の答えは「何をどこへ置く・つなぐ・並べる」の日本語と、同じ意味の操作（actions）
 * - エラーが出たら、エラーの解説（errorGuides）を探して「内容 → 原因候補 → ヒント」を示す。ゲームオーバーにしない。
 *   出すのは命令が目的を果たせなかった時だけ（failedCommand）。警告や、読めない場所を飛ばしただけの時は出さない
 * - エラーの後にヒント無しで成功したら「エラーから自力で回復した」と記録する（トラブルシューティング）
 */

/* ---------- 状態による判定 ---------- */

/** 端末の実戦で判定できる形 */
export const SHELL_CHECKS: ReadonlySet<CheckSpec['kind']> = new Set(['fs', 'cwd', 'service', 'http', 'tls', 'git', 'k8s', 'net', 'container', 'ci', 'alert', 'ran', 'answer']);

/** 模擬環境（模）の実戦で判定できる形（docs/content-spec.md 2.4.1） */
export const SIM_CHECKS: ReadonlySet<CheckSpec['kind']> = new Set(['sim']);

/**
 * ブラウザ内 SQL（S）の実戦で判定できる形。DB を変える手順は sql、取り出すだけの SELECT は、
 * 結果そのものが目的の値なら ran（SQL の結果）、結果を読み取って考える値なら answer
 */
export const SQL_CHECKS: ReadonlySet<CheckSpec['kind']> = new Set(['sql', 'ran', 'answer']);

/** 判定に使う模擬環境の今の状態。実戦の形に応じて、どれか 1 つがある */
export interface CheckInput {
  shell?: ShellState | undefined;
  /** 画面で操作する模擬（模） */
  sim?: SimState | undefined;
  /** 原因などを答える形（answer）の、学習者の答え */
  answer?: string | undefined;
  /** 端末で今打った行の、区切り（; && ||）ごとの結果。コマンドの実行の結果で判定する形（ran）に使う */
  ran?: readonly CommandPart[] | undefined;
  /** ブラウザ内 SQL（S）の DB */
  db?: SqlDb | undefined;
}

/** 答えの比べ方。前後の空白と英字の大小を問わず、全角の数字・英字・記号は半角と同じに見る（日本語の入力のまま答えてよい） */
const plain = (s: string): string => s.normalize('NFKC').trim().toLowerCase();
const sameAnswer = (a: string, b: string): boolean => {
  if (plain(a) === plain(b)) return true;
  // 場所の答えは、最後の / を問わない（/srv/report/out/）
  const dir = (s: string): string => plain(s).replace(/(.)\/+$/, '$1');
  if (plain(b).startsWith('/') && dir(a) === dir(b)) return true;
  // 数の答えは、後ろに単位を付けてもよい（3 バイト）
  const unit = /^(\d+(?:\.\d+)?)\s*[^\d\s.][^\d]{0,9}$/.exec(plain(a));
  return /^\d+(?:\.\d+)?$/.test(plain(b)) && unit?.[1] === plain(b);
};

/**
 * 打った行の区切りのどれかが、uses のコマンドを全て使い、その結果（標準出力の全体）が result と同じか（判定の ran）。
 * 比べ方は答えと同じ（行ごとの前後の空白も問わない）
 */
function ranHolds(parts: readonly CommandPart[], uses: readonly string[], result: string | undefined, shows: readonly string[] | undefined): boolean {
  return parts.some((p) => {
    if (!uses.every((u) => p.commands.includes(u))) return false;
    const got = resultLines(p.stdout);
    const resultOk = result === undefined || got === resultLines(result) || countsSum(got, result);
    const lines = got.split('\n');
    return resultOk && (shows ?? []).every((s) => lines.includes(resultLines(s)));
  });
}

/** 数える手順で、ファイルごとの数（grep -c の「名前:数」の行）を出した時は、その合計で比べる（grep -rc・find -exec grep -c {} +） */
function countsSum(got: string, result: string): boolean {
  if (!/^\d+$/.test(result.trim())) return false;
  const counts = got.split('\n').map((l) => /^\S.*:(\d+)$/.exec(l)?.[1]);
  return counts.length > 0 && counts.every((c) => c !== undefined) && counts.reduce((s, c) => s + Number(c), 0) === Number(result.trim());
}

/** 結果の比べ方: 行ごとに答えと同じく比べ、行の中の空白の続きは 1 つに見て、空の行は飛ばす */
const resultLines = (t: string): string => t.split('\n').map((l) => plain(l).replace(/\s+/g, ' ')).filter((l) => l !== '').join('\n');

/**
 * ブラウザ内 SQL の 1 回の実行を、判定 ran で見られる形にする。使ったコマンドは、文に出る SQL の語（大文字。'…' の中は除く）。
 * 結果は表ごとに 1 つで、行ごとに値を空白で並べる（列の名前は入れない）。誤りは標準エラーに置く
 */
export function sqlParts(statement: string, outcome: ExecOutcome): CommandPart[] {
  const commands = (statement.replace(/'(?:[^']|'')*'/g, ' ').match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []).map((w) => w.toUpperCase());
  const part = (stdout: string, stderr = ''): CommandPart => ({ stdout, stderr, code: stderr === '' ? 0 : 1, handled: false, commands });
  if (!outcome.ok) return [part('', outcome.error)];
  if (outcome.results.length === 0) return [part('')];
  return outcome.results.map((r) => part(r.rows.map((row) => row.map((v) => (v === null ? 'NULL' : typeof v === 'object' ? `x'${[...v].map((n) => n.toString(16).padStart(2, '0')).join('')}'` : String(v))).join(' ')).join('\n')));
}

const WHO_SHIFT: Record<string, number> = { u: 6, g: 3, o: 0 };
const BIT: Record<string, number> = { r: 4, w: 2, x: 1 };

/** 権限が判定の形に合うか。8 進数ならその値、u+x・go-rwx の形なら、その権限が有る（+）・無い（-） */
function modeHolds(mode: number, spec: string): boolean {
  if (/^[0-7]+$/.test(spec)) return (mode & 0o7777) === Number.parseInt(spec, 8);
  return spec.split(',').every((clause) => {
    const [, who = '', op = '+', perms = ''] = /^([ugoa]*)([+-])([rwx]+)$/.exec(clause) ?? [];
    const whos = who === '' || who === 'a' ? ['u', 'g', 'o'] : who.split('');
    return whos.every((w) => [...perms].every((p) => {
      const on = ((mode >> (WHO_SHIFT[w] ?? 0)) & (BIT[p] ?? 0)) !== 0;
      return op === '+' ? on : !on;
    }));
  });
}

/** 返事に「名前: 値」の見出しがあるか（名前の大文字・小文字は問わず、値は前後の空白を除いて同じ） */
function hasHeader(headers: Readonly<Record<string, string>>, spec: string): boolean {
  const at = spec.indexOf(': ');
  const name = spec.slice(0, at).toLowerCase();
  const want = spec.slice(at + 2);
  return Object.entries(headers).some(([k, v]) => k.toLowerCase() === name && v.trim() === want.trim());
}

/** 達成条件を、模擬環境の今の状態で判定する */
export function checkState(check: CheckSpec, input: CheckInput): boolean {
  if (check.kind === 'sim') return input.sim !== undefined && holds(input.sim, check.expr);
  if (check.kind === 'answer') return input.answer !== undefined && sameAnswer(input.answer, check.equals);
  if (check.kind === 'ran') return input.ran !== undefined && ranHolds(input.ran, check.uses, check.result, check.shows);
  // DB の実戦は、確かめる問い合わせの結果が期待する値と一致するか（DB の状態で判定する）
  if (check.kind === 'sql') return input.db !== undefined && matchesExpected(input.db, check.query, check.equals);
  const { shell } = input;
  if (!shell) return false;
  switch (check.kind) {
    case 'cwd':
      return shell.cwd === resolve('/', check.equals);
    case 'fs': {
      const path = resolve('/', check.path);
      // /proc/<PID> は、そのプロセスが動いている間だけ有る（本物と同じ。プロセス表から決める）
      const pid = /^\/proc\/(\d+)(\/|$)/.exec(path)?.[1];
      const there = pid !== undefined ? shell.procs.processes.has(Number(pid)) : exists(shell.vfs, path);
      if (check.exists === false) return !there;
      if (!there) return false;
      if (check.mode !== undefined && !modeHolds(metaOf(shell.vfs, path).mode, check.mode)) return false;
      if (check.contains === undefined && check.lacks === undefined) return true;
      if (isDir(shell.vfs, path)) return false;
      const text = readFile(shell.vfs, path);
      return (check.contains === undefined || text.includes(check.contains)) && (check.lacks ?? []).every((x) => !text.includes(x));
    }
    case 'service': {
      const s = serviceOf(shell.services, check.name);
      if (!s) return false;
      if (check.active !== undefined && (s.active === 'active') !== check.active) return false;
      if (check.enabled !== undefined && s.enabled !== check.enabled) return false;
      if (check.listen !== undefined && (s.active !== 'active' || ![...portsOf(s), ...(s.udp ?? [])].includes(check.listen))) return false;
      return true;
    }
    case 'http': {
      const r = request(httpEnvOf(shell), check.url, { ...(check.method ? { method: check.method } : {}), ...(check.data !== undefined ? { data: check.data } : {}) });
      return r.ok && r.response.status === check.status && (check.contains === undefined || r.response.body.includes(check.contains)) && (check.header === undefined || hasHeader(r.response.headers, check.header));
    }
    case 'tls': {
      // 手元（/etc/hosts で手元を指す名前を含む）の Web サーバは、送ってくる証明書で確かめる
      const env = httpEnvOf(shell);
      if (env.localNames.includes(check.host.toLowerCase())) {
        const l = env.local(443);
        if (!l || 'reset' in l || !l.chain?.length) return false;
        return verify(check.host, l.chain, env.roots, env.today).trusted === check.trusted;
      }
      const web = shell.web;
      const site = web?.sites.find((x) => x.host === check.host && x.chain && x.chain.length > 0);
      if (!web || !site?.chain) return false;
      return verify(check.host, site.chain, web.roots, web.today).trusted === check.trusted;
    }
    case 'git':
      return gitHolds(shell.git, shell.vfs, check.expr, shell.gitServers);
    case 'k8s':
      return clusterHolds(shell.cluster, check.expr);
    case 'net':
      return netHolds(shell, check.expr);
    case 'container':
      return containerHolds(shell.containers, check.expr);
    case 'ci':
      return ciHolds(shell, check.expr);
    case 'alert':
      return alertHolds(shell, check.expr);
  }
}

/**
 * 網の判定の式（端末の機械から見て）。` && ` でつなぎ、先頭の `!` で否定。
 * `reach 名前[:ポート] [from 機器]`（行きも帰りも通る。ポートを書けば、そこで待ち受けている。from を書けば、その機器から）/
 * `route 機器 宛先の網 via 次のアドレス`（その機器の経路表に、その行がある）/ `resolve 名前=アドレス`（名前の答え）/
 * `record 名前 種類 値`（DNS のサーバが読んだゾーンに、そのレコードがある。末尾の . は問わず、MX は優先度を問わない）/
 * `dnat 機器 ポート アドレス:ポート`（その機器の最初の口に外から来た TCP のそのポートを、iptables の DNAT でその先へ転送する）/
 * `ssh 利用者@名前`（手元の秘密鍵で入った記録があり、今も鍵で入れて、サーバに秘密鍵が置かれていない。setup の sshHosts）。
 * 網の無い機械や、式の誤りは投げる（内容の誤り）
 */
export function netHolds(shell: ShellState, expr: string): boolean {
  const self = shell.vars.get('NET_SELF') ?? '';
  return expr.split('&&').every((raw) => {
    const c = raw.trim();
    const negate = c.startsWith('!');
    const [head = '', arg = '', ...rest] = (negate ? c.slice(1) : c).trim().split(/\s+/);
    const shape = head === 'route' ? rest.length === 3 && rest[1] === 'via' : head === 'record' || head === 'dnat' ? rest.length === 2 : head === 'reach' ? rest.length === 0 || (rest.length === 2 && rest[0] === 'from') : rest.length === 0;
    if (!shape || arg === '') throw new Error(`判定の net の式「${c}」: reach 名前[:ポート] [from 機器] か route 機器 宛先 via 次 か resolve 名前=アドレス か ssh 利用者@名前`);
    if (head === 'ssh') {
      if (!shell.sshHosts) throw new Error('判定の net: この実戦の機械に SSH のサーバ（setup の sshHosts）が無い');
      return sshHolds(shell, arg) !== negate;
    }
    const net = shell.net;
    if (net === null) throw new Error('判定の net: この実戦の機械に網（setup の network）が無い');
    let value: boolean;
    if (head === 'reach') {
      const [host = '', port] = arg.split(':');
      const ip = resolveName(net, host);
      const from = rest[1] ?? self;
      if (!net.devices.has(from)) throw new Error(`判定の net の式「${c}」: 機器 ${from} が網に無い`);
      value = ip !== null && roundTrip(net, from, ip, port === undefined ? undefined : Number(port)).kind === 'ok';
    } else if (head === 'dnat') {
      const device = net.devices.get(arg);
      if (!device) throw new Error(`判定の net の式「${c}」: 機器 ${arg} が網に無い`);
      const [port = '', want = ''] = rest;
      const wan = device.interfaces[0];
      const to = device.iptables && wan ? dnat(device.iptables, { proto: 'tcp', src: '0.0.0.0', dst: wan.ip, dport: Number(port), inIf: wan.name, outIf: null, established: false }) : null;
      value = to !== null && `${to.dst}:${String(to.dport ?? '')}` === want;
    } else if (head === 'record') {
      const bare = (n: string): string => n.replace(/\.$/, '').toLowerCase();
      const [type = '', want = ''] = rest;
      value = (net.records ?? []).some((r) => bare(r.name) === bare(arg) && r.type === type.toUpperCase() && bare(r.type === 'MX' ? (r.value.split(/\s+/)[1] ?? '') : r.value) === bare(want));
    } else if (head === 'route') {
      const device = net.devices.get(arg);
      if (!device) throw new Error(`判定の net の式「${c}」: 機器 ${arg} が網に無い`);
      const [to = '', , via = ''] = rest;
      value = device.routes.some((r) => (r.destination === to || (to === 'default' && r.destination === '0.0.0.0/0')) && r.via === via);
    } else if (head === 'resolve') {
      const [name = '', want = ''] = arg.split('=');
      value = resolveName(net, name) === want;
    } else {
      throw new Error(`判定の net の式「${c}」: reach か resolve か ssh`);
    }
    return negate ? !value : value;
  });
}

/* ---------- ヒント ---------- */

/** 最後のヒント（そのまま入力すれば通る答え）に書いた、打つ物（`...` で囲んだ所）。順に打つ */
export function answerOf(step: PracticeStep): string[] {
  return parseRich(step.hints[2]).flatMap((p) => (p.kind === 'code' ? [p.text] : []));
}

const REGISTRY = createDefaultRegistry();

/**
 * 「今打てるコマンドの候補」（docs/learning-design.md 8 章）。その実戦で使うコマンドの全て（VERIFY-ALL.txt【6】）:
 * 全ての手順の目的・ヒント（打つ行は、パイプの後ろ・sudo の後ろも）・判定の uses に出る、端末のコマンドの名前。
 * 用語として書いたコマンド（{{term:pwd}}）も含める。出すのは名前だけで、打つ行そのものは出さない。step を渡すと、その手順の物を先に並べる
 */
export function commandCandidates(practice: Practice, step?: PracticeStep): string[] {
  const of = (s: PracticeStep): string[] => {
    // 答える手順の最後の `` は答え（コマンドではない）
    const answer = s.check.kind === 'answer' ? answerOf(s).at(-1) : undefined;
    const named = [s.purpose, ...s.hints].flatMap((t) => parseRich(t).flatMap((p) => {
      if (p.kind === 'term') return [p.id];
      if (p.kind !== 'code' || p.text === answer) return [];
      const names = lineCommands(p.text);
      return names.length > 0 ? names : [p.text.trim().split(/\s+/)[0] ?? ''];
    }));
    return s.check.kind === 'ran' ? [...named, ...s.check.uses] : named;
  };
  const steps = step ? [step, ...practice.steps.filter((s) => s.id !== step.id)] : practice.steps;
  return [...new Set(steps.flatMap(of).filter((n) => REGISTRY.has(n)))];
}

/* ---------- エラーの解説 ---------- */

/** 解説の見つからないエラーのための、一般的な案内（内容 → 原因候補 → ヒント の順は同じ） */
export const GENERIC_GUIDE: ErrorGuide = {
  id: 'unknown',
  match: '.',
  meaning: 'コマンドがうまくいかず、エラーの文が出た。赤い行に、何が起きたかが書いてある。',
  causes: ['コマンドの名前や、その後に書いた名前・場所の綴りが違う。', 'この場面では使えない書き方をした（順番や記号の違い）。'],
  hint: 'エラーの文の中の名前を、打った行と見比べよう。分からなければ、左のヒントを 1 段ずつ開ける。',
};

/** 答えた・全て並べたのに達成条件を満たさない時の文。エラーの解説の match はこの文に当てる */
export const NOT_YET = '答えが合っていない（全て答えたが、達成条件をまだ満たしていない）';

/** 答えが合っていない時の、一般的な案内（手順で想定した解説が無い時） */
export const ANSWER_GUIDE: ErrorGuide = {
  id: 'not-yet',
  match: NOT_YET,
  meaning: '答えは受け取ったが、達成条件をまだ満たしていない。どこかが違うようだ。',
  causes: ['見る場所（列・行・グラフ）を取り違えた。', '似た名前や数を読み違えた。'],
  hint: '左の手順の目的を読み直し、どの情報を見ればよいかを確かめよう。分からなければヒントを 1 段ずつ開ける。',
};

function guideMatches(g: ErrorGuide, text: string): boolean {
  try {
    return new RegExp(g.match).test(text);
  } catch {
    return text.includes(g.match);
  }
}

/**
 * 命令が目的を果たせなかったか（エラーの案内を出すか。docs/learning-design.md 7 章、docs/content-spec.md 2.5）。
 * - 標準エラーが空なら、果たしている
 * - 終了の状態が 0 なら、果たしている。標準エラーの文は警告や途中経過（curl -v・kubectl の Warning:・
 *   パイプの前の命令が飛ばした場所。パイプの終了の状態は、本物と同じく最後の命令の物）
 * - 0 でなくても、結果（標準出力）が出ていて、エラーの行が全て「飛ばして続けた」物（解説の skipped）なら、果たしている
 *   （grep -r・find が読めない場所を飛ばした。本物の grep はこの時 2、find は 1 を返す）
 * - 終了の状態を渡さない操作（画面の操作・SQL・保存の後の確かめ）は、標準エラーがあれば果たせていない
 * - 1 行に ; && || で区切った命令が並ぶ時（parts）は、区切りごとに確かめ、どれかが果たせなければ果たせていない。
 *   後ろが || の物は、失敗をその行の中で受けているので数えない
 */
export function failedCommand(a: CommandResultLike, guides: readonly ErrorGuide[]): boolean {
  return failureOf(a, guides) !== null;
}

/** 目的を果たせなかった命令の標準エラー（解説を探すのに使う）。果たしていれば null */
export function failureOf(a: CommandResultLike, guides: readonly ErrorGuide[]): string | null {
  if (a.parts !== undefined) {
    const failed = a.parts.filter((p) => !p.handled && failureOf(p, guides) !== null);
    return failed.length > 0 ? failed.map((p) => p.stderr).join('') : null;
  }
  if (a.stderr.trim() === '') return null;
  if (a.code === undefined) return a.stderr;
  if (a.code === 0) return null;
  if ((a.stdout ?? '').trim() === '') return a.stderr;
  const skips = guides.flatMap((g) => (g.skipped === undefined ? [] : [g.skipped]));
  const onlySkipped = a.stderr.split('\n').filter((l) => l.trim() !== '').every((l) => skips.some((s) => new RegExp(s).test(l)));
  return onlySkipped ? null : a.stderr;
}

/** 命令の結果（標準エラー・出力・終了の状態・区切りごとの結果） */
export interface CommandResultLike {
  stderr: string;
  stdout?: string | undefined;
  code?: number | undefined;
  parts?: readonly CommandPart[] | undefined;
}

/** エラーの文に当たる解説。手順で想定したエラーを先に探し、無ければ全ての解説から、それも無ければ一般的な案内 */
export function findGuide(stderr: string, step: PracticeStep | undefined, guides: readonly ErrorGuide[]): ErrorGuide {
  const expected = (step?.expectedErrors ?? []).map((id) => guides.find((g) => g.id === id)).filter((g): g is ErrorGuide => g !== undefined);
  return expected.find((g) => guideMatches(g, stderr)) ?? guides.find((g) => guideMatches(g, stderr)) ?? GENERIC_GUIDE;
}

/* ---------- 実戦の 1 回 ---------- */

export interface PracticeRun {
  /** 今の手順（全て終えたら steps.length） */
  stepIndex: number;
  stepsDone: string[];
  /** 手順ごとに開いたヒントの段（0〜3） */
  hints: Record<string, number>;
  /** 出たエラーの解説の ID（出た順） */
  errors: string[];
  /** 最後のエラーの後、まだ成功していない */
  errorOpen: boolean;
  /** エラーから自力で（ヒントを開かずに）手順を満たした */
  recovered: boolean;
  dangerousUsed: string[];
  commands: string[];
}

export function startRun(): PracticeRun {
  return { stepIndex: 0, stepsDone: [], hints: {}, errors: [], errorOpen: false, recovered: false, dangerousUsed: [], commands: [] };
}

export const isFinished = (practice: Practice, run: PracticeRun): boolean => run.stepIndex >= practice.steps.length;

export const currentStep = (practice: Practice, run: PracticeRun): PracticeStep | undefined => practice.steps[run.stepIndex];

/** 使ったヒントの最大の段（0〜3） */
export const hintsUsed = (run: PracticeRun): number => Math.max(0, ...Object.values(run.hints));

/** 今の手順のヒントを 1 段開く（3 段まで） */
export function openHint(practice: Practice, run: PracticeRun): PracticeRun {
  const step = currentStep(practice, run);
  if (!step) return run;
  const shown = run.hints[step.id] ?? 0;
  return shown >= 3 ? run : { ...run, hints: { ...run.hints, [step.id]: shown + 1 } };
}

export interface CommandOutcome {
  run: PracticeRun;
  /** この操作で満たした手順 */
  done: PracticeStep[];
  /** エラーが出た時の解説 */
  error: ErrorGuide | null;
  /** その解説が、打った時の手順の見せるための失敗（designedErrors）。画面は「想定どおり」と言い、打ち直しではなく目的の続きへ促す */
  designed: boolean;
  /** 使った危ない手 */
  danger: { id: string; why: string } | null;
}

/**
 * 1 行打った後に呼ぶ。エラー（命令が目的を果たせなかった。failedCommand）の扱いと、状態による手順の判定をする。
 * 終了の値が 0 でなくても、エラーの文が無ければエラーとしない（systemctl status は止まっていれば 3 を返す）
 */
export function afterCommand(
  practice: Practice,
  run: PracticeRun,
  a: {
    line: string;
    stderr: string;
    /** 出力（標準出力）。想定エラーのうち output の物だけを当てる（HTTP の 4xx・5xx） */
    stdout?: string;
    /** 終了の状態（端末で打った行）。渡さなければ、標準エラーがあればエラー */
    code?: number;
    /** ; && || で区切った物ごとの結果（端末で打った行） */
    parts?: readonly CommandPart[];
    shell?: ShellState;
    sim?: SimState;
    answer?: string;
    db?: SqlDb;
    /** 答える・全て並べるなど、出来上がりを確かめる操作だった（満たさなければ「合っていない」と知らせる） */
    settled?: boolean;
    /** 設定の編集（編）で保存した（満たさなければ、手順で想定した「合っていない」の解説を出す） */
    saved?: boolean;
  },
  guides: readonly ErrorGuide[],
): CommandOutcome {
  const line = a.line.trim();
  // この操作より前にエラーが出ていて、まだ成功していない
  const hadError = run.errorOpen;
  let next: PracticeRun = line ? { ...run, commands: [...run.commands, line] } : run;
  const danger = (practice.dangerous ?? []).find((d) => new RegExp(d.pattern).test(line)) ?? null;
  if (danger && !next.dangerousUsed.includes(danger.id)) next = { ...next, dangerousUsed: [...next.dangerousUsed, danger.id] };

  let error: ErrorGuide | null = null;
  // 打った時の手順（エラーの解説を当てる手順。見せるための失敗かを決める）
  const typedIn = currentStep(practice, next);
  const failure = failureOf(a, guides);
  if (failure !== null) {
    error = findGuide(failure, currentStep(practice, next), guides);
    next = { ...next, errors: [...next.errors, error.id], errorOpen: true };
  } else if (`${a.stdout ?? ''}${a.code === 0 ? a.stderr : ''}`.trim() !== '') {
    // 出力に当てる解説は、うまくいった命令が標準エラーに出した文にも当てる（パスワードを聞かれて入れた ssh の「password:」など）
    const said = a.code === 0 ? `${a.stdout ?? ''}\n${a.stderr}` : a.stdout ?? '';
    const step = currentStep(practice, next);
    const inOutput = (step?.expectedErrors ?? []).map((id) => guides.find((g) => g.id === id)).find((g) => g?.output === true && (g.outputOf === undefined || new RegExp(g.outputOf).test(line)) && guideMatches(g, said));
    if (inOutput) {
      error = inOutput;
      next = { ...next, errors: [...next.errors, inOutput.id], errorOpen: true };
    }
  }

  const done: PracticeStep[] = [];
  for (let step = currentStep(practice, next); step; step = currentStep(practice, next)) {
    if (!checkState(step.check, { shell: a.shell, sim: a.sim, answer: a.answer, db: a.db, ran: a.parts })) break;
    done.push(step);
    // 前の操作のエラーの後、ヒントを開かずに満たした
    const self = hadError && (next.hints[step.id] ?? 0) === 0;
    next = { ...next, stepIndex: next.stepIndex + 1, stepsDone: [...next.stepsDone, step.id], errorOpen: false, recovered: next.recovered || self };
  }
  const step = currentStep(practice, next);
  const notYet = (step?.expectedErrors ?? []).map((id) => guides.find((g) => g.id === id)).find((g) => g !== undefined && guideMatches(g, NOT_YET));
  if (done.length > 0) error = null;
  else if (error === null && (a.answer !== undefined || a.settled === true) && step) {
    // 答えたのに満たさない: 調べる材料として「合っていない」を出す（ゲームオーバーにしない）
    error = notYet ?? ANSWER_GUIDE;
    next = { ...next, errors: [...next.errors, error.id], errorOpen: true };
  } else if (error === null && notYet && step && (
    (step.check.kind === 'ran' && missed(step.check, a.parts ?? [], guides))
    || (step.check.kind === 'fs' && a.shell !== undefined && wroteTo(line, a.shell.cwd, resolve('/', step.check.path)))
    || a.saved === true
  )) {
    // 決めた道具を使って結果を出したのに目的の値でない・判定するファイルに書き出したのに中身が違う・設定を保存したのに満たさない:
    // 手順で想定した「合っていない」の解説だけを出す（形を見るために同じ道具を打つのは調べる途中なので、想定の無い手順では何も出さない）
    error = notYet;
    next = { ...next, errors: [...next.errors, notYet.id], errorOpen: true };
  }
  const designed = error !== null && (typedIn?.designedErrors ?? []).includes(error.id);
  return { run: next, done, error, designed, danger: danger ? { id: danger.id, why: danger.why } : null };
}

/** 打った行が、そのファイルへ書き出した（> ・ >> ・ tee の先がそのファイル） */
function wroteTo(line: string, cwd: string, path: string): boolean {
  return [...line.matchAll(/(?:>>?|\btee(?:\s+-a)?)\s*([^\s;|&<>]+)/g)].some((m) => resolve(cwd, (m[1] ?? '').replace(/^["']|["']$/g, '')) === path);
}

/** 決めた道具（uses）を全て使い、目的を果たして結果を出した区切りがある（その結果が目的の値でなかった時に使う） */
function missed(check: Extract<CheckSpec, { kind: 'ran' }>, parts: readonly CommandPart[], guides: readonly ErrorGuide[]): boolean {
  // 数える手順では、数（か、ファイルごとの数）を出した時だけ（grep で一致した行を並べて見るのは、調べる途中）
  const counted = (out: string): boolean => check.result === undefined || !/^\d+$/.test(check.result.trim()) || out.split('\n').every((l) => /^(\S.*:)?\d+$/.test(l));
  return parts.some((p) => check.uses.every((u) => p.commands.includes(u)) && p.stdout.trim() !== '' && counted(resultLines(p.stdout)) && failureOf(p, guides) === null);
}

/** 記録に残す形（docs/data-model.md 4.1 の PracticeAttempt。時刻は記録する時に付く） */
export function attemptOf(practice: Practice, run: PracticeRun): Omit<PracticeAttempt, 'at'> {
  const success = isFinished(practice, run);
  return {
    stepsDone: [...run.stepsDone],
    hintsUsed: hintsUsed(run),
    errors: [...run.errors],
    recoveredFromError: success && run.recovered && hintsUsed(run) === 0,
    dangerousUsed: [...run.dangerousUsed],
    success,
    commands: [...run.commands],
  };
}

/* ---------- 結果 ---------- */

export type ResultKind = 'success' | 'partial' | 'retry';

/** 結果の文の選び方（docs/content-spec.md 2.6）: 未達 → retry、ヒントか危ない手を使った → partial、それ以外 → success */
export function resultKind(attempt: Pick<PracticeAttempt, 'success' | 'hintsUsed' | 'dangerousUsed'>): ResultKind {
  if (!attempt.success) return 'retry';
  return attempt.hintsUsed > 0 || attempt.dangerousUsed.length > 0 ? 'partial' : 'success';
}

/* ---------- 最後のヒントで通るか（docs/content-spec.md 6 章） ---------- */

/**
 * 初期状態から、各手順の最後のヒントの答えを順に打ち、全ての手順を満たすか。満たせなかった手順の問題を返す（無ければ空）。
 * 答えの途中で出るエラーは、その手順の想定エラー（expectedErrors）に当たる物だけ認める（マージの衝突のように、出会うこと自体が課題の時）
 */
export function replayAnswers(practice: Practice, guides: readonly ErrorGuide[] = []): string[] {
  if (practice.mode === 'simulation') return replaySim(practice, guides);
  if (practice.mode === 'editor') return replayEditor(practice, guides);
  if (practice.mode !== 'terminal') return [];
  const problems: string[] = [];
  const registry = REGISTRY;
  const clock = createClock();
  let shell = initialShell(practice.environment, practice.setup);
  for (const step of practice.steps) {
    if (!SHELL_CHECKS.has(step.check.kind)) {
      problems.push(`実戦 ${step.id}: 判定の形 ${step.check.kind} は端末の実戦でまだ使えない`);
      continue;
    }
    const lines = answerOf(step);
    if (lines.length === 0) problems.push(`実戦 ${step.id}: 最後のヒントに打つ物（\`...\`）が無い`);
    let answer: string | undefined;
    let ran: readonly CommandPart[] | undefined;
    const results: string[] = [];
    for (const [i, line] of lines.entries()) {
      // 答える手順は、最後の物が答え。その前の物は、調べるために端末で打つコマンド
      if (step.check.kind === 'answer' && i === lines.length - 1) {
        answer = line;
        continue;
      }
      const out = execute(shell, line, registry, clock);
      shell = out.state;
      ran = out.parts;
      const of = (stream: 'stdout' | 'stderr'): string => out.chunks.filter((c) => c.stream === stream).map((c) => c.text).join('');
      const err = of('stderr');
      results.push(of('stdout'));
      const expected = (step.expectedErrors ?? []).some((id) => guides.some((g) => g.id === id && guideMatches(g, err)));
      if (failedCommand({ stderr: err, stdout: of('stdout'), code: out.exitCode, parts: out.parts }, guides) && !expected) problems.push(`実戦 ${step.id}: 答え「${line}」でエラー: ${err.trim()}`);
    }
    if (!checkState(step.check, { shell, answer, ran })) problems.push(`実戦 ${step.id}: 最後のヒントを打っても達成条件を満たさない`);
    // 答えの欄は、コマンドでは得られない値を答える時だけ使う。コマンドの結果がそのまま答えなら、実行の結果で判定する（ran）
    problems.push(...answerIsResult(step, results));
  }
  return problems;
}

/** 答えの欄は、コマンドでは得られない値を答える時だけ使う。コマンド（SQL）の結果がそのまま答えなら、実行の結果で判定する（ran） */
function answerIsResult(step: PracticeStep, results: readonly string[]): string[] {
  const { check } = step;
  return check.kind === 'answer' && results.some((r) => resultLines(r) === resultLines(check.equals))
    ? [`実戦 ${step.id}: 答えがコマンドの結果そのもの。答えの欄でなく、実行の結果で判定する（ran）`]
    : [];
}

/** 設定の編集（編）の実戦: 最後のヒントの中身を保存して確かめ、全ての手順を満たすか */
function replayEditor(practice: Practice, guides: readonly ErrorGuide[]): string[] {
  const edit = editOf(practice);
  if (!edit) return ['実戦: 設定の編集に、編集するファイル（setup.edit）が無い'];
  const problems: string[] = [];
  const registry = REGISTRY;
  const clock = createClock();
  let shell = initialShell(practice.environment, practice.setup);
  for (const step of practice.steps) {
    if (!SHELL_CHECKS.has(step.check.kind) || step.check.kind === 'answer' || step.check.kind === 'ran') {
      problems.push(`実戦 ${step.id}: 判定の形 ${step.check.kind} は設定の編集の実戦で使えない`);
      continue;
    }
    const answers = answerOf(step);
    if (answers.length !== 1) {
      problems.push(`実戦 ${step.id}: 最後のヒントに、保存する中身（\`...\`）がちょうど 1 つ要る`);
      continue;
    }
    const out = saveEdit(shell, edit, answers[0] ?? '', registry, clock);
    shell = out.state;
    for (const r of out.results) {
      const expected = (step.expectedErrors ?? []).some((id) => guides.some((g) => g.id === id && guideMatches(g, r.stderr)));
      if (failedCommand(r, guides) && !expected) problems.push(`実戦 ${step.id}: 保存の後の「${r.line}」でエラー: ${r.stderr.trim()}`);
    }
    if (!checkState(step.check, { shell })) problems.push(`実戦 ${step.id}: 最後のヒントを保存しても達成条件を満たさない`);
  }
  return problems;
}

/**
 * 模擬環境（模）の実戦: 各手順の最後のヒントの操作（actions）を、画面の操作と同じ関数（applyAction）に順に与え、全ての手順を満たすか。
 * 文を打って操作する経路は無い（REWORK-PRACTICE.txt (2)）
 */
function replaySim(practice: Practice, guides: readonly ErrorGuide[]): string[] {
  const problems: string[] = [];
  let sim = createSim(practice.environment, practice.setup);
  for (const step of practice.steps) {
    if (!SIM_CHECKS.has(step.check.kind)) {
      problems.push(`実戦 ${step.id}: 判定の形 ${step.check.kind} は模擬環境の実戦で使えない`);
      continue;
    }
    const actions = step.actions ?? [];
    if (actions.length === 0) problems.push(`実戦 ${step.id}: 最後のヒントで通る操作（actions）が無い`);
    for (const action of actions) {
      const out = applyAction(sim, action);
      const expected = out.error !== null && (step.expectedErrors ?? []).some((id) => guides.some((g) => g.id === id && guideMatches(g, out.error ?? '')));
      if (out.error !== null && !expected) problems.push(`実戦 ${step.id}: 操作「${describeAction(sim, action)}」でエラー: ${out.error}`);
      sim = out.state;
    }
    try {
      if (!checkState(step.check, { sim })) problems.push(`実戦 ${step.id}: 最後のヒントの操作をしても達成条件を満たさない`);
    } catch (e) {
      problems.push(`実戦 ${step.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return problems;
}

/** 最後のヒントの通りに操作した時に、画面に出たエラーの案内 */
export interface ShownGuide {
  /** その時の今の手順（前の手順の最後のヒントの行で、次の手順に移った後のこともある） */
  step: string;
  /** その行を最後のヒントに書いた手順 */
  from: string;
  line: string;
  guide: string;
  /** 命令が本当に失敗した（failedCommand か、終了の状態が 0 でない）。false なら、うまくいった命令の出力に、出力に当てる解説（output）が当たった */
  failed: boolean;
}

/**
 * 最後のヒントの通りに操作して出るエラーの案内が、許される物か（docs/content-spec.md 2.4）。許されるのは、
 * その手順で見せるための失敗（designedErrors）で、その手順の間に、本当に失敗した命令（衝突・拒否・届かないことを見せる）の物だけ。
 * うまくいった命令の出力に当たった案内・次の手順に移ってから出た案内・想定していない案内は問題。最後に満たせない手順も問題
 */
export function hintGuideProblems(practice: Practice, guides: readonly ErrorGuide[]): string[] {
  // ブラウザ内 SQL は、SQLite を開く replaySqlAnswers の中で同じことを確かめる
  if (practice.mode === 'sql') return [];
  const { shown, missed } = playHints(practice, guides);
  return [...shownProblems(practice, shown), ...missed.map((id) => `実戦 ${id}: 最後のヒントの通りに操作しても、この手順を満たさない`)];
}

function shownProblems(practice: Practice, shown: readonly ShownGuide[]): string[] {
  return shown.flatMap((s) => {
    const from = practice.steps.find((x) => x.id === s.from);
    const why = !s.failed ? 'うまくいった命令の出力に当たった'
      : s.step !== s.from ? `次の手順 ${s.step} に移ってから出た`
        : !(from?.expectedErrors ?? []).includes(s.guide) ? 'その手順の想定エラーに無い'
          : !(from?.designedErrors ?? []).includes(s.guide) ? 'その手順の見せるための失敗（designedErrors）に無い' : null;
    return why ? [`実戦 ${s.from}: 最後のヒントの「${s.line}」で、エラーの案内（${s.guide}）が出る（${why}）`] : [];
  });
}

/**
 * 最後のヒントの通りに、人と同じ順で操作する（VERIFY-ALL.txt【1】の f）。画面と同じ関数（afterCommand）を通し、
 * 出たエラーの案内と、最後に満たせなかった手順を返す。前の手順の操作で満たした手順は飛ばす（画面でも、もう今の手順ではない）。
 * 端末・設定の編集・画面の操作（模）の実戦。ブラウザ内 SQL は playSqlHints
 */
export function playHints(practice: Practice, guides: readonly ErrorGuide[]): { shown: ShownGuide[]; missed: string[] } {
  return playSteps(practice, guides, hintInputs(practice));
}

/** 手順ごとに行う物（端末・ブラウザ内 SQL は打つ行、設定の編集は保存する中身、模は操作）。答える手順の最後の物は答え */
export type StepInputs = (step: PracticeStep) => readonly (string | SimAction)[];

/** 最後のヒントに書いた操作 */
const hintInputs = (practice: Practice): StepInputs => (step) => (practice.mode === 'simulation' ? step.actions ?? [] : answerOf(step));

/** 人と同じ順に通した結果。run はヒントを開かずに通した時の記録（XP の計算に使う） */
export interface PlayResult {
  shown: ShownGuide[];
  missed: string[];
  run: PracticeRun;
}

/**
 * 手順ごとに inputs の物を、人と同じ順で画面と同じ関数（afterCommand）に通す（playHints の一般の形。
 * VERIFY-FREE.txt【1】の別解も同じ道を通る）。ヒントは開かない
 */
export function playSteps(practice: Practice, guides: readonly ErrorGuide[], inputs: StepInputs): PlayResult {
  const shown: ShownGuide[] = [];
  let run = startRun();
  const took = (from: PracticeStep, line: string, out: CommandOutcome, failed: boolean): void => {
    if (out.error) shown.push({ step: currentStep(practice, run)?.id ?? '', from: from.id, line, guide: out.error.id, failed });
    run = out.run;
  };
  const textsOf = (step: PracticeStep): string[] => inputs(step).filter((x): x is string => typeof x === 'string');
  if (practice.mode === 'simulation') {
    let sim = createSim(practice.environment, practice.setup);
    for (const step of practice.steps) {
      if (run.stepsDone.includes(step.id)) continue;
      for (const action of inputs(step).filter((x): x is SimAction => typeof x !== 'string')) {
        const said = describeAction(sim, action);
        const out = applyAction(sim, action);
        const before = sim;
        sim = out.state;
        const check = currentStep(practice, run)?.check;
        const settled = out.error === null && settledAfter(before, sim, check?.kind === 'sim' ? check.expr : null);
        took(step, said, afterCommand(practice, run, { line: said, stderr: out.error ?? '', sim, settled }, guides), out.error !== null);
      }
    }
  } else if (practice.mode === 'editor') {
    const edit = editOf(practice);
    let shell = initialShell(practice.environment, practice.setup);
    const clock = createClock();
    for (const step of practice.steps) {
      if (!edit || run.stepsDone.includes(step.id)) continue;
      for (const content of textsOf(step)) {
        const out = saveEdit(shell, edit, content, REGISTRY, clock);
        shell = out.state;
        const stderr = out.results.filter((x) => failedCommand(x, guides)).map((x) => x.stderr).join('');
        const stdout = out.results.map((x) => x.stdout).join('');
        took(step, edit.path, afterCommand(practice, run, { line: editedText(shell, edit), stderr, stdout, shell, saved: true }, guides), stderr !== '');
      }
    }
  } else if (practice.mode === 'terminal') {
    let shell = initialShell(practice.environment, practice.setup);
    const clock = createClock();
    for (const step of practice.steps) {
      if (run.stepsDone.includes(step.id)) continue;
      const lines = textsOf(step);
      for (const [i, line] of lines.entries()) {
        if (step.check.kind === 'answer' && i === lines.length - 1) {
          took(step, line, afterCommand(practice, run, { line: `（答え）${line}`, stderr: '', shell, answer: line }, guides), false);
          continue;
        }
        const out = execute(shell, line, REGISTRY, clock);
        shell = out.state;
        const of = (stream: 'stdout' | 'stderr'): string => out.chunks.filter((c) => c.stream === stream).map((c) => c.text).join('');
        const a = { line, stderr: of('stderr'), stdout: of('stdout'), code: out.exitCode, parts: out.parts, shell };
        took(step, line, afterCommand(practice, run, a, guides), failedCommand(a, guides) || out.exitCode !== 0);
      }
    }
  }
  return { shown, missed: practice.steps.filter((s) => !run.stepsDone.includes(s.id)).map((s) => s.id), run };
}

/**
 * 人と同じ順に通して出たエラーの案内のうち、許されない物（hintGuideProblems と同じ決まり）。
 * 許されるのは、その手順で想定したエラーで、その手順の間に、本当に失敗した命令の物だけ
 */
export function playProblems(practice: Practice, played: Pick<PlayResult, 'shown' | 'missed'>): string[] {
  return [...shownProblems(practice, played.shown), ...played.missed.map((id) => `実戦 ${id}: この手順を満たさない`)];
}

/**
 * ブラウザ内 SQL（S）の実戦: 初期状態の SQL で開いた DB に、最後のヒントの SQL を順に実行し、全ての手順を満たすか。
 * SQLite の本体（WebAssembly）を読むので非同期。内容の検証（validate.test.ts・scripts/validate-content.mts）が使う
 */
export async function replaySqlAnswers(practice: Practice, guides: readonly ErrorGuide[] = []): Promise<string[]> {
  if (practice.mode !== 'sql') return [];
  const { openDb } = await import('@/engines/db/db');
  const problems: string[] = [];
  const db = await openDb(resolveSetup(practice.environment, practice.setup).sql ?? '');
  try {
    for (const step of practice.steps) {
      if (!SQL_CHECKS.has(step.check.kind)) {
        problems.push(`実戦 ${step.id}: 判定の形 ${step.check.kind} はブラウザ内 SQL の実戦で使えない`);
        continue;
      }
      const lines = answerOf(step);
      if (lines.length === 0) problems.push(`実戦 ${step.id}: 最後のヒントに実行する SQL（\`...\`）が無い`);
      // 答える手順は、最後の物が答え。その前の物は、調べるために実行する SQL
      const answer = step.check.kind === 'answer' ? lines.at(-1) : undefined;
      let ran: CommandPart[] | undefined;
      const results: string[] = [];
      for (const line of step.check.kind === 'answer' ? lines.slice(0, -1) : lines) {
        const out = db.exec(line);
        ran = sqlParts(line, out);
        results.push(...ran.map((p) => p.stdout));
        const expected = !out.ok && (step.expectedErrors ?? []).some((id) => guides.some((g) => g.id === id && guideMatches(g, out.error)));
        if (!out.ok && !expected) problems.push(`実戦 ${step.id}: 答え「${line}」でエラー: ${out.error}`);
      }
      if (!checkState(step.check, { db, answer, ran })) problems.push(`実戦 ${step.id}: 最後のヒントを実行しても達成条件を満たさない`);
      problems.push(...answerIsResult(step, results));
    }
  } finally {
    db.close();
  }
  // 手順ごとに通る時だけ、人と同じ順に通した時の案内と満たし方も確かめる（同じ誤りを 2 度言わない）
  return problems.length > 0 ? problems : playSqlHints(practice, guides);
}

/** ブラウザ内 SQL の最後のヒントを、画面と同じ関数（afterCommand）で人と同じ順に通し、出たエラーの案内と満たせない手順を問題にする（hintGuideProblems と同じ） */
async function playSqlHints(practice: Practice, guides: readonly ErrorGuide[]): Promise<string[]> {
  const { shown, missed } = await playSqlSteps(practice, guides, hintInputs(practice));
  return [...shownProblems(practice, shown), ...missed.map((id) => `実戦 ${id}: 最後のヒントの通りに操作しても、この手順を満たさない`)];
}

/** ブラウザ内 SQL の実戦で、手順ごとに inputs の SQL を人と同じ順で画面と同じ関数に通す（playSteps の SQL の形） */
export async function playSqlSteps(practice: Practice, guides: readonly ErrorGuide[], inputs: StepInputs): Promise<PlayResult> {
  const { openDb } = await import('@/engines/db/db');
  const db = await openDb(resolveSetup(practice.environment, practice.setup).sql ?? '');
  const shown: ShownGuide[] = [];
  let run = startRun();
  try {
    for (const step of practice.steps) {
      if (run.stepsDone.includes(step.id)) continue;
      const lines = inputs(step).filter((x): x is string => typeof x === 'string');
      for (const [i, line] of lines.entries()) {
        let failed = false;
        let out: CommandOutcome;
        if (step.check.kind === 'answer' && i === lines.length - 1) {
          out = afterCommand(practice, run, { line: `（答え）${line}`, stderr: '', db, answer: line }, guides);
        } else {
          const r = db.exec(line);
          failed = !r.ok;
          out = afterCommand(practice, run, { line, stderr: r.ok ? '' : r.error, db, parts: sqlParts(line, r) }, guides);
        }
        if (out.error) shown.push({ step: currentStep(practice, run)?.id ?? '', from: step.id, line, guide: out.error.id, failed });
        run = out.run;
      }
    }
  } finally {
    db.close();
  }
  return { shown, missed: practice.steps.filter((s) => !run.stepsDone.includes(s.id)).map((s) => s.id), run };
}

/* ---------- 設定の編集（編。docs/content-spec.md 2.4.2） ---------- */

/** 編集するファイルと、保存の後に打つコマンド */
export interface EditSpec {
  path: string;
  apply: readonly string[];
}

/** 「編」の実戦の setup.edit。設定の編集でない実戦と、書いていない時は null */
export function editOf(practice: Practice): EditSpec | null {
  if (practice.mode !== 'editor') return null;
  return resolveSetup(practice.environment, practice.setup).edit ?? null;
}

/** 保存の後に打った 1 行と、その出力（確かめた結果） */
export interface EditResult {
  line: string;
  stdout: string;
  stderr: string;
  /** 終了の状態（記録し始める前の保存には無い） */
  code?: number;
}

/**
 * 「保存して確かめる」: 編集欄の中身をファイル全体として保存し、apply のコマンドを順に打つ。
 * 画面と、最後のヒントの再生（replayAnswers）が同じ関数を通る
 */
export function saveEdit(shell: ShellState, edit: EditSpec, content: string, registry: CommandRegistry, clock: MutableClock): { state: ShellState; results: EditResult[] } {
  const text = content === '' || content.endsWith('\n') ? content : `${content}\n`;
  let state: ShellState = { ...shell, vfs: writeFile(shell.vfs, edit.path, text, true) };
  const results: EditResult[] = [];
  for (const line of edit.apply) {
    const out = execute(state, line, registry, clock);
    state = out.state;
    const of = (stream: 'stdout' | 'stderr'): string => out.chunks.filter((c) => c.stream === stream).map((c) => c.text).join('');
    results.push({ line, stdout: of('stdout'), stderr: of('stderr'), code: out.exitCode });
  }
  return { state, results };
}

/** 編集するファイルの今の中身（無ければ空） */
export function editedText(shell: ShellState, edit: EditSpec): string {
  return exists(shell.vfs, edit.path) && !isDir(shell.vfs, edit.path) ? readFile(shell.vfs, edit.path) : '';
}
