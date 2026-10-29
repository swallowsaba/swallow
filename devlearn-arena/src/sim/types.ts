import type { City, DomainId, FacilityType, Point, ZoneKind } from '@/city/types';
import type { FactorId } from './layers';
import type { BusinessKind } from './rules';

/**
 * 都市の模擬と市政の状態（docs/data-model.md 8〜12 章）。保存データの版 4 に入る形。
 * 保存するのは、前の週の値から積み上がる物だけ。地価・騒音・通勤などは状態と seed から計算し直す。
 */

/* ---------- 8 章 都市の模擬の状態 ---------- */

/** 長さ 12。層の並びは 年齢の帯（若者・子育て・中年・高齢）× 収入の帯（低・中・高）の順 */
export type LayerCounts = number[];

export interface BusinessState {
  kind: BusinessKind;
  /** 収入の帯（3）ごとの雇っている人数 */
  workers: number[];
  /** 売上が費用を上回った週の続き（負の数は下回った週の続き） */
  profitWeeks: number;
}

export interface PowerState {
  /** 海底ケーブルの陸揚げ所（docs/city-design.md 9.4） */
  landing: Point;
  /** 外からの電気の上限（MW） */
  externalCapMW: number;
  /** 輪番の停電で次に止める地区の番号 */
  rotation: number;
  /** [地区 144] 直近 28 日に止まった日の数 */
  outageDays: number[];
  /** 直近 4 週の、週ごとに止まった地区（最後が今の週。outageDays はここから数える。docs/data-model.md 8 章） */
  recent?: number[][];
}

export interface SimState {
  week: number;
  /** 地区（8×8 マス、144）の名前 */
  districtNames: string[];
  /** 住宅の建物 ID → 層ごとの世帯の数 */
  households: Record<string, LayerCounts>;
  /** 商業・オフィス・工業の建物 ID → 事業者 */
  businesses: Record<string, BusinessState>;
  /** 事業者が撤退して空いた建物 ID → 撤退した週（次の事業者は REOPEN_WEEKS の後に入る） */
  vacant: Record<string, number>;
  /** 需給の倍率（0.6〜1.8） */
  rentFactor: number;
  /** [地区 144][層 12] の支持（0〜100）。週ごとに目標へ 1/4 近づく。−1 はまだ住む人がいない（住み始めた週に目標の値で始める） */
  support: number[][];
  /**
   * 支持の内訳: 地区の番号 → [層 12][要因 12]。支持 = 50 + Σ 要因。
   * 要因ごとに目標の点へ 1/4 ずつ近づけるので、要因の合計はいつも支持と一致する（docs/game-design.md 13.8「内訳を保つ」）
   */
  supportParts: Record<string, number[][]>;
  /** [層 12] 市政への信頼（−15〜+15） */
  trust: number[];
  power: PowerState;
  /** 雇い手（事業者の建物・施設）ID → 先週雇っていた人数（需給の倍率の原因を、増えた雇用の多い建物に分ける。13.8） */
  employed: Record<string, number>;
  /** 先週の終わりの値のうち、毎日の計算が読む物（読み込んだ後も同じ値で続けるために持つ） */
  lastWeek: {
    /** 低と中の帯の失業者の数（工業の需要。23 章） */
    unemployedLowMid: number;
    approval: number;
    jobs: number;
    unemployment: number;
  };
}

/* ---------- 9 章 記録 ---------- */

export interface WeeklySample {
  week: number;
  population: number;
  funds: number;
  treasury: number;
  approval: number;
  jobs: number;
  unemployment: number;
  marks: string[];
}

export type CauseKind = 'facility' | 'zone' | 'road' | 'building' | 'decision' | 'demand';
export interface Cause {
  factor: FactorId;
  source: { kind: CauseKind; id: string; at?: Point };
  /** 支持率への寄与（人数で重みを付けた後） */
  points: number;
}

export interface WeeklyBreakdown {
  week: number;
  /** [要因 12][層 12] の支持率への寄与（重みを掛け、18 歳以上の人数の割合を掛けた後）。支持率 = 50 + 全ての合計 */
  factors: number[][];
  /** 原因ごとの点の上位 20 件 */
  causes: Cause[];
  /** その週の支持率（確かめに使う） */
  approval: number;
  /** [層 12] 都市全体の層の支持（18 歳以上の人数で重みを付けた平均。住む人がいなければ −1）。説明の 2 行目「特に、〇〇で 11 下がった」に使う */
  layers?: number[];
}

export type NewsKind =
  | 'application' | 'approved' | 'rejected' | 'appeal' | 'completed' | 'election' | 'term-end' | 'closure'
  | 'outage' | 'tax' | 'petition' | 'mission' | 'reward' | 'scandal' | 'start';

export interface Article {
  id: string;
  week: number;
  day: number;
  kind: NewsKind;
  headline: string;
  body: string;
  at?: Point;
}

export interface SimHistory {
  weekly: WeeklySample[];
  breakdown: WeeklyBreakdown[];
  news: Article[];
}

/* ---------- 10 章 申請と審議 ---------- */

/** 議員が見る論点（docs/game-design.md 18.1） */
export type IssueId = 'afford' | 'environment' | 'jobs' | 'finance' | 'safety' | 'traffic' | 'tech';

/** 譲歩で変えられる性質（docs/content-spec.md 7.1.1） */
export const MOD_KEYS = ['height', 'noise', 'nightNoise', 'traffic', 'tech', 'jobs', 'power', 'coolingWater', 'green', 'units'] as const;
export type ModKey = (typeof MOD_KEYS)[number];

/** 理由の強さの計算（docs/game-design.md 16.2） */
export type Measure =
  | { kind: 'noise'; night?: boolean }
  | { kind: 'power' }
  | { kind: 'jobs-density' }
  | { kind: 'sunlight' }
  | { kind: 'traffic' }
  | { kind: 'rent' }
  | { kind: 'trait'; trait: ModKey }
  | { kind: 'service-load'; service: 'police' | 'fire' | 'school' | 'clinic' }
  | { kind: 'cost' };

export interface Concession {
  id: string;
  label: string;
  mods: Partial<Record<ModKey, number>>;
  cost?: { ratio?: number; fixed?: number };
  loss?: string;
  requires?: { domain: DomainId; stage: 1 | 2 | 3 | 4 | 5 };
}

export interface Explanation {
  id: string;
  domain: DomainId;
  stage: 1 | 2 | 3 | 4 | 5;
  text: string;
  quality: 'sound' | 'partial' | 'wrong';
  why: string;
  lesson?: string;
}

/** 反対の理由（docs/content-spec.md 7.1）。content/politics/objections/ のデータ */
export interface ObjectionReason {
  id: string;
  title: string;
  targets: string[];
  group: GroupId;
  issue: IssueId;
  measure: Measure;
  radius?: number;
  misconception: number;
  claim: string;
  concessions: Concession[];
  explanations: Explanation[];
  lessons: string[];
}

/** 議員の 1 行の種類（docs/content-spec.md 7.6） */
export type MemberLineKey = 'gain' | 'concern' | 'unanswered' | 'explained' | 'wrong' | 'pushed' | 'approval' | 'persuaded' | 'stance';

/** 議員（docs/content-spec.md 7.2）。content/politics/council.json のデータ */
export interface CouncilMember {
  id: string;
  name: string;
  profile: string;
  main: IssueId;
  second: IssueId;
  stance: number;
  icon: string;
  /** その議員の口ぶりの 1 行（無い鍵は共通の型の文。docs/decisions.md C-10） */
  lines?: Partial<Record<MemberLineKey, string>>;
}

/** 模擬が引数で受け取る市政のデータ（模擬の層は内容の置き場所を知らない） */
export interface PoliticsRules {
  reasons: readonly ObjectionReason[];
  /** 議員 7 人（docs/game-design.md 18 章） */
  council: readonly CouncilMember[];
  /** 施設の電力の使用量（MW / Lv）と性質の初めの値（docs/content-spec.md 7.9） */
  facilities: Partial<Record<FacilityType, { powerMW?: number; traits?: Partial<Record<ModKey, number>> }>>;
  /** 公約の候補（docs/content-spec.md 7.4。docs/game-design.md 21.4） */
  pledges?: readonly Pledge[];
  /** 請願の候補（docs/content-spec.md 7.3。docs/game-design.md 22.1） */
  petitions?: readonly Petition[];
  /** 新聞の名前と型の文（docs/content-spec.md 7.5。docs/game-design.md 22.3） */
  news?: NewsRules;
}

export const NO_RULES: PoliticsRules = { reasons: [], council: [], facilities: {}, pledges: [] };

/** 請願の受理の中身（docs/content-spec.md 7.3）。模擬に実際に効く */
export type PetitionEffect =
  /** 届いた地区の、送った層の家賃を ratio だけ下げる */
  | { kind: 'rent-subsidy'; ratio: number; weeks: number }
  /** 届いた地区の空き地に、その種類を建てる（申請の要らない種類はそのまま置く。費用は財政） */
  | { kind: 'build'; type: FacilityType }
  /** 外からの電気の上限を足す */
  | { kind: 'power-cap'; mw: number }
  /** 届いた地区に届く工業の騒音の倍率（その間、その工場の売上も同じ割合で下がる） */
  | { kind: 'noise-limit'; factor: number; weeks: number }
  /** 届いた地区から通う人の通勤の時間の倍率 */
  | { kind: 'bus'; traffic: number; weeks: number };

/** 請願（docs/content-spec.md 7.3）。content/politics/petitions.json のデータ */
export interface Petition {
  id: string;
  title: string;
  text: string;
  group: GroupId;
  /** 送ってくる層（層の番号）。その層の住む地区にだけ届く */
  layers?: number[];
  /** 届く条件（7.7 の式。any: の語は、どこかの地区で満たす） */
  when: string;
  priority: number;
  accept: {
    effect: PetitionEffect;
    cost?: { treasury?: number; weekly?: number; weeks?: number };
    why: string;
  };
  reject: { why: string };
}

/** 新聞の型の文（docs/content-spec.md 7.5） */
export interface NewsTemplate {
  kind: NewsKind;
  variant?: string;
  headline: string;
  body: string;
}

export interface NewsRules {
  /** 新聞の名前（「市民新報」） */
  title: string;
  templates: readonly NewsTemplate[];
}

/** 公約（docs/content-spec.md 7.4） */
export interface Pledge {
  id: string;
  /** 「人口を 2 割増やす」 */
  title: string;
  /** 果たす条件（7.7 の式。start. を付けると任期の初めの値） */
  goal: string;
  /** この公約を重く見る層（果たした・果たせない時に信頼が動く） */
  layers: number[];
}

export type GroupId = 'neighbors' | 'merchants' | 'environment' | 'taxpayers' | 'workers';
export type ApplicationKind = 'facility' | 'upgrade' | 'rezone' | 'civic' | 'power' | 'reward';
export type ApplicationStage = 'filed' | 'zoning' | 'objection' | 'hearing' | 'council' | 'appeal' | 'construction' | 'done' | 'rejected' | 'withdrawn';

export interface ObjectionState {
  reasonId: string;
  group: GroupId;
  district?: number;
  strength: number;
  share: number;
  /** 反対の受付が終わった時の割合（%）。受付の間は share がここへ日ごとに直線で上がる */
  full: number;
  /** 強さの元になった模擬の値（value）と、比べた値（ref。電力の余り・都市の平均など） */
  basis: { value: number; ref?: number };
  /** この理由の反対で一番多い層（層の番号） */
  topLayer?: number;
  /** この理由に反対した層（信頼を動かす相手。押し切る・誤った説明。docs/game-design.md 17 章） */
  layers?: number[];
  /** 公聴会の論点（公聴会の段に入った時に 5% 以上だった理由。手を出して割合が下がっても、論点の列から外さない） */
  issue?: boolean;
  hand?:
    | { kind: 'concede'; concessionId: string; day: number }
    | { kind: 'explain'; explanationId: string; quality: 'sound' | 'partial' | 'wrong'; day: number }
    | { kind: 'push'; capital: number; day: number };
}

export interface VoteRecord {
  day: number;
  consent: boolean;
  members: { memberId: string; score: number; yes: boolean; reasonKey: string; persuaded: boolean }[];
  passed: boolean;
}

export interface Application {
  id: string;
  kind: ApplicationKind;
  target: {
    type?: FacilityType;
    facilityId?: string;
    toLevel?: 2 | 3 | 4 | 5;
    zone?: { kind: ZoneKind; cells: Point[]; from?: ZoneKind };
    origin?: Point;
    rotation?: 0 | 90 | 180 | 270;
  };
  stage: ApplicationStage;
  stageDay: number;
  filedDay: number;
  wallet: 'funds' | 'treasury';
  reserved: number;
  exception: boolean;
  objections: ObjectionState[];
  opposition: number;
  hearing?: { heldDay: number; attended: boolean };
  vote?: VoteRecord;
  appeal?: { day: number; group: GroupId; resolved?: 'conceded' | 'capital' | 'expired' };
  mods: Record<string, number>;
  /** 譲歩の費用（可決した時に取り分けに足す。負の値は規模を小さくして下がる分。docs/game-design.md 17.1） */
  pendingCost?: number;
  /** 採決の前に説得した議員（1 件の申請で 1 人まで。docs/game-design.md 18.2） */
  persuaded?: string;
}

/* ---------- 11 章 市政 ---------- */

export type Difficulty = 'gentle' | 'normal' | 'tough';

export interface Term {
  no: number;
  startDay: number;
  pledges: { pledgeId: string; startValue: number; doneDay?: number }[];
  startSnapshot: { population: number; jobs: number; treasury: number; approval: number; lessonsDone: number };
  /** 任期の初めの分野ごとのスキル段階（任期の終わりの一覧の「上がったスキル」。画面が知らせた値） */
  startStages?: Partial<Record<DomainId, number>>;
  /** この任期に達成したミッション（政治資本 +3 を得た物） */
  missions?: string[];
}

export interface TermSummary {
  no: number;
  startDay: number;
  endDay: number;
  won: boolean;
  voteShare: number;
  byLayer: { support: number; turnout: number }[];
  causes?: { layer: number; factors: { factor: FactorId; points: number }[]; decisions: string[] }[];
  built: string[];
  approved: number;
  rejected: number;
  pledgesDone: string[];
  missionsDone: string[];
  lessonsDone: number;
  skillsUp: DomainId[];
  population: [number, number];
  jobs: [number, number];
  treasury: [number, number];
  approval: [number, number];
}

export interface Politics {
  difficulty: Difficulty;
  capital: number;
  capitalLog: { day: number; amount: number; why: string }[];
  term: Term;
  pastTerms: TermSummary[];
  pushesThisTerm: number;
  wrongExplanations: number;
  expiredPetitions: number;
  /** 落選して、同じ都市で再び立つか新しい都市で始めるかを選ぶまで（その間、都市の日は進まない。docs/game-design.md 21.2） */
  defeated?: true;
  /** 政治資本を得たミッション（同じミッションで 2 度得ない。公約の missionsDone） */
  missions?: string[];
  /** 学習の進み（画面が知らせる数だけ。任期の終わりの一覧に使い、市政の条件には使わない） */
  learning?: { lessonsDone: number; stages: Partial<Record<DomainId, number>> };
}

export interface Budget {
  treasury: number;
  taxRate: number;
  pendingTaxRate?: number;
  ledger: {
    week: number;
    income: { residents: number; businesses: number };
    spend: { services: number; power: number; external: number; petitions: number };
  }[];
  deficitWeeks: number;
}

export interface PetitionState {
  inbox: { id: string; petitionId: string; arrivedWeek: number; district?: number; layer?: number; value: number }[];
  handled: Record<string, { week: number; choice: 'accept' | 'reject' | 'expire' }>;
  effects: { petitionId: string; untilWeek: number; district?: number }[];
}

export interface Rewards {
  unlocked: Record<string, number>;
  built: Record<string, string>;
  highApprovalWeeks: number;
}

/* ---------- 12 章 版 4 の、都市と模擬と市政の全体 ---------- */

export interface World {
  city: City;
  sim: SimState;
  history: SimHistory;
  applications: Application[];
  politics: Politics;
  budget: Budget;
  petitions: PetitionState;
  rewards: Rewards;
}
