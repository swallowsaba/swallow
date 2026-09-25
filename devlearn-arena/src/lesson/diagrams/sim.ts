import { createSession, type Session, type SessionOptions } from '@/engines/kernel/session';
import { execute } from '@/engines/kernel/shell';
import type { DiagramId } from '@/engines/lesson/diagramIds';

/**
 * 遊べる図解の土台（REWORK 6-2）。
 *
 * 図解は台本のアニメーションを持たない。学習者の端末と同じシェルを小さく立て、
 * 操作をそのままコマンドとして流す。図は、流した後のシェルの状態を描くだけ。
 * だから図の中で起きたことは、端末で同じコマンドを打っても起きる。
 */

/** 図解の中で動いているシェル。学習者の端末とは別の、使い捨ての 1 台 */
export interface Sim {
  session: Session;
  /** 図解ごとの覚え書き（「1 人消した」など、目標の判定に使う） */
  notes: Readonly<Record<string, number>>;
}

export interface RunResult {
  sim: Sim;
  code: number;
  out: string;
  err: string;
}

export function boot(options: SessionOptions, lines: readonly string[] = []): Sim {
  let sim: Sim = { session: createSession(options), notes: {} };
  for (const line of lines) {
    const result = run(sim, line);
    if (result.code !== 0) throw new Error(`図解の下ごしらえに失敗: ${line} → ${result.err}`);
    sim = result.sim;
  }
  return sim;
}

/** 1 行打つ。学習者の端末で打ったのと同じ道を通る */
export function run(sim: Sim, line: string): RunResult {
  const outcome = execute(sim.session.state, line, sim.session.registry, sim.session.clock);
  const pick = (stream: 'stdout' | 'stderr') =>
    outcome.chunks.filter((c) => c.stream === stream).map((c) => c.text).join('');
  return {
    sim: { ...sim, session: { ...sim.session, state: outcome.state } },
    code: outcome.exitCode,
    out: pick('stdout'),
    err: pick('stderr'),
  };
}

export function note(sim: Sim, name: string, add = 1): Sim {
  return { ...sim, notes: { ...sim.notes, [name]: (sim.notes[name] ?? 0) + add } };
}

/** 図の中で手を出せる操作 1 つ */
export interface Move {
  /** 操作の名前。図の要素から組み立てる（`delete:web-1` など） */
  id: string;
  /** 画面に出す短い言葉 */
  label: string;
  /** この操作と同じことをする端末のコマンド */
  command: string;
}

/** 操作の結果 */
export interface Applied {
  sim: Sim;
  /** 端末で打てば同じことが起きるコマンド */
  command: string;
  /** 制約に当たって何も起きなかったとき false。理由は `reason` */
  ok: boolean;
  reason: string | null;
}

/**
 * 遊べる図解の模型。見た目（React）とは分けて持ち、テストはこちらを動かす。
 * `V` は図に描く中身。シェルの状態から毎回読み直す。
 */
export interface Playground<V> {
  id: DiagramId;
  /** 図の上に出す小さな目標 */
  goal: string;
  /** 図の下に出す説明。3 行まで */
  notes: readonly string[];
  start: () => Sim;
  /** いま出せる操作の一覧 */
  moves: (sim: Sim) => readonly Move[];
  apply: (sim: Sim, moveId: string) => Applied;
  /**
   * 時間を 1 つ進めた姿。まだ変わる途中なら返し、落ち着いていれば null。
   * 画面はこれを少しずつ呼んで、歯車が回って作り直される様子を見せる
   */
  settle?: (sim: Sim) => Sim | null;
  view: (sim: Sim) => V;
  reached: (sim: Sim) => boolean;
  /** 目標に届く操作の並び。テストで「達成できる」ことを確かめる */
  solution: readonly string[];
}

/** 知らない操作を渡されたとき。何も変えずに理由を返す */
export function unknownMove(sim: Sim, moveId: string): Applied {
  return { sim, command: '', ok: false, reason: `その操作はできない: ${moveId}` };
}

/** コマンドを 1 つ流し、失敗したら状態を変えずに理由を返す */
export function applyCommand(sim: Sim, command: string, reason?: (err: string) => string): Applied {
  const result = run(sim, command);
  if (result.code !== 0) {
    return { sim, command, ok: false, reason: reason?.(result.err) ?? result.err.trim() };
  }
  return { sim: result.sim, command, ok: true, reason: null };
}
