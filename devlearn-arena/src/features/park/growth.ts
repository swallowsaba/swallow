import { isHelpCommand } from '@/engines/lesson/helpCommands';

/**
 * 街が育つきっかけと、そのときの育ち方。
 *
 * コマンドの成功・手順の通過・理解度の正解・任務のクリア。
 * この 4 つでは必ず街が育つ（REWORK 3-1）。育たないきっかけを作らない。
 *
 * ここは React にも状態にも触れない。決めごとを 1 か所に集めるためだけの表。
 */

export type GrowthTrigger = 'command' | 'step' | 'quiz' | 'clear';

export const GROWTH_TRIGGERS: readonly GrowthTrigger[] = ['command', 'step', 'quiz', 'clear'];

/** 一度の育ちで増える量。家は住民の家、階は建物の高さ */
export interface GrowthGain {
  houses: number;
  floors: number;
}

const GAIN: Readonly<Record<GrowthTrigger, GrowthGain>> = {
  // コマンドが 1 本通るたびに、どこかの建物が 1 階ぶん高くなる
  command: { houses: 0, floors: 1 },
  // 手順を 1 つ越えると、もう 1 階ぶん
  step: { houses: 0, floors: 1 },
  // 理解度の問題に正解すると、住民の家が 1 軒建つ
  quiz: { houses: 1, floors: 0 },
  // 任務を終えると、家も階もまとめて増える
  clear: { houses: 1, floors: 2 },
};

export function gainFor(trigger: GrowthTrigger): GrowthGain {
  return GAIN[trigger];
}

/** その育ちで街が実際に変わるか。0 しか増えない育ちを作らないために使う */
export function grows(gain: GrowthGain): boolean {
  return gain.houses > 0 || gain.floors > 0;
}

/**
 * そのコマンドで街が育つか。
 * 失敗した行と、助けを求めた行（hint や answer）では育たない。
 */
export function growsFromCommand(line: string, exitCode: number): boolean {
  return exitCode === 0 && line.trim() !== '' && !isHelpCommand(line);
}
