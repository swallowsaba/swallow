# コンテンツ仕様

教え方は `docs/learning-design.md`、型の全体は `docs/data-model.md`。
この文書は**コンテンツのデータの形と置き場所、書き方の規則**を決める。

## 1. 置き場所

アプリ本体を改修せずにコンテンツを足せるように、全てデータとして `content/` に置く。

```text
content/
  domains.json               分野の一覧（ID・名前・施設・説明・推奨前提・関連）
  lessons/<分野>/<ID>.json   レッスン 1 本 = 1 ファイル
  glossary/<分野>.json       用語集
  missions/<ID>.json         ミッション
  facilities.json            施設の定義（見た目は src/city/assets、規則は docs/game-design.md）
  errors/<分野>.json         エラーの解説（errorGuides）
```

- 形式は JSON。読み込み時に zod で検証する。**検証に失敗したコンテンツはビルドで落とす**
- 画像（図）は `content/figures/<ID>.svg`。`docs/visual-design.md` の決まりに従う
- 分野を足すときは `domains.json` に 1 行足し、レッスンを置くだけで、学習ライブラリ・知識グラフ・施設に現れる

## 2. レッスン

```ts
interface Lesson {
  id: string;                   // 'linux.i.01'
  domain: DomainId;
  level: 'beginner' | 'intermediate' | 'advanced';
  theme: string;                // 'サービス'
  title: string;
  goal: string;                 // 到達目標（1 文）
  minutes: number;              // 目安の時間（10〜20）
  prerequisites: string[];      // 推奨前提（レッスン ID）。ロックではない
  related: string[];            // 関連（レッスン ID）
  next: string[];               // 次に学ぶとよい（レッスン ID）
  terms: string[];              // このレッスンで使う用語（用語集の ID）
  explain: Explain;
  understand: UnderstandItem[]; // 2 つ以上
  quiz: QuizItem[];             // 3〜5 問、種類 3 つ以上
  practice: Practice;
  result: ResultText;
  summary: Summary;
}
```

### 2.1 解説

```ts
interface Explain {
  what: Rich;        // 何か
  why: Rich;         // なぜ必要か
  use: Rich;         // 何に使うか
  when: Rich;        // どんな場面で使うか
  figures: string[]; // 図の ID（1 つ以上）
  situation?: Rich;  // 状況説明（その技術が必要になる場面。任意）
}
type Rich = string;  // 本文。用語は {{term:ID}} で書き、画面で用語説明に変わる
```

### 2.2 理解

```ts
type UnderstandItem =
  | { kind: 'figure-pick'; figure: string; prompt: string; answer: string[] }      // 図の一部を押す
  | { kind: 'order'; prompt: string; items: string[] }                              // 正しい順（items は正しい順で書く）
  | { kind: 'situation'; prompt: string; choices: Choice[] }                        // 状況説明
  | { kind: 'yesno'; prompt: string; answer: boolean; why: string }                 // 簡単な確認
  | { kind: 'match'; prompt: string; pairs: [string, string][] }                    // 用語と説明を結ぶ
  | { kind: 'relation'; prompt: string; a: string; b: string; answer: RelationKind; why: string }; // 関係性
```

- 理解は採点しない。間違えたら、関係する解説の箇所（`explain` のどれか）を示す

### 2.3 クイズ

```ts
interface QuizItem {
  id: string;
  kind: 'choice' | 'multi' | 'situation' | 'cause' | 'predict' | 'term' | 'order';
  prompt: Rich;
  context?: { log?: string; command?: string; figure?: string };  // 原因特定・結果予測の材料
  choices?: Choice[];
  order?: string[];
  explanation: Rich;                // 正答の理由
}
interface Choice { id: string; text: Rich; correct: boolean; whyNot?: Rich } // 誤答には whyNot 必須
```

### 2.4 実戦

```ts
interface Practice {
  mode: 'terminal' | 'simulation' | 'sql' | 'editor';
  purpose: Rich;                       // 目的（何を確かめる実戦か）
  environment: string;                 // 模擬環境の初期状態の ID（src/engines の定義）
  setup?: unknown;                     // 初期状態の差分（壊れた状態から始める等）
  steps: PracticeStep[];               // 1 つ以上
  dangerous?: DangerRule[];            // 危ない手（使うと「失策」として記録。成功はさせる）
}
interface PracticeStep {
  id: string;
  purpose: Rich;                       // この手順で何を確かめるか（打つ前に表示）
  check: CheckSpec;                    // 達成条件（模擬環境の状態で判定）
  afterward: Rich;                     // 打った後に「何が起きたか」を表示
  hints: [Rich, Rich, Rich];           // 方向 → 具体 → そのまま通る答え
  expectedErrors?: string[];           // 想定エラーの ID（content/errors）
}
type CheckSpec =
  | { kind: 'fs'; path: string; exists?: boolean; contains?: string }
  | { kind: 'cwd'; equals: string }
  | { kind: 'service'; name: string; active?: boolean; enabled?: boolean }
  | { kind: 'git'; expr: string }               // 例: 'branch:feature merged-into:main'
  | { kind: 'k8s'; expr: string }               // 例: 'deployment/web readyReplicas>=3'
  | { kind: 'net'; expr: string }               // 例: 'reach shop.example:443'
  | { kind: 'http'; url: string; status: number }
  | { kind: 'tls'; host: string; trusted: boolean }
  | { kind: 'sql'; query: string; equals: unknown }
  | { kind: 'answer'; equals: string };        // 原因などを答える形
```

- **判定は出力の文字列ではなく、模擬環境の状態で行う**
- 最後のヒントは、そのまま入力すれば必ず通る（テストで確かめる）

### 2.5 エラーの解説（errorGuides）

```ts
interface ErrorGuide {
  id: string;                    // 'enoent'
  match: string;                 // エラーメッセージに含まれる文字列か正規表現
  meaning: Rich;                 // エラー内容（何と言われたか）
  causes: Rich[];                // 原因候補（2〜3 個）
  hint: Rich;                    // 次に何を確かめるか
  terms?: string[];
}
```

実戦でエラーが出たら、`エラー → 内容 → 原因候補 → ヒント → 再挑戦` の順に表示する（`docs/learning-design.md`）。

### 2.6 結果とまとめ

```ts
interface ResultText {
  success: Rich;                 // よかった点（何ができたか）
  partial: Rich;                 // ヒントを使った・危ない手を使ったとき
  retry: Rich;                   // 未達のとき（責めずに、どこで外れたか）
}
interface Summary {
  points: [Rich, Rich?, Rich?];  // 要点 3 つ以内
  next: string[];                // 次に学ぶとよい（レッスン ID）
  terms: string[];               // 関連用語
}
```

## 3. 用語

```ts
interface Term {
  id: string;            // 'pod'
  word: string;          // 'Pod'
  reading?: string;      // 'ポッド'
  plain: Rich;           // 簡単な説明（1〜2 文）
  why: Rich;             // なぜ重要か
  related: string[];     // 関連する技術・用語の ID
  lessons: string[];     // 関係するレッスン
  analogy?: Rich;        // 例え（例えだけで終わらせない）
}
```

## 4. ミッション

```ts
interface Mission {
  id: string;
  title: string;                 // 'Web サーバを構築せよ'
  story: Rich;                   // 都市の課題としての説明
  domains: DomainId[];           // 関係する分野（複数）
  knowledge: Rich[];             // 必要な知識（1 行ずつ。1 つ以上。用語は {{term:ID}}。docs/decisions.md D-15）
  recommended: string[];         // おすすめのレッスン（前提ではない）
  practice: Practice;            // 実戦部分（レッスンと同じ形）
  rewards: { xp: number; funds: number; landmark?: string };   // 報酬の規則は docs/game-design.md 8 章
}
```

## 5. 書き方の規則

- 1 文 40 字前後。1 画面 200 字以内
- 用語は `{{term:ID}}` で書き、初出で必ず説明が付くようにする。**用語集に無い専門用語を書くとテストで落ちる**
- 解説の前にコマンドを出さない（`explain` にコマンドを書かない。例として示す場合は「この後の実戦で使う」と明記）
- 誤答の選択肢は、実際に誤解しやすいものにする
- 例えは使ってよい。例えの後に正確な説明を必ず続ける
- 製品名は例としてのみ出す。特定のクラウド製品に依存した説明にしない

## 5.1 設計からの書き起こし

- 各レッスンは `docs/lessons/<分野>.md` の設計を、この文書の形に書き起こして作る
- 設計の要素（解説の 4 問い・図・理解・クイズ・実戦・結果・まとめ）を削らない。足すのはよい
- 設計と食い違う中身にしたい場合は、先に設計を直す（`CLAUDE.md` の仕様変更ルール）

## 6. 検証（自動テスト）

`src/content/validate.test.ts` で次を確かめる。

- 全ファイルが型の通り（zod）
- 全レッスンが 7 段を持つ（解説の 4 問い・図 1 つ以上・理解 2 つ以上・クイズ 3〜5 問かつ種類 3 以上・実戦・結果・まとめ）
- 誤答の選択肢すべてに `whyNot` がある
- 推奨前提・関連・次の ID が存在する。推奨前提の辺に循環が無い
- 本文に出る用語がすべて用語集にある
- 全実戦の最後のヒントを模擬環境で実行すると、達成条件を満たす
- `docs/curriculum.md` の表にあるレッスン ID と、`docs/lessons/` の設計と、`content/lessons/` のファイルが一致する（公開範囲のもの）
