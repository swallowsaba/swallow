import type { PullRequest, Repo } from '@/engines/github/types';
import { jobDag, prTimeline, type DagJob, type Stage } from '../prModel';
import type { Box } from '../sceneKit';

/**
 * GitHub を「冒険者ギルド」として並べる。
 * 左上にギルドの建物。その下に Pull Request を1件ずつクエストとして並べ、
 * 作成 → レビュー → チェック → マージ の4つの関所を道でつなぐ。チェックの中身（Actions のジョブ）はダンジョンの部屋として下に描く。
 */

const MARGIN = 40;
export const BOARD_W = 210;
export const STAGE_W = 118;
export const STAGE_H = 74;
const STAGE_GAP = 34;
const STAGES_X = MARGIN + BOARD_W + 40;
const QUEST_TOP = 250;
const DUNGEON_GAP = 58;

export interface GuildQuest {
  pull: PullRequest;
  board: Box;
  stages: { stage: Stage; box: Box }[];
  /** 承認・差し戻しの看板を置く位置 */
  actionsY: number;
  /** ダンジョンの見出しの位置。チェックが無ければ null */
  dungeonY: number | null;
  rooms: (DagJob & { box: Box })[];
  edges: { from: string; to: string }[];
  height: number;
}

export interface Guild {
  hall: Box;
  quests: GuildQuest[];
  width: number;
  height: number;
}

export function layoutGuild(repo: Repo): Guild {
  const hall = { x: MARGIN, y: 70, w: 190, h: 120 };
  let top = QUEST_TOP;
  let right = STAGES_X + 4 * STAGE_W + 3 * STAGE_GAP;
  const quests = repo.pulls.map((pull) => {
    const stages = prTimeline(repo, pull).map((stage, i) => ({
      stage,
      box: { x: STAGES_X + i * (STAGE_W + STAGE_GAP), y: top, w: STAGE_W, h: STAGE_H },
    }));
    const board = { x: MARGIN, y: top - 6, w: BOARD_W, h: STAGE_H + 12 };
    const actionsY = top + STAGE_H + 22;
    let height = STAGE_H + 60;
    let dungeonY: number | null = null;
    let rooms: GuildQuest['rooms'] = [];
    let edges: GuildQuest['edges'] = [];
    if (pull.checks.length > 0) {
      const dag = jobDag(pull.checks);
      dungeonY = top + STAGE_H + DUNGEON_GAP;
      const originY = dungeonY + 26;
      rooms = dag.jobs.map((job) => ({ ...job, box: { x: STAGES_X + job.x, y: originY + job.y, w: 150, h: 46 } }));
      edges = dag.edges;
      height = originY - top + dag.height + 20;
      right = Math.max(right, STAGES_X + dag.width);
    }
    const quest = { pull, board, stages, actionsY, dungeonY, rooms, edges, height };
    top += height + 40;
    return quest;
  });
  return { hall, quests, width: right + MARGIN, height: Math.max(top, QUEST_TOP + 60) };
}
