import { z } from 'zod';
import { materialize } from '@/engines/git/repository';
import type { GitState } from '@/engines/git/types';

/**
 * Git のサーバに付いた Pull Request（GitHub・GitLab のような置き場。git.i.03 の実戦）。純粋な計算。
 *
 * - 依頼（Pull Request）は、サーバにある枝（head）を、別の枝（base）に取り込む頼み。番号は 1 から振る
 * - 自動の検査（checks）は、依頼の head の今の先の記録の中身で決まる（push すると、次に見た時に検査し直した結果になる）
 * - 見る人（reviewers）は、頼まれた時に、その時の説明と検査の結果を見て、質問・変更を求める・承認のどれかを返す
 * - 取り込み（merge）は、保護の決まり（必須の検査と承認の数）を満たす時だけできる
 */

export const forgeSetupSchema = z.object({
  /** 置き場の上の名前（city/reserve）。依頼の URL に出す */
  repo: z.string().regex(/^[a-z0-9-]+\/[a-z0-9-]+$/),
  /** 自動の検査。path のファイルが pass のどれかの文字列を含めば成功 */
  checks: z.array(z.object({
    name: z.string().regex(/^[a-z0-9-]+$/),
    path: z.string().min(1),
    pass: z.array(z.string().min(1)).min(1),
    /** 失敗・成功した時のログ（gh run view --log-failed で読める） */
    failLog: z.array(z.string()).min(1),
    passLog: z.array(z.string()).min(1),
  }).strict()).default([]),
  /** 見る人。頼まれると、説明（describe の語を全て含むか）と検査の結果を見て返す */
  reviewers: z.array(z.object({
    login: z.string().regex(/^[a-z][a-z0-9-]*$/),
    /** 説明に要る語（全て含まなければ、質問を返す） */
    describe: z.array(z.string().min(1)).default([]),
    /** 説明が足りない時の質問 */
    question: z.string().min(1),
    /** 検査が失敗している時の、変更を求める言葉 */
    changes: z.string().min(1),
    /** 承認の言葉 */
    approve: z.string().min(1),
  }).strict()).default([]),
  /** 枝の保護（取り込みに要る承認の数と、必須の検査） */
  protect: z.object({ branch: z.string().min(1), approvals: z.number().int().min(0), checks: z.array(z.string()) }).strict().optional(),
}).strict();

export type ForgeSetup = z.infer<typeof forgeSetupSchema>;

export type ReviewKind = 'COMMENTED' | 'CHANGES_REQUESTED' | 'APPROVED';

export interface ForgeReview {
  login: string;
  state: ReviewKind;
  body: string;
}

export interface ForgePull {
  number: number;
  title: string;
  body: string;
  head: string;
  base: string;
  author: string;
  state: 'OPEN' | 'MERGED' | 'CLOSED';
  /** 見るのを頼んだ人（返事をもらうと、ここから外れる） */
  requested: string[];
  reviews: ForgeReview[];
}

export interface Forge {
  setup: ForgeSetup;
  pulls: ForgePull[];
}

export const createForge = (setup: ForgeSetup): Forge => ({ setup, pulls: [] });

export interface CheckResult {
  name: string;
  ok: boolean;
  /** 実行の番号（gh run view で引く）。先の記録から決まる */
  run: number;
  log: string[];
}

const tipOf = (git: GitState, branch: string): string | undefined => git.refs.get(`refs/heads/${branch}`);

/** 実行の番号: 検査の名前と先の記録から決める（同じ記録なら同じ番号） */
function runNumber(name: string, commit: string): number {
  let h = 7;
  for (const c of `${name}:${commit}`) h = (h * 31 + c.charCodeAt(0)) % 900000;
  return 100000 + h;
}

/** 依頼の head の今の先の記録で、自動の検査をする */
export function checksOf(forge: Forge, server: GitState, pull: ForgePull): CheckResult[] {
  const tip = tipOf(server, pull.head);
  if (tip === undefined) return [];
  const files = materialize(server, tip);
  return forge.setup.checks.map((c) => {
    const text = files.get(c.path) ?? '';
    const ok = c.pass.some((p) => text.includes(p));
    return { name: c.name, ok, run: runNumber(c.name, tip), log: ok ? c.passLog : c.failLog };
  });
}

/** 実行の番号から、その検査の結果を探す（開いている依頼のどれか） */
export function findRun(forge: Forge, server: GitState, run: number): CheckResult | undefined {
  for (const p of forge.pulls) {
    const hit = checksOf(forge, server, p).find((c) => c.run === run);
    if (hit) return hit;
  }
  return undefined;
}

/** 見る人の返事（その時の説明と検査の結果で決まる） */
export function reviewBy(forge: Forge, server: GitState, pull: ForgePull, login: string): ForgeReview | null {
  const r = forge.setup.reviewers.find((x) => x.login === login);
  if (!r) return null;
  if (!r.describe.every((w) => pull.body.includes(w))) return { login, state: 'COMMENTED', body: r.question };
  if (checksOf(forge, server, pull).some((c) => !c.ok)) return { login, state: 'CHANGES_REQUESTED', body: r.changes };
  return { login, state: 'APPROVED', body: r.approve };
}

/** 見る人に頼む。頼まれた人はすぐ返事をする（返事は、その時の説明と検査の結果で決まる） */
export function requestReview(forge: Forge, server: GitState, number: number, logins: readonly string[]): { forge: Forge; error?: string } {
  const pull = forge.pulls.find((p) => p.number === number);
  if (!pull) return { forge, error: `no pull requests found for #${String(number)}` };
  const unknown = logins.find((l) => !forge.setup.reviewers.some((r) => r.login === l));
  if (unknown !== undefined) return { forge, error: `'${unknown}' not found` };
  const reviews = logins.flatMap((l) => reviewBy(forge, server, pull, l) ?? []);
  return { forge: replacePull(forge, { ...pull, requested: [], reviews: [...pull.reviews, ...reviews] }) };
}

const replacePull = (forge: Forge, pull: ForgePull): Forge => ({ ...forge, pulls: forge.pulls.map((p) => (p.number === pull.number ? pull : p)) });

/** 依頼を作る。head はサーバにある枝で、base と違うこと */
export function openPull(forge: Forge, server: GitState, a: { title: string; body: string; head: string; base: string; author: string }): { forge: Forge; pull?: ForgePull; error?: string } {
  if (a.head === a.base) return { forge, error: `could not create pull request: head branch "${a.head}" is the same as base branch "${a.base}"` };
  if (tipOf(server, a.head) === undefined) return { forge, error: `could not find any commits between origin/${a.base} and ${a.head}: you must first push the current branch to a remote` };
  if (tipOf(server, a.base) === undefined) return { forge, error: `base branch "${a.base}" not found` };
  const open = forge.pulls.find((p) => p.head === a.head && p.base === a.base && p.state === 'OPEN');
  if (open) return { forge, error: `a pull request for branch "${a.head}" into branch "${a.base}" already exists:\n${pullUrl(forge, 'git.example', open.number)}` };
  const pull: ForgePull = { number: forge.pulls.length + 1, title: a.title, body: a.body, head: a.head, base: a.base, author: a.author, state: 'OPEN', requested: [], reviews: [] };
  return { forge: { ...forge, pulls: [...forge.pulls, pull] }, pull };
}

export const pullUrl = (forge: Forge, host: string, number: number): string => `https://${host}/${forge.setup.repo}/pull/${String(number)}`;

/** 見る人ごとの、最後の返事 */
export function latestReviews(pull: ForgePull): ForgeReview[] {
  const out = new Map<string, ForgeReview>();
  for (const r of pull.reviews) out.set(r.login, r);
  return [...out.values()];
}

/** 取り込めるか。取り込めなければ、満たしていない決まり */
export function mergeBlockers(forge: Forge, server: GitState, pull: ForgePull): string[] {
  if (pull.state !== 'OPEN') return [`Pull request #${String(pull.number)} was already ${pull.state === 'MERGED' ? 'merged' : 'closed'}`];
  const rule = forge.setup.protect;
  if (!rule || rule.branch !== pull.base) return [];
  const out: string[] = [];
  const checks = checksOf(forge, server, pull);
  for (const name of rule.checks) if (!checks.find((c) => c.name === name)?.ok) out.push(`required status check "${name}" is failing`);
  const latest = latestReviews(pull);
  if (latest.some((r) => r.state === 'CHANGES_REQUESTED')) out.push('changes were requested by a reviewer');
  const approved = latest.filter((r) => r.state === 'APPROVED').length;
  if (approved < rule.approvals) out.push(`at least ${String(rule.approvals)} approving review is required`);
  return out;
}

/** 取り込んだ印を付ける（サーバの履歴を進めるのは、呼ぶ側が git で行う） */
export const markMerged = (forge: Forge, number: number): Forge => {
  const pull = forge.pulls.find((p) => p.number === number);
  return pull ? replacePull(forge, { ...pull, state: 'MERGED' }) : forge;
};

/** 説明を変える */
export function editPull(forge: Forge, number: number, change: { body?: string; title?: string }): { forge: Forge; error?: string } {
  const pull = forge.pulls.find((p) => p.number === number);
  if (!pull) return { forge, error: `no pull requests found for #${String(number)}` };
  return { forge: replacePull(forge, { ...pull, ...(change.body !== undefined ? { body: change.body } : {}), ...(change.title !== undefined ? { title: change.title } : {}) }) };
}
