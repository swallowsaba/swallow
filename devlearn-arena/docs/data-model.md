# データモデル

この文書は**プレイヤー・XP・スキル・学習履歴・都市・ミッション・セーブの型**と、**レッスン・クイズ・実戦をプレイヤーの記録としてどう持つか**を決める。
都市の模擬と市政（住民・事業者・地価・家賃・雇用・申請・反対・公聴会・議会・選挙・政治資本・請願・新聞・電力・公共サービス・褒賞）の保存は 8〜12 章（`docs/decisions.md` D-20）。
レッスン・クイズ・実戦の**中身（作る側のデータ形式）**は `docs/content-spec.md` が決める（`docs/decisions.md` D-06）。
実装は `src/**/types.ts`。ここを変える時は、セーブの版を上げて移行関数を書く。

## 1. プレイヤー

```ts
interface Player {
  id: string;                    // 端末内で生成
  name: string;                  // 市長の名前（既定: 市長）
  createdAt: string;             // ISO 日時
  introSeen: boolean;            // 初回の操作説明（docs/ui-design.md 9 章）を見終えた・飛ばした（版 2 で足した。版 1 からの移行では true）
  xp: number;                    // 累計 XP（消費しない）
  engineerRank: 'apprentice' | 'junior' | 'middle' | 'senior' | 'lead';
  skills: Record<DomainId, SkillState>;
  settings: Settings;
}
```

## 2. XP

```ts
interface XpEvent {
  at: string;                    // ISO 日時
  source: 'lesson-complete' | 'quiz' | 'practice' | 'troubleshoot' | 'mission' | 'skill-up' | 'review';
  ref: string;                   // レッスン ID・ミッション ID など
  amount: number;                // 稼ぎ防止を適用した後の値（docs/game-design.md 3 章）
}
```

## 3. スキル

```ts
interface SkillState {
  domain: DomainId;
  value: number;                 // 0〜100（docs/game-design.md 4 章の式で計算。保存はキャッシュ）
  stage: 0 | 1 | 2 | 3 | 4 | 5;
  breakdown: {                   // 「何をしたからこの値か」
    completion: number;          // 0〜1
    quizFirstTry: number;        // 0〜1（直近 20 問）
    practiceSuccess: number;     // 0〜1（直近 10 回）
    retention: number;           // 0〜1
  };
}
```

## 4. レッスン・クイズ・実戦（プレイヤー側の持ち方）

レッスンの中身は `content/` の読み取り専用のデータ（`docs/content-spec.md` の `Lesson`・`QuizItem`・`Practice`）。
プレイヤー側は、それを ID で参照し、**進み具合と結果だけ**を持つ。中身を保存データに写さない。

| 概念 | 中身（読み取り専用） | プレイヤー側の記録 |
|---|---|---|
| レッスン | `Lesson`（content-spec 2 章） | `LessonProgress`（下） |
| クイズ | `QuizItem`（content-spec 2.3） | `QuizAttempt`（下） |
| 実戦 | `Practice`（content-spec 2.4） | `PracticeAttempt`（下）と、模擬環境の状態の保存（途中再開のため） |

```ts
interface PracticeSession {      // 実戦の途中再開のための状態
  lessonId: string;
  stepIndex: number;
  engineState: unknown;          // 模擬環境（src/engines）が出力する直列化済みの状態
  savedAt: string;
}
```

## 4.1 学習履歴

```ts
interface LessonProgress {
  lessonId: string;
  status: 'not-started' | 'in-progress' | 'completed';
  stage: 'explain' | 'understand' | 'quiz' | 'practice' | 'result' | 'summary' | 'done';
  startedAt?: string;
  completedAt?: string;
  completions: number;           // 何回まとめまで到達したか
  quiz: QuizAttempt[];
  practice: PracticeAttempt[];
  lastXpDay?: string;            // 稼ぎ防止（YYYY-MM-DD）
}
interface QuizAttempt { quizId: string; at: string; choiceIds: string[]; correct: boolean; tryNo: number }
interface PracticeAttempt {
  at: string;
  stepsDone: string[];
  hintsUsed: number;             // 0〜3（最大の段）
  errors: string[];              // 出たエラーの ID
  recoveredFromError: boolean;   // エラーから自力で成功
  dangerousUsed: string[];       // 危ない手の ID
  success: boolean;
  commands: string[];            // 打ったコマンド（自分の振り返り用）
}
interface ReviewCard { id: string; lessonId: string; due: string; intervalDays: number; ease: number }
```

## 5. 都市

```ts
interface City {
  seed: number;
  name: string;
  day: number;                   // 都市の日付（都市画面で、止めていない間に進む。1 倍で 1 日 2 秒。docs/game-design.md 13.1）
  funds: number;                 // 開発資金（財政は 11 章の Budget）
  stage: 1 | 2 | 3 | 4 | 5;      // 発展段階
  population: number;            // 都市規模
  techPower: number;             // 技術力（施設 Lv の合計）
  revealed: Rect[];              // 霧の晴れた範囲
  roads: Road[];
  zones: Zone[];
  buildings: Building[];         // 区画に自動で建った建物
  facilities: Facility[];        // 学習者が置いた施設・公園・記念碑
}
interface Road { id: string; kind: 'lane' | 'street' | 'avenue' | 'bridge' | 'roundabout'; path: Point[] }
interface Zone { id: string; kind: 'residential' | 'commercial' | 'office' | 'industrial'; cells: Point[]; mods?: Record<string, number> }  // mods: 用途地域の変更の申請の譲歩（height・units・jobs・noise）
interface Building { id: string; zoneId: string; cell: Point; variant: string; level: number; builtDay: number }
interface Facility {
  id: string;
  type: FacilityType;            // 'server' | 'network' | 'web' | ... | 'park' | 'monument' | 公共サービス・発電所・陸揚げ所・褒賞の建物（12 章）
  domain?: DomainId;
  origin: Point; rotation: 0 | 90 | 180 | 270;
  level: 1 | 2 | 3 | 4 | 5;
  state: 'constructing' | 'active';
  builtDay: number;
  landmark?: string;             // 記念碑のとき、どの記念碑か（ミッションの報酬 rewards.landmark。docs/content-spec.md 4 章）
  completeDay?: number;          // 工事が終わる日（版 4。docs/game-design.md 15.2）
  mods?: Record<string, number>; // 申請の譲歩で変わった性質（版 4。10 章）
}
type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
```

都市の見た目（どの建物がどの高さか）は、この状態と seed から**計算で決まる**。描画用のデータを保存しない。
申請中の物（囲いと看板）は `City` に入れず、`Application`（10 章）から描く。

## 6. ミッション

```ts
interface MissionProgress {
  missionId: string;
  status: 'available' | 'in-progress' | 'completed';
  practice?: PracticeAttempt[];
  completedAt?: string;
}
```

## 7. セーブ

```ts
interface SaveData {
  version: number;               // 版。上がったら src/save/migrations.ts で移行
  savedAt: string;
  player: Player;
  city: City;
  lessons: Record<string, LessonProgress>;
  practiceSessions: Record<string, PracticeSession>;  // 実戦の途中再開
  reviews: ReviewCard[];
  missions: Record<string, MissionProgress>;
  xpLog: XpEvent[];              // 直近 1,000 件
}
interface Settings {
  sound: boolean; reduceMotion: boolean; fontScale: 1 | 1.15 | 1.3;
  quality: 'low' | 'standard' | 'high'; furigana: boolean; commandHints: boolean;
  minimap: boolean;              // 都市画面のミニマップを出す（既定は出す。版 3 で足した。版 2 からの移行では true。docs/decisions.md D-18）
}
```

- 保存先: IndexedDB の `devlearn-arena` データベース、`save` ストアの `current`。設定の写しを localStorage にも置く（読み込みの速さのため）
- 自動保存: 操作の 2 秒後と、レッスンの段が進むたび（レッスンを始めた・修了した時も含む）。ページを離れる時も、待っている保存を書き切る
- 起動時の読み込み: 画面を描く前に `current` を読み、都市・学習の記録・途中の実戦・市長を元に戻す（リロード・ブラウザの再起動の後も同じ）
- 保存に失敗した時は、何が起きたかを画面に 1 行で知らせる（記録は画面に残り、次の操作でもう一度保存する）。
  `current` を読めなかった時（壊れている・新しい版で書かれた）は、その写しを同じストアの `broken-<時刻>` に残してから新しい都市で始め、1 行で知らせる（読めない物を上書きして失わない）
- 書き出し: `devlearn-save-<日付>.json`。読み込み時に zod で検証し、版を移行する
- 読み込みと最初からやり直すは、設定画面の「保存」から行う。どちらも今の記録を置き換えるので、確かめてから行う。
  読み込みは、選んだファイルの中身（都市・保存した時・XP・修了したレッスンの数・古い版から移したか）を示してから置き換える。読めないファイルは何も書かず、何が起きたか・どうすればよいかを 1 行ずつ出す。
  やり直しは、新しい都市・空の学習の記録・新しい市長で始め、設定は残す。確かめの中から先に書き出せる。
  置き換えた後は保存先から開き直し、都市画面に 1 行で知らせる。置き換えを書けなかった時は、今の記録のまま自動保存を続ける
- 保存データに秘密情報は無い（外部のサービスの鍵を扱わない）
- 版 4 で足す項目（8〜11 章）と、版 3 からの移行は 12 章。都市の模擬の状態は Worker が持ち、自動保存の時に写しを受け取って入れる（`docs/architecture.md` 9.1）

## 8. 都市の模擬の状態

規則は `docs/game-design.md` 13 章、置き場所は `docs/architecture.md` 9 章。
**保存するのは、前の週の値から積み上がる物（世帯・事業者の続いた週・家賃の倍率・支持・信頼）だけ。** 地価・騒音・行き届き・通勤・需要・電力の割り振りは、状態と seed から計算で決まるので保存しない（読み込んだ時に計算し直す）。

```ts
interface SimState {
  week: number;                          // 何週目か（city.day ÷ 7 の切り捨てと同じ。確かめに使う）
  districtNames: string[];               // 地区（8×8 マス、144）の名前。新しい都市を作る時に seed で決める（docs/game-design.md 16.1）
  households: Record<string, LayerCounts>;  // 住宅の建物 ID → 層ごとの世帯の数
  businesses: Record<string, BusinessState>; // 商業・オフィス・工業の建物 ID → 事業者
  rentFactor: number;                    // 需給の倍率（0.6〜1.8。docs/game-design.md 13.5）
  support: number[][];                   // [地区 144][層 12] の支持（0〜100）。週ごとに目標へ 1/4 近づく
  trust: number[];                       // [層 12] 市政への信頼（−15〜+15）
  power: PowerState;
}
type LayerCounts = number[];             // 長さ 12。層の並びは 年齢の帯（若者・子育て・中年・高齢）× 収入の帯（低・中・高）の順
interface BusinessState {
  kind: 'shop' | 'office' | 'it' | 'factory';
  workers: number[];                     // 収入の帯（3）ごとの雇っている人数
  profitWeeks: number;                   // 売上が費用を上回った週の続き（負の数は下回った週の続き）
}
interface PowerState {
  landing: Point;                        // 海底ケーブルの陸揚げ所（docs/city-design.md 9.4）
  externalCapMW: number;                 // 外からの電気の上限（新しい都市は 8。移行した都市は 12 章）
  rotation: number;                      // 輪番の停電で次に止める地区の番号
  outageDays: number[];                  // [地区 144] 直近 28 日に止まった日の数
  recent?: number[][];                   // 直近 4 週の、週ごとに止まった地区（最後が今の週）。outageDays はここから数える（止まった週 × 7 日）
}
```

- 層の番号は `年齢の帯 × 3 + 収入の帯`（若者・低 = 0 … 高齢・高 = 11）。全ての `[層 12]` の配列で同じ
- 区画の建物（`Building`）が壊れたり作り直されたりしたら、その ID の世帯と事業者も消える（住んでいた世帯は都市を出る）

## 9. 記録（グラフ・内訳・新聞）

```ts
interface SimHistory {
  weekly: WeeklySample[];                // 直近 208 週は全て、それより前は 4 週ごと（docs/architecture.md 9.4）
  breakdown: WeeklyBreakdown[];          // 直近 8 週だけ
  news: Article[];                       // 1 任期分は全文。それより前は body を空にして見出しだけ
}
interface WeeklySample {
  week: number;
  population: number; funds: number; treasury: number;
  approval: number;                      // 0〜100
  jobs: number; unemployment: number;    // 仕事の数・失業率（0〜1）
  marks: string[];                       // その週の出来事（申請の可決・完成・税率の変更・選挙）の ID。グラフの印（docs/ui-design.md 11.2）
}
interface WeeklyBreakdown {              // 支持率の内訳（docs/game-design.md 13.8）
  week: number;
  factors: number[][];                   // [要因 12][層 12] の点（重みを掛けた後）
  causes: Cause[];                       // 原因ごとの点の上位 20 件
  layers?: number[];                     // [層 12] 層の支持の都市全体の平均（18 歳以上の人数で重み。住む人がいなければ −1）。説明の 2 行目（一番効いた層。docs/game-design.md 14 章）
}
interface Cause {
  factor: FactorId;                      // 'afford' | 'jobs' | 'commute' | 'noise' | 'green' | 'police' | 'school' | 'clinic' | 'fire' | 'power' | 'tax' | 'trust'
  source: { kind: 'facility' | 'zone' | 'road' | 'building' | 'decision' | 'demand'; id: string; at?: Point };
  points: number;                        // 支持率への寄与（人数で重みを付けた後）
}
interface Article {
  id: string; week: number; day: number;
  kind: NewsKind;                        // 'application' | 'approved' | 'rejected' | 'appeal' | 'completed' | 'election' | 'term-end' | 'closure' | 'outage' | 'tax' | 'petition' | 'mission' | 'reward' | 'scandal' | 'start'
  headline: string; body: string;        // 型の文（content/politics/news.json）に名前と数字を入れた物
  at?: Point;                            // 押すとカメラが寄る場所
}
```

## 10. 申請と審議

規則は `docs/game-design.md` 15〜19 章。中身（反対の理由・譲歩・説明・議員）は `docs/content-spec.md` 7 章のデータを ID で参照し、写さない。

```ts
interface Application {
  id: string;
  kind: 'facility' | 'upgrade' | 'rezone' | 'civic' | 'power' | 'reward';
  target: {                              // 何を・どこに
    type?: FacilityType;                 // 施設・公共サービス・発電所・褒賞の建物
    facilityId?: string;                 // アップグレードの時の施設
    toLevel?: 2 | 3 | 4 | 5;
    zone?: { kind: ZoneKind; cells: Point[]; from?: ZoneKind }; // 用途地域の変更
    origin?: Point; rotation?: 0 | 90 | 180 | 270;
  };
  stage: 'filed' | 'zoning' | 'objection' | 'hearing' | 'council' | 'appeal' | 'construction' | 'done' | 'rejected' | 'withdrawn';
  stageDay: number;                      // 今の段階に入った日
  filedDay: number;
  wallet: 'funds' | 'treasury';
  reserved: number;                      // 取り分けた費用（譲歩の費用を含む）
  exception: boolean;                    // 用途の例外（公聴会を省けない）
  objections: ObjectionState[];
  opposition: number;                    // 今の反対率（0〜100。受付の間は日ごとに上がる途中の値）
  hearing?: { heldDay: number; attended: boolean };
  vote?: VoteRecord;
  appeal?: { day: number; group: GroupId; resolved?: 'conceded' | 'capital' | 'expired' };
  mods: Record<string, number>;          // 譲歩で変わった性質（'height': −1, 'nightNoise': 0, 'coolingWater': 0.3 など）。完成した建物に写す
  pendingCost?: number;                  // 譲歩の費用（可決した時に reserved に足す。負の値は規模を小さくして下がる分）
  persuaded?: string;                    // 採決の前に説得した議員の ID（1 件の申請で 1 人まで。docs/game-design.md 18.2）
}
interface ObjectionState {
  reasonId: string;                      // content/politics/objections の理由
  group: GroupId;                        // 'neighbors' | 'merchants' | 'environment' | 'taxpayers' | 'workers'
  district?: number;                     // 近隣の住民の時、地区の番号
  strength: number;                      // 0〜1（docs/game-design.md 16.2）
  share: number;                         // 反対率の内訳（%）。全ての理由の合計が opposition
  full: number;                          // 反対の受付が終わった時の割合（%）。受付の間は share がここへ日ごとに直線で上がる
  basis: { value: number; ref?: number };  // 強さの元になった模擬の値と、比べた値（申請の詳細に出す。docs/ui-design.md 10.2 の 3）
  topLayer?: number;                     // この理由の反対で一番多い層（0〜11。申請の詳細の「多い層」）
  layers?: number[];                     // この理由に反対した層（押し切る・誤った説明で信頼を動かす相手）
  hand?:
    | { kind: 'concede'; concessionId: string; day: number }
    | { kind: 'explain'; explanationId: string; quality: 'sound' | 'partial' | 'wrong'; day: number }
    | { kind: 'push'; capital: number; day: number };
}
interface VoteRecord {
  day: number;
  consent: boolean;                      // 同意の案件（採決なしの可決）
  members: { memberId: string; score: number; yes: boolean; reasonKey: string; persuaded: boolean }[];
  passed: boolean;
}
```

- `Facility`（5 章）は、申請が可決して着工した時に `state: 'constructing'` で足し、完成した日に `active` にする。申請中は `Facility` を作らず、`Application` だけを持つ（都市の上の囲いと看板は `Application` から描く）
- 完成した `Facility` は、申請の `mods` を `mods` として持つ（譲歩は建物にずっと残る。`docs/game-design.md` 17.1）
- 終わった申請（`done`・`rejected`・`withdrawn`）は 1 任期分を残し、それより前は消す（許認可の一覧の「終わった申請」。`docs/ui-design.md` 10.1）

## 11. 市政（選挙・政治資本・任期・公約・請願・予算・褒賞）

```ts
interface Politics {
  difficulty: 'gentle' | 'normal' | 'tough';   // 始め方（docs/game-design.md 27 章）
  capital: number;                       // 政治資本
  capitalLog: { day: number; amount: number; why: string }[];  // この任期の得と使い（予算の窓。docs/ui-design.md 10.9）
  term: Term;
  pastTerms: TermSummary[];              // 任期の終わりの一覧（docs/game-design.md 21.3）。全て残す
  pushesThisTerm: number;                // 押し切った回数（新聞の不祥事。docs/game-design.md 22.3）
  wrongExplanations: number;
  expiredPetitions: number;
  defeated?: true;                       // 落選して、次の道（同じ都市で再び立つ・新しい都市で始める）を選ぶまで。その間、都市の日は進まない
  missions?: string[];                   // 政治資本 +3 を得たミッション（同じミッションで 2 度得ない。公約の missionsDone）
  learning?: { lessonsDone: number; stages: Partial<Record<DomainId, number>> };  // 画面が知らせる学習の進み（任期の終わりの一覧だけに使う。市政の条件には使わない）
}
interface Term {
  no: number;                            // 何期目か（落選して同じ都市で立っても数え続ける）
  startDay: number;                      // 選挙の日は startDay + 1,455（208 週の最後の日）
  pledges: { pledgeId: string; startValue: number; doneDay?: number }[];  // 2 つ。startValue は goal の start の語の、選んだ時の値
  startSnapshot: { population: number; jobs: number; treasury: number; approval: number; lessonsDone: number };
  startStages?: Partial<Record<DomainId, number>>;  // 任期の初めの分野ごとのスキル段階（一覧の「上がったスキル」）
  missions?: string[];                   // この任期に達成したミッション（一覧の missionsDone）
}
interface TermSummary {
  no: number; startDay: number; endDay: number;
  won: boolean; voteShare: number;
  byLayer: { support: number; turnout: number }[];   // 12 層
  causes?: { layer: number; factors: { factor: FactorId; points: number }[]; decisions: string[] }[]; // 落選の時の敗因（上位 3 層）
  built: string[]; approved: number; rejected: number;
  pledgesDone: string[]; missionsDone: string[];
  lessonsDone: number; skillsUp: DomainId[];
  population: [number, number]; jobs: [number, number]; treasury: [number, number]; approval: [number, number]; // 始めと終わり
}
interface Budget {
  treasury: number;                      // 財政（docs/game-design.md 22.2）
  taxRate: number;                       // 5〜20（%）
  pendingTaxRate?: number;               // 次の週から効く値
  ledger: { week: number; income: { residents: number; businesses: number }; spend: { services: number; power: number; external: number; petitions: number } }[]; // 直近 52 週
  deficitWeeks: number;                  // 赤字の続いた週
}
interface PetitionState {
  inbox: { id: string; petitionId: string; arrivedWeek: number; district?: number; layer?: number; value: number }[];  // 最大 5。value は届いた理由の模擬の値
  handled: Record<string, { week: number; choice: 'accept' | 'reject' | 'expire' }>;  // 請願 ID → 最後に扱った週（26 週は再び届かない）
  effects: { petitionId: string; untilWeek: number; district?: number }[];            // 受理した中身のうち、続く物（家賃の補助など）
}
interface Rewards {
  unlocked: Record<string, number>;      // 褒賞の ID → 届いた日（届いた後は下がっても残る）
  built: Record<string, string>;         // 褒賞の ID → 建てた施設の ID
  highApprovalWeeks: number;             // 支持率 65% 以上が続いた週（市民ホール）
}
```

- 敗因の `decisions` は、その層の点を最も下げた原因（`Cause.source`）の `種類:ID`（施設・区画・道路・決定。申請・税率の変更・請願の扱い）。2 つまで
- `built` は、その任期に完成した申請の ID

## 12. 保存データの版 4 と、版 3 からの移行

```ts
interface SaveData {                     // 7 章の形に、次を足す（版 4）
  // …7 章の項目…
  sim: SimState;                         // 8 章
  history: SimHistory;                   // 9 章
  applications: Application[];           // 10 章
  politics: Politics;                    // 11 章
  budget: Budget;
  petitions: PetitionState;
  rewards: Rewards;
}
```

- 5 章の `City` は次のように変わる（同じ版 4）
  - `day`: 都市の日付。都市画面が前に出ていて、止めていない間に進む（`docs/game-design.md` 13.1）。1 倍で 1 日 2 秒
  - `Zone.kind` に `'industrial'`（工業）を足す
  - `Facility.type` に公共サービス・発電所・陸揚げ所・褒賞の建物を足す: `'police' | 'fire' | 'school' | 'clinic' | 'power-thermal' | 'power-solar' | 'landing' | 'city-hall' | 'memorial' | 'stadium' | 'civic-hall' | 'central-park'`。これらは `level` を 1 に固定し、`domain` を持たない
  - `Facility` に `mods?: Record<string, number>`（譲歩で変わった性質）と `completeDay?: number`（工事が終わる日）を足す
  - `funds` は開発資金のまま（財政は `Budget.treasury`）。`population` と `techPower` は模擬の結果の写し（計算で決まる。表示の速さのため）
- **版 3 → 版 4 の移行**（`src/save/migrations.ts`）。今の都市を壊さず、遊びの途中から市政が始まる形にする
  - 住宅の建物ごとに、今の都市規模の計算（`src/city/growth.ts`）でその建物に住む人数を、初めの分布（年齢の帯 若者 30%・子育て 35%・中年 20%・高齢 15%、収入の帯 低 30%・中 50%・高 20%）の世帯に分けて入れる。移行の前と後で都市規模の差が 1% 以内であることをテストで確かめる
  - 商業・オフィスの建物ごとに、今の仕事の数（`CAPACITY`）を雇う人にして事業者を作る（`profitWeeks` は 0。オフィスで IT 施設から 8 マス以内は IT 企業）
  - 工事中（`constructing`）の施設は、移行した日に完成にする（今の工事は 2 日なので、待たせない）。申請（`applications`）は空
  - `rentFactor` は 1、`support` は初めの週に目標の値で埋める（1/4 ずつ近づけずに始める）、`trust` は全て 0
  - 電力: 陸揚げ所を地形から決めて置き（`docs/city-design.md` 9.4）、外からの電気の上限を `max(8, 今の使う量 × 1.2)` にする（移行した瞬間に停電させない）
  - 市政: 始め方は「ふつう」、政治資本 10、1 期目を移行した日に始める（公約は、都市画面に戻った時に選ぶ窓を出す）。財政 800、税率 10%
  - 地区の名前を seed で決める。新聞に最初の記事（`start`。「市政が始まった」）を 1 つ入れる
  - 学習の記録（`player`・`lessons`・`practiceSessions`・`reviews`・`missions`・`xpLog`）と開発資金は、そのまま写す（変えない）
- 版 2 以前からは、今までの移行（版 2 → 3）を通ってから、この移行を通す
- 読み込みの確かめ（7 章の「選んだファイルの中身を示す」）に、版 4 では任期と支持率を足す
