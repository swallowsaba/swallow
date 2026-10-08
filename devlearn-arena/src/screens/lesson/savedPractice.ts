import { useEffect, useState } from 'react';
import { z, type ZodType } from 'zod';
import type { Practice } from '@/content/schema';
import { restoreShell, type ShellSnapshotData } from '@/engines/kernel/session';
import type { SimState } from '@/engines/sim/types';
import type { EditResult, PracticeRun } from '@/learning/practice';
import { shellSnapshotSchema } from '@/save/engine/shell';
import { useSaveStatus } from '../saveStatus';
import type { SqlLogEntry } from './sql/sqlRun';

/**
 * 途中の実戦の記録（保存データの practiceSessions の engineState。docs/data-model.md 4 章）を、開く時に確かめる。
 * 保存データの全体は読み込む時に確かめるが、engineState の中身は模擬環境ごとに違うので、ここで確かめる。
 * 読めない物（書き換えたファイルを読み込んだ時など）は使わず、初めから始めて 1 行で知らせる（画面を壊さない）。
 */

export type Restored<T> =
  /** 途中の記録が無い */
  | { kind: 'none' }
  | { kind: 'ok'; value: T }
  /** 途中の記録があったが読めなかった */
  | { kind: 'broken' };

export interface TerminalSaved {
  shell: ShellSnapshotData;
  run: PracticeRun;
}
export interface SimLogEntry {
  line: string;
  error: string | null;
}
export interface SimSaved {
  sim: SimState;
  log: SimLogEntry[];
  run: PracticeRun;
}
export interface SqlSaved {
  /** 実行した文（誤りも含む。開き直す時に、初期状態から順に実行し直す） */
  statements: string[];
  log: SqlLogEntry[];
  run: PracticeRun;
}
export interface EditorSaved {
  shell: ShellSnapshotData;
  run: PracticeRun;
  draft: string;
  results: EditResult[];
}

const runSchema = (p: Practice) => z.object({
  stepIndex: z.number().int().min(0).max(p.steps.length),
  stepsDone: z.array(z.string()),
  hints: z.record(z.string(), z.number().int().min(0).max(3)),
  errors: z.array(z.string()),
  errorOpen: z.boolean(),
  recovered: z.boolean(),
  dangerousUsed: z.array(z.string()),
  commands: z.array(z.string()),
}).strict();

/** 形を確かめ、さらに check で使えるか（復元できるか）を確かめる。どちらかで落ちたら読めない */
function restoreWith<T>(raw: unknown, schema: ZodType<T>, check: (value: T) => void = () => undefined): Restored<T> {
  if (raw === undefined) return { kind: 'none' };
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { kind: 'broken' };
  try {
    check(parsed.data);
  } catch {
    return { kind: 'broken' };
  }
  return { kind: 'ok', value: parsed.data };
}

/**
 * シェルの写しは、形の決まりで確かめた上で、元の物をそのまま使う
 * （決まりは主な所だけを書いていて、知らない鍵を落とすため。落とすと、サービスなどの状態が消える）。
 * 復元（restoreShell）が通ることも確かめる
 */
const shell = z.unknown().superRefine((v, ctx) => {
  if (!shellSnapshotSchema.safeParse(v).success) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'シェルの写しの形が違う' });
}) as unknown as ZodType<ShellSnapshotData>;

export const terminalSaved = (p: Practice, raw: unknown): Restored<TerminalSaved> =>
  restoreWith(raw, z.object({ shell, run: runSchema(p) }).strict(), (v) => restoreShell(v.shell));

export const editorSaved = (p: Practice, raw: unknown): Restored<EditorSaved> =>
  restoreWith(
    raw,
    z.object({
      shell,
      run: runSchema(p),
      draft: z.string(),
      results: z.array(z.object({ line: z.string(), stdout: z.string(), stderr: z.string() }).strict()),
    }).strict(),
    (v) => restoreShell(v.shell),
  );

export const sqlSaved = (p: Practice, raw: unknown): Restored<SqlSaved> =>
  restoreWith(
    raw,
    z.object({
      statements: z.array(z.string()),
      log: z.array(z.object({
        statement: z.string(),
        results: z.array(z.object({ columns: z.array(z.string()), rows: z.array(z.array(z.unknown())) }).strict()),
        changes: z.number(),
        error: z.string().nullable(),
      }).strict()),
      run: runSchema(p),
    }).strict() as unknown as ZodType<SqlSaved>,
  );

/**
 * 模擬環境の状態は、操作で変わる所だけを確かめ、設定（setup）は中身のデータから作った物（fresh）を使う。
 * 名前で指す物（点・札・枠・欄・表・問い）は、その設定にある物だけ
 */
function simStateSchema(fresh: SimState): ZodType<SimState> {
  const among = (ids: readonly string[]) => z.string().refine((id) => ids.includes(id));
  const keyed = <T extends ZodType>(ids: readonly string[], value: T) => z.record(z.string(), value).refine((r) => Object.keys(r).every((k) => ids.includes(k)));
  const base = z.object({ type: z.literal(fresh.type) }).passthrough();
  switch (fresh.type) {
    case 'connect': {
      const node = among(fresh.setup.nodes.map((n) => n.id));
      return base.extend({ links: z.array(z.tuple([node, node])), up: z.array(node), sent: z.array(z.tuple([node, node])) })
        .transform((v) => ({ ...fresh, links: v.links, up: v.up, sent: v.sent })) as unknown as ZodType<SimState>;
    }
    case 'order': {
      const item = among(fresh.setup.items.map((i) => i.id));
      return base.extend({ stages: z.array(z.array(item)) }).transform((v) => ({ ...fresh, stages: v.stages })) as unknown as ZodType<SimState>;
    }
    case 'assign': {
      const slot = among(fresh.setup.slots.map((s) => s.id));
      return base.extend({ placed: keyed(fresh.setup.items.map((i) => i.id), z.array(slot)) })
        .transform((v) => ({ ...fresh, placed: v.placed })) as unknown as ZodType<SimState>;
    }
    case 'config': {
      const tables = fresh.setup.tables ?? [];
      const columnsOf = (id: string) => tables.find((t) => t.id === id)?.columns.map((c) => c.id) ?? [];
      return base.extend({
        fields: keyed((fresh.setup.fields ?? []).map((f) => f.id), z.string()),
        tables: keyed(tables.map((t) => t.id), z.array(z.record(z.string(), z.string())))
          .refine((r) => Object.entries(r).every(([id, rows]) => rows.every((row) => Object.keys(row).every((c) => columnsOf(id).includes(c))))),
      }).transform((v) => ({ ...fresh, fields: v.fields, tables: v.tables })) as unknown as ZodType<SimState>;
    }
    case 'read':
      return base.extend({ answers: keyed(fresh.setup.questions.map((q) => q.id), z.string()) })
        .transform((v) => ({ ...fresh, answers: v.answers })) as unknown as ZodType<SimState>;
  }
}

export const simSaved = (p: Practice, fresh: SimState, raw: unknown): Restored<SimSaved> =>
  restoreWith(
    raw,
    z.object({
      sim: simStateSchema(fresh),
      log: z.array(z.object({ line: z.string(), error: z.string().nullable() }).strict()),
      run: runSchema(p),
    }).strict() as unknown as ZodType<SimSaved>,
  );

/** 途中の記録を開いた時に 1 度だけ確かめる。読めなければ、何が起きたかを 1 行で知らせる */
export function useRestored<T>(read: () => Restored<T>): T | undefined {
  const [restored] = useState(read);
  useEffect(() => {
    if (restored.kind === 'broken') useSaveStatus.getState().set('途中の実戦の記録を読めなかった（壊れているか、書き換えられていた）。この実戦は初めから始める。');
  }, [restored]);
  return restored.kind === 'ok' ? restored.value : undefined;
}
