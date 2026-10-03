import type { CheckSpec, ErrorGuide, Practice, PracticeStep } from '@/content/schema';
import { parseRich } from '@/content/rich';
import { createClock } from '@/engines/kernel/clock';
import { createDefaultRegistry } from '@/engines/kernel/commands';
import { gitHolds } from '@/engines/git/check';
import { clusterHolds } from '@/engines/k8s/check';
import { httpEnvOf } from '@/engines/kernel/commands/httpLocal';
import { resolve } from '@/engines/kernel/path';
import type { ShellState } from '@/engines/kernel/registry';
import { serviceOf } from '@/engines/kernel/services';
import { execute } from '@/engines/kernel/shell';
import { exists, isDir, readFile } from '@/engines/kernel/vfs';
import { initialShell } from '@/engines/environments';
import { request } from '@/engines/http/http';
import { verify } from '@/engines/tls/tls';
import type { PracticeAttempt } from '@/game/types';

/**
 * 実戦の進み（docs/learning-design.md 6・7 章、docs/content-spec.md 2.4・2.5）。純粋な計算。
 *
 * - 判定は出力の文字列ではなく、模擬環境の状態で行う（checkState）
 * - 1 つの操作で手順を続けて満たしてもよい（満たした手順は先へ進む）
 * - ヒントは手順ごとに 3 段（方向 → 具体 → そのまま打てば通る答え）。使っても失敗にはしない
 * - エラーが出たら、エラーの解説（errorGuides）を探して「内容 → 原因候補 → ヒント」を示す。ゲームオーバーにしない
 * - エラーの後にヒント無しで成功したら「エラーから自力で回復した」と記録する（トラブルシューティング）
 */

/* ---------- 状態による判定 ---------- */

/** 端末の実戦で判定できる形。net は、その分野の実戦と一緒に作る（docs/development-plan.md Phase 10） */
export const SHELL_CHECKS: ReadonlySet<CheckSpec['kind']> = new Set(['fs', 'cwd', 'service', 'http', 'tls', 'git', 'k8s', 'answer']);

export interface CheckInput {
  shell: ShellState;
  /** 原因などを答える形（answer）の、学習者の答え */
  answer?: string | undefined;
}

const sameAnswer = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** 達成条件を、模擬環境の今の状態で判定する */
export function checkState(check: CheckSpec, input: CheckInput): boolean {
  const { shell } = input;
  switch (check.kind) {
    case 'cwd':
      return shell.cwd === resolve('/', check.equals);
    case 'fs': {
      const path = resolve('/', check.path);
      const there = exists(shell.vfs, path);
      if (check.exists === false) return !there;
      if (!there) return false;
      if (check.contains === undefined) return true;
      return !isDir(shell.vfs, path) && readFile(shell.vfs, path).includes(check.contains);
    }
    case 'service': {
      const s = serviceOf(shell.services, check.name);
      if (!s) return false;
      if (check.active !== undefined && (s.active === 'active') !== check.active) return false;
      if (check.enabled !== undefined && s.enabled !== check.enabled) return false;
      return true;
    }
    case 'http': {
      const r = request(httpEnvOf(shell), check.url);
      return r.ok && r.response.status === check.status;
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
      return gitHolds(shell.git, shell.vfs, check.expr);
    case 'k8s':
      return clusterHolds(shell.cluster, check.expr);
    case 'answer':
      return input.answer !== undefined && sameAnswer(input.answer, check.equals);
    case 'sql':
      // DB の実戦は DB の状態で判定する（src/engines/db の matchesExpected）。端末の状態では判定しない
      return false;
    case 'net':
      throw new Error(`判定の形 ${check.kind} は、まだ端末の実戦につないでいない`);
  }
}

/* ---------- ヒント ---------- */

/** 最後のヒント（そのまま入力すれば通る答え）に書いた、打つ物（`...` で囲んだ所）。順に打つ */
export function answerOf(step: PracticeStep): string[] {
  return parseRich(step.hints[2]).flatMap((p) => (p.kind === 'code' ? [p.text] : []));
}

const REGISTRY = createDefaultRegistry();

/**
 * 「今打てるコマンドの候補」（docs/learning-design.md 8 章）。手順の目的と、答えでないヒントに出た物のうち、端末のコマンドの名前。
 * 用語として書いたコマンド（{{term:pwd}}）も含める
 */
export function commandCandidates(step: PracticeStep): string[] {
  const texts = [step.purpose, step.hints[0], step.hints[1]];
  const names = texts.flatMap((t) => parseRich(t).flatMap((p) => (p.kind === 'code' ? [p.text.trim().split(/\s+/)[0] ?? ''] : p.kind === 'term' ? [p.id] : [])));
  return [...new Set(names.filter((n) => REGISTRY.has(n)))];
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

function guideMatches(g: ErrorGuide, text: string): boolean {
  try {
    return new RegExp(g.match).test(text);
  } catch {
    return text.includes(g.match);
  }
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
  /** 使った危ない手 */
  danger: { id: string; why: string } | null;
}

/**
 * 1 行打った後に呼ぶ。エラー（エラーの文が出た）の扱いと、状態による手順の判定をする。
 * 終了の値が 0 でなくても、エラーの文が無ければエラーとしない（systemctl status は止まっていれば 3 を返す）
 */
export function afterCommand(
  practice: Practice,
  run: PracticeRun,
  a: { line: string; stderr: string; shell: ShellState; answer?: string },
  guides: readonly ErrorGuide[],
): CommandOutcome {
  const line = a.line.trim();
  // この操作より前にエラーが出ていて、まだ成功していない
  const hadError = run.errorOpen;
  let next: PracticeRun = line ? { ...run, commands: [...run.commands, line] } : run;
  const danger = (practice.dangerous ?? []).find((d) => new RegExp(d.pattern).test(line)) ?? null;
  if (danger && !next.dangerousUsed.includes(danger.id)) next = { ...next, dangerousUsed: [...next.dangerousUsed, danger.id] };

  let error: ErrorGuide | null = null;
  if (a.stderr.trim() !== '') {
    error = findGuide(a.stderr, currentStep(practice, next), guides);
    next = { ...next, errors: [...next.errors, error.id], errorOpen: true };
  }

  const done: PracticeStep[] = [];
  for (let step = currentStep(practice, next); step; step = currentStep(practice, next)) {
    if (!checkState(step.check, { shell: a.shell, answer: a.answer })) break;
    done.push(step);
    // 前の操作のエラーの後、ヒントを開かずに満たした
    const self = hadError && (next.hints[step.id] ?? 0) === 0;
    next = { ...next, stepIndex: next.stepIndex + 1, stepsDone: [...next.stepsDone, step.id], errorOpen: false, recovered: next.recovered || self };
  }
  if (done.length > 0) error = null;
  return { run: next, done, error, danger: danger ? { id: danger.id, why: danger.why } : null };
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
    for (const line of lines) {
      if (step.check.kind === 'answer') {
        answer = line;
        continue;
      }
      const out = execute(shell, line, registry, clock);
      shell = out.state;
      const err = out.chunks.filter((c) => c.stream === 'stderr').map((c) => c.text).join('');
      const expected = (step.expectedErrors ?? []).some((id) => guides.some((g) => g.id === id && guideMatches(g, err)));
      if (err.trim() && !expected) problems.push(`実戦 ${step.id}: 答え「${line}」でエラー: ${err.trim()}`);
    }
    if (!checkState(step.check, { shell, answer })) problems.push(`実戦 ${step.id}: 最後のヒントを打っても達成条件を満たさない`);
  }
  return problems;
}
