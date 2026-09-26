import type { CityQuiz, ExperienceScene, RevealScene } from '../types';

/**
 * 章ごとの学びの流れ。同じ章の任務は、同じ遊びで困り、同じ施設に出会う。
 * 章の中で困りごとが違う任務だけ、任務ごとに上書きする（`TrackFlow.missions`）。
 */
export interface ChapterFlow {
  experience: ExperienceScene;
  reveal: RevealScene;
  /** 1〜2 問。うち 1 問以上は町の中で答える形（pick か order） */
  quiz: readonly CityQuiz[];
  /** 振り返りで並べる、街の前と後。3 行のまとめは任務の takeaways から組み立てる */
  recap: { before: string; after: string };
}

/** 手順ごとの [目的, 打った後に街で起きたこと]。手順の数と同じだけ並べる */
export type StepNotes = readonly (readonly [purpose: string, afterward: string])[];

export interface TrackFlow {
  /** 章 id（例 'k8s/01'）ごとの流れ */
  chapters: Readonly<Record<string, ChapterFlow>>;
  /** 本編の任務 id ごとの上書き。章の流れと困りごとが違う任務だけに書く */
  missions?: Readonly<Record<string, Partial<ChapterFlow>>>;
  /**
   * 本編の任務 id ごとの、手順の目的と結果。
   * 値だけ違う繰り返し（反復演習）は、元になった任務のものを使う。
   */
  steps: Readonly<Record<string, StepNotes>>;
}
