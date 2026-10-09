import { ipToInt, parseCidr } from '@/engines/net/subnet';
import {
  assignSetupSchema, configSetupSchema, connectSetupSchema, orderSetupSchema, readSetupSchema,
  type AssignState, type ConfigState, type ConnectState, type OrderState, type Panel, type ReadState, type SimAction, type SimOutcome, type SimState,
} from './types';

/**
 * 画面で操作する模擬環境（模）（docs/content-spec.md 2.4.1、docs/decisions.md D-16、REWORK-PRACTICE.txt）。純粋な計算。
 *
 * - 状態は setup から作り、操作（SimAction）を 1 つずつ与えて変える（applyAction）。
 *   画面のドラッグ・ボタンと、最後のヒントの再生（テスト）が同じ関数を通る。文を打って操作する経路は無い
 * - 誤った操作は、状態を変えずにエラーの文を返す（エラーの解説が match で当たる）
 * - 達成条件は、式（link A B など）を今の状態で判定する（holds）
 * - 動きで見せるための計算（送った荷物の道すじ・並べた流れの止まる所・置き違えた札）もここで行う
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

/** 型ごとに使える操作 */
const OPS: Record<SimState['type'], readonly SimAction['op'][]> = {
  connect: ['connect', 'cut', 'start', 'send'],
  order: ['arrange'],
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
      for (const i of s.items) {
        need(slots, Object.keys(i.time ?? {}), `${i.id} の time`);
        need(slots, Object.keys(i.refuse ?? {}), `${i.id} の refuse`);
      }
      // 初めの割り振りは、動かせない札（keep）も置く
      let state: AssignState = { type: 'assign', setup: s, placed: {} };
      for (const [item, to] of Object.entries(s.initial ?? {})) {
        for (const slot of Array.isArray(to) ? to : [to]) {
          const r = assignOp(state, { op: 'put', item, slot }, true);
          if (r.error) throw new Error(`初めの割り振り: ${r.error}`);
          state = r.state as AssignState;
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
      const settle = s.settle === undefined ? [] : exprProblems(state, s.settle);
      if (settle.length > 0) throw new Error(`出来上がりの式（settle）: ${settle.join('・')}`);
      for (const f of s.fields ?? []) {
        for (const r of f.requires ?? []) {
          if (f.options && !f.options.some((o) => same(o, r.value))) throw new Error(`欄 ${f.id} の条件（requires）: ${r.value} が選べる値に無い`);
          const problems = exprProblems(state, r.expr);
          if (problems.length > 0) throw new Error(`欄 ${f.id} の条件（requires）: ${problems.join('・')}`);
        }
      }
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

/** 操作を 1 つ与える。この型で使えない操作・無い物を指す操作は、状態を変えずにエラーの文を返す */
export function applyAction(state: SimState, action: SimAction): SimOutcome {
  if (!OPS[state.type].includes(action.op)) return fail(state, `この画面ではできない操作: ${action.op}`);
  switch (state.type) {
    case 'connect': return connectOp(state, action);
    case 'order': return action.op === 'arrange' ? arrange(state, action.stages) : fail(state, `この画面ではできない操作: ${action.op}`);
    case 'assign': return assignOp(state, action, false);
    case 'config': return configOp(state, action);
    case 'read': return action.op === 'answer' ? readOp(state, action.question, action.value) : fail(state, `この画面ではできない操作: ${action.op}`);
  }
}

/* つなぐ */

const nodeOf = (s: ConnectState, id: string) => s.setup.nodes.find((n) => n.id === id);
const nodeLabel = (s: ConnectState, id: string): string => nodeOf(s, id)?.label ?? id;
const sameLink = (s: ConnectState, [a, b]: [string, string], x: string, y: string): boolean =>
  (a === x && b === y) || (!s.setup.directed && a === y && b === x);

export const isUp = (s: ConnectState, id: string): boolean => !nodeOf(s, id)?.down || s.up.includes(id);

/** 2 つの部品をつなげるか。つなげなければ、その理由の文（線を引く前に、ドラッグの途中で示す） */
export function connectProblem(s: ConnectState, a: string, b: string): string | null {
  if (!nodeOf(s, a) || !nodeOf(s, b)) return `「${!nodeOf(s, a) ? a : b}」という部品は無い`;
  if (a === b) return '同じ部品どうしはつなげない';
  if (s.links.some((l) => sameLink(s, l, a, b))) return `「${nodeLabel(s, a)}」と「${nodeLabel(s, b)}」は、もうつながっている`;
  const forbid = s.setup.forbid?.find((f) => (f.a === a && f.b === b) || (f.a === b && f.b === a));
  return forbid ? forbid.message : null;
}

function connectOp(s: ConnectState, action: SimAction): SimOutcome {
  if (action.op === 'start') {
    if (!nodeOf(s, action.node)) return fail(s, `「${action.node}」という部品は無い`);
    if (isUp(s, action.node)) return fail(s, `「${nodeLabel(s, action.node)}」は、もう動いている`);
    return ok({ ...s, up: [...s.up, action.node] });
  }
  if (action.op === 'send') {
    const { from, to } = action;
    for (const x of [from, to]) if (!nodeOf(s, x)) return fail(s, `「${x}」という部品は無い`);
    if (!isUp(s, from)) return fail(s, `届かない: 送り元の「${nodeLabel(s, from)}」が止まっている`);
    if (!reaches(s, from, to)) {
      const far = reachable(s, from).filter((x) => x !== from);
      return fail(s, `届かない: 「${nodeLabel(s, from)}」から届くのは ${far.length > 0 ? far.map((x) => `「${nodeLabel(s, x)}」`).join('・') : 'どこにも無い'}まで。「${nodeLabel(s, to)}」へ進めない`);
    }
    return ok({ ...s, sent: [...s.sent.filter(([a, b]) => !(a === from && b === to)), [from, to]] });
  }
  if (action.op !== 'connect' && action.op !== 'cut') return fail(s, `この画面ではできない操作: ${action.op}`);
  const { a, b } = action;
  if (action.op === 'cut') {
    if (!s.links.some((l) => sameLink(s, l, a, b))) return fail(s, `「${nodeLabel(s, a)}」と「${nodeLabel(s, b)}」はつながっていない`);
    return ok({ ...s, links: s.links.filter((l) => !sameLink(s, l, a, b)), sent: [] });
  }
  const problem = connectProblem(s, a, b);
  if (problem) return fail(s, problem);
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
    for (const next of neighbors(s, at)) {
      if (seen.has(next) || !isUp(s, next)) continue;
      seen.add(next);
      queue.push(next);
    }
  }
  return [...seen];
}

function neighbors(s: ConnectState, at: string): string[] {
  return s.links.flatMap(([a, b]) => (a === at ? [b] : !s.setup.directed && b === at ? [a] : []));
}

/** 線をたどって届くか（止まった機器は通れない） */
export const reaches = (s: ConnectState, from: string, to: string): boolean => isUp(s, to) && reachable(s, from).includes(to);

/** 動いている機器だけを通る、最も短い道（from から goal まで。届かなければ null） */
function shortest(s: ConnectState, from: string, goal: string): string[] | null {
  if (!isUp(s, from)) return null;
  const prev = new Map<string, string | null>([[from, null]]);
  const queue = [from];
  while (queue.length > 0) {
    const at = queue.shift() ?? '';
    if (at === goal) break;
    for (const next of neighbors(s, at)) {
      if (prev.has(next) || !isUp(s, next)) continue;
      prev.set(next, at);
      queue.push(next);
    }
  }
  if (!prev.has(goal)) return null;
  const path: string[] = [];
  for (let at: string | null = goal; at !== null; at = prev.get(at) ?? null) path.unshift(at);
  return path;
}

/**
 * 送った荷物の道すじ（画面で、荷物が線を進む動きに使う）。
 * 届けば宛先までの道、届かなければ、届く所のうち宛先に最も近い（盤の上で）部品までの道と、そこで止まったこと
 */
export function sendRoute(s: ConnectState, from: string, to: string): { path: string[]; arrived: boolean } {
  const direct = isUp(s, to) ? shortest(s, from, to) : null;
  if (direct) return { path: direct, arrived: true };
  const goal = nodeOf(s, to);
  const near = reachable(s, from)
    .map((id) => {
      const n = nodeOf(s, id);
      return { id, d: n && goal ? (n.x - goal.x) ** 2 + (n.y - goal.y) ** 2 : 0 };
    })
    .sort((p, q) => p.d - q.d)[0];
  return { path: near ? (shortest(s, from, near.id) ?? [from]) : [from], arrived: false };
}

/* 並べる */

function arrange(s: OrderState, stages: readonly (readonly string[])[]): SimOutcome {
  const seen = new Set<string>();
  const next = stages.map((g) => [...g]).filter((g) => g.length > 0);
  for (const g of next) {
    if (g.length > 1 && !s.setup.parallel) return fail(s, '同じ段に 2 つは並べられない（1 つずつ順に並べる）');
    for (const i of g) {
      if (!s.setup.items.some((x) => x.id === i)) return fail(s, `「${i}」という札は無い`);
      if (seen.has(i)) return fail(s, `「${itemLabel(s, i)}」を 2 回並べた`);
      seen.add(i);
    }
  }
  return ok({ ...s, stages: next });
}

const itemLabel = (s: OrderState | AssignState, id: string): string => s.setup.items.find((i) => i.id === id)?.label ?? id;

export const stageOf = (s: OrderState, id: string): number => s.stages.findIndex((g) => g.includes(id));

/** 各段の最も長い時間の合計 */
export const orderTime = (s: OrderState): number =>
  s.stages.reduce((sum, g) => sum + stageTime(s, g), 0);

/** 1 つの段の時間（同じ段の札は並行して進むので、最も長い札の時間） */
export const stageTime = (s: OrderState, g: readonly string[]): number => Math.max(0, ...g.map((i) => s.setup.items.find((x) => x.id === i)?.minutes ?? 0));

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

/**
 * 並べた流れを上の段から流した時に、止まる所（画面で、上から順に処理が進む動きに使う）。
 * 止まるのは、流れに入れると止まる札（stop）か、先に要る物がまだ済んでいない札のある段。止まらなければ null
 */
export function orderStop(s: OrderState): { stage: number; item: string; reason: string } | null {
  for (const [at, g] of s.stages.entries()) {
    for (const id of g) {
      const item = s.setup.items.find((x) => x.id === id);
      if (item?.stop) return { stage: at, item: id, reason: item.stop };
      const missing = (item?.needs ?? []).find((n) => {
        const before = stageOf(s, n);
        return before < 0 || before >= at;
      });
      if (missing !== undefined) {
        const where = stageOf(s, missing);
        const why = where < 0 ? 'まだ流れに無い' : where === at ? '同じ段で、まだ終わっていない' : 'まだ後の段にある';
        return { stage: at, item: id, reason: `「${itemLabel(s, id)}」には、先に「${itemLabel(s, missing)}」が要る（${why}）` };
      }
    }
  }
  return null;
}

/* 置く */

export const usedOf = (s: AssignState, slot: string): number =>
  Object.entries(s.placed).reduce((sum, [item, slots]) => sum + (slots.includes(slot) ? (s.setup.items.find((i) => i.id === item)?.size ?? 0) : 0), 0);

export const assignTime = (s: AssignState): number =>
  Object.entries(s.placed).reduce((sum, [item, slots]) => {
    const t = s.setup.items.find((i) => i.id === item)?.time ?? {};
    return sum + slots.reduce((x, slot) => x + (t[slot] ?? 0), 0);
  }, 0);

const slotLabel = (s: AssignState, id: string): string => s.setup.slots.find((x) => x.id === id)?.label ?? id;

/** 札を出した後の割り振り（slot を書けば、その枠からだけ出す） */
function without(placed: Record<string, string[]>, item: string, slot?: string): Record<string, string[]> {
  const rest = slot === undefined ? [] : (placed[item] ?? []).filter((x) => x !== slot);
  const next = { ...placed };
  if (rest.length > 0) next[item] = rest;
  else delete next[item];
  return next;
}

/** 置く・出す。札は 1 つの枠にだけ入る（multi の札を除く）ので、別の枠に入っている札を置くと、そこから移る */
function assignOp(s: AssignState, action: SimAction, initial: boolean): SimOutcome {
  if (action.op !== 'put' && action.op !== 'take') return fail(s, `この画面ではできない操作: ${action.op}`);
  const item = s.setup.items.find((i) => i.id === action.item);
  if (!item) return fail(s, `「${action.item}」という札は無い`);
  const now = s.placed[item.id] ?? [];
  if (action.op === 'take') {
    if (now.length === 0 || (action.slot !== undefined && !now.includes(action.slot))) return fail(s, `「${item.label}」は${action.slot ? `「${slotLabel(s, action.slot)}」に` : 'どの枠にも'}入っていない`);
    if (item.keep) return fail(s, item.keep);
    return ok({ ...s, placed: without(s.placed, item.id, action.slot) });
  }
  const slot = s.setup.slots.find((x) => x.id === action.slot);
  if (!slot) return fail(s, `「${action.slot}」という枠は無い`);
  if (now.includes(slot.id)) return fail(s, `「${item.label}」は、もう「${slot.label}」に入っている`);
  if (!initial && item.keep && now.length > 0) return fail(s, item.keep);
  const refused = item.refuse?.[slot.id];
  if (refused) return fail(s, refused);
  // 移す札は、元の枠から出してから容量を数える
  const base = item.multi || now.length === 0 ? s.placed : without(s.placed, item.id);
  if (slot.capacity !== undefined) {
    const after = usedOf({ ...s, placed: base }, slot.id) + (item.size ?? 0);
    if (after > slot.capacity && slot.full !== undefined) return fail(s, slot.full);
    if (after > slot.capacity) return fail(s, `「${slot.label}」に入りきらない（容量 ${String(slot.capacity)}${slot.unit ?? ''}、入れると ${String(after)}${slot.unit ?? ''}）`);
  }
  return ok({ ...s, placed: { ...base, [item.id]: [...(base[item.id] ?? []), slot.id] } });
}

/** 達成条件の in の式のうち、今は違う枠にある札（全て置いたのに合っていない時、その札を赤く示す） */
export function misplaced(s: AssignState, expr: string): string[] {
  const out: string[] = [];
  for (const raw of expr.split('&&')) {
    const [head = '', ...args] = raw.trim().split(/\s+/);
    if (head !== 'in') continue;
    for (const a of args) {
      const at = a.indexOf('=');
      const item = a.slice(0, at);
      if (at > 0 && !(s.placed[item] ?? []).includes(a.slice(at + 1)) && !out.includes(item)) out.push(item);
    }
  }
  return out;
}

/* 設定する（作り直しの間だけ） */

function configOp(s: ConfigState, action: SimAction): SimOutcome {
  if (action.op === 'set') {
    const field = s.setup.fields?.find((f) => f.id === action.field);
    if (!field) return fail(s, `「${action.field}」という欄は無い`);
    const value = action.value.trim();
    const option = field.options?.find((o) => same(o, value));
    if (field.options && !option) return fail(s, `「${field.label}」に「${value}」は選べない（選べる値: ${field.options.join('・')}）`);
    const blocked = field.requires?.find((r) => same(r.value, value) && !holds(s, r.expr));
    if (blocked) return fail(s, blocked.message);
    return ok({ ...s, fields: { ...s.fields, [field.id]: option ?? value } });
  }
  if (action.op !== 'add' && action.op !== 'del') return fail(s, `この画面ではできない操作: ${action.op}`);
  const table = s.setup.tables?.find((t) => t.id === action.table);
  if (!table) return fail(s, `「${action.table}」という表は無い`);
  const rows = s.tables[table.id] ?? [];
  if (action.op === 'del') {
    if (action.index > rows.length) return fail(s, `「${table.label}」に ${String(action.index)} 行目は無い`);
    return ok({ ...s, tables: { ...s.tables, [table.id]: rows.filter((_, i) => i !== action.index - 1) } });
  }
  const row: Record<string, string> = {};
  for (const [colId, raw] of Object.entries(action.row)) {
    const col = table.columns.find((c) => c.id === colId);
    if (!col) return fail(s, `「${table.label}」に列「${colId}」は無い`);
    const value = raw.trim();
    if (value === '') continue;
    const option = col.options?.find((o) => same(o, value));
    if (col.options && !option) return fail(s, `列「${col.label}」に「${value}」は選べない（選べる値: ${col.options.join('・')}）`);
    row[col.id] = option ?? value;
  }
  if (Object.keys(row).length === 0) return fail(s, `「${table.label}」に足す行が空`);
  return ok({ ...s, tables: { ...s.tables, [table.id]: [...rows, row] } });
}

/* 読み取って答える */

function readOp(s: ReadState, qId: string, raw: string): SimOutcome {
  const q = s.setup.questions.find((x) => x.id === qId);
  if (!q) return fail(s, `「${qId}」という問いは無い`);
  const option = q.options.find((o) => same(o, raw));
  if (!option) return fail(s, `「${q.prompt}」に「${raw}」は選べない`);
  return ok({ ...s, answers: { ...s.answers, [qId]: option } });
}

/**
 * 出来上がったか（札を全て並べた・入れた、問いに全て答えた、欄を全て初めの値から変えた。設定するは settle の式でも決められる）。
 * 出来上がったのに達成条件を満たさなければ、実戦は「合っていない」と知らせる（src/learning/practice.ts）。つなぐには出来上がりが無い
 */
export function isSettled(s: SimState): boolean {
  switch (s.type) {
    case 'order': return s.setup.items.every((i) => i.extra === true || stageOf(s, i.id) >= 0);
    case 'assign': return s.setup.items.every((i) => i.extra === true || (s.placed[i.id] ?? []).length > 0);
    case 'read': return s.setup.questions.every((q) => (s.answers[q.id] ?? '') !== '');
    case 'config': {
      if (s.setup.settle !== undefined) return holds(s, s.setup.settle);
      const fields = s.setup.fields ?? [];
      return fields.length > 0 && fields.every((f) => (s.fields[f.id] ?? '') !== '' && !same(s.fields[f.id] ?? '', f.value ?? ''));
    }
    case 'connect':
      return false;
  }
}

/* ---------- 操作を日本語で言う（記録と、エラーの小窓の「何をしたか」） ---------- */

/** 操作を、画面に出ている名前で言い表す（「予約のアプリ」を「箱」に入れた、など） */
export function describeAction(s: SimState, action: SimAction): string {
  const q = (t: string): string => `「${t}」`;
  switch (action.op) {
    case 'connect': return s.type === 'connect' ? `${q(nodeLabel(s, action.a))}から${q(nodeLabel(s, action.b))}へ線を引いた` : '線を引いた';
    case 'cut': return s.type === 'connect' ? `${q(nodeLabel(s, action.a))}と${q(nodeLabel(s, action.b))}の線を外した` : '線を外した';
    case 'start': return s.type === 'connect' ? `${q(nodeLabel(s, action.node))}を動かした` : '動かした';
    case 'send': return s.type === 'connect' ? (s.setup.sends?.find((x) => x.from === action.from && x.to === action.to)?.label ?? `${q(nodeLabel(s, action.from))}から${q(nodeLabel(s, action.to))}へ送った`) : '送った';
    case 'arrange': return s.type === 'order' ? `上から ${action.stages.map((g) => g.map((i) => q(itemLabel(s, i))).join('と')).join(' → ')} の順に並べた` : '並べた';
    case 'put': return s.type === 'assign' ? `${q(itemLabel(s, action.item))}を${q(slotLabel(s, action.slot))}に入れた` : '入れた';
    case 'take': return s.type === 'assign' ? `${q(itemLabel(s, action.item))}を置き場に戻した` : '戻した';
    case 'answer': return s.type === 'read' ? `${q(s.setup.questions.find((x) => x.id === action.question)?.prompt ?? action.question)}に${q(action.value)}と答えた` : '答えた';
    case 'set': return `${q(action.field)}を${q(action.value)}にした`;
    case 'add': return `${q(action.table)}に行を足した`;
    case 'del': return `${q(action.table)}の ${String(action.index)} 行目を消した`;
  }
}

/**
 * 操作に出てくる物の名前（最後のヒントの日本語に、これが全て書いてあるかを内容の検証で確かめる。
 * 「何をどこへ置く・つなぐ・並べる」がヒントの文から分かるように）
 */
export function actionNames(s: SimState, action: SimAction): string[] {
  switch (action.op) {
    case 'connect':
    case 'cut':
      return s.type === 'connect' ? [nodeLabel(s, action.a), nodeLabel(s, action.b)] : [];
    case 'start': return s.type === 'connect' ? [nodeLabel(s, action.node)] : [];
    case 'send': return s.type === 'connect' ? [s.setup.sends?.find((x) => x.from === action.from && x.to === action.to)?.label ?? nodeLabel(s, action.to)] : [];
    case 'arrange': return s.type === 'order' ? action.stages.flat().map((i) => itemLabel(s, i)) : [];
    case 'put': return s.type === 'assign' ? [itemLabel(s, action.item), slotLabel(s, action.slot)] : [];
    case 'take': return s.type === 'assign' ? [itemLabel(s, action.item)] : [];
    case 'answer': return [action.value];
    case 'set':
    case 'add':
    case 'del':
      return [];
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
