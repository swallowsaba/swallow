import { createSession } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import { allMissions } from './registry';
import type { LessonIntro, LessonStep, MissionTrack } from './types';

/**
 * 任務を始める前の「依頼」を、任務の説明（intro）から組み立てる。
 *
 * 説明を文章の一覧で読ませるのではなく、依頼主が 1 つずつ話し、理解度を確かめ、道具（コマンド）を試してから作業に入る。
 * 台本・問題・試し打ちの結果はどれも任務のデータから決まる（乱数を使わない）ので、何度開いても同じになる。
 */

/* ---------------- 台本 ---------------- */

export type BriefingLine =
  | { kind: 'request'; text: string }
  | { kind: 'why'; text: string }
  | { kind: 'concept'; term: string; text: string }
  | { kind: 'tool'; command: string; text: string }
  | { kind: 'plan'; steps: string[] };

/** 街の人が話す順。依頼 → なぜ要るか → 知っておく言葉 → 使う道具 → 建設の工程 */
export function briefingScript(title: string, intro: LessonIntro, steps: readonly Pick<LessonStep, 'prompt'>[]): BriefingLine[] {
  return [
    { kind: 'request', text: `市長、「${title}」をお願いします。${intro.summary}` },
    { kind: 'why', text: intro.why },
    ...intro.concepts.map((c) => ({ kind: 'concept' as const, term: c.term, text: c.plain })),
    ...intro.commands.map((c) => ({ kind: 'tool' as const, command: c.command, text: c.means })),
    { kind: 'plan', steps: steps.map((s) => s.prompt) },
  ];
}

/* ---------------- 理解度チェック ---------------- */

export interface QuizQuestion {
  id: string;
  kind: 'concept' | 'command';
  /** 問いの対象（用語かコマンド） */
  subject: string;
  choices: string[];
  /** 正解の choices の位置 */
  answer: number;
  /** 正解したときに手に入る道具（コマンド）。用語の問題なら null */
  reward: string | null;
}

export interface QuizPool {
  concepts: readonly { term: string; plain: string }[];
  commands: readonly { command: string; means: string }[];
}

/** 文字列から決まる 32bit の値。同じ入力には必ず同じ値を返す */
export function stableHash(text: string): number {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** seed で決まる並べ替え。同じ seed なら同じ並びになる */
function stableShuffle<T>(items: readonly T[], seed: string, key: (item: T) => string): T[] {
  return [...items].sort((a, b) => stableHash(`${seed}|${key(a)}`) - stableHash(`${seed}|${key(b)}`));
}

const MAX_CONCEPT_QUESTIONS = 2;
const MAX_COMMAND_QUESTIONS = 2;
const WRONG_CHOICES = 2;

/**
 * 理解度チェックの問題を作る。用語の意味を選ぶ問題と、コマンドでできることを選ぶ問題。
 * 間違いの選択肢は同じ世界のほかの任務の説明から取るので、紛らわしすぎず、でたらめでもない。
 */
export function briefingQuiz(missionId: string, intro: LessonIntro, pool: QuizPool): QuizQuestion[] {
  const questions: QuizQuestion[] = [];

  const concepts = stableShuffle(intro.concepts, missionId, (c) => c.term).slice(0, MAX_CONCEPT_QUESTIONS);
  for (const concept of concepts) {
    const wrong = uniqueOthers(
      pool.concepts.filter((c) => c.term !== concept.term).map((c) => c.plain),
      [concept.plain, ...intro.concepts.map((c) => c.plain)],
      `${missionId}|${concept.term}`,
    );
    if (wrong.length === 0) continue;
    questions.push(question(`${missionId}|concept|${concept.term}`, 'concept', concept.term, concept.plain, wrong, null));
  }

  const commands = stableShuffle(intro.commands, missionId, (c) => c.command).slice(0, MAX_COMMAND_QUESTIONS);
  for (const command of commands) {
    const wrong = uniqueOthers(
      pool.commands.filter((c) => c.command !== command.command).map((c) => c.means),
      [command.means, ...intro.commands.map((c) => c.means)],
      `${missionId}|${command.command}`,
    );
    if (wrong.length === 0) continue;
    questions.push(question(`${missionId}|command|${command.command}`, 'command', command.command, command.means, wrong, command.command));
  }
  return questions;
}

/** 正解と重ならない、別の説明を seed で選ぶ */
function uniqueOthers(candidates: readonly string[], exclude: readonly string[], seed: string): string[] {
  const unique = [...new Set(candidates)].filter((c) => !exclude.includes(c));
  return stableShuffle(unique, seed, (c) => c).slice(0, WRONG_CHOICES);
}

function question(id: string, kind: QuizQuestion['kind'], subject: string, correct: string, wrong: readonly string[], reward: string | null): QuizQuestion {
  const choices = stableShuffle([correct, ...wrong], id, (c) => c);
  return { id, kind, subject, choices, answer: choices.indexOf(correct), reward };
}

/* ---------------- 試し打ち ---------------- */

export interface Tryout {
  command: string;
  means: string;
  /** 実際に打ったときの出力（長ければ先頭だけ） */
  output: string[];
  ok: boolean;
}

const MAX_OUTPUT_LINES = 8;

/**
 * 使う道具のうち、そのまま打てるもの（<ファイル> のような穴埋めが無いもの）を、任務と同じ初期状態の「練習用の環境」で実際に打つ。
 * 任務の本番の状態には触れない。上から順に打つので、git init のあとに git status のような流れも再現される。
 */
export function tryouts(intro: LessonIntro, initial: Parameters<typeof createSession>[0]): Tryout[] {
  const runnable = intro.commands.filter((c) => !/[<>]/.test(c.command.replace(/\s[<>]\s/g, ' ')) && !c.command.includes('…'));
  if (runnable.length === 0) return [];
  const session = createSession(initial);
  let state = session.state;
  return runnable.map(({ command, means }) => {
    try {
      const outcome = execute(state, command, session.registry, session.clock);
      state = outcome.state;
      const text = outcome.chunks.map((c) => c.text).join('');
      const lines = text.split('\n').filter((line, i, all) => !(i === all.length - 1 && line === ''));
      return {
        command,
        means,
        output: lines.length > MAX_OUTPUT_LINES ? [...lines.slice(0, MAX_OUTPUT_LINES), '…'] : lines,
        ok: outcome.exitCode === 0,
      };
    } catch {
      return { command, means, output: [], ok: false };
    }
  });
}

/* ---------------- 依頼主 ---------------- */

/** 市長に住民の要望を伝える、街ごとの職員 */
export const QUEST_GIVER: Record<MissionTrack, { name: string; role: string }> = {
  kernel: { name: 'ハル', role: '副市長' },
  git: { name: 'ミオ', role: '駅長' },
  k8s: { name: 'ゴロー', role: '港湾局長' },
  net: { name: 'ポスト', role: '郵便局長' },
  github: { name: 'レイ', role: '建築課長' },
};

const pools = new Map<MissionTrack, QuizPool>();

/** 同じ世界の全任務の用語とコマンド。間違いの選択肢を取る元 */
export function quizPool(track: MissionTrack): QuizPool {
  const cached = pools.get(track);
  if (cached) return cached;
  const mine = allMissions().filter((m) => m.track === track);
  const pool = {
    concepts: mine.flatMap((m) => m.intro.concepts),
    commands: mine.flatMap((m) => m.intro.commands),
  };
  pools.set(track, pool);
  return pool;
}
