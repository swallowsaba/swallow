import { z } from 'zod';

/**
 * GitHub Actions の実行の模型の初めの状態（Git のサーバの置き場 forge の setup の `actions`。docs/content-spec.md 2.4）。
 *
 * ワークフローの YAML・git・gh・curl は本物の書き方で動かし、runner の中で package.json の scripts が呼ぶ道具
 * （tsc・esbuild・vitest・rsync など）の振る舞いと、配る先のサーバだけを、ここに書いた模型で決める。
 */

/** ファイルの中身の条件（path は作業の場所か、配った版の中の相手。has を含む・lacks を含まない） */
export const matchSchema = z.object({
  path: z.string().min(1),
  has: z.string().min(1).optional(),
  lacks: z.string().min(1).optional(),
}).strict().refine((m) => m.has !== undefined || m.lacks !== undefined, { message: 'has か lacks のどちらかを書く' });

/** 当てはまると失敗する（上から最初の物）。log はその時の道具の出力 */
const faultSchema = z.object({
  when: z.array(matchSchema).min(1),
  log: z.array(z.string()).min(1),
  code: z.number().int().min(1).max(255).default(1),
}).strict();

/**
 * package.json の scripts の 1 つの振る舞い。
 * - build: sources のファイルと、入れた部品（node_modules）の版を 1 つにまとめ、bundle に書く（esbuild の束ね方）
 * - test: faults に当たれば失敗する（作業の場所のファイルで決まる）
 * - deploy: out の中身を、site の新しい版（package.json の version）として置き、今の版にする
 * - rollback: site の今の版を、1 つ前に置いた版に戻す。前の版が無ければ missing で止まる
 * - prune: site の今の版のほかの版を消す
 */
export const scriptSchema = z.object({
  kind: z.enum(['build', 'test', 'deploy', 'rollback', 'prune']),
  /** かかる秒（runner の時刻を進める） */
  seconds: z.number().int().min(0).default(0),
  /** build: 束ねる元のディレクトリ */
  sources: z.string().optional(),
  /** build: 書き出すファイル（dist/server.js） */
  bundle: z.string().optional(),
  /** test・deploy: 要るディレクトリ（無ければ missing で止まる） */
  out: z.string().optional(),
  /** 要る物（out・前の版）が無い時の出力 */
  missing: z.object({ log: z.array(z.string()).min(1), code: z.number().int().min(1).max(255).default(1) }).strict().optional(),
  faults: z.array(faultSchema).default([]),
  /** 成功した時の出力。{version} は package.json の版、{previous} は戻した先の版 */
  log: z.array(z.string()).default([]),
  /** deploy・rollback・prune: 配る先の名前 */
  site: z.string().optional(),
  /** 配るのに要る鍵: 環境変数 env の値が、Secrets の secret の値と同じでなければ、log で止まる */
  token: z.object({ env: z.string(), secret: z.string(), log: z.array(z.string()).min(1), code: z.number().int().min(1).max(255).default(1) }).strict().optional(),
}).strict();

const routeSchema = z.object({ status: z.number().int().min(100).max(599), body: z.string() }).strict();

const certSchema = z.object({
  id: z.string(), subject: z.string(), issuer: z.string(), sans: z.array(z.string()),
  notBefore: z.string(), notAfter: z.string(), ca: z.boolean(),
}).strict();

/** 配る先のサーバ（https://名前/ で答える）。答えは今の版の中身で決まる */
export const siteSchema = z.object({
  host: z.string().regex(/^[a-z0-9.-]+$/),
  port: z.number().int().default(443),
  /** 社内の網の名前。書くと、その網の runner からだけ届く（名前も引けない） */
  network: z.string().optional(),
  chain: z.array(certSchema).optional(),
  /** 置いてある版（古い順）。files は版の中のファイル（版の中の場所 → 中身） */
  releases: z.array(z.object({ version: z.string().min(1), files: z.record(z.string()).default({}) }).strict()).min(1),
  /** 今の版 */
  current: z.string().min(1),
  /** 道ごとの答え。{version} は今の版 */
  routes: z.record(z.string().regex(/^\/\S*$/), routeSchema),
  /** 今の版の中身が当てはまると、道の答えを替える（上から最初の物） */
  faults: z.array(z.object({ when: z.array(matchSchema).min(1), routes: z.record(z.string().regex(/^\/\S*$/), routeSchema) }).strict()).default([]),
}).strict().refine((s) => s.releases.some((r) => r.version === s.current), { message: 'current は releases のどれか' });

export const actionsSetupSchema = z.object({
  /** 初めの実行の番号（#58 から始めるなど） */
  firstRun: z.number().int().min(1).default(1),
  /** npm ci・npm install にかかる秒 */
  installSeconds: z.number().int().min(0).default(0),
  /** 部品の置き場（npm の registry）。名前 → 版（published はその時刻から入れられる。無ければ初めから） */
  packages: z.record(z.array(z.object({ version: z.string().regex(/^\d+\.\d+\.\d+$/), published: z.string().optional() }).strict()).min(1)).default({}),
  /** package.json の scripts の名前 → 振る舞い。書いていない script は、本物と同じくシェルで動かす */
  scripts: z.record(scriptSchema).default({}),
  sites: z.array(siteSchema).default([]),
  /** リポジトリの Secrets（名前 → 値）。${{ secrets.名前 }} で渡し、ログでは値を *** に伏せる */
  secrets: z.record(z.string()).default({}),
  /** 自前の runner（ラベルと、つながる社内の網）。提供される runner は ubuntu-* */
  runners: z.array(z.object({ labels: z.array(z.string()).min(1), network: z.string().optional() }).strict()).default([]),
  /** 環境の決まり。reviewers を書くと、その環境の job は承認を待つ */
  environments: z.record(z.object({ reviewers: z.array(z.string()).default([]) }).strict()).default({}),
}).strict();

export type ActionsSetup = z.infer<typeof actionsSetupSchema>;
export type ScriptModel = z.infer<typeof scriptSchema>;
export type SiteSetup = z.infer<typeof siteSchema>;
export type FileMatch = z.infer<typeof matchSchema>;
