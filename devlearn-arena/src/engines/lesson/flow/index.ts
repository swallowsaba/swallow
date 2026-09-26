import { takeawaysOf } from '../takeaways';
import type { LessonCore, LessonDefinition, MissionTrack } from '../types';
import { GIT_FLOW } from './git';
import { GITHUB_FLOW } from './github';
import { K8S_FLOW } from './k8s';
import { KERNEL_FLOW } from './kernel';
import { NET_FLOW } from './net';
import type { ChapterFlow, TrackFlow } from './types';

export type { ChapterFlow, StepNotes, TrackFlow } from './types';

const FLOWS: Readonly<Record<MissionTrack, TrackFlow>> = {
  kernel: KERNEL_FLOW,
  git: GIT_FLOW,
  k8s: K8S_FLOW,
  net: NET_FLOW,
  github: GITHUB_FLOW,
};

/** 任務がどこに属するか。反復演習は元になった任務（mainId）の流れを使う */
export interface FlowPlace {
  chapterId: string;
  /** 本編の任務 id。反復演習なら元になった任務の id */
  mainId: string;
}

/** その任務の章の流れ。任務ごとの上書きがあれば重ねる */
export function chapterFlowOf(track: MissionTrack, place: FlowPlace): ChapterFlow {
  const flows = FLOWS[track];
  const chapter = flows.chapters[place.chapterId];
  if (chapter === undefined) throw new Error(`学びの流れが書かれていない章: ${place.chapterId}`);
  const own = flows.missions?.[place.mainId] ?? {};
  return {
    experience: own.experience ?? chapter.experience,
    reveal: own.reveal ?? chapter.reveal,
    quiz: own.quiz ?? chapter.quiz,
    recap: own.recap ?? chapter.recap,
  };
}

/** 振り返りの 3 行。任務の takeaways から組み立て、足りなければ登場した施設の説明で埋める */
function recapLines(core: LessonCore, flow: ChapterFlow): [string, string, string] {
  const lines = takeawaysOf(core);
  const extra = [flow.reveal.replaces, ...flow.reveal.terms.map((t) => `${t.term}: ${t.plain}`)];
  while (lines.length < 3) lines.push(extra.shift() ?? flow.recap.after);
  return [lines[0] ?? '', lines[1] ?? '', lines[2] ?? ''];
}

/**
 * 書き手が書いた任務に、学びの流れの 5 段をそろえる（CLAUDE.md「学びの流れ」）。
 * 体験・登場・確かめ・振り返りは章から、手順の目的と結果は任務から引く。
 * 書き忘れがあれば投げる。テストが全任務を組み立てて確かめる。
 */
export function withFlow(core: LessonCore, place: FlowPlace): LessonDefinition {
  const flow = chapterFlowOf(core.track, place);
  const notes = FLOWS[core.track].steps[place.mainId] ?? [];
  // 手順に直に書いてあればそれを、無ければ表を使う。どちらも無ければ書き忘れ
  const steps = core.steps.map((step, i) => {
    const purpose = step.purpose ?? notes[i]?.[0];
    const afterward = step.afterward ?? notes[i]?.[1];
    if (purpose === undefined || afterward === undefined || notes.length > core.steps.length) {
      throw new Error(
        `手順の目的と結果が書かれていない: ${core.id} の ${String(i + 1)} 手目（手順 ${String(core.steps.length)} / 表 ${String(notes.length)}）`,
      );
    }
    return { ...step, purpose, afterward };
  });
  return {
    ...core,
    experience: flow.experience,
    reveal: flow.reveal,
    quiz: flow.quiz,
    steps,
    recap: { before: flow.recap.before, after: flow.recap.after, lines: recapLines(core, flow) },
  };
}
