import { ipToInt, parseCidr } from '@/engines/net/subnet';
import {
  assignSetupSchema, configSetupSchema, connectSetupSchema, orderSetupSchema, readSetupSchema,
  type AssignState, type ConfigState, type ConnectState, type OrderState, type Panel, type ReadState, type SimOutcome, type SimState,
} from './types';

/**
 * 画面で操作する模擬環境（模）（docs/content-spec.md 2.4.1、docs/decisions.md D-16）。純粋な計算。
 *
 * - 状態は setup から作り、操作の文（connect A B など）を 1 つずつ与えて変える。画面の操作も同じ文を通る
 * - 誤った操作は、状態を変えずにエラーの文を返す（エラーの解説が match で当たる）
 * - 達成条件は、式（link A B など）を今の状態で判定する（holds）
 */

export const SIM_TYPES = {
  'sim-connect': 'connect',
  'sim-order': 'order',
  'sim-assign': 'assign',
  'sim-config': 'config',
  'sim-read': 'read',
} as const;

export type SimEnvironmentId = keyof typeof SIM_TYPES;

export const isSimEnvironment = (id: string): id is SimEnvironmentId => Object.hasOwn(SIM_TYPES, id);

/** 型ごとの操作の名前（画面の「使える操作」と、誤りの文に出す） */
export const SIM_VERBS: Record<SimState['type'], string[]> = {
  connect: ['connect', 'cut', 'start', 'send'],
  order: ['order'],
  assign: ['put', 'take'],
  config: ['set', 'add', 'del'],
  read: ['answer'],
};

const norm = (s: string): string => s.trim().toLowerCase();
const same = (a: string, b: string): boolean => norm(a) === norm(b);

/** setup を検証して初期状態を作る。形の誤りや、無い ID を指した setup は投げる（内容の誤り） */
export function createSim(environment: string, setup: unknown): SimState {
  if (!isSimEnvironment(environment)) throw new Error(`知らない模擬環境 ${environment}`);
  switch (SIM_TYPES[environment]) {
    case 'connect': {
      const s = connectSetupSchema.parse(setup);
      const ids = unique(s.nodes.map((n) => n.id), '部品');
      for (const [a, b] of s.links ?? []) need(ids, [a, b], '線');
      for (const f of s.forbid ?? []) need(ids, [f.a, f.b], '引けない線');
      for (const x of s.sends ?? []) need(ids, [x.from, x.to], '送れる組');
      const state: ConnectState = { type: 'connect', setup: s, links: (s.links ?? []).map(([a, b]) => [a, b]), up: [], sent: [] };
      checkPanels(state);
      return state;
    }
    case 'order': {
      const s = orderSetupSchema.parse(setup);
      const ids = unique(s.items.map((i) => i.id), '札');
      for (const i of s.items) need(ids, i.needs ?? [], `${i.id} の needs`);
      const state: OrderState = { type: 'order', setup: s, stages: [] };
      if (s.initial === undefined) return state;
      const r = arrange(state, s.initial);
      if (r.error) throw new Error(`初めの並び: ${r.error}`);
      checkPanels(r.state);
      return r.state;
    }
    case 'assign': {
      const s = assignSetupSchema.parse(setup);
      unique(s.items.map((i) => i.id), '札');
      const slots = unique(s.slots.map((x) => x.id), '枠');
      for (const i of s.items) need(slots, Object.keys(i.time ?? {}), `${i.id} の time`);
      let state: SimState = { type: 'assign', setup: s, placed: {} };
      for (const [item, to] of Object.entries(s.initial ?? {})) {
        for (const slot of Array.isArray(to) ? to : [to]) {
          const r = applyStatement(state, `put ${item} ${slot}`);
          if (r.error) throw new Error(`初めの割り振り: ${r.error}`);
          state = r.state;
        }
      }
      checkPanels(state);
      return state;
    }
    case 'config': {
      const s = configSetupSchema.parse(setup);
      unique([...(s.fields ?? []).map((f) => f.id), ...(s.tables ?? []).map((t) => t.id)], '欄と表');
      const fields: Record<string, string> = {};
      for (const f of s.fields ?? []) {
        if (f.value !== undefined && f.options && !f.options.some((o) => same(o, f.value ?? ''))) throw new Error(`欄 ${f.id} の初めの値 ${f.value} が選べる値に無い`);
        fields[f.id] = f.value ?? '';
      }
      const tables: Record<string, Record<string, string>[]> = {};
      for (const t of s.tables ?? []) {
        const cols = unique(t.columns.map((c) => c.id), `表 ${t.id} の列`);
        for (const row of t.rows ?? []) need(cols, Object.keys(row), `表 ${t.id} の行`);
        tables[t.id] = (t.rows ?? []).map((r) => ({ ...r }));
      }
      const state: ConfigState = { type: 'config', setup: s, fields, tables };
      checkPanels(state);
      return state;
    }
    case 'read': {
      const s = readSetupSchema.parse(setup);
      unique(s.questions.map((q) => q.id), '問い');
      const state: ReadState = { type: 'read', setup: s, answers: {} };
      checkPanels(state);
      return state;
    }
  }
}

/** 情報の when の式が正しいか（誤りは内容の誤りとして投げる） */
function checkPanels(state: SimState): void {
  for (const p of state.setup.panels ?? []) {
    if (p.when === undefined) continue;
    const problems = exprProblems(state, p.when);
    if (problems.length > 0) throw new Error(`情報「${p.title}」の when: ${problems.join('・')}`);
  }
}

/** 今の状態で示す情報（when を満たす物だけ） */
export const shownPanels = (state: SimState): Panel[] => (state.setup.panels ?? []).filter((p) => p.when === undefined || holds(state, p.when));

function unique(ids: string[], what: string): Set<string> {
  const set = new Set<string>();
  for (const i of ids) {
    if (set.has(i)) throw new Error(`${what}の ID ${i} が重なる`);
    set.add(i);
  }
  return set;
}

function need(ids: ReadonlySet<string>, refs: string[], where: string): void {
  for (const r of refs) if (!ids.has(r)) throw new Error(`${where}: ${r} が無い`);
}

/* ---------- 操作 ---------- */

const fail = (state: SimState, error: string): SimOutcome => ({ state, error });
const ok = (state: SimState): SimOutcome => ({ state, error: null });

/** 操作の文を 1 つ与える。空の行は何もしない */
export function applyStatement(state: SimState, line: string): SimOutcome {
  const words = line.trim().split(/\s+/).filter(Boolean);
  const [verb, ...args] = words;
  if (!verb) return ok(state);
  if (!SIM_VERBS[state.type].includes(verb)) return fail(state, `使えない操作: ${verb}（ここで使える操作: ${SIM_VERBS[state.type].join('・')}）`);
  switch (state.type) {
    case 'connect': return connectOp(state, verb, args);
    case 'order': return arrange(state, args.join(' '));
    case 'assign': return assignOp(state, verb, args);
    case 'config': return configOp(state, verb, args, line);
    case 'read': return readOp(state, args);
  }
}

/* つなぐ */

const nodeOf = (s: ConnectState, id: string) => s.setup.nodes.find((n) => n.id === id);
const sameLink = (s: ConnectState, [a, b]: [string, string], x: string, y: string): boolean =>
  (a === x && b === y) || (!s.setup.directed && a === y && b === x);

export const isUp = (s: ConnectState, id: string): boolean => !nodeOf(s, id)?.down || s.up.includes(id);

function connectOp(s: ConnectState, verb: string, args: string[]): SimOutcome {
  const want = verb === 'start' ? 1 : 2;
  if (args.length !== want) return fail(s, verb === 'start' ? '書き方: start 機器' : `書き方: ${verb} 部品 部品（2 つの ID を空白で区切る）`);
  for (const a of args) if (!nodeOf(s, a)) return fail(s, `「${a}」という部品は無い`);
  if (verb === 'send') {
    const [from = '', to = ''] = args;
    if (!isUp(s, from)) return fail(s, `届かない: 送り元の「${from}」が止まっている`);
    if (!reaches(s, from, to)) {
      const far = reachable(s, from).filter((x) => x !== from);
      return fail(s, `届かない: 「${from}」から届くのは ${far.length > 0 ? far.map((x) => `「${x}」`).join('・') : 'どこにも無い'}まで。「${to}」へ進めない`);
    }
    return ok({ ...s, sent: [...s.sent.filter(([a, b]) => !(a === from && b === to)), [from, to]] });
  }
  if (verb === 'start') {
    const [a = ''] = args;
    if (isUp(s, a)) return fail(s, `「${a}」は、もう動いている`);
    return ok({ ...s, up: [...s.up, a] });
  }
  const [a = '', b = ''] = args;
  if (a === b) return fail(s, '同じ部品どうしはつなげない');
  const linked = s.links.some((l) => sameLink(s, l, a, b));
  if (verb === 'cut') {
    if (!linked) return fail(s, `「${a}」と「${b}」はつながっていない`);
    return ok({ ...s, links: s.links.filter((l) => !sameLink(s, l, a, b)), sent: [] });
  }
  if (linked) return fail(s, `「${a}」と「${b}」は、もうつながっている`);
  const forbid = s.setup.forbid?.find((f) => (f.a === a && f.b === b) || (f.a === b && f.b === a));
  if (forbid) return fail(s, forbid.message);
  // 線を足しても、届いた道は残る（届いた記録を消すのは、線を外した時だけ）
  return ok({ ...s, links: [...s.links, [a, b]] });
}

/** 線をたどって届く部品（止まった機器は通れない。送り元を含む） */
export function reachable(s: ConnectState, from: string): string[] {
  if (!isUp(s, from)) return [];
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length > 0) {
    const at = queue.shift() ?? '';
    for (const [a, b] of s.links) {
      const next = a === at ? b : !s.setup.directed && b === at ? a : null;
      if (next === null || seen.has(next) || !isUp(s, next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return [...seen];
}

/** 線をたどって届くか（止まった機器は通れない） */
export const reaches = (s: ConnectState, from: string, to: string): boolean => isUp(s, to) && reachable(s, from).includes(to);

/* 並べる */

function arrange(s: OrderState, text: string): SimOutcome {
  const stages = text.trim() === '' ? [] : text.trim().split(/\s+/).map((g) => g.split(',').filter(Boolean));
  const seen = new Set<string>();
  for (const g of stages) {
    if (g.length > 1 && !s.setup.parallel) return fail(s, '同じ段に 2 つは並べられない（1 つずつ順に並べる）');
    for (const i of g) {
      if (!s.setup.items.some((x) => x.id === i)) return fail(s, `「${i}」という札は無い`);
      if (seen.has(i)) return fail(s, `「${i}」を 2 回並べた`);
      seen.add(i);
    }
  }
  return ok({ ...s, stages });
}

/** 並びを操作の文にする（画面の操作を文で残す） */
export const orderStatement = (stages: string[][]): string => ['order', ...stages.filter((g) => g.length > 0).map((g) => g.join(','))].join(' ').trim();

export const stageOf = (s: OrderState, id: string): number => s.stages.findIndex((g) => g.includes(id));

/** 各段の最も長い時間の合計 */
export const orderTime = (s: OrderState): number =>
  s.stages.reduce((sum, g) => sum + Math.max(0, ...g.map((i) => s.setup.items.find((x) => x.id === i)?.minutes ?? 0)), 0);

/** 先に要る物が、前の段に無い札 */
export function unmetNeeds(s: OrderState): { item: string; needs: string }[] {
  const out: { item: string; needs: string }[] = [];
  for (const item of s.setup.items) {
    const at = stageOf(s, item.id);
    if (at < 0) continue;
    for (const n of item.needs ?? []) {
      const before = stageOf(s, n);
      if (before < 0 || before >= at) out.push({ item: item.id, needs: n });
    }
  }
  return out;
}

/* 割り振る */

export const usedOf = (s: AssignState, slot: string): number =>
  Object.entries(s.placed).reduce((sum, [item, slots]) => sum + (slots.includes(slot) ? (s.setup.items.find((i) => i.id === item)?.size ?? 0) : 0), 0);

export const assignTime = (s: AssignState): number =>
  Object.entries(s.placed).reduce((sum, [item, slots]) => {
    const t = s.setup.items.find((i) => i.id === item)?.time ?? {};
    return sum + slots.reduce((x, slot) => x + (t[slot] ?? 0), 0);
  }, 0);

function assignOp(s: AssignState, verb: string, args: string[]): SimOutcome {
  const [itemId = '', slotId] = args;
  const item = s.setup.items.find((i) => i.id === itemId);
  if (verb === 'take') {
    if (args.length < 1 || args.length > 2) return fail(s, '書き方: take 札（枠を書くと、その枠からだけ出す）');
    if (!item) return fail(s, `「${itemId}」という札は無い`);
    const now = s.placed[itemId] ?? [];
    if (now.length === 0 || (slotId !== undefined && !now.includes(slotId))) return fail(s, `「${itemId}」は${slotId ? `「${slotId}」に` : 'どの枠にも'}入っていない`);
    const rest = slotId === undefined ? [] : now.filter((x) => x !== slotId);
    const placed = { ...s.placed };
    if (rest.length > 0) placed[itemId] = rest;
    else delete placed[itemId];
    return ok({ ...s, placed });
  }
  if (args.length !== 2 || slotId === undefined) return fail(s, '書き方: put 札 枠');
  if (!item) return fail(s, `「${itemId}」という札は無い`);
  const slot = s.setup.slots.find((x) => x.id === slotId);
  if (!slot) return fail(s, `「${slotId}」という枠は無い`);
  const now = s.placed[itemId] ?? [];
  if (now.includes(slotId)) return fail(s, `「${itemId}」は、もう「${slotId}」に入っている`);
  if (now.length > 0 && !item.multi) return fail(s, `「${itemId}」は、もう「${now.join('・')}」に入っている。1 つの札は 1 つの枠にだけ入る（先に take で出す）`);
  if (slot.capacity !== undefined) {
    const after = usedOf(s, slotId) + (item.size ?? 0);
    if (after > slot.capacity && slot.full !== undefined) return fail(s, slot.full);
    if (after > slot.capacity) return fail(s, `「${slotId}」に入りきらない（容量 ${String(slot.capacity)}${slot.unit ?? ''}、入れると ${String(after)}${slot.unit ?? ''}）`);
  }
  return ok({ ...s, placed: { ...s.placed, [itemId]: [...now, slotId] } });
}

/* 設定する */

function configOp(s: ConfigState, verb: string, args: string[], line: string): SimOutcome {
  if (verb === 'set') {
    const [fieldId = ''] = args;
    // 値は空白を含んでよい（欄の ID の後ろ全て）
    const value = line.trim().replace(/^set\s+\S+\s*/, '');
    const field = s.setup.fields?.find((f) => f.id === fieldId);
    if (!field) return fail(s, `「${fieldId}」という欄は無い`);
    if (value === '') return fail(s, `書き方: set ${fieldId} 値`);
    const option = field.options?.find((o) => same(o, value));
    if (field.options && !option) return fail(s, `「${fieldId}」に「${value}」は選べない（選べる値: ${field.options.join('・')}）`);
    return ok({ ...s, fields: { ...s.fields, [fieldId]: option ?? value } });
  }
  const [tableId = '', ...rest] = args;
  const table = s.setup.tables?.find((t) => t.id === tableId);
  if (!table) return fail(s, `「${tableId}」という表は無い`);
  const rows = s.tables[tableId] ?? [];
  if (verb === 'del') {
    const n = Number(rest[0]);
    if (rest.length !== 1 || !Number.isInteger(n) || n < 1 || n > rows.length) return fail(s, `書き方: del ${tableId} 行の番号（1〜${String(rows.length)}）`);
    return ok({ ...s, tables: { ...s.tables, [tableId]: rows.filter((_, i) => i !== n - 1) } });
  }
  const row: Record<string, string> = {};
  for (const pair of rest) {
    const at = pair.indexOf('=');
    const col = table.columns.find((c) => c.id === pair.slice(0, at));
    if (at < 1 || !col) return fail(s, `「${pair}」は書けない（列=値 の形。列: ${table.columns.map((c) => c.id).join('・')}）`);
    const value = pair.slice(at + 1);
    const option = col.options?.find((o) => same(o, value));
    if (col.options && !option) return fail(s, `列「${col.id}」に「${value}」は選べない（選べる値: ${col.options.join('・')}）`);
    row[col.id] = option ?? value;
  }
  if (Object.keys(row).length === 0) return fail(s, `書き方: add ${tableId} ${table.columns.map((c) => `${c.id}=値`).join(' ')}`);
  return ok({ ...s, tables: { ...s.tables, [tableId]: [...rows, row] } });
}

/* 読み取って答える */

function readOp(s: ReadState, args: string[]): SimOutcome {
  const [qId = '', ...rest] = args;
  const q = s.setup.questions.find((x) => x.id === qId);
  if (!q) return fail(s, `「${qId}」という問いは無い`);
  const value = rest.join(' ');
  if (value === '') return fail(s, `書き方: answer ${qId} 値`);
  const option = q.options?.find((o) => same(o, value));
  if (q.options && !option) return fail(s, `「${qId}」に「${value}」は選べない（選べる値: ${q.options.join('・')}）`);
  return ok({ ...s, answers: { ...s.answers, [qId]: option ?? value } });
}

/**
 * 出来上がったか（札を全て並べた・入れた、問いに全て答えた）。出来上がったのに達成条件を満たさなければ、
 * 実戦は「合っていない」と知らせる（src/learning/practice.ts）。つなぐ・設定するには出来上がりが無い
 */
export function isSettled(s: SimState): boolean {
  switch (s.type) {
    case 'order': return s.setup.items.every((i) => i.extra === true || stageOf(s, i.id) >= 0);
    case 'assign': return s.setup.items.every((i) => i.extra === true || (s.placed[i.id] ?? []).length > 0);
    case 'read': return s.setup.questions.every((q) => (s.answers[q.id] ?? '') !== '');
    case 'config': {
      const fields = s.setup.fields ?? [];
      return fields.length > 0 && fields.every((f) => (s.fields[f.id] ?? '') !== '' && !same(s.fields[f.id] ?? '', f.value ?? ''));
    }
    case 'connect':
      return false;
  }
}

/* ---------- 判定の式 ---------- */

type Compare = (a: number, b: number) => boolean;
const COMPARE: Record<string, Compare> = { '<=': (a, b) => a <= b, '>=': (a, b) => a >= b, '=': (a, b) => a === b, '<': (a, b) => a < b, '>': (a, b) => a > b };

/** `名前<=N` を読む */
function comparison(arg: string): { name: string; op: Compare; n: number } | null {
  const m = /^(.*?)(<=|>=|=|<|>)(-?\d+(?:\.\d+)?)$/.exec(arg);
  const op = m ? COMPARE[m[2] ?? ''] : undefined;
  if (!m || !op) return null;
  return { name: m[1] ?? '', op, n: Number(m[3]) };
}

/** `A=B` の組を読む */
function pairs(args: string[]): [string, string][] | null {
  const out: [string, string][] = [];
  for (const a of args) {
    const at = a.indexOf('=');
    if (at < 1) return null;
    out.push([a.slice(0, at), a.slice(at + 1)]);
  }
  return out.length > 0 ? out : null;
}

/** 式の誤り（内容の検証で使う）。無ければ空 */
export function exprProblems(state: SimState, expr: string): string[] {
  const p: string[] = [];
  for (const raw of expr.split('&&')) {
    const clause = raw.trim().replace(/^!/, '');
    try {
      evalClause(state, clause);
    } catch (e) {
      p.push(e instanceof Error ? e.message : String(e));
    }
  }
  if (expr.trim() === '') p.push('式が空');
  return p;
}

/** 達成条件の式を、今の状態で判定する。式の誤りは投げる */
export function holds(state: SimState, expr: string): boolean {
  return expr.split('&&').every((raw) => {
    const c = raw.trim();
    return c.startsWith('!') ? !evalClause(state, c.slice(1).trim()) : evalClause(state, c);
  });
}

function evalClause(state: SimState, clause: string): boolean {
  const [head = '', ...args] = clause.split(/\s+/).filter(Boolean);
  const bad = (why: string): never => {
    throw new Error(`式「${clause}」: ${why}`);
  };
  const idsOf = (list: { id: string }[] | undefined, refs: string[], what: string): void => {
    for (const r of refs) if (!(list ?? []).some((x) => x.id === r)) bad(`${what} ${r} が無い`);
  };
  switch (state.type) {
    case 'connect': {
      const s = state;
      if (head === 'link') {
        if (args.length !== 2) bad('link A B');
        idsOf(s.setup.nodes, args, '部品');
        return s.links.some((l) => sameLink(s, l, args[0] ?? '', args[1] ?? ''));
      }
      if (head === 'path') {
        const chain = (args[0] ?? '').split('>');
        if (args.length !== 1 || chain.length < 2) bad('path A>B>C');
        idsOf(s.setup.nodes, chain, '部品');
        return chain.every((a, i) => i === 0 || s.links.some((l) => sameLink(s, l, chain[i - 1] ?? '', a)));
      }
      if (head === 'reach') {
        if (args.length !== 2) bad('reach A B');
        idsOf(s.setup.nodes, args, '部品');
        return reaches(s, args[0] ?? '', args[1] ?? '');
      }
      if (head === 'sent') {
        if (args.length !== 2) bad('sent A B');
        idsOf(s.setup.nodes, args, '部品');
        return s.sent.some(([a, b]) => a === args[0] && b === args[1]);
      }
      if (head === 'up') {
        idsOf(s.setup.nodes, args, '部品');
        return args.every((a) => isUp(s, a));
      }
      return bad('つなぐの式は link・path・reach・sent・up');
    }
    case 'order': {
      const s = state;
      if (head === 'seq') {
        const chain = (args[0] ?? '').split('<');
        if (args.length !== 1 || chain.length < 2) bad('seq A<B<C');
        idsOf(s.setup.items, chain, '札');
        return chain.every((a, i) => stageOf(s, a) >= 0 && (i === 0 || stageOf(s, chain[i - 1] ?? '') < stageOf(s, a)));
      }
      if (head === 'with') {
        if (args.length < 2) bad('with A B');
        idsOf(s.setup.items, args, '札');
        const at = stageOf(s, args[0] ?? '');
        return at >= 0 && args.every((a) => stageOf(s, a) === at);
      }
      if (head === 'has') {
        if (args.length < 1) bad('has A');
        idsOf(s.setup.items, args, '札');
        return args.every((a) => stageOf(s, a) >= 0);
      }
      if (head === 'deps' && args.length === 0) return unmetNeeds(s).length === 0;
      if (head === 'placed' && args.length === 0) return s.setup.items.every((i) => i.extra === true || stageOf(s, i.id) >= 0);
      const c = comparison(head);
      if (c?.name === 'time' && args.length === 0) return c.op(orderTime(s), c.n);
      if (c?.name === 'stages' && args.length === 0) return c.op(s.stages.length, c.n);
      return bad('並べるの式は seq・with・has・deps・placed・time<=N・stages<=N');
    }
    case 'assign': {
      const s = state;
      if (head === 'in') {
        const ps = pairs(args) ?? bad('in 札=枠 …');
        idsOf(s.setup.items, ps.map(([i]) => i), '札');
        idsOf(s.setup.slots, ps.map(([, x]) => x), '枠');
        return ps.every(([i, x]) => (s.placed[i] ?? []).includes(x));
      }
      if (head === 'count') {
        const c = comparison(args[0] ?? '');
        if (!c || args.length !== 1) bad('count 枠<=N');
        idsOf(s.setup.slots, [c?.name ?? ''], '枠');
        const n = Object.values(s.placed).filter((x) => x.includes(c?.name ?? '')).length;
        return c?.op(n, c.n) ?? false;
      }
      if (head === 'fits' && args.length === 0) return s.setup.slots.every((x) => x.capacity === undefined || usedOf(s, x.id) <= x.capacity);
      if (head === 'placed') {
        idsOf(s.setup.items, args, '札');
        const want = args.length > 0 ? args : s.setup.items.filter((i) => !i.extra).map((i) => i.id);
        return want.every((i) => (s.placed[i] ?? []).length > 0);
      }
      const c = comparison(head);
      if (c?.name === 'time' && args.length === 0) return c.op(assignTime(s), c.n);
      return bad('割り振るの式は in・count・fits・placed・time<=N');
    }
    case 'config': {
      const s = state;
      if (head === 'field') {
        const ps = pairs(args) ?? bad('field 欄=値 …');
        idsOf(s.setup.fields, ps.map(([f]) => f), '欄');
        return ps.every(([f, v]) => same(s.fields[f] ?? '', v));
      }
      if (head === 'row') {
        const [tableId = '', ...rest] = args;
        idsOf(s.setup.tables, [tableId], '表');
        const ps = pairs(rest) ?? bad('row 表 列=値 …');
        const table = s.setup.tables?.find((t) => t.id === tableId);
        idsOf(table?.columns, ps.map(([c]) => c), `表 ${tableId} の列`);
        return (s.tables[tableId] ?? []).some((r) => ps.every(([c, v]) => same(r[c] ?? '', v)));
      }
      if (head === 'rows') {
        const c = (args.length === 1 ? comparison(args[0] ?? '') : null) ?? bad('rows 表<=N');
        idsOf(s.setup.tables, [c.name], '表');
        return c.op((s.tables[c.name] ?? []).length, c.n);
      }
      if (head === 'samenet') return sameNet(s, args, bad);
      if (head === 'pool') return poolHolds(s, args, bad);
      return bad('設定するの式は field・row・rows・samenet・pool');
    }
    case 'read': {
      const s = state;
      if (head !== 'answered') return bad('読み取って答えるの式は answered');
      const ps = pairs(args) ?? bad('answered 問い=値 …');
      idsOf(s.setup.questions, ps.map(([q]) => q), '問い');
      return ps.every(([q, v]) => same(s.answers[q] ?? '', v));
    }
  }
}

/* ---------- ネットワークの設定の式（net の分野） ---------- */

/** 欄の ID ならその値、そうでなければ書いた値そのもの（決まったアドレス）。欄でもアドレスでもなければ式の誤り */
function valueOf(s: ConfigState, ref: string, bad: (why: string) => never): string {
  if (s.setup.fields?.some((f) => f.id === ref)) return s.fields[ref] ?? '';
  if (/^[\d.]+(\/\d+)?$/.test(ref)) return ref;
  return bad(`欄 ${ref} が無い`);
}

/** IPv4 のアドレスを数にする。読めなければ null */
function ipNumber(ip: string): bigint | null {
  try {
    return /^\d+\.\d+\.\d+\.\d+$/.test(ip.trim()) ? ipToInt(ip.trim()) : null;
  } catch {
    return null;
  }
}

/**
 * samenet A B …: 全て「アドレス/区切り」の形で、同じ網（網の部分と区切りが同じ）にあり、互いに重ならず、
 * 網そのもの・全体宛てのアドレスでない（そのまま機械に振って、互いに届く）
 */
function sameNet(s: ConfigState, args: string[], bad: (why: string) => never): boolean {
  if (args.length < 2) bad('samenet 欄 欄 …（2 つ以上）');
  const values = args.map((a) => valueOf(s, a, bad).trim());
  const nets = new Set<string>();
  const seen = new Set<string>();
  for (const v of values) {
    if (!/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(v)) return false;
    let c;
    try {
      c = parseCidr(v);
    } catch {
      return false;
    }
    if (c.prefix > 30 || c.address === c.network || c.address === c.broadcast || seen.has(c.address)) return false;
    seen.add(c.address);
    nets.add(`${c.network}/${String(c.prefix)}`);
  }
  return nets.size === 1;
}

/** pool 始め 終わり in=網 size>=N avoid=a,b: 配る範囲が網の中（網そのもの・全体宛てを除く）で、数が足り、固定のアドレスを含まない */
function poolHolds(s: ConfigState, args: string[], bad: (why: string) => never): boolean {
  const [startRef = '', endRef = '', ...rest] = args;
  if (args.length < 3) bad('pool 始め 終わり in=網 size>=N avoid=a,b');
  const start = ipNumber(valueOf(s, startRef, bad));
  const end = ipNumber(valueOf(s, endRef, bad));
  let net: { network: bigint; broadcast: bigint } | null = null;
  let size: { op: Compare; n: number } | null = null;
  const avoid: bigint[] = [];
  for (const a of rest) {
    if (a.startsWith('in=')) {
      try {
        const c = parseCidr(a.slice(3));
        net = { network: ipToInt(c.network), broadcast: ipToInt(c.broadcast) };
      } catch {
        bad(`網 ${a.slice(3)} が読めない（10.0.0.0/8 の形）`);
      }
      continue;
    }
    if (a.startsWith('avoid=')) {
      for (const ip of a.slice(6).split(',')) avoid.push(ipNumber(ip) ?? bad(`アドレス ${ip} が読めない`));
      continue;
    }
    const c = comparison(a);
    if (c?.name === 'size') size = c;
    else bad(`「${a}」は書けない（in=網・size>=N・avoid=a,b）`);
  }
  if (!net) return bad('in=網 が要る');
  if (start === null || end === null || start > end) return false;
  if (start <= net.network || end >= net.broadcast) return false;
  if (avoid.some((x) => x >= start && x <= end)) return false;
  return size === null || size.op(Number(end - start + 1n), size.n);
}
