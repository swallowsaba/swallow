import { z } from 'zod';

/**
 * 画面で操作する模擬環境（模）の初期状態の形（docs/content-spec.md 2.4.1、docs/decisions.md D-16）。
 * 5 つの型（つなぐ・並べる・割り振る・設定する・読み取って答える）ごとに setup の形を決め、zod で検証する。
 */

/** ID は空白を含まない語（日本語でよい）。操作の文に書く */
const id = z.string().regex(/^[^\s,=<>&!]+$/, 'ID は空白と , = < > & ! を含まない語');

/* ---------- 画面に示す情報（全ての型で置ける） ---------- */

/** when（判定の式）を書くと、その式を満たす時だけ示す */
const when = { when: z.string().min(1).optional() };

export const panelSchema = z.discriminatedUnion('kind', [
  /** 項目と値の並び */
  z.object({ kind: z.literal('kv'), title: z.string().min(1), rows: z.array(z.tuple([z.string(), z.string()])).min(1), ...when }).strict(),
  /** 表 */
  z.object({ kind: z.literal('table'), title: z.string().min(1), columns: z.array(z.string()).min(1), rows: z.array(z.array(z.string())).min(1), ...when }).strict(),
  /** ログ（1 行ずつ） */
  z.object({ kind: z.literal('log'), title: z.string().min(1), lines: z.array(z.string()).min(1), ...when }).strict(),
  /** 折れ線のグラフ（横軸の目盛りと、系列ごとの値） */
  z.object({
    kind: z.literal('chart'), title: z.string().min(1), unit: z.string().optional(),
    x: z.array(z.string()).min(2),
    series: z.array(z.object({ label: z.string().min(1), values: z.array(z.number()) }).strict()).min(1).max(4),
    ...when,
  }).strict(),
  /** 短い文 */
  z.object({ kind: z.literal('text'), title: z.string().min(1), body: z.string().min(1), ...when }).strict(),
]);

const panels = { panels: z.array(panelSchema).max(8).optional() };

/* ---------- つなぐ ---------- */

export const connectSetupSchema = z.object({
  nodes: z.array(z.object({
    id,
    label: z.string().min(1),
    /** 記号（画面の SVG）。無ければ箱 */
    icon: z.enum(['box', 'pc', 'server', 'router', 'switch', 'cloud', 'db', 'cpu', 'memory', 'disk', 'keyboard', 'screen', 'app', 'user', 'net']).optional(),
    /** 位置（0〜100。左上が 0） */
    x: z.number().min(0).max(100),
    y: z.number().min(0).max(100),
    /** 止まっている（動かすまで、たどれない） */
    down: z.boolean().optional(),
    /** 名前の下に添える短い説明 */
    note: z.string().optional(),
  }).strict()).min(2),
  /** 初めにある線 */
  links: z.array(z.tuple([id, id])).optional(),
  /** 向きのある線にする（A → B。reach と path は向きに沿ってたどる） */
  directed: z.boolean().optional(),
  /** 引けない線と、引こうとした時のエラーの文 */
  forbid: z.array(z.object({ a: id, b: id, message: z.string().min(1) }).strict()).optional(),
  /** 荷物を送れる組（画面に「送る」の操作が出る） */
  sends: z.array(z.object({ from: id, to: id, label: z.string().min(1) }).strict()).optional(),
  ...panels,
}).strict();

/* ---------- 並べる ---------- */

export const orderSetupSchema = z.object({
  items: z.array(z.object({
    id,
    label: z.string().min(1),
    /** かかる時間（単位は unit。無ければ分） */
    minutes: z.number().min(0).optional(),
    /** 先（前の段）に要る物 */
    needs: z.array(id).optional(),
    /** 並べなくてよい物（紛れ込ませた札） */
    extra: z.boolean().optional(),
    note: z.string().optional(),
  }).strict()).min(2),
  /** 同じ段に並べられる（並行）か */
  parallel: z.boolean().optional(),
  /** かかる時間の単位（画面に出す。無ければ分）。チームの手順の待ちなど、分で数えない時に書く */
  unit: z.string().min(1).optional(),
  /** 初めの並び（操作の文の order の後ろと同じ形） */
  initial: z.string().optional(),
  ...panels,
}).strict();

/* ---------- 割り振る ---------- */

export const assignSetupSchema = z.object({
  slots: z.array(z.object({
    id,
    label: z.string().min(1),
    /** 容量（札の大きさの合計の上限）。超える put はエラー */
    capacity: z.number().min(0).optional(),
    /** 容量の単位（画面に出す） */
    unit: z.string().optional(),
    /** 容量を超えて入れようとした時のエラーの文（無ければ「入りきらない」。使用中のポートなど、その場面の言葉で返す） */
    full: z.string().min(1).optional(),
    note: z.string().optional(),
  }).strict()).min(1),
  items: z.array(z.object({
    id,
    label: z.string().min(1),
    size: z.number().min(0).optional(),
    /** 枠ごとにかかる時間 */
    time: z.record(id, z.number().min(0)).optional(),
    /** 複数の枠に入れられる（役割に権限を配る、など） */
    multi: z.boolean().optional(),
    extra: z.boolean().optional(),
    note: z.string().optional(),
  }).strict()).min(1),
  /** 初めの割り振り（札 → 枠） */
  initial: z.record(id, z.union([id, z.array(id)])).optional(),
  ...panels,
}).strict();

/* ---------- 設定する ---------- */

export const configSetupSchema = z.object({
  fields: z.array(z.object({
    id,
    label: z.string().min(1),
    /** 選べる値（無ければ自由に入れる） */
    options: z.array(z.string().min(1)).optional(),
    value: z.string().optional(),
    note: z.string().optional(),
    /** その値を選ぶ前に満たす条件（判定の式）。満たさなければ message の文で断る（検査が通るまで取り込めない、など） */
    requires: z.array(z.object({ value: z.string().min(1), expr: z.string().min(1), message: z.string().min(1) }).strict()).optional(),
  }).strict()).optional(),
  tables: z.array(z.object({
    id,
    label: z.string().min(1),
    columns: z.array(z.object({ id, label: z.string().min(1), options: z.array(z.string().min(1)).optional() }).strict()).min(1),
    rows: z.array(z.record(id, z.string())).optional(),
  }).strict()).optional(),
  /** 出来上がりの式（判定の式）。無ければ「全ての欄を初めの値から変えた」。表に行を足す設定で、答えが合っていない時を知らせる */
  settle: z.string().min(1).optional(),
  ...panels,
}).strict().refine((s) => (s.fields?.length ?? 0) + (s.tables?.length ?? 0) > 0, '欄か表が 1 つ以上要る');

/* ---------- 読み取って答える ---------- */

export const readSetupSchema = z.object({
  questions: z.array(z.object({
    id,
    prompt: z.string().min(1),
    options: z.array(z.string().min(1)).optional(),
  }).strict()).min(1),
  panels: z.array(panelSchema).min(1).max(8),
}).strict();

export type Panel = z.infer<typeof panelSchema>;
export type ConnectSetup = z.infer<typeof connectSetupSchema>;
export type OrderSetup = z.infer<typeof orderSetupSchema>;
export type AssignSetup = z.infer<typeof assignSetupSchema>;
export type ConfigSetup = z.infer<typeof configSetupSchema>;
export type ReadSetup = z.infer<typeof readSetupSchema>;

/* ---------- 状態（そのまま JSON にでき、途中の保存に使う） ---------- */

export interface ConnectState { type: 'connect'; setup: ConnectSetup; links: [string, string][]; up: string[]; sent: [string, string][] }
export interface OrderState { type: 'order'; setup: OrderSetup; stages: string[][] }
export interface AssignState { type: 'assign'; setup: AssignSetup; placed: Record<string, string[]> }
export interface ConfigState { type: 'config'; setup: ConfigSetup; fields: Record<string, string>; tables: Record<string, Record<string, string>[]> }
export interface ReadState { type: 'read'; setup: ReadSetup; answers: Record<string, string> }

export type SimState = ConnectState | OrderState | AssignState | ConfigState | ReadState;

/** 1 つの操作の結果。誤りなら error に文を入れ、状態はそのまま */
export interface SimOutcome {
  state: SimState;
  error: string | null;
}
