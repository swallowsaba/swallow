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
  | { kind: 'fs'; path: string; exists?: boolean; contains?: string; mode?: string } // mode: 権限。'600' ならその値、'u+x'・'go-rwx' ならその権限が有る・無い
  | { kind: 'cwd'; equals: string }
  | { kind: 'service'; name: string; active?: boolean; enabled?: boolean }
  | { kind: 'git'; expr: string }               // 例: 'branch:feature merged-into:main'
  | { kind: 'k8s'; expr: string }               // 例: 'deployment/web readyReplicas>=3'
  | { kind: 'net'; expr: string }               // 例: 'reach shop.example:443'
  | { kind: 'container'; expr: string }         // 例: 'image:nginx:1.27 running:web'
  | { kind: 'http'; url: string; status: number; contains?: string } // contains: 返事の本文にその文字列がある
  | { kind: 'tls'; host: string; trusted: boolean }
  | { kind: 'sql'; query: string; equals: unknown }
  | { kind: 'answer'; equals: string }         // 原因などを答える形
  | { kind: 'sim'; expr: string };              // 画面で操作する模擬環境（模）の状態。式は 2.4.1（docs/decisions.md D-16）
```

- **判定は出力の文字列ではなく、模擬環境の状態で行う**
- `fs` の `/proc/<PID>` は、その PID のプロセスが動いている間だけ有る（本物の Linux と同じ）。プロセスを止めたことは `exists: false` で確かめる
- `net` の式は、端末の機械（setup の `network` の `self`）から見て判定する: `reach 名前[:ポート]`（行きも帰りも通る。ポートを書けば、そこで待ち受けている）/ `resolve 名前=アドレス`（名前の答え）/ `ssh 利用者@名前`（setup の `sshHosts` のサーバに、手元の秘密鍵で入った記録があり、今も鍵で入れて、サーバに秘密鍵が置かれていない。sec.b.04 の鍵の登録。`docs/decisions.md` D-17）。` && ` でつなぎ、先頭の `!` で否定
- `git` の式は、空白で区切った条件を全て満たせば達成。先頭の `!` で否定: `branch:枝`（ある。origin/main のようなリモートの枝の控えでもよい）/ `merged-into:枝`（前の `branch:` の枝の先が取り込まれている）/ `on:枝`（今いる枝）/ `clean`（記録していない変更が無く、取り込みの途中でもない）/ `commits:枝>=数` / `resolved`（衝突の印が無い）/ `committed:パス`（今の枝の先の記録に、作業ツリーと同じ中身で入っている）/ `pushed:枝`（手元の枝の先が origin のサーバ（setup の `gitServers`）の同じ枝に届いている）/ `linear`（今の枝の履歴に合流の記録が無い）/ `tag:名前`（そのタグが今の枝の先を指す）/ `ignored:パス`（.gitignore の決まりに当たる）/ `history:文字列`（今の枝の履歴のどこかの記録に、その文字列を含むファイルがある。消して記録し直しても前の記録に残る。秘密を履歴に入れていないことを `!history:` で確かめる）
- `container` の式は、端末の機械のコンテナの模型（`src/engines/container`）で判定する。空白で区切った条件を全て満たせば達成。先頭の `!` で否定: `image:名前:タグ`（手元にある。タグを省けば最新のタグ）/ `running:名前`・`exited:名前`（コンテナの状態）/ `exists:名前`（コンテナがある。消したことは `!exists:` で確かめる） / `volume:名前`（名前付きボリュームがある）/ `mount:コンテナ=つなぐ物[:中の場所]`（そのコンテナが、名前付きボリュームか手元の場所を、中のその場所につないでいる。中の場所を省けば、どこにつないでいてもよい）/ `rows:コンテナ/表=数`（DB のコンテナの、データを書く場所にある表の行の数。コンテナを作り直してもデータが残ったことを確かめる）/ `made:名前>=数`・`made:名前=数`（その名前でコンテナを作った回数。作り直したことを確かめる） / `network:名前`（網がある。決まって在る bridge・host・none か、自分で作った網）/ `on:コンテナ=網`（そのコンテナが網に入っている）/ `reach:A>B`（コンテナ A から B に名前で届く。どちらも動いていて、同じ自作の網にいる。既定の網 bridge では名前は引けない） / `from:コンテナ=名前:タグ`（そのイメージから作ったコンテナ）/ `pushed:住所/名前:タグ`（自分たちの置き場（setup の `registries`）にある）/ `login:住所`（その置き場にログインしている）。`@名前` を置くと、それより後ろの条件を、その頼む先（setup の `contexts`。`docker --context 名前`）の機械の Engine で判定する（`@default` で手元に戻る）
- `k8s` の式は、クラスタの状態で判定する（`src/engines/k8s/check.ts`）: `種類/名前` の後に、空白で区切った `欄 比べ方 値` を並べ、全てを満たせば達成（欄が無ければ、あるかどうか）。別の資源の条件は ` && ` でつなぐ。比べ方は `>=` `<=` `=`。名前空間は default。
  種類と欄: `deployment`（`replicas`・`readyReplicas`・`updatedReplicas`・`made`（その ReplicaSet が作った Pod の数。消された Pod を作り直したことを確かめる））/ `service`（`endpoints`（札の合う Ready の Pod の数）・`port`）/ `pod`（`ready`（Ready のコンテナの数）・`restarts`・`status`（`kubectl get pods` の STATUS と同じ語。`=` だけ））。
  クラスタを操作する機械（`k8s-cluster`）では、本物と同じく kubectl を打つたびに時間（2 秒）が流れて Pod の状態が進み、`kubectl get pods -w` は落ち着くまで状態の変化を 1 行ずつ見せる。取れるイメージは模擬の置き場にある物だけ（無ければ ErrImagePull）。setup の `cluster` には、Node の数（`nodes`）・制御の側（`controlPlane`）・止まった Node（`notReady`）・作ってからの日数（`ageDays`）・初めから在る物（`manifests`。マニフェストの YAML で、前から動いている形で置く）を書ける。Service の住所は名前から決め、窓口の `kubernetes` の Service は初めから在る。Deployment の Pod の名前は本物と同じ `名前-印-5 字` の形で、同じ操作からは同じ名前になる
- 最後のヒントは、そのまま入力すれば必ず通る（テストで確かめる）
  - 端末（`terminal`）: `` で囲んだコマンドを順に打つ
  - 模擬環境（`simulation`）: `` で囲んだ操作の文（2.4.1）を順に与える
  - 設定の編集（`editor`）: `` で囲んだ中身を、そのまま保存する（ファイル全体）。2.4.2
  - ブラウザ内 SQL（`sql`）: `` で囲んだ SQL を順に実行する。判定は `sql`（確かめる問い合わせの結果が `equals` と一致する）か、取り出すだけで DB を変えない手順（SELECT）は `answer`（端末と同じく、最後の物が答え）

### 2.4.1 模擬環境（模）の型

「模」の実戦は、5 つの型のどれかで作る（`docs/decisions.md` D-16）。`environment` に型を、`setup` に中身を書く。
模擬は純粋な TS（`src/engines/sim`）で、画面の操作と操作の文は同じ関数を通る。画面は `docs/ui-design.md` 7.1。

| `environment` | 操作 | 操作の文 | `setup` の中身 | 判定の式（`sim`） |
|---|---|---|---|---|
| `sim-connect`（つなぐ） | 部品・機器・サービスを線でつなぐ・外す。止まった機器を動かす。荷物を送って届くかを見る | `connect A B` / `cut A B` / `start A` / `send A B` | `nodes`（ID・名前・位置・止まっているか）・`links`（初めの線）・`forbid`（引けない線と、その理由の文）・`sends`（送れる組） | `link A B`（直接つながる）/ `path A>B>C`（順につながる）/ `reach A B`（動いている機器をたどって届く）/ `sent A B`（送った荷物が届いた） |
| `sim-order`（並べる） | 手順・段・層を並べる。同じ段に並べる（並行）。外す | `order A B,C D`（空白で次の段、`,` で同じ段） | `items`（ID・名前・かかる時間・先に要る物 `needs`・使わなくてよい物 `extra`） | `seq A<B<C`（段の順）/ `with A B`（同じ段）/ `has A` / `deps`（先に要る物が前の段にある）/ `time<=N`（各段の最も長い時間の合計）/ `placed`（`extra` でない物を全て並べた） |
| `sim-assign`（割り振る・仕分ける） | 札を枠に入れる・出す | `put 札 枠` / `take 札` | `slots`（ID・名前・容量・容量を超えた時のエラーの文 `full`）・`items`（ID・名前・大きさ・枠ごとの時間・複数の枠に入れられるか・`extra`） | `in 札=枠 …` / `count 枠<=N`（`=` `>=` も）/ `fits`（容量の内）/ `time<=N`（枠ごとの時間の合計）/ `placed` |
| `sim-config`（設定する） | 欄に値を選ぶ・入れる。表に行を足す・消す | `set 欄 値` / `add 表 列=値 …` / `del 表 番号` | `fields`（ID・名前・選べる値・初めの値・値を選ぶ前に満たす条件 `requires`（値・式・満たさない時に断る文））・`tables`（ID・名前・列・初めの行）・`settle`（出来上がりの式。無ければ全ての欄を変えた時） | `field 欄=値 …` / `row 表 列=値 …`（その行がある）/ `rows 表<=N`（`=` `>=` も）/ `samenet 欄 …`（全て「アドレス/区切り」で同じ網にあり、重ならず、網そのもの・全体宛てでない。欄の代わりに決まったアドレスも書ける）/ `pool 始め 終わり in=網 size>=N avoid=a,b`（配る範囲が網の中で、数が足り、固定のアドレスを含まない） |
| `sim-read`（読み取って答える） | 表・グラフ・ログ・情報を読み、問いに答える | `answer 問い 値` | `questions`（ID・問い・選べる値） | `answered 問い=値 …` |

- 全ての型で、`setup.panels` に画面に示す情報（表・グラフ・ログ・項目と値・文）を置ける（`sim-read` は必須）。
  情報に `when`（判定の式）を書くと、その式を満たす時だけ示す（操作の結果を見せる。例: 正しい文字コードを選ぶと本文が読める）
- 札を全て並べた・入れた、問いに全て答えた、欄を全て初めの値から変えた（設定するは `settle` の式を満たした）（出来上がり）のに達成条件を満たさない時は、
  「答えが合っていない」として、手順の想定エラー（`match` が「答えが合っていない」に当たる物）の原因候補を出す
- 式は ` && ` でつなげる。先頭に `!` を付けると否定（例: `!reach 外 db`）。値の比べ方は、前後の空白と英字の大小を無視する
- 操作の誤り（無い ID・容量を超える・引けない線・もう別の枠に入っている札など）は、エラーの文として返す。エラーの解説（2.5）が `match` で当たり、端末と同じ「エラー → 内容 → 原因候補 → ヒント」を出す
- ID は空白を含まない語（日本語でよい）。画面には名前を出し、操作の文には ID を書く

### 2.4.2 設定の編集（編）

「編」の実戦は、端末と同じ模擬環境（`environment` は端末の環境の ID、`setup` も端末と同じ形）の上で、1 つの設定ファイルを編集欄で書き換える。画面は `docs/ui-design.md` 7.1。

```ts
interface EditSetup {             // setup.edit（「編」の実戦では必須）
  path: string;                   // 編集するファイル。初めの中身は setup の files（無ければ空）
  apply: string[];                // 「保存して確かめる」で、保存の後に順に打つコマンド（設定の読み直しと確かめる依頼）
}
```

- 「保存して確かめる」は、編集欄の中身をファイル全体として保存し、`apply` のコマンドを順に打つ。打った行と出力を「確かめた結果」として示す
- 判定は端末と同じく、保存と `apply` の後の模擬環境の状態で行う。`apply` の出力のエラーには、端末と同じくエラーの解説（2.5）を当てる
- 最後のヒントの `` は 1 つで、ファイル全体の中身（複数の行）を書く

### 2.5 エラーの解説（errorGuides）

```ts
interface ErrorGuide {
  id: string;                    // 'enoent'
  match: string;                 // エラーメッセージに含まれる文字列か正規表現
  meaning: Rich;                 // エラー内容（何と言われたか）
  causes: Rich[];                // 原因候補（2〜3 個）
  hint: Rich;                    // 次に何を確かめるか
  terms?: string[];
  output?: boolean;              // 出力（標準出力）にも当てる
}
```

- エラーは、標準エラーに出た文に `match` を当てて探す（手順の想定エラーを先に、無ければ全ての解説から）
- HTTP の 4xx・5xx のように、失敗でも標準エラーに出ない物（curl は返事の本文と頭を出力に出す）は `output: true` にする。
  手順の想定エラー（`expectedErrors`）の時だけ、出力にも当てる（`systemctl status` の「failed」のような、出力のただの語でエラーにしない）

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
