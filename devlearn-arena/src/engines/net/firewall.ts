import { contains } from './subnet';

/**
 * iptables の模型（docs/lessons/net.md の net.i.02・net.i.03・net.i.06）。純粋な関数。
 *
 * - filter の表（INPUT・FORWARD・OUTPUT）と nat の表（PREROUTING の DNAT・POSTROUTING の MASQUERADE）を持つ
 * - 規則は上から順に見て、最初に当たった規則の行き先（ACCEPT・DROP・REJECT）で決まる。どれにも当たらなければ鎖の方針（policy）
 * - 当てる条件は本物の書き方: -p・--dport・-s・-d・-i・-o・-m conntrack --ctstate（-m state --state）
 * - 返事の荷物（つながった後の物）は ESTABLISHED。状態の条件を書いた規則に当たる。ポートを書いた規則は、返事には当たらない
 *   （返事は宛先のポートが違うため）
 * - 命令（iptables の引数）を読み、表を変え、-L・-S で本物と同じ形に並べる
 */

export type Verdict = 'ACCEPT' | 'DROP' | 'REJECT';
export type FilterChain = 'INPUT' | 'FORWARD' | 'OUTPUT';
export type NatChain = 'PREROUTING' | 'POSTROUTING';

export interface Rule {
  proto?: 'tcp' | 'udp' | 'icmp';
  dport?: number;
  src?: string;
  dst?: string;
  inIf?: string;
  outIf?: string;
  /** 接続の状態（NEW・ESTABLISHED・RELATED） */
  state?: string[];
  /** 状態の条件の書き方（conntrack か state） */
  stateModule?: 'conntrack' | 'state';
  target: Verdict | 'DNAT' | 'MASQUERADE';
  /** DNAT の先（アドレス[:ポート]） */
  to?: string;
}

export interface Chain {
  policy: 'ACCEPT' | 'DROP';
  rules: Rule[];
}

export interface Iptables {
  filter: Record<FilterChain, Chain>;
  nat: Record<NatChain, Chain>;
}

export const emptyIptables = (): Iptables => ({
  filter: { INPUT: { policy: 'ACCEPT', rules: [] }, FORWARD: { policy: 'ACCEPT', rules: [] }, OUTPUT: { policy: 'ACCEPT', rules: [] } },
  nat: { PREROUTING: { policy: 'ACCEPT', rules: [] }, POSTROUTING: { policy: 'ACCEPT', rules: [] } },
});

/** 判定する荷物の要点 */
export interface Flow {
  proto: 'tcp' | 'udp' | 'icmp';
  src: string;
  dst: string;
  dport: number | null;
  inIf: string | null;
  outIf: string | null;
  established: boolean;
}

const inNet = (cidr: string, ip: string): boolean => (cidr.includes('/') ? contains(cidr, ip) : cidr === ip);

/** 規則が荷物に当たるか */
export function matches(r: Rule, f: Flow): boolean {
  if (r.state) {
    const st = f.established ? 'ESTABLISHED' : 'NEW';
    if (!r.state.includes(st)) return false;
  } else if (f.established && (r.dport !== undefined || r.proto !== undefined)) {
    // 返事は宛先のポートも、決まりも行きと違う。ポート・決まりを書いた規則には当たらない
    return false;
  }
  if (r.proto !== undefined && r.proto !== f.proto) return false;
  if (r.dport !== undefined && r.dport !== f.dport) return false;
  if (r.src !== undefined && !inNet(r.src, f.src)) return false;
  if (r.dst !== undefined && !inNet(r.dst, f.dst)) return false;
  if (r.inIf !== undefined && r.inIf !== f.inIf) return false;
  if (r.outIf !== undefined && r.outIf !== f.outIf) return false;
  return true;
}

/** 鎖を上から見て、行き先を決める。当たった規則の番号（1 から）も返す。どれにも当たらなければ 0（方針） */
export function decide(chain: Chain, f: Flow): { verdict: Verdict; rule: number } {
  for (const [i, r] of chain.rules.entries()) {
    if (r.target === 'DNAT' || r.target === 'MASQUERADE') continue;
    if (matches(r, f)) return { verdict: r.target, rule: i + 1 };
  }
  return { verdict: chain.policy, rule: 0 };
}

/** PREROUTING の DNAT。当たれば、書き換えた宛先とポート */
export function dnat(t: Iptables, f: Flow): { dst: string; dport: number | null } | null {
  for (const r of t.nat.PREROUTING.rules) {
    if (r.target !== 'DNAT' || r.to === undefined || !matches(r, f)) continue;
    const [ip = '', port] = r.to.split(':');
    return { dst: ip, dport: port === undefined ? f.dport : Number(port) };
  }
  return null;
}

/* ---------- 命令を読む ---------- */

const VERSION = 'iptables v1.8.10 (nf_tables)';
const STATE_ORDER: readonly string[] = ['INVALID', 'NEW', 'RELATED', 'ESTABLISHED', 'UNTRACKED'];
const FILTER_CHAINS: readonly string[] = ['INPUT', 'FORWARD', 'OUTPUT'];
const NAT_CHAINS: readonly string[] = ['PREROUTING', 'POSTROUTING'];

export type IptablesResult = { ok: true; table: Iptables; stdout?: string } | { ok: false; table: Iptables; stderr: string; code: number };

const err = (table: Iptables, stderr: string, code = 2): IptablesResult => ({ ok: false, table, stderr, code });

/** 規則の部分（-p … -j …）を読む */
function readRule(args: readonly string[]): Rule | string {
  const r: Partial<Rule> = {};
  let module: string | null = null;
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i] ?? '';
    const v = args[i + 1];
    const need = (): string | null => (v === undefined ? `${VERSION}: option "${a}" requires an argument` : null);
    switch (a) {
      case '-p': case '--protocol': {
        const e = need(); if (e) return e;
        if (v !== 'tcp' && v !== 'udp' && v !== 'icmp' && v !== 'all') return `${VERSION}: unknown protocol "${v ?? ''}" specified`;
        if (v !== 'all') r.proto = v;
        i += 1; break;
      }
      case '--dport': case '--destination-port': {
        const e = need(); if (e) return e;
        if (r.proto !== 'tcp' && r.proto !== 'udp') return `${VERSION}: unknown option "${a}"`;
        if (!/^\d+$/.test(v ?? '')) return `${VERSION}: invalid port/service \`${v ?? ''}' specified`;
        r.dport = Number(v); i += 1; break;
      }
      case '-s': case '--source': { const e = need(); if (e) return e; r.src = v; i += 1; break; }
      case '-d': case '--destination': { const e = need(); if (e) return e; r.dst = v; i += 1; break; }
      case '-i': case '--in-interface': { const e = need(); if (e) return e; r.inIf = v; i += 1; break; }
      case '-o': case '--out-interface': { const e = need(); if (e) return e; r.outIf = v; i += 1; break; }
      case '-m': case '--match': { const e = need(); if (e) return e; module = v ?? null; i += 1; break; }
      case '--ctstate': case '--state': {
        const e = need(); if (e) return e;
        if ((a === '--ctstate' && module !== 'conntrack') || (a === '--state' && module !== 'state')) return `${VERSION}: unknown option "${a}"`;
        // 本物と同じく、状態は決まった順（INVALID・NEW・RELATED・ESTABLISHED・UNTRACKED）に並べ直して持つ
        r.state = (v ?? '').split(',').map((s) => s.toUpperCase()).sort((a2, b2) => STATE_ORDER.indexOf(a2) - STATE_ORDER.indexOf(b2));
        r.stateModule = module === 'state' ? 'state' : 'conntrack';
        i += 1; break;
      }
      case '-j': case '--jump': {
        const e = need(); if (e) return e;
        if (!['ACCEPT', 'DROP', 'REJECT', 'DNAT', 'MASQUERADE'].includes(v ?? '')) return `${VERSION}: Couldn't load target \`${v ?? ''}':No such file or directory`;
        r.target = v as Rule['target']; i += 1; break;
      }
      case '--to-destination': case '--to': { const e = need(); if (e) return e; r.to = v; i += 1; break; }
      default:
        return `Bad argument \`${a}'`;
    }
  }
  if (r.target === undefined) return `${VERSION}: no target specified (use -j)`;
  if (r.target === 'DNAT' && r.to === undefined) return `${VERSION}: DNAT: option "--to-destination" must be specified`;
  return r as Rule;
}

/**
 * iptables の引数（命令の名前は除く）を、表に当てる。-t 表・-A・-I・-D・-F・-P・-L・-S
 */
export function runIptables(t: Iptables, args: readonly string[]): IptablesResult {
  let rest = [...args];
  let tableName: 'filter' | 'nat' = 'filter';
  const ti = rest.findIndex((a) => a === '-t' || a === '--table');
  if (ti >= 0) {
    const name = rest[ti + 1];
    if (name !== 'filter' && name !== 'nat') return err(t, `${VERSION}: can't initialize iptables table \`${name ?? ''}': Table does not exist (do you need to insmod?)\nPerhaps iptables or your kernel needs to be upgraded.\n`, 3);
    tableName = name;
    rest = [...rest.slice(0, ti), ...rest.slice(ti + 2)];
  }
  const chainsOf = tableName === 'filter' ? FILTER_CHAINS : NAT_CHAINS;
  const chains = (tableName === 'filter' ? t.filter : t.nat) as Record<string, Chain>;
  const put = (name: string, chain: Chain): Iptables => (tableName === 'filter' ? { ...t, filter: { ...t.filter, [name]: chain } } : { ...t, nat: { ...t.nat, [name]: chain } });
  const flags = new Set(rest.filter((a) => a.startsWith('-')));
  const command = rest.find((a) => /^-[AIDFPLS]$/.test(a) || ['--append', '--insert', '--delete', '--flush', '--policy', '--list', '--list-rules'].includes(a));
  if (command === undefined) return err(t, `${VERSION}: no command specified\nTry \`iptables -h' or 'iptables --help' for more information.\n`);
  const at = rest.indexOf(command);
  const chainName = rest[at + 1] !== undefined && !rest[at + 1]?.startsWith('-') ? rest[at + 1] : undefined;
  const noChain = (): IptablesResult => err(t, `iptables: No chain/target/match by that name.\n`, 1);
  const chain = chainName !== undefined ? chains[chainName] : undefined;
  if (chainName !== undefined && !chainsOf.includes(chainName)) return noChain();

  switch (command) {
    case '-L': case '--list': {
      const names = chainName !== undefined ? [chainName] : chainsOf;
      return { ok: true, table: t, stdout: names.map((n) => listChain(n, chains[n] ?? { policy: 'ACCEPT', rules: [] }, flags.has('--line-numbers'), flags.has('-v') || rest.includes('-nv') || rest.includes('-vn'))).join('\n') };
    }
    case '-S': case '--list-rules': {
      const names = chainName !== undefined ? [chainName] : chainsOf;
      const lines = [...names.map((n) => `-P ${n} ${chains[n]?.policy ?? 'ACCEPT'}`), ...names.flatMap((n) => (chains[n]?.rules ?? []).map((r) => `-A ${n} ${ruleSpec(r)}`))];
      return { ok: true, table: t, stdout: `${lines.join('\n')}\n` };
    }
    case '-F': case '--flush': {
      if (chainName !== undefined && chain) return { ok: true, table: put(chainName, { ...chain, rules: [] }) };
      let next = t;
      for (const n of chainsOf) next = tableName === 'filter' ? { ...next, filter: { ...next.filter, [n]: { ...next.filter[n as FilterChain], rules: [] } } } : { ...next, nat: { ...next.nat, [n]: { ...next.nat[n as NatChain], rules: [] } } };
      return { ok: true, table: next };
    }
    case '-P': case '--policy': {
      const target = rest[at + 2];
      if (!chain || chainName === undefined) return noChain();
      if (target !== 'ACCEPT' && target !== 'DROP') return err(t, `${VERSION}: Bad policy name. Run \`dmesg' for more information.\n`, 1);
      return { ok: true, table: put(chainName, { ...chain, policy: target }) };
    }
    case '-A': case '--append': case '-I': case '--insert': {
      if (!chain || chainName === undefined) return noChain();
      const insert = command === '-I' || command === '--insert';
      const posRaw = insert && /^\d+$/.test(rest[at + 2] ?? '') ? Number(rest[at + 2]) : null;
      const spec = rest.slice(at + (posRaw !== null ? 3 : 2));
      const rule = readRule(spec);
      if (typeof rule === 'string') return err(t, `${rule}\nTry \`iptables -h' or 'iptables --help' for more information.\n`);
      if (insert) {
        const pos = posRaw ?? 1;
        if (pos < 1 || pos > chain.rules.length + 1) return err(t, `iptables: Index of insertion too big.\n`, 1);
        const rules = [...chain.rules];
        rules.splice(pos - 1, 0, rule);
        return { ok: true, table: put(chainName, { ...chain, rules }) };
      }
      return { ok: true, table: put(chainName, { ...chain, rules: [...chain.rules, rule] }) };
    }
    case '-D': case '--delete': {
      if (!chain || chainName === undefined) return noChain();
      const n = rest[at + 2];
      if (n !== undefined && /^\d+$/.test(n)) {
        const k = Number(n);
        if (k < 1 || k > chain.rules.length) return err(t, `iptables: Index of deletion too big.\n`, 1);
        return { ok: true, table: put(chainName, { ...chain, rules: chain.rules.filter((_, i) => i !== k - 1) }) };
      }
      const rule = readRule(rest.slice(at + 2));
      if (typeof rule === 'string') return err(t, `${rule}\n`);
      const k = chain.rules.findIndex((r) => ruleSpec(r) === ruleSpec(rule));
      if (k < 0) return err(t, `iptables: Bad rule (does a matching rule exist in that chain?).\n`, 1);
      return { ok: true, table: put(chainName, { ...chain, rules: chain.rules.filter((_, i) => i !== k) }) };
    }
    default:
      return err(t, `${VERSION}: unknown option "${command}"\n`);
  }
}

/** -S の書き方（iptables-save と同じ並び） */
export function ruleSpec(r: Rule): string {
  return [
    ...(r.src !== undefined ? ['-s', r.src.includes('/') ? r.src : `${r.src}/32`] : []),
    ...(r.dst !== undefined ? ['-d', r.dst.includes('/') ? r.dst : `${r.dst}/32`] : []),
    ...(r.inIf !== undefined ? ['-i', r.inIf] : []),
    ...(r.outIf !== undefined ? ['-o', r.outIf] : []),
    ...(r.proto !== undefined ? ['-p', r.proto] : []),
    ...(r.state ? (r.stateModule === 'state' ? ['-m', 'state', '--state', r.state.join(',')] : ['-m', 'conntrack', '--ctstate', r.state.join(',')]) : []),
    ...(r.dport !== undefined && r.proto !== undefined ? ['-m', r.proto, '--dport', String(r.dport)] : []),
    '-j', r.target,
    ...(r.to !== undefined ? ['--to-destination', r.to] : []),
  ].join(' ');
}

/** -L の 1 つの鎖（本物の欄の幅） */
function listChain(name: string, chain: Chain, numbers: boolean, verbose: boolean): string {
  const head = `Chain ${name} (policy ${chain.policy}${verbose ? ' 0 packets, 0 bytes' : ''})`;
  const cols = `${numbers ? 'num  ' : ''}${verbose ? ' pkts bytes ' : ''}target     prot opt ${verbose ? 'in     out    ' : ''}source               destination`;
  const rows = chain.rules.map((r, i) => {
    const extra = [
      ...(r.state ? [`${r.stateModule === 'state' ? 'state' : 'ctstate'} ${r.state.join(',')}`] : []),
      ...(r.dport !== undefined && r.proto !== undefined ? [`${r.proto} dpt:${String(r.dport)}`] : []),
      ...(r.to !== undefined ? [`to:${r.to}`] : []),
    ].join(' ');
    const line = `${numbers ? String(i + 1).padEnd(5) : ''}${verbose ? '    0     0 ' : ''}${r.target.padEnd(10)} ${(r.proto ?? 'all').padEnd(4)} --  ${verbose ? `${(r.inIf ?? '*').padEnd(6)} ${(r.outIf ?? '*').padEnd(6)} ` : ''}${(r.src ?? '0.0.0.0/0').padEnd(20)} ${(r.dst ?? '0.0.0.0/0').padEnd(20)} ${extra}`;
    return line.trimEnd();
  });
  return `${[head, cols, ...rows].join('\n')}\n`;
}
