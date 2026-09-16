import type { MissionTrack } from '@/engines/lesson/types';

/**
 * 街づくりの設計図。
 *
 * 街の建物（施設）は、その世界を支える「概念」そのもの。1 章 = 1 施設。
 * 施設はコマンドを打つ前に、住民の困りごと → 何なのか → なぜ要るのか → 仕組み → 現場の落とし穴 → 判断問題 の順で学んで建てる。
 * 建てた施設は、その章の任務（実際のコマンド操作）をこなすほど稼働していく。
 */

/** 施設の見た目 */
export type BuildingKind =
  | 'hall' // 役所・案内所
  | 'office' // 事務所
  | 'house'
  | 'warehouse' // 倉庫
  | 'workshop' // 工房
  | 'station' // 駅
  | 'bridge'
  | 'tower' // 見張り台
  | 'castle' // 城・本部
  | 'factory' // 工場
  | 'post' // 郵便局
  | 'library' // 図書館・記録
  | 'gate' // 関所
  | 'farm' // 牧場
  | 'lab'; // 研究所

export interface FacilityQuiz {
  /** 現場で起きた場面 */
  situation: string;
  choices: readonly string[];
  /** 正解の位置 */
  answer: number;
  /** なぜそれが正しいのか（間違えたときにも見せる） */
  explain: string;
}

export interface Facility {
  /** 章の id と同じ（例: git/01） */
  id: string;
  /** 施設の名前（例: 記録庫） */
  name: string;
  /** 学ぶ概念（例: Git の内部データモデル） */
  concept: string;
  building: BuildingKind;
  /** 先に建っている必要がある施設。地図では道でつながる */
  needs: readonly string[];
  /** 住民の困りごと。これを解決するために施設を建てる */
  trouble: { who: string; text: string };
  /** 何なのか（専門用語を使わずに） */
  what: string;
  /** 街で例えると */
  analogy: string;
  /** なぜ現場で必要なのか */
  why: string;
  /** 仕組みを順を追って */
  how: readonly string[];
  /** 現場でよくある失敗 */
  pitfalls: readonly string[];
  /** プロの心得 */
  pro: string;
  quiz: readonly FacilityQuiz[];
}

export interface CityPlan {
  track: MissionTrack;
  /** 街の名前 */
  name: string;
  /** 街の案内人 */
  guide: { name: string; role: string };
  /** 最初に街に来たときの話 */
  welcome: string;
  facilities: readonly Facility[];
}
