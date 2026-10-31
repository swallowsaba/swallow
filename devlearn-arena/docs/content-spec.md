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
  facilities.json            施設の定義（見た目は src/city/assets、規則は docs/game-design.md）。公共サービス・発電所・褒賞の建物も（7.9）
  errors/<分野>.json         エラーの解説（errorGuides）
  politics/                  市政のデータ: 反対の理由と公聴会の答え・議員・請願・公約・新聞と説明の型の文・地区の名前（7 章）
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
  designedErrors?: string[];           // 見せるための失敗の ID（expectedErrors の中の物。手順の目的そのものが、その失敗を見て読むこと。2.4）
  actions?: SimAction[];               // 画面で操作する実戦（模）だけ: 最後のヒントで通る操作（2.4.1）
}
type CheckSpec =
  | { kind: 'fs'; path: string; exists?: boolean; contains?: string; lacks?: string[]; mode?: string } // lacks: どれも含まない（秘密の値が残っていない）。mode: 権限。'600' ならその値、'u+x'・'go-rwx' ならその権限が有る・無い
  | { kind: 'cwd'; equals: string }
  | { kind: 'mount'; path: string; device: string } // その場所に、その装置（/dev/vdb）が取り付いている
  | { kind: 'disk'; maxUse: number }            // ディスクの使用率（df の Use%）がこの値以下
  | { kind: 'service'; name: string; active?: boolean; enabled?: boolean; listen?: number; user?: string } // user: 動かしている利用者（ユニットファイルの User=。daemon-reload して動かし直すまで変わらない）
  | { kind: 'git'; expr: string }               // 例: 'branch:feature merged-into:main'
  | { kind: 'k8s'; expr: string }               // 例: 'deployment/web readyReplicas>=3'
  | { kind: 'net'; expr: string }               // 例: 'reach shop.example:443'
  | { kind: 'container'; expr: string }         // 例: 'image:nginx:1.27 running:web'
  | { kind: 'ci'; expr: string }                // 例: 'head run=success needs:deploy=unit,lint,e2e'
  | { kind: 'alert'; expr: string }             // 例: 'rules:rules/reserve.yml test:tests/yesterday.test.yml'
  | { kind: 'http'; url: string; status: number; contains?: string; header?: string; method?: string; data?: string; auth?: string } // contains: 返事の本文にその文字列がある。header: '名前: 値' の見出しがある（名前の大文字・小文字は問わず、値は同じ）。method・data: 頼み方（POST と送る中身）。auth: 送る Authorization の見出しの値
  | { kind: 'tls'; host: string; trusted: boolean }
  | { kind: 'sql'; query: string; equals: unknown; committed?: boolean } // committed: true はトランザクションの途中でない（COMMIT か ROLLBACK まで打った）、false は途中
  | { kind: 'ran'; uses: string[]; result?: string; shows?: string[] } // 端末で打った行が uses のコマンドを全て使い（パイプでつないでよい）、その結果（標準出力の全体）が result と同じ。shows: 出力にその行が全てある（result か shows のどちらかを書く）
  | { kind: 'answer'; equals: string }         // 答えの欄に入れる形。コマンドでは得られない値（読み取って考える値）を答える時だけ
  | { kind: 'sim'; expr: string };              // 画面で操作する模擬環境（模）の状態。式は 2.4.1（docs/decisions.md D-16）
```

- **判定は出力の文字列ではなく、模擬環境の状態で行う**
- **端末の実戦は、コマンドの実行の結果と模擬環境の状態で判定する。答えの欄は、コマンドでは得られない値を答える時だけ使う**（`docs/progress/urgent-03.md`）
  - 状態が変わる手順（作る・直す・動かす）は、その状態（`fs`・`service`・`container` など）で判定する
  - 数える・探す・取り出すなど、コマンドの結果そのものが目的の値になる手順は `ran` で判定する。正しいコマンドを打って正しい結果が出た時点で達成し、答えの欄は出さない。
    例: grep で行の数を数える → `{ "kind": "ran", "uses": ["grep"], "result": "3" }`（数え方は `| wc -l` でも `-c` でもよいので、`uses` には数える道具を書かない）。find でファイルを探す → `{ "kind": "ran", "uses": ["find"], "result": "/etc/app/app.conf" }`
  - `ran` は、打った 1 行の区切り（`;` `&&` `||`）のどれかが、`uses` のコマンドを全て使い（`sudo` の後ろのコマンドも数える）、その結果（標準出力の全体）が `result` と同じ時に満たす。
    比べ方は答えと同じ（行ごとの前後の空白・行の中の空白の続き・空の行・英字の大小・全角と半角を問わない）。標準エラーは比べない（読めない場所を飛ばした `Permission denied` が出ても、結果が正しければ満たす）。
    結果の一部だけが合う物（一覧の中に目的の値が混ざる）は満たさない
  - 数える手順（`result` が数）で、ファイルごとの数（`grep -c` の「名前:数」の行）を出した時は、その合計で比べる（`grep -rc`・`find … -exec grep -c … {} +`。VERIFY-FREE.txt【1】）
  - `shows` は、結果に他の行が混ざってよい手順に使う（詳しい形の一覧で、`ls -l` に `-a` を足すと `.` や隠しファイルの行も出る）。書いた行が全て出ていれば満たす。比べ方は `result` と同じ
  - ブラウザ内 SQL の実戦でも `ran` を使える。`uses` は文に出る SQL の語（大文字で書く。`'…'` の中は数えない。小文字で打っても同じ）、結果は返った表の行（列の名前は入れず、行ごとに値を空白で並べる）。
    例: 在籍の会員を数える → `{ "kind": "ran", "uses": ["COUNT"], "result": "15" }`（`SELECT 15` と数を書いただけでは満たさない）
  - `uses` のコマンドを全て使って結果を出したのに `result` と違う時は、手順の想定エラーに「答えが合っていない」に当たる解説があれば、それを出す（数え方・探し方の誤りの原因候補）。数える手順では、数（かファイルごとの数）を出した時だけ（一致した行を並べて見るのは調べる途中）。
    無ければ何も出さない（形を見るために同じ道具を打つのは、調べる途中）
  - 同じく、`fs` の手順で打った行が判定するファイル（`path`）へ書き出した（`>`・`>>`・`tee` の先がそのファイル）のに満たさない時と、設定の編集（編）で保存したのに満たさない時も、手順の想定エラーに「答えが合っていない」に当たる解説があれば、それを出す（書き出した中身・保存した中身の誤りの原因候補。VERIFY-FREE.txt【2】）。無ければ何も出さない
  - `answer`（答えの欄）は、表やログを読み取って選ぶ・考える値（どの行か・どの欄か・何が原因か）に使う。答えが、最後のヒントのコマンドの出力の全体と同じなら、その手順は `ran` にする（検証で見つける）
  - 答えの欄の比べ方は、前後の空白と英字の大小を問わず、全角の数字・英字・記号は半角と同じに見る（日本語の入力のまま答えてよい）。数の答えは後ろに単位を付けてよく（`3 バイト`）、場所の答えは最後の `/` を問わない（`/srv/report/out/`）
- `http` は端末の機械から頼んだ結果で判定する（`src/engines/http`）。Web サーバの設定（nginx の `add_header`）や、アプリの設定（php.ini の `session.cookie_path` など。アプリを動かした時に読む）を直した結果を、返事の見出し（`header`）で確かめられる。例: `{ "kind": "http", "url": "http://port.example/", "status": 200, "header": "Cache-Control: no-cache" }`
- `fs` の `/proc/<PID>` は、その PID のプロセスが動いている間だけ有る（本物の Linux と同じ）。プロセスを止めたことは `exists: false` で確かめる
- `net` の式は、端末の機械（setup の `network` の `self`）から見て判定する: `reach 名前[:ポート]`（行きも帰りも通る。ポートを書けば、そこで待ち受けている）/ `resolve 名前=アドレス`（名前の答え）/ `ssh 利用者@名前`（setup の `sshHosts` のサーバに、手元の秘密鍵で入った記録があり、今も鍵で入れて、サーバに秘密鍵が置かれていない。sec.b.04 の鍵の登録。`docs/decisions.md` D-17）。` && ` でつなぎ、先頭の `!` で否定
- `git` の式は、空白で区切った条件を全て満たせば達成。先頭の `!` で否定: `branch:枝`（ある。origin/main のようなリモートの枝の控えでもよい）/ `merged-into:枝`（前の `branch:` の枝の先が取り込まれている）/ `on:枝`（今いる枝）/ `clean`（記録していない変更が無く、取り込みの途中でもない）/ `commits:枝>=数` / `resolved`（衝突の印が無い）/ `committed:パス`（今の枝の先の記録に、作業ツリーと同じ中身で入っている）/ `pushed:枝`（手元の枝の先が origin のサーバ（setup の `gitServers`）の同じ枝に届いている）/ `linear`（今の枝の履歴に合流の記録が無い）/ `tag:名前`（そのタグが今の枝の先を指す）/ `ignored:パス`（.gitignore の決まりに当たる）/ `history:文字列`（今の枝の履歴のどこかの記録に、その文字列を含むファイルがある。消して記録し直しても前の記録に残る。秘密を履歴に入れていないことを `!history:` で確かめる）
- `container` の式は、端末の機械のコンテナの模型（`src/engines/container`）で判定する。空白で区切った条件を全て満たせば達成。先頭の `!` で否定: `image:名前:タグ`（手元にある。タグを省けば最新のタグ）/ `running:名前`・`exited:名前`（コンテナの状態）/ `exists:名前`（コンテナがある。消したことは `!exists:` で確かめる） / `volume:名前`（名前付きボリュームがある）/ `mount:コンテナ=つなぐ物[:中の場所]`（そのコンテナが、名前付きボリュームか手元の場所を、中のその場所につないでいる。中の場所を省けば、どこにつないでいてもよい）/ `rows:コンテナ/表=数`（DB のコンテナの、データを書く場所にある表の行の数。コンテナを作り直してもデータが残ったことを確かめる）/ `made:名前>=数`・`made:名前=数`（その名前でコンテナを作った回数。作り直したことを確かめる） / `network:名前`（網がある。決まって在る bridge・host・none か、自分で作った網）/ `on:コンテナ=網`（そのコンテナが網に入っている）/ `reach:A>B`（コンテナ A から B に名前で届く。どちらも動いていて、同じ自作の網にいる。既定の網 bridge では名前は引けない） / `from:コンテナ=名前:タグ`（そのイメージから作ったコンテナ）/ `pushed:住所/名前:タグ`（自分たちの置き場（setup の `registries`）にある）/ `login:住所`（その置き場にログインしている）/ `body:コンテナ~文字列`（動いているコンテナが答える中身に、その文字列がある）/ `log:コンテナ~文字列`（コンテナの記録（`podman logs`・`docker logs`）に、その文字列がある）/ `changed:コンテナ`（中で書いた物が書き込みの層にある。`podman diff` に出る）/ `published:コンテナ[=手元のポート]`（手元のポートに公開している）/ `cached:名前:タグ=語`（そのイメージを作った時、その語を含む命令の段を前に作った物から使い回した）。機械のコンテナの道具は setup の `containerCli`（`docker` か `podman`。無ければ `docker`。`podman` の機械には `docker` が無く、`podman` は本体を持たず利用者の権限で動かす）。`@名前` を置くと、それより後ろの条件を、その頼む先（setup の `contexts`。`docker --context 名前`）の機械の Engine で判定する（`@default` で手元に戻る）
- `ci` の式は、GitHub Actions の実行の記録と配る先（`src/engines/cicd`）で判定する。相手は今いるリポジトリの origin の置き場。空白で区切った条件を全て満たせば達成。先頭の `!` で否定。手順の文字の空白は `+` で書く: `head`（一番新しい実行が、手元の今の記録を push して動いた物）/ `run=結果`・`run:ワークフロー=結果`（一番新しい実行の結果 `success`・`failure`）/ `job:job=結果`（`success`・`failure`・`skipped`）/ `step:job/文字=結果`（名前か `run`・`uses` にその文字を含む手順の結果）/ `has:job/文字`（その job の手順に、その文字を含む物がある）/ `order:job=文字,文字,…`（その順にある）/ `needs:job=job,job`（順は問わない）/ `elapsed<=分`（`4m30s` の形も書ける）/ `artifact:名前`（上げた成果物）/ `got:job=名前`（受け取った成果物）/ `deployed:名前=版`・`release:名前~文字`・`kept:名前=版`（配る先の今の版・その中身・置いてある版）。
  実行は、setup の `gitServers[].forge.actions` がある置き場に `git push` すると動く: push した記録の `.github/workflows/*.yml` を本物の書き方で読み（読めなければ `Invalid workflow file` の失敗の実行）、`on.push.branches` に合う物を、job の `needs` の順に動かす（依存しない job は同じ時刻に並ぶ）。job ごとに新しい runner の機械を作り、`actions/checkout`・`actions/setup-node`・`actions/upload-artifact`・`actions/download-artifact` と、`run` の行（本物のシェル、`bash -e`）を動かす。`if: failure()`・`always()` の手順・job は、失敗の後も動く。
  `actions` に書く物: `firstRun`（初めの実行の番号）・`installSeconds`（`npm ci`・`npm install` にかかる秒）・`packages`（部品の置き場。名前 → 版と出た時刻。`npm install` は範囲に合う、その時刻に出ている一番新しい版を入れる）・`scripts`（package.json の scripts の名前 → 振る舞い: `build`（`sources` を束ねて `bundle` に書く）・`test`（`faults` のファイルの中身の条件に当たれば失敗）・`deploy`（`out` を配る先の新しい版にする）・`rollback`・`prune`、かかる秒・出力。書いていない script は中身をシェルで動かす）・`sites`（配る先。`https://名前/` で答え、今の版の中身の条件（`faults`）で道の答えが替わる。端末の機械と runner の curl から届く）。`gh run list`・`gh run view [--log | --log-failed]`・`gh run watch` は本物の gh の出し方で読む
- `alert` の式は、端末の機械のファイル（Prometheus の規則のファイルと、その単体テストのファイル）で判定する（`src/engines/monitor`）。空白で区切った条件を全て満たせば達成。先頭の `!` で否定。パスは端末の今いる場所から: `rules:規則のファイル`（`promtool check rules` が通る）/ `test:テストのファイル`（`promtool test rules` が通る。鳴った時刻・ラベル・注釈が期待と全て同じ）/ `times:テストのファイル`（期待を書いた全ての時刻で、鳴っているアラートの数が期待と同じ。ラベルと注釈は問わない）/ `fire:テストのファイル@時刻=名前`（その時刻（`10h3m` の形）に、その名前のアラートが鳴っている）。
  規則は本物の書式（`groups` の下の `alert`・`record`・`expr`・`for`・`labels`・`annotations`）で、式は PromQL の一部（時系列の選び出しとラベルの条件・四則・比べ・かっこ。関数と集計は読めない式として断る）。アラートは、式の結果に出た時系列ごとに待ち（pending）になり、`for` の間ずっと出続けたら鳴る（firing）。テストのファイルは本物の `promtool test rules` の書式（`rule_files` はテストのファイルの場所から読む・`input_series` の `0.005x602 0.12` の書き方・`alert_rule_test` の `exp_alerts`）。`promtool check rules`・`promtool test rules`・`amtool config routes [show | test]`（Alertmanager の `route` と `receivers` の振り分け）は本物の出し方で答える
- `k8s` の式は、クラスタの状態で判定する（`src/engines/k8s/check.ts`）: `種類/名前`（区画は `@区画` を後ろに付ける。省けば default）の後に、空白で区切った `欄 比べ方 値` を並べ、全てを満たせば達成（欄が無ければ、あるかどうか）。別の資源の条件は ` && ` でつなぐ。比べ方は `>=` `<=` `=`（語の欄は `=`）。比べ方と値を書かない欄は、値があるかどうか（例: `deployment/web from.DB_HOST`）。
  種類と欄: `deployment`（`replicas`・`readyReplicas`・`updatedReplicas`・`made`（その ReplicaSet が作った Pod の数。消された Pod を作り直したことを確かめる）・`env.名前`（Ready の Pod の全てが持つ、その環境変数の値。Pod を動かした時に引いた値で、Pod ごとに違えば `<mixed>`）・`from.名前`（その環境変数を、設計図の最初のコンテナが受け取る ConfigMap か Secret の名前。直接書いた env が勝つ時は無い）・`readyUpdated`（今の設計図の Pod のうち Ready の数。入れ替えが止まっている間も残る古い Pod の Ready は数えない）・`restarts`（今の設計図の Pod の、作り直した数の合計）・`early`（今の設計図の Pod が、アプリの読み込みの途中で Ready だった秒数の合計。readiness の確かめが無いと増える）・`rows.表`（Ready の Pod の DB（PostgreSQL のイメージ）の、その表の行の数。データを書く場所に PVC を付けていれば PV から、無ければ Pod の書き込みの層から読む）・`image`（今の設計図の最初のコンテナのイメージ。`=` だけ）・`tried`（その Deployment の世代（残っている ReplicaSet）が使ったイメージ。`=` で、その中にあるか。壊れた版を一度配ってから戻したことを確かめる））/ `service`（`endpoints`（札の合う Ready の Pod の数）・`port`）/ `pod`（`ready`（Ready のコンテナの数）・`restarts`・`status`（`kubectl get pods` の STATUS と同じ語。`=` だけ）） / `namespace`（区画がある） / `pvc`（`status`（`Bound`・`Pending`。`=` だけ）・`volume`（結ばれた PV の名前）） / `hpa`（`target`（目標の CPU 使用率 %）・`min`・`max`・`cpu`（今の使用率 %。要求が無いなど測れない間は無い）・`replicas`（最後に見た数。`get hpa` の REPLICAS））。
  クラスタを操作する機械（`k8s-cluster`）では、本物と同じく kubectl を打つたびに時間（2 秒）が流れて Pod の状態が進み、`kubectl get pods -w` は落ち着くまで状態の変化を 1 行ずつ見せる。取れるイメージは模擬の置き場にある物だけ（無ければ ErrImagePull）。setup の `cluster` には、Node の数（`nodes`）・制御の側（`controlPlane`）・止まった Node（`notReady`）・作ってからの日数（`ageDays`）・初めから在る区画（`namespaces`）・初めから在る物（`manifests`。マニフェストの YAML で、前から動いている形で置く）・少し前に入れた物（`recent`。1 分前に入れた形で置き、その間の動き（止まる・置けない）と知らせを残す）・入れてある入口の係（`ingress: { address }`。ingress-nginx が種類 nginx の Ingress を受け持ち、その住所に外の住所を書く）を書ける。Service の住所は名前から決め、窓口の `kubernetes` の Service は初めから在る。Deployment の Pod の名前は本物と同じ `名前-印-5 字` の形で、同じ操作からは同じ名前になる。`kubectl apply` は本物と同じく、無ければ created、書いた形が変われば configured、同じなら unchanged と言う。ConfigMap・Secret から受け取る環境変数は、Pod のコンテナを動かした時に引く（後から ConfigMap を変えても、Pod を作り直すまで変わらない）。参照先が無ければ CreateContainerConfigError で待つ。`kubectl rollout status` は入れ替えが終わるまで時間を進めて待ち、600 秒で終わらなければ期限を過ぎたと言う。Pod の中で書いた物は、本物と同じく PVC で付けた場所なら PV に残り、それ以外はコンテナの書き込みの層に入って Pod を作り直すと消える。予約の DB のイメージ（`city-db:1.0`）は、データを書く場所が空なら最初の表を作り、`kubectl exec … -- psql -U postgres -d 名前 -c "文"` で数え・足せる（文の形は Docker の模擬と同じ）。PVC は、大きさ・使い方・種類（`storageClassName`）の合う PV と結ばれ、合う物が無ければ Pending のままで、付けた Pod も置けない。PVC の中身は作った後に変えられない（本物と同じく断られる）。入口の係の住所（`/etc/hosts` で名前が指す住所か、住所そのもの）の 80 番に `curl` で頼むと、Ingress の規則（名前が合う物の中で Exact、次に一番長い道）で Service に振り分け、Ready の Pod のイメージが答える（置き場のイメージの `serves`）。合う規則が無ければ 404、宛先の Service が無い・Ready の Pod が無ければ 503、Pod がそのポートで待ち受けていなければ 502。`-H 'Host: 名前'` で名乗る名前を変えられる。置き場のイメージのうち、待ち受けるまでの秒数（`serves.warmup`）を持つアプリ（`city-guide:1.0`）は、本物の確かめ（`livenessProbe`・`readinessProbe` の `httpGet`）で見る: 確かめは `initialDelaySeconds` 後から `periodSeconds` ごとにその道とポートに頼み、`failureThreshold` 回続けて失敗すると、readiness は Ready を外し、liveness はコンテナを作り直す（続くと CrashLoopBackOff）。失敗は本物と同じ文で describe の Events に出る。`kubectl exec … -- kill -STOP 1` でアプリを止め（頼みに答えない）、`kill -CONT 1` で戻せる。`kubectl get pods -w` は、確かめの失敗が続く・止められた・作り直しを待つ Pod がある間は、変わるまで（180 秒まで）見続ける。Pod の CPU とメモリの使用量は、本物の metrics-server と同じく 15 秒ごとに測る（`kubectl top pods`。動き出してから一度も測っていない Pod は出ない）。置き場の `city-crowd:1.0`（環境変数 `TARGET_URL` の Service に頼みを送り続ける道具）が動いている間、その Service の Ready の Pod に CPU の仕事を等しく分ける。`kubectl autoscale` で作る HPA は、本物と同じく 15 秒ごとに使用率（使用量 ÷ 要求（requests））を目標と比べて数を決め（1 回に 2 倍か 4 つまで・min と max の間）、要求の無いコンテナがあれば計算できない（`get hpa` の TARGETS が `<unknown>`）。減らす時は、過去 5 分の計算の一番大きい数を保つ。`kubectl get hpa -w` は欄が変わるたびに 1 行足し、落ち着くまで（420 秒まで）見続ける。要求（requests）がどの Node の空き（Allocatable から、載っている Pod の要求を引いた量）にも入らない Pod は Pending のままで、本物と同じ文の FailedScheduling（`Insufficient cpu` など）を知らせる。メモリの上限（`limits.memory`）より多く使うアプリ（置き場のイメージのプロセスの量）は、本物と同じくカーネルに止められ（OOMKilled・終了コード 137）、作り直しは、すぐ・10 秒・20 秒…と延びる（CrashLoopBackOff）。`kubectl get events` は本物の欄で、`--field-selector type=Warning` などで絞れる。Deployment の入れ替え（RollingUpdate）は本物の deployment controller と同じ数え方をする: `maxSurge`・`maxUnavailable` は数か割合（既定はどちらも 25%。増やす側は切り上げ・減らす側は切り捨て）で、新しい側は全体が「あるべき数 + maxSurge」を超えない分だけ増やし、古い側は Ready の数が「あるべき数 − maxUnavailable」を割らない分だけ減らす（古い側の Ready でない Pod は先に減らす）。Ready にならない版では古い Pod を残して止まり、最後に進んでから 600 秒で期限を過ぎる（`rollout status` は本物の文で失敗し、describe の Progressing は ProgressDeadlineExceeded）。`kubectl set image` は変えた理由（change-cause）を書かない。`kubectl rollout history` は本物の形（`--revision=N` でその世代の Pod の雛形）、`kubectl rollout undo` は 2 番目に新しい世代（`--to-revision=N` で指定）の設計図を書き戻し、その ReplicaSet を使い直して番号を最大 + 1 に付け替える（今と同じなら skipped rollback）。同じ物・同じ理由・同じ文の知らせは、本物と同じく 1 つにまとめて回数を数える
- **本物の道具を使う**（`docs/learning-design.md` 6 章の原則 1）。その分野に本物のコマンドや操作があるなら、実戦は端末（`terminal`）・設定の編集（`editor`）・ブラウザ内 SQL（`sql`）で作り、架空の文を作らない。
  git の実戦には git、Kubernetes には kubectl、Docker には docker、Web には curl、ネットワークには ping・dig・ip・ss・traceroute、DB には SQL が出る。
  画面で操作する模擬環境（`simulation`）は、打つコマンドが存在しない概念（コンピュータの仕組み・層への仕分け・構成図・流れの設計など）だけに使う
- 最後のヒントは、そのまま入力すれば必ず通る（テストで確かめる）
  - 人と同じ順に、画面と同じ関数（`afterCommand`）で通して確かめる（前の手順の操作で満たした手順は飛ばす）。その時に出るエラーの案内は、**その手順で見せるための失敗（`designedErrors`）で、その手順の間に、本当に失敗した命令（終了の状態が 0 でない）の物だけ**にする（衝突・拒否・届かないことを見せる手順。`docs/progress/verify-all.md` の C2）。うまくいった命令（様子を見る `git status`・確かめの `nmap`）の出力に、出力に当てる解説が当たってはいけない。前の手順の確かめの行が、次の手順の案内を出してもいけない
  - 想定した失敗を最後のヒントで打たせる時は、そこで失敗することも書く（「`kubectl drain node-2` を打つ。手で置いた Pod があると断られるので、続けて …」）。言われたとおり打ったのにエラー、と迷わせない
  - 手順の目的そのものが、失敗を見て読むこと（衝突・拒否・届かない・止まる所を見る）の時は、その失敗の解説の ID を `designedErrors` に書く（`expectedErrors` にも書く）。
    目的の文のとおりに打つと失敗する手順（最後のヒントは先に直すので失敗しない物）も書く。その案内が出た時、画面は「想定どおりのエラー」と言い、打ち直しではなく目的の続きへ促す（`docs/learning-design.md` 7 章）
  - 端末（`terminal`）: `` で囲んだコマンドを順に打つ。答える手順（`answer`）は、最後の `` が答え。`ran` の手順は、出る結果を `` で囲まずに書く（「3 と出れば達成」）
  - 模擬環境（`simulation`）: 「何をどこへ置く・つなぐ・並べる」を日本語で書く（打つ文を書かない）。同じ意味の操作を手順の `actions` に書き、テストは画面の操作と同じ関数に与えて確かめる（2.4.1）
  - 設定の編集（`editor`）: `` で囲んだ中身を、そのまま保存する（ファイル全体）。2.4.2
  - ブラウザ内 SQL（`sql`）: `` で囲んだ SQL を順に実行する。判定は `sql`（確かめる問い合わせの結果が `equals` と一致する）。取り出すだけで DB を変えない手順（SELECT）は、結果そのものが目的の値なら `ran`（数える `COUNT(*)` など）、結果を読み取って考える値なら `answer`（端末と同じく、最後の物が答え）

### 2.4.1 模擬環境（模）の型

「模」の実戦は、打つコマンドが存在しない概念だけに使い（2.4）、次の 4 つの型のどれかで作る（`docs/decisions.md` D-16、`REWORK-PRACTICE.txt`）。
`environment` に型を、`setup` に中身を書く。模擬は純粋な TS（`src/engines/sim`）で、画面の操作と最後のヒントの再生は同じ関数（`applyAction`）を通る。画面は `docs/ui-design.md` 7.1。

画面の操作は、**ドラッグして置く・ドラッグしてつなぐ・ドラッグして並べ替える** の 3 つだけ。押すだけで済む物（選ぶ・送る・動かす）はボタンでよいが、何をするボタンかが文字で分かること。
**文を打つ入力欄は作らない**（文で操作する欄・操作の文の記録は無い）。

| `environment` | 画面の操作 | 操作（`actions` に書く形） | `setup` の中身 | 判定の式（`sim`） |
|---|---|---|---|---|
| `sim-connect`（つなぐ） | 点（部品・機器・サービス）から点へドラッグして線を引く。線を押すと外れる。止まった機器の「動かす」を押す。「送る」のボタンを押して届くかを見る | `{op:'connect',a,b}` / `{op:'cut',a,b}` / `{op:'start',node}` / `{op:'send',from,to}` | `nodes`（ID・名前・位置・止まっているか）・`links`（初めの線）・`forbid`（引けない線と、その理由の文）・`sends`（送れる組と、ボタンの文。確かめる本物の道具があれば、その名を書く: 「ping サーバ」） | `link A B`（直接つながる）/ `path A>B>C`（順につながる）/ `reach A B`（動いている機器をたどって届く）/ `sent A B`（送った荷物が届いた）/ `up A` |
| `sim-order`（並べる） | 札をドラッグして、上から順に並べ替える。同じ段に落とすと並行（`parallel` の時）。置き場へドラッグすると外れる | `{op:'arrange',stages:[[A],[B,C],[D]]}`（並べ替えた後の並び。上の段から） | `items`（ID・名前・かかる時間・先に要る物 `needs`（`a|b` は、どれか 1 つが前の段にあればよい）・流れに入れると止まる理由 `stop`・使わなくてよい物 `extra`）・`unit`（時間の単位。無ければ分）・`initial`（初めの並び） | `seq A<B<C`（段の順）/ `with A B`（同じ段）/ `has A` / `deps`（先に要る物が前の段にある）/ `time<=N`（各段の最も長い時間の合計）/ `stages<=N` / `placed`（`extra` でない物を全て並べた） |
| `sim-assign`（置く・仕分ける） | 札を枠へドラッグして入れる。枠から別の枠へドラッグすると移り、置き場へドラッグすると戻る | `{op:'put',item,slot}` / `{op:'take',item}` | `slots`（ID・名前・容量・容量を超えた時の文 `full`）・`items`（ID・名前・大きさ・枠ごとの時間・複数の枠に入れられるか `multi`・入らない枠と理由 `refuse`・動かせない理由 `keep`・`extra`）・`initial`・時間の合計の見出しと単位 `timeLabel`・`timeUnit` | `in 札=枠 …` / `count 枠<=N`（`=` `>=` も）/ `fits`（容量の内）/ `time<=N`（枠ごとの時間の合計）/ `placed` |
| `sim-read`（読み取って答える） | 表・グラフ・ログ・情報を読み、問いの答えを押して選ぶ。読む所を押すと、その部分が拡大・強調される | `{op:'answer',question,value}` | `questions`（ID・問い・選べる答え 2 つ以上） | `answered 問い=値 …` |

- 全ての型で、`setup.panels` に画面に示す情報（表・グラフ・ログ・項目と値・文）を置ける（`sim-read` は必須）。
  情報に `when`（判定の式）を書くと、その式を満たす時だけ示す（操作の結果を見せる。例: 荷物が届くとサーバの返事が出る）
- **操作の結果は動きで見せる**（`docs/ui-design.md` 7.1）。そのために、並べるの札には先に要る物（`needs`）か止まる理由（`stop`）を書き、
  順が違う時に流れが止まる段と理由が出るようにする。置くの札には、入らない枠の理由（`refuse`）を書いてよい
- 札を全て並べた・入れた、問いに全て答えた（出来上がり）のに達成条件を満たさない時は、
  「答えが合っていない」として、手順の想定エラー（`match` が「答えが合っていない」に当たる物）の原因候補を出す。置くは、置き違えた札（達成条件の `in` と違う枠にある札）を赤く示す
  - 並べるの出来上がりは、手順の式に出てくる札（否定の条件を除く）と、並んだ札が先に要る札（`needs`）が全て並んだ時（下の段から置く途中で知らせない）。後の手順で使う札が置き場に残っていてもよい（1 つ目の手順は初めの 3 段だけを並べる、など）。式に `placed` があれば、全ての札が並んだ時（VERIFY-FREE.txt【2】）
  - 並べ直しの途中は知らせない: 札を置き場へ戻した操作の後と、置くで達成条件の 1 つ（札 1 枚ずつに分けた `in`・`!in`）を満たして、どの条件も崩さなかった操作の後（強い札を先に入れてから、初めから入っている弱い札を戻す、など。`src/engines/sim/sim.ts` の `settledAfter`。VERIFY-FREE.txt【1】）
- 式は ` && ` でつなげる。先頭に `!` を付けると否定（例: `!reach 外 db`）。値の比べ方は、前後の空白と英字の大小を無視する
- 操作の誤り（容量を超える・入らない枠・引けない線・届かない荷物など）は、画面の名前で言い表したエラーの文として返す。エラーの解説（2.5）が `match` で当たり、端末と同じ「エラー → 内容 → 原因候補 → ヒント」を出す
- ID は空白を含まない語（日本語でよい）。式と `actions` に書く。画面には名前だけを出す（ID は出さない）
- **左の目的と右の画面を結び付ける**（`docs/learning-design.md` 6 章の原則 5）。目的・手順の文に出てくる物の名前は、画面の名前（`label`）とそのまま同じにする
- 最後のヒントは「「予約のアプリ」を「箱（イメージ）」へドラッグして入れる」のように、画面の名前を「」で囲んで書く。`actions` に出てくる物の名前（つなぐ・置く物と枠の名前、並べる札の名前、送るボタンの文、選ぶ答え）が全て書いてあることを検証で確かめる

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
  outputOf?: string;             // 出力に当てるのは、この形の行（正規表現）を打った時だけ。'\bgit\b.*\bcommit\b'
  skipped?: string;              // 飛ばして続けたことを言うエラーの行（正規表現）。'^(grep|find|du|ls): .+: Permission denied$'
}
```

- **エラーの解説は、コマンドが目的を果たせなかった時だけ出す。警告や、読めない場所を飛ばしただけの時は出さない**（`docs/learning-design.md` 7 章。判定は `src/learning/practice.ts` の `failedCommand`）
  - 終了の状態が 0 なら出さない（標準エラーの文は警告や途中経過）
  - 0 でなくても、結果（標準出力）が出ていて、エラーの行が全ていずれかの解説の `skipped` に当たれば出さない
  - 1 行に `;` `&&` `||` で並べた時は区切りごとに確かめる。後ろが `||` の物は数えない
  - 終了の状態の無い操作（画面の操作・SQL・保存の後の確かめで打つ行の標準エラー）は、エラーの文があれば出す
- エラーは、目的を果たせなかった命令の標準エラーに `match` を当てて探す（手順の想定エラーを先に、無ければ全ての解説から）
- 想定エラー（`expectedErrors`）は、出会うかもしれないエラーの解説を先に当てるための物。そこに書いても、目的を果たした命令では案内を出さない
- HTTP の 4xx・5xx のように、失敗でも標準エラーに出ない物（curl は返事の本文と頭を出力に出す）は `output: true` にする。`output: true` の解説は、うまくいった（終了の状態が 0 の）命令が標準エラーに出した文にも当てる（パスワードを聞かれて入れた `ssh` の `'s password:`。鍵で入っていないことを知らせる。VERIFY-FREE.txt【2】）。
  手順の想定エラー（`expectedErrors`）の時だけ、出力にも当てる（`systemctl status` の「failed」のような、出力のただの語でエラーにしない）
- 同じ文を、様子を見るだけの命令も出す時は `outputOf` に、案内を出す命令の形を書く。`git status` も `git commit` と同じ「nothing added to commit」を出すが、記録しようとしていないので案内を出さない（`git-nothing-added` は `git … commit` の時だけ）。どの機械から調べたかで意味が変わる時も同じ（来客の網から 445 番に届くのは誤りだが、社内の `pc1` から届くのは正しい。`net-seg-same` は `ip netns exec guest` の時だけ）

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
- 全実戦の最後のヒントを模擬環境で実行すると、達成条件を満たす（画面で操作する実戦は、手順の `actions` を画面と同じ関数に与える。最後のヒントに打つ文が無く、`actions` の物の名前が全て書いてある）
- 全実戦の最後のヒントを、人と同じ順に画面と同じ関数で通すと、全ての手順を満たし、出るエラーの案内は想定した失敗だけ（2.4）
- 押す図（理解の「図を押す」に使える図）の部分は、押せる所が、後に描いた物に覆われていない（押せる面の無い線と字だけの部分は、画面が描いた物ごとに 24×24 まで広げた透明な面を敷く）
- `docs/curriculum.md` の表にあるレッスン ID と、`docs/lessons/` の設計と、`content/lessons/` のファイルが一致する（公開範囲のもの）

市政のデータ（7 章）は、`src/content/politics.test.ts` で次を確かめる。

- 全ファイルが型の通り（zod）
- 申請の対象になる全ての種類（IT 施設 15・公共サービス 4・発電所 2・褒賞の建物 5・アップグレード・用途地域の変更の 4 つの区画）に、反対の理由が 2 つ以上ある
- **全ての理由に、`requires` の無い譲歩が 1 つ以上ある**（スキルが無くても通せる道。`docs/game-design.md` 20 章）。その譲歩のどれかが、理由の `measure` の元の値を下げる（騒音の理由なら `noise` か `nightNoise` か `height`）
- 譲歩の `mods` の名前が 7.1.1 の表にある。`misconception` が 0〜0.8
- IT 施設の理由は、その施設の分野（`docs/curriculum.md` 1 章の対応）か関連の分野の説明を持ち、`sound` の説明が段階 1〜2 に 1 つ以上と段階 3 に 1 つ以上ある（学ぶと答えが増えることを保つ）
  - 関連の分野は、`docs/curriculum.md` 3.2 の表のその分野の「推奨前提」と「関連」（trouble は全分野、lab はどの分野でもよい）。技術の代案の `requires` の分野も同じ
  - IT 施設の理由は、技術の代案（`requires` の段階 4 以上の譲歩）を 1 つ以上持つ（`docs/learning-design.md` 12.2 の段階 4〜5。G7）
  - 説明の `text` と `why` を、理由どうしで使い回さない
- `wrong` と `partial` の説明に `lesson` がある。理由の `lessons`・説明の `lesson` のレッスン ID が存在する
- 本文に出る用語がすべて用語集にある
- 議員がちょうど 7 人で、7 つの論点のそれぞれが、ちょうど 1 人の主な論点になっている
- 請願の `when` と公約の `goal` が 7.7 の式として読める。公約に学習の語が無い
- 新聞の型の文が全ての `NewsKind` にあり、差し込む名前がその種類で入る物だけ。説明の型の文が全ての要因と原因の種類にある
- `facilities.json` の公共サービス・発電所・褒賞の建物の値が、`docs/game-design.md` の表と一致する

## 7. 市政のデータ

都市の模擬と市政（`docs/game-design.md` 13〜27 章、`docs/decisions.md` D-20）の中身。アプリ本体を改修せずに、反対の理由・答え・議員・請願・公約・記事を足せるように、データとして `content/politics/` に置く。
規則と数値は game-design、プレイヤー側の記録（どの手を出したか）は `docs/data-model.md` 10・11 章が決める。ここは**作る側が書くデータの形**だけを決める（D-06 と同じ分け方）。

```text
content/politics/
  objections/<申請の種類>.json   反対の理由と、譲歩・説明（7.1）。datacenter.json・rezone-industrial.json など
  council.json                   議員 7 人（7.2）
  petitions.json                 請願（7.3）
  pledges.json                   公約の候補（7.4）
  news.json                      新聞の型の文（7.5）
  explain.json                   平易な言葉の説明と、議員の判断の 1 行の型の文（7.6）
  names.json                     地区の名前の部品（7.8）
```

### 7.1 反対の理由（公聴会の論点）と、出せる答え

```ts
interface ObjectionReason {
  id: string;                     // 'dc-night-noise'
  title: string;                  // 「夜間の騒音」（論点の名前。画面と新聞に出る）
  targets: string[];              // 立つ申請: 施設の種類（'datacenter'）・'upgrade:datacenter'・'rezone:industrial'・'civic:power-thermal' など
  group: GroupId;                 // 'neighbors' | 'merchants' | 'environment' | 'taxpayers' | 'workers'（docs/game-design.md 16.1）
  issue: IssueId;                 // 議員が見る論点: 'afford' | 'environment' | 'jobs' | 'finance' | 'safety' | 'traffic' | 'tech'（同 18.1）
  measure: Measure;               // 強さの計算（同 16.2）
  radius?: number;                // 影響の半径（マス）。都市全体の集団（environment・taxpayers）は書かない
  misconception: number;          // 誤解から来る割合（0〜0.8。説明で下げられる上限。同 17.2）
  claim: Rich;                    // 反対する側の言い分（1〜2 文）。その分野の実務の論点として書く
  concessions: Concession[];      // 1 つ以上
  explanations: Explanation[];    // 0 個以上
  lessons: string[];              // この論点を学べるレッスン（1 つ以上。公聴会の「この論点を学ぶ」）
}
type Measure =
  | { kind: 'noise'; night?: boolean }         // 騒音の増え方（night: 夜も動く施設の夜の騒音）
  | { kind: 'power' }                          // 電力の余裕
  | { kind: 'jobs-density' }                   // 雇用の少なさ
  | { kind: 'sunlight' }                       // 日照
  | { kind: 'traffic' }                        // 交通の増え方
  | { kind: 'rent' }                           // 地価・家賃の上がり方
  | { kind: 'trait'; trait: ModKey }           // 施設の性質の値（冷却水の量など。7.1.1）
  | { kind: 'service-load'; service: 'police' | 'fire' | 'school' | 'clinic' }  // 公共サービスの負担（定員の余りが減る割合）
  | { kind: 'cost' };                          // 費用
interface Concession {
  id: string;
  label: string;                  // 「夜間（22 時〜6 時）の重い処理を止める」
  mods: Partial<Record<ModKey, number>>;       // 申請の性質に掛ける倍率（height だけは足す段の数）。7.1.1
  cost?: { ratio?: number; fixed?: number };   // 費用（建てた費用に対する割合か、決まった額）。財布は建物の物（docs/game-design.md 2 章）。ratio の負の値は費用が下がる（規模を小さくする譲歩）
  loss?: Rich;                    // 効果が落ちる中身（「技術力への効きが 2 割下がる」）。mods から作れる物は書かなくてよい
  requires?: { domain: DomainId; stage: 1 | 2 | 3 | 4 | 5 };  // 技術の代案（同 20 章）。書いた物は、その分野のスキル段階がその段階以上の時だけ出る
}
interface Explanation {
  id: string;
  domain: DomainId;               // どの分野の知識で言える説明か
  stage: 1 | 2 | 3 | 4 | 5;       // 出せるスキル段階（同 17.2・20 章）
  text: Rich;                     // 市長が言う説明（1〜2 文。用語は {{term:ID}}）
  quality: 'sound' | 'partial' | 'wrong';   // 画面には出さない
  why: Rich;                      // 住民と議員の受け取り方（1 行）。誤り・一部なら、どこが足りないか
  lesson?: string;                // この説明の根拠を学べるレッスン（誤り・一部では必須）
}
```

#### 7.1.1 譲歩で変えられる性質（ModKey）

譲歩は模擬に実際に効く（`docs/game-design.md` 17.1）。`mods` に書けるのは、模擬が読む次の性質だけ（検証で確かめる）。

| ModKey | 模擬の中の意味 | 効く所 |
|---|---|---|
| `height` | 建物の高さの段（足す段の数。−1 で 1 段低く） | 日照・戸数（用途地域の変更）・雇用・技術力への効き |
| `noise` | 騒音の倍率 | 騒音・地価 |
| `nightNoise` | 夜の騒音の倍率（夜も動く施設） | 騒音（夜の分）・地価 |
| `traffic` | 生む交通の流れの倍率（駐車場を増やす・送迎の車を出す） | 通勤の混み具合 |
| `tech` | 技術力への効きの倍率 | 技術力・オフィスの需要 |
| `jobs` | 雇う人数の倍率 | 雇用 |
| `power` | 電力の使用量の倍率 | 電力の余裕 |
| `coolingWater` | 冷却水の量の倍率 | 施設の性質（冷却水の使用） |
| `green` | 敷地の中の緑地（公園の行き届きを足す。0〜1） | 緑地・地価 |
| `units` | 戸数の倍率（住宅の用途地域の変更） | 住まい・手頃さ・公共サービスの負担 |

- 施設の性質の初めの値（冷却水の量など）は `content/facilities.json` の施設に `traits` として書く（`{ "coolingWater": 0.15 }`。Lv を掛けて使う）
- 理由の強さ（`measure`）を下げられる性質: `noise` → `noise`・`nightNoise`・`height` / `power` → `power` / `jobs-density` → `jobs` / `sunlight` → `height` / `traffic` → `traffic` / `rent` → `units`・`height` / `trait` → その性質 / `service-load` → `units`・`height` / `cost` → `cost.ratio` が負の譲歩（規模を小さくして費用を下げる。`height` か `units` も一緒に下げる）。
  6 章の検証の「理由の元の値を下げる」は、この対応で確かめる

#### 7.1.2 書き方の規則

- **理由は、その分野の実務の論点そのものにする**（`docs/game-design.md` 20 章）。架空の論点や、IT と関係の無い言いがかりにしない。
  例: データセンター → 夜間の騒音（冷却の送風機）・電力の逼迫（使う電力と送電の余裕）・雇用が少ない（運用の人数）・冷却水の使用（冷やし方）。
  クラスタ施設 → 電力・排熱。Web 施設 → 夜の光と人の流れ。発電所 → 騒音と排気・景観
- 説明の `text` は、本物の技術の言葉で正確に書く。`sound` は正しく論点に答える物、`partial` は正しいが論点の一部にしか答えない物、`wrong` は**学習者が実際に誤解しやすい物**（でたらめにしない。クイズの誤答と同じ規則。`docs/learning-design.md` 5 章）
- 段階の目安: 1〜2 は仕組みを言い表す説明、3 は測り方・数字を示す説明、4〜5 は技術の代案の譲歩（`requires`）として書く
- 誤解から来る割合（`misconception`）は、論点のうち説明で解ける分。騒音のように本当に出る物は小さく（0.1〜0.3）、冷却水の「使い切る」のような誤解の多い物は大きく（0.5〜0.8）する
- 用語は `{{term:ID}}` で書き、用語集に無い専門用語を書くとテストで落ちる（5 章と同じ）

例（データセンターの冷却水）:

```json
{
  "id": "dc-cooling-water",
  "title": "冷却水の使用",
  "targets": ["datacenter", "upgrade:datacenter"],
  "group": "environment",
  "issue": "environment",
  "measure": { "kind": "trait", "trait": "coolingWater" },
  "misconception": 0.6,
  "claim": "サーバを冷やすのに大量の水を使い、川の水が減るのではないか。",
  "concessions": [
    { "id": "dc-water-closed", "label": "冷却水を閉じた回路で回し、補給は雨水をためて使う", "mods": { "coolingWater": 0.3 }, "cost": { "ratio": 0.2 } },
    { "id": "dc-water-air", "label": "外気で冷やす方式に切り替える（夏は能力を落とす）", "mods": { "coolingWater": 0.1, "tech": 0.85 }, "requires": { "domain": "cloud", "stage": 4 } }
  ],
  "explanations": [
    { "id": "dc-water-loop", "domain": "cloud", "stage": 2, "quality": "sound", "text": "冷却の水は配管の中を回り続け、使い切る量は蒸発する分だけです。", "why": "水を使い捨てると思っていた人の心配が和らいだ。" },
    { "id": "dc-water-pue", "domain": "cloud", "stage": 3, "quality": "sound", "text": "冷却に使う電力と水の量を毎月測って公開します。{{term:pue}} の目標も決めます。", "why": "数字で確かめられると分かり、議員も評価した。" },
    { "id": "dc-water-cloud", "domain": "cloud", "stage": 1, "quality": "wrong", "text": "クラウドなので、建物で水は使いません。", "why": "クラウドの裏側にも建物と冷却がある。かえって不信を招いた。", "lesson": "cloud.b.01" }
  ],
  "lessons": ["cloud.b.01"]
}
```

（例のレッスン ID と用語は形を示すための物。実際に書く時は、`docs/curriculum.md` と用語集にある ID を使う）

### 7.2 議員

```ts
interface CouncilMember {
  id: string;
  name: string;                   // 自分たちで決めた名前（docs/decisions.md D-20）
  profile: string;                // 人柄の 1 行（「元 小学校の先生。子どもの暮らしを重く見る」）
  main: IssueId;                  // 主な論点（重み 3）
  second: IssueId;                // 次の論点（重み 1.5）
  stance: -3 | -2 | -1 | 0 | 1 | 2 | 3;   // 姿勢（docs/game-design.md 18.2）
  icon: string;                   // 人の影の SVG の ID（顔を描かない）
  lines?: Partial<Record<MemberLineKey, string>>;  // その議員の口ぶりの 1 行（7.6 の member と同じ鍵と差し込み名。無い鍵は共通の型の文。docs/decisions.md C-10）
}
```

- `council.json` は 7 人ちょうど。7 つの論点のそれぞれが、ちょうど 1 人の `main` になる（検証）
- `lines` の文は、議員どうしで同じ文にしない（検証）

### 7.3 請願

```ts
interface Petition {
  id: string;
  title: string;                  // 「家賃が上がって住み続けられない」
  text: Rich;                     // 市民の要望（1〜2 文）
  group: GroupId;
  layers?: number[];              // 送ってくる層（層の番号。docs/data-model.md 8 章）
  when: string;                   // 届く条件（7.7 の式）
  priority: number;               // 同じ週に複数が条件を満たした時、大きい物から
  accept: {
    effect: PetitionEffect;       // 受理の中身。模擬に実際に効く
    cost?: { treasury?: number; weekly?: number; weeks?: number };
    why: Rich;                    // 受理した時の受け取られ方
  };
  reject: { why: Rich };
}
type PetitionEffect =
  | { kind: 'rent-subsidy'; ratio: number; weeks: number }   // 届いた地区の、その層の家賃を ratio だけ下げる
  | { kind: 'build'; type: FacilityType }                    // 届いた地区の空き地に、その種類を建てる。申請の要る種類は申請を出し、要らない種類（公園の類）はそのまま置く。費用は財政（場所は模擬が決める）
  | { kind: 'power-cap'; mw: number }                        // 外からの電気の上限を足す（代金は cost）
  | { kind: 'noise-limit'; factor: number; weeks: number }   // 届いた地区の工業の騒音の倍率（その間、工場の売上も同じ割合で下がる）
  | { kind: 'bus'; traffic: number; weeks: number };         // 届いた地区の通勤の混み具合の倍率
```

### 7.4 公約

```ts
interface Pledge {
  id: string;
  title: string;                  // 「人口を 2 割増やす」
  goal: string;                   // 果たす条件（7.7 の式。start. を付けると任期の初めの値）
  layers: number[];               // この公約を重く見る層（果たした・果たせない時に信頼が動く。docs/game-design.md 21.4）
}
```

- 公約の `goal` に、レッスンの修了の数を入れない（docs/game-design.md 21.4。検証で、7.7 の学習の語が無いことを確かめる。`missions` は使ってよい）
- `goal` に使えるのは、今の模擬が数えている語だけ（検証で確かめる）。行き届き（G10）・家賃の負担と騒音の語（それを数える Phase）を使う公約は、その Phase で足す

### 7.5 新聞の型の文

```ts
interface NewsTemplate {
  kind: NewsKind;                 // docs/data-model.md 9 章の Article.kind
  variant?: string;               // 同じ種類の中の場合分け（'scandal' の 'push' など）
  headline: string;               // 「{facility}、議会で可決 賛成 {yes} 反対 {no}」
  body: string;                   // 2〜3 行。{名前} の所に名前と数字が入る
}
```

- 差し込める名前: `{city}` `{mayor}` `{facility}` `{district}` `{group}` `{reason}` `{yes}` `{no}` `{n}` `{rate}` `{value}` `{week}` `{year}`。書いた名前が、その種類で入る物かを検証で確かめる
- 新聞の名前（「市民新報」）は `news.json` の `title` に 1 つ書く

### 7.6 説明と判断の 1 行の型の文

```ts
interface ExplainTemplates {
  approval: { up: string; down: string; flat: string };        // 「この {weeks} 週で支持率が {delta} {dir}。主な理由は、{cause}（{factor}）」
  layer: string;                                                // 「特に、{layer}で {delta} {dir}」
  causes: Record<'facility' | 'zone' | 'road' | 'building' | 'decision' | 'demand', string>;  // 原因の言い表し方（「{name}が{district}に建ったこと」）
  factors: Record<FactorId, string>;                            // 要因の名前（「騒音」「家賃の負担」）
  member: Record<MemberLineKey, string>; // 議員の 1 行（docs/game-design.md 18.2）。議員ごとの口ぶりは 7.2 の lines
  gains: Record<IssueId, string>;        // 得の言い表し（「雇用が {value} 人分増える」）。member の {gain} に入る（docs/decisions.md C-10）
}
type MemberLineKey = 'gain' | 'concern' | 'unanswered' | 'explained' | 'wrong' | 'pushed' | 'approval' | 'persuaded' | 'stance';
```

- 議員の 1 行の差し込み名: `{issue}`（論点の名前）・`{reason}`（理由の題）・`{gain}`（得の言い表し）・`{rate}`（支持率）・`{dir}`（「賛成」か「反対」）

- 数字は四捨五入した整数で入れる。全ての要因と原因の種類に文があることを検証で確かめる

### 7.7 条件の式

請願の `when` と公約の `goal` に使う。`&&` でつなぎ、比べ方は `>=` `<=` `>` `<` `=`。
右は数か、`start.<語>` に足す・掛ける数（`population >= start.population * 1.2`「人口を 2 割増やす」・`facilities.it >= start.facilities.it + 2`）。`start` の語は 1 つの式に 1 つ。

| 語 | 値 |
|---|---|
| `population` `jobs` `unemployment` `approval` `treasury` `taxRate` | 都市全体の値（失業率と支持率は 0〜100） |
| `rentBurden.<低|中|高>` | その収入の帯の家賃の負担の平均（%） |
| `outageDays` | 直近 28 日に停電した日の数（どこかの地区） |
| `noiseAtHome` | 住まいのマスの騒音の大きい方から 1 割の平均 |
| `coverage.<police|fire|school|clinic|park>` | 住民の行き届きの平均（0〜100） |
| `facilities.it` `facilities.civic` | 完成した IT 施設・公共サービスの数 |
| `missionsDone` | 達成したミッションの数（公約に使ってよい） |
| `highApprovalWeeks` | 支持率 65% 以上が続いた週（褒賞の市民ホールの節目。`docs/data-model.md` 11 章の `Rewards.highApprovalWeeks`） |
| `any:<語>` | 地区ごとの値の、どこかの地区で満たす（請願だけ。満たした地区に届く） |
| `start.<語>` | 任期の初めの値（公約だけ） |

- 式は `src/sim` の 1 つの関数で読む。読めない式は検証で落とす。レッスンの修了・XP・スキルの語は無い（学習を市政の条件にしない）

### 7.8 地区の名前

- `names.json` に、地区の名前の前の部品（方角・地形: 北・南・浜・丘・川・森 …）と後ろの部品（町・台・野・原 …）を並べ、新しい都市を作る時に seed で 144 地区に重ならないよう組み合わせる（`docs/game-design.md` 16.1）
- 実在の地名をそのまま写さない。Permit Pending の都市名・地名は使わない（D-20）

### 7.9 公共サービス・発電所・褒賞の建物の定義

`content/facilities.json` に、IT 施設と同じ形で足す。足す欄:

```ts
interface FacilityDef {             // 今の欄（id・name・cost・domain・大きさ）に足す
  wallet: 'funds' | 'treasury';     // 財布（docs/game-design.md 2 章）
  role: 'it' | 'civic' | 'power' | 'reward' | 'park';
  jobs?: number;                    // Lv あたりの雇う人数（今の 15 を既定）
  powerMW?: number;                 // 使う電力（Lv あたり）。発電所は負の値で作る量
  noise?: { value: number; radius: number; night?: boolean };
  traits?: Partial<Record<ModKey, number>>;   // 譲歩で変えられる性質の初めの値
  coverage?: { kind: 'police' | 'fire' | 'school' | 'clinic' | 'park'; distance: number; capacity?: number };
  upkeep?: number;                  // 週の維持費（財政）
  buildDays?: number;               // 工事の日数（無ければ大きさで決まる。docs/game-design.md 15.2）
  unlock?: string;                  // 褒賞の節目（7.7 の式。届いたら建てられる）
}
```

- 値は `docs/game-design.md` 13・24・25 章の表と一致させる（テストで確かめる）
