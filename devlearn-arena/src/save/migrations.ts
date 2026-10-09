import type { ZodType } from 'zod';
import { SAVE_VERSION, saveDataSchema, type SaveData } from './schema';

/**
 * 保存データの版と移行（docs/architecture.md 5 章）。
 * 版 N のデータを N+1 の形に直す関数を MIGRATIONS[N] に置く。読み込みは、今の版になるまで順に当ててから形を確かめる。
 * 移行の関数は、受け取った物を変えずに新しい物を返す。
 */
export type Migration = (old: Record<string, unknown>) => Record<string, unknown>;

/** 版 1 が最初の版。版を上げる時に、前の版からの移行をここに足す */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  /** 版 1 → 2: 市長に introSeen を足す。版 1 の記録はもう遊んだ人の物なので、初回の操作説明は出さない */
  1: (old) => ({ ...old, player: { ...(old.player as Record<string, unknown>), introSeen: true } }),
  /** 版 2 → 3: 設定に minimap を足す。既定と同じく、ミニマップを出す（docs/decisions.md D-18） */
  2: (old) => {
    const player = old.player as Record<string, unknown>;
    return { ...old, player: { ...player, settings: { ...(player.settings as Record<string, unknown>), minimap: true } } };
  },
};

export type ReadFailure =
  /** 何も無い（初めて遊ぶ） */
  | 'empty'
  /** JSON として読めない */
  | 'not-json'
  /** 版の番号が無い（このゲームの保存データではない） */
  | 'not-save'
  /** 今より新しい版で作られた */
  | 'newer'
  /** 移行の道が無い古い版 */
  | 'too-old'
  /** 形が合わない（壊れている・書き換えられている） */
  | 'invalid';

export type ReadResult =
  | { ok: true; data: SaveData; migratedFrom?: number }
  | { ok: false; reason: ReadFailure; detail?: string };

export interface ReadOptions {
  migrations?: Readonly<Record<number, Migration>>;
  version?: number;
  schema?: ZodType<SaveData>;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * 保存データを読む。文字列（書き出したファイルの中身）でも、読み込んだ物でもよい。
 * 壊れていても投げず、読めない理由を返す（読めない物で、今のデータを上書きしないため）
 */
export function readSave(raw: unknown, options: ReadOptions = {}): ReadResult {
  const migrations = options.migrations ?? MIGRATIONS;
  const current = options.version ?? SAVE_VERSION;
  const schema = options.schema ?? saveDataSchema;
  if (raw === null || raw === undefined || raw === '') return { ok: false, reason: 'empty' };
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch (e) {
      return { ok: false, reason: 'not-json', detail: e instanceof Error ? e.message : String(e) };
    }
  }
  if (!isObject(value) || typeof value.version !== 'number' || !Number.isInteger(value.version)) return { ok: false, reason: 'not-save' };
  const from = value.version;
  if (from > current) return { ok: false, reason: 'newer', detail: `版 ${String(from)}（このゲームは版 ${String(current)} まで読める）` };
  let data: Record<string, unknown> = value;
  for (let v = from; v < current; v += 1) {
    const step = migrations[v];
    if (!step) return { ok: false, reason: 'too-old', detail: `版 ${String(v)} から先へ移せない` };
    try {
      data = { ...step(data), version: v + 1 };
    } catch (e) {
      return { ok: false, reason: 'invalid', detail: `版 ${String(v)} からの移行で失敗した: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return { ok: false, reason: 'invalid', detail: first ? `${first.path.join('.') || '全体'}: ${first.message}` : undefined };
  }
  return from < current ? { ok: true, data: parsed.data, migratedFrom: from } : { ok: true, data: parsed.data };
}

/** 読めなかった時の案内（何が起きたか・どうすればよいかを 1 行ずつ。docs/ui-design.md 9 章） */
export function readFailureText(reason: ReadFailure): { what: string; next: string } {
  switch (reason) {
    case 'empty':
      return { what: 'ファイルが空だった。', next: '書き出したファイル（devlearn-save-日付.json）を選び直す。' };
    case 'not-json':
      return { what: 'ファイルを読めなかった（中身が JSON の形ではない）。', next: '書き出したファイルを、書き換えずにそのまま選ぶ。' };
    case 'not-save':
      return { what: 'このゲームの保存データではなかった。', next: '書き出したファイル（devlearn-save-日付.json）を選び直す。' };
    case 'newer':
      return { what: 'このゲームより新しい版で書き出したファイルだった。', next: 'ページを読み込み直して最新の版にしてから、もう一度読み込む。' };
    case 'too-old':
      return { what: '古すぎる版のファイルで、今の形に移せなかった。', next: '新しく書き出したファイルを使う。' };
    case 'invalid':
      return { what: 'ファイルの中身が壊れているか、書き換えられていた。', next: '別の時に書き出したファイルを選ぶ。今の記録はそのまま残っている。' };
  }
}
