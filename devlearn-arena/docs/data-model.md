# データモデル

この文書は**プレイヤー・XP・スキル・学習履歴・都市・ミッション・セーブの型**と、**レッスン・クイズ・実戦をプレイヤーの記録としてどう持つか**を決める。
レッスン・クイズ・実戦の**中身（作る側のデータ形式）**は `docs/content-spec.md` が決める（`docs/decisions.md` D-06）。
実装は `src/**/types.ts`。ここを変える時は、セーブの版を上げて移行関数を書く。

## 1. プレイヤー

```ts
interface Player {
  id: string;                    // 端末内で生成
  name: string;                  // 市長の名前（既定: 市長）
  createdAt: string;             // ISO 日時
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
  day: number;                   // 都市の日付（学習者の操作で進む）
  funds: number;                 // 開発資金
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
interface Zone { id: string; kind: 'residential' | 'commercial' | 'office'; cells: Point[] }
interface Building { id: string; zoneId: string; cell: Point; variant: string; level: number; builtDay: number }
interface Facility {
  id: string;
  type: FacilityType;            // 'server' | 'network' | 'web' | ... | 'park' | 'monument'
  domain?: DomainId;
  origin: Point; rotation: 0 | 90 | 180 | 270;
  level: 1 | 2 | 3 | 4 | 5;
  state: 'constructing' | 'active';
  builtDay: number;
}
type Point = { x: number; y: number };
type Rect = { x: number; y: number; w: number; h: number };
```

都市の見た目（どの建物がどの高さか）は、この状態と seed から**計算で決まる**。描画用のデータを保存しない。

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
}
```

- 保存先: IndexedDB の `devlearn-arena` データベース、`save` ストアの `current`。設定の写しを localStorage にも置く（読み込みの速さのため）
- 自動保存: 操作の 2 秒後と、レッスンの段が進むたび
- 書き出し: `devlearn-save-<日付>.json`。読み込み時に zod で検証し、版を移行する
- 保存データに秘密情報は無い（外部のサービスの鍵を扱わない）
