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
  actions?: SimAction[];               // 画面で操作する実戦（模）だけ: 最後のヒントで通る操作（2.4.1）
}
type CheckSpec =
  | { kind: 'fs'; path: string; exists?: boolean; contains?: string; lacks?: string[]; mode?: string } // lacks: どれも含まない（秘密の値が残っていない）。mode: 権限。'600' ならその値、'u+x'・'go-rwx' ならその権限が有る・無い
  | { kind: 'cwd'; equals: string }
  | { kind: 'service'; name: string; active?: boolean; enabled?: boolean }
  | { kind: 'git'; expr: string }               // 例: 'branch:feature merged-into:main'
  | { kind: 'k8s'; expr: string }               // 例: 'deployment/web readyReplicas>=3'
  | { kind: 'net'; expr: string }               // 例: 'reach shop.example:443'
  | { kind: 'container'; expr: string }         // 例: 'image:nginx:1.27 running:web'
  | { kind: 'ci'; expr: string }                // 例: 'head run=success needs:deploy=unit,lint,e2e'
  | { kind: 'alert'; expr: string }             // 例: 'rules:rules/reserve.yml test:tests/yesterday.test.yml'
  | { kind: 'http'; url: string; status: number; contains?: string; header?: string; method?: string; data?: string } // contains: 返事の本文にその文字列がある。header: '名前: 値' の見出しがある（名前の大文字・小文字は問わず、値は同じ）。method・data: 頼み方（POST と送る中身）
  | { kind: 'tls'; host: string; trusted: boolean }
  | { kind: 'sql'; query: string; equals: unknown }
  | { kind: 'ran'; uses: string[]; result: string } // 端末で打った行が uses のコマンドを全て使い（パイプでつないでよい）、その結果（標準出力の全体）が result と同じ
  | { kind: 'answer'; equals: string }         // 答えの欄に入れる形。コマンドでは得られない値（読み取って考える値）を答える時だけ
  | { kind: 'sim'; expr: string };              // 画面で操作する模擬環境（模）の状態。式は 2.4.1（docs/decisions.md D-16）
```

- **判定は出力の文字列ではなく、模擬環境の状態で行う**
- **端末の実戦は、コマンドの実行の結果と模擬環境の状態で判定する。答えの欄は、コマンドでは得られない値を答える時だけ使う**（`docs/progress/urgent-03.md`）
  - 状態が変わる手順（作る・直す・動かす）は、その状態（`fs`・`service`・`container` など）で判定する
  - 数える・探す・取り出すなど、コマンドの結果そのものが目的の値になる手順は `ran` で判定する。正しいコマンドを打って正しい結果が出た時点で達成し、答えの欄は出さない。
    例: grep と wc で行の数を数える → `{ "kind": "ran", "uses": ["grep", "wc"], "result": "3" }`。find でファイルを探す → `{ "kind": "ran", "uses": ["find"], "result": "/etc/app/app.conf" }`
  - `ran` は、打った 1 行の区切り（`;` `&&` `||`）のどれかが、`uses` のコマンドを全て使い（`sudo` の後ろのコマンドも数える）、その結果（標準出力の全体）が `result` と同じ時に満たす。
    比べ方は答えと同じ（行ごとの前後の空白・行の中の空白の続き・空の行・英字の大小・全角と半角を問わない）。標準エラーは比べない（読めない場所を飛ばした `Permission denied` が出ても、結果が正しければ満たす）。
    結果の一部だけが合う物（一覧の中に目的の値が混ざる）は満たさない
  - ブラウザ内 SQL の実戦でも `ran` を使える。`uses` は文に出る SQL の語（大文字で書く。`'…'` の中は数えない。小文字で打っても同じ）、結果は返った表の行（列の名前は入れず、行ごとに値を空白で並べる）。
    例: 在籍の会員を数える → `{ "kind": "ran", "uses": ["COUNT"], "result": "15" }`（`SELECT 15` と数を書いただけでは満たさない）
  - `uses` のコマンドを全て使って結果を出したのに `result` と違う時は、手順の想定エラーに「答えが合っていない」に当たる解説があれば、それを出す（数え方・探し方の誤りの原因候補）。
    無ければ何も出さない（形を見るために同じ道具を打つのは、調べる途中）
  - `answer`（答えの欄）は、表やログを読み取って選ぶ・考える値（どの行か・どの欄か・何が原因か）に使う。答えが、最後のヒントのコマンドの出力の全体と同じなら、その手順は `ran` にする（検証で見つける）
  - 答えの欄の比べ方は、前後の空白と英字の大小を問わず、全角の数字・英字・記号は半角と同じに見る（日本語の入力のまま答えてよい）
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
  - 人と同じ順に、画面と同じ関数（`afterCommand`）で通して確かめる（前の手順の操作で満たした手順は飛ばす）。その時に出るエラーの案内は、**その手順で想定したエラー（`expectedErrors`）で、その手順の間に、本当に失敗した命令（終了の状態が 0 でない）の物だけ**にする（衝突・拒否・届かないことを見せる手順。`docs/progress/verify-all.md` の C2）。うまくいった命令（様子を見る `git status`・確かめの `nmap`）の出力に、出力に当てる解説が当たってはいけない。前の手順の確かめの行が、次の手順の案内を出してもいけない
  - 想定した失敗を最後のヒントで打たせる時は、そこで失敗することも書く（「`kubectl drain node-2` を打つ。手で置いた Pod があると断られるので、続けて …」）。言われたとおり打ったのにエラー、と迷わせない
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
- HTTP の 4xx・5xx のように、失敗でも標準エラーに出ない物（curl は返事の本文と頭を出力に出す）は `output: true` にする。
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
