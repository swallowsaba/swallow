import { NAME_PARTS } from '@/content/politics';
import { terrainOf } from '@/sim/runner';
import { newWorld } from '@/sim/world';
import { emptyProgress } from '@/game/progress';
import { readFailureText, readSave, type ReadOptions } from './migrations';
import { exportFileName, fromSaveData, newPlayer, toSaveData } from './saveData';
import type { SaveData, Settings } from './schema';

/**
 * 書き出しと読み込み・最初からやり直す（docs/data-model.md 7 章・docs/product-spec.md 4 章の「保存」）。
 * 置き換え（読み込み・やり直し）の書き込みは、自動保存の replace で行う（src/save/autosave.ts）。
 */

export interface ExportFile {
  /** devlearn-save-<日付>.json */
  name: string;
  text: string;
}

/** 書き出すファイル。日付は保存した時の、端末の日付 */
export const exportFile = (data: SaveData): ExportFile => ({
  name: exportFileName(data.savedAt.slice(0, 10)),
  text: JSON.stringify(data, null, 2),
});

/** 読み込む前に示す、ファイルの中身 */
export interface ImportSummary {
  mayor: string;
  city: string;
  /** 書き出した時（ISO 日時） */
  savedAt: string;
  xp: number;
  /** 修了したレッスンの数 */
  completed: number;
  /** 古い版から移したなら、その版 */
  migratedFrom?: number;
}

export type ImportCheck =
  | { ok: true; data: SaveData; summary: ImportSummary }
  /** 読めなかった。何が起きたか・どうすればよいか（1 行ずつ） */
  | { ok: false; what: string; next: string };

/** 読み込むファイルを確かめる（zod で形を確かめ、版を移す）。読めなくても投げない */
export function checkImport(text: string, options?: ReadOptions): ImportCheck {
  const read = readSave(text, options);
  if (!read.ok) return { ok: false, ...readFailureText(read.reason) };
  const { data } = read;
  const summary: ImportSummary = {
    mayor: data.player.name,
    city: data.city.name,
    savedAt: data.savedAt,
    xp: data.player.xp,
    completed: Object.values(data.lessons).filter((l) => l.status === 'completed').length,
  };
  if (read.migratedFrom !== undefined) summary.migratedFrom = read.migratedFrom;
  return { ok: true, data, summary };
}

/** 次の島の seed（今の島から決める。乱数を使わない） */
export const nextIslandSeed = (seed: number): number => (Math.imul(seed, 1664525) + 1013904223) >>> 0;

/**
 * 落選の後に新しい都市で始める時の保存データ（docs/game-design.md 21.2）: 新しい島で、村から・開発資金 1,500・1 期目（始め方は「ふつう」。開き直した後の始め方の選択の窓で選ぶ。docs/ui-design.md 10.12）。
 * 学習の記録（XP・スキル・レッスンの進み・ミッション・途中の実戦）・市長・設定は、そのまま写す
 */
export function newCitySave(current: SaveData, now: string): SaveData {
  const parts = fromSaveData(current);
  const seed = nextIslandSeed(current.city.seed);
  return toSaveData({ ...parts, world: newWorld(terrainOf(seed), NAME_PARTS, seed) }, now, now.slice(0, 10));
}

/** 最初からやり直す時の保存データ: 新しい都市・空の学習の記録・新しい市長。設定は今のまま残す */
export const freshSave = ({ id, now, settings }: { id: string; now: string; settings: Settings }): SaveData =>
  toSaveData({ player: newPlayer(id, now), settings, world: newWorld(terrainOf(20261002), NAME_PARTS), progress: emptyProgress(), practiceSessions: {} }, now, now.slice(0, 10));
