# アーキテクチャ

データの型は `docs/data-model.md`、公開の手順は `docs/deployment.md`、サービスの無料条件は `docs/free-services.md`。
この文書は**技術の選択と理由・構造**を決める。

## 1. 選定の基準（優先順）

1. 無料 2. GitHub Pages で動く 3. 保守しやすい 4. Claude Code で開発しやすい 5. 初心者でも読める 6. 将来拡張できる

## 2. 技術スタックと採用理由

| 技術 | 用途 | 採用理由 | 不採用にした候補 |
|---|---|---|---|
| TypeScript（strict） | 全体 | 型で仕様を固定でき、Claude Code の誤りを早く見つけられる | JavaScript のみ |
| Vite | ビルド | 静的ファイルを出力でき GitHub Pages と相性がよい。設定が小さい | Next.js（サーバ機能が不要で重い） |
| React 18 | HUD・パネル・レッスン画面 | 部品化と状態の扱いが容易。 | Vue・Svelte（同等の利点があり、決め手が無い） |
| Canvas 2D（自作の描画） | 都市の描画 | 2.5D の大量の建物を軽く描ける。依存が増えない | 3D エンジン（不要。`docs/decisions.md` D-01）、PixiJS（必要になるまで入れない） |
| SVG（自作） | 建物の素材・図・アイコン | 拡大しても劣化しない。ライセンスの心配が無い | ビットマップの素材 |
| Zustand | 画面の状態 | 小さく分かりやすい。 | Redux |
| zod | コンテンツとセーブデータの検証 | 型と検証を 1 つで書ける | — |
| sql.js（SQLite の WebAssembly 版、MIT。型は @types/sql.js、MIT） | DB の実戦 | ブラウザ内で本物の SQL を実行できる。サーバ不要。WebAssembly のファイルは同梱して配信する | 外部の DB サービス（有料・秘密情報が要る） |
| @xterm/xterm・@xterm/addon-fit（MIT） | 仮想端末の表示（`src/screens/lesson/terminal`） | 本物の端末と同じ表示（カーソル・折り返し・色・選択）を小さな手間で出せる。中身は模擬のシェル（`src/engines/kernel`）で、端末は表示だけを受け持つ。既存の端末が使っている（`docs/archive/inventory.md`） | 自作の表示（折り返しと文字幅の扱いを誤りやすい） |
| Vitest / Testing Library | 単体・部品のテスト | Vite と同じ設定で動く | Jest |
| Playwright | 画面の撮影・E2E | 実際のブラウザで撮影して見た目を確かめられる | — |
| @fontsource | フォントの同梱 | 外部配信に依存しない | Google Fonts の外部読み込み |
| IndexedDB（idb-keyval 程度の薄い包み） | 保存 | 容量が大きく、ブラウザ標準 | 外部 DB |
| @noble/hashes（MIT） | Git の模擬（`src/engines/git`） | オブジェクトの名前（SHA-1）を本物と同じ計算で出せる。小さく依存が無い。既存の模擬が使っている（`docs/archive/inventory.md`） | Web Crypto（非同期で、模擬の同期的な処理に合わない） |
| js-yaml（MIT） | Kubernetes の模擬（`src/engines/k8s`）・設定の編集 | YAML のマニフェストと CI の設定を読む。既存の模擬が使っている（`docs/archive/inventory.md`） | 自作の YAML 解析（誤りやすい） |

**依存を足す時は、この表に 1 行足してから足す。** 足した理由が書けない依存は入れない。

## 3. ディレクトリ構造

```text
devlearn-arena/
  CLAUDE.md
  docs/                      仕様書（docs/README.md が索引）
  content/                   コンテンツ（データ。docs/content-spec.md）
  public/                    そのまま配信する物（favicon など）
  src/
    main.tsx  App.tsx        入口と画面の切り替え
    ui/                      見た目の部品と tokens（docs/visual-design.md）
    screens/                 画面（都市・学習ライブラリ・知識グラフ・レッスン・成長・ミッション・用語・設定）
    city/                    都市の模型（純粋な TS）: 地形・道路・区画・施設・成長・配置の判定
      render/                Canvas 2D の描画（模型を読むだけ）
      assets/                施設の SVG（Lv1〜Lv5）
      generate/              区画の建物の手続き的な生成
    game/                    ゲームの模型（純粋な TS）: XP・スキル・資金・ミッション・発展段階
    sim/                     都市の模擬と市政（純粋な TS。9 章）: 住民・事業者・地価・家賃・雇用と通勤・税収・電力・公共サービス・満足と支持率・
                             申請と審議・反対・公聴会・議会・異議申し立て・選挙・請願・予算・新聞・褒賞・説明の文
      worker.ts              模擬を Web Worker で動かす入口（ここだけがメッセージを扱う。計算は持たない）
    learning/                学習の模型（純粋な TS）: レッスンの進行・判定・推奨・知識グラフ・復習
    engines/                 実戦の模擬環境（純粋な TS）
      kernel/  vfs/          シェルとファイル
      git/                   Git
      net/                   ネットワーク
      k8s/                   Kubernetes
      github/                プルリクエスト・Actions
      container/             コンテナとレジストリ
      docker/                Docker の CLI（container の上に作る）
      http/                  HTTP と Web サーバ
      tls/                   証明書の連鎖と検証
      sim/                   画面で操作する模擬（つなぐ・並べる・置く・読み取って答える。docs/decisions.md D-16・D-19）
      cicd/                  GitHub Actions の実行（push で .github/workflows を動かす runner・npm の scripts と配る先の模型・gh run の出力。D-19）
      monitor/               Prometheus の規則（PromQL の一部・アラートの待ちと発火）と promtool test rules・Alertmanager の振り分け（promtool・amtool の中身。D-19）
      db/                    sql.js の包み
    content/                 コンテンツの読み込みと検証
    save/                    保存と読み込み・版の移行
  tools/                     開発用のスクリプト（画面の撮影など）
  e2e/                       Playwright
```

### 層の境界（破らない）

- `src/city` `src/game` `src/learning` `src/engines` `src/sim` は React・DOM・Canvas を import しない（ESLint で禁止）。`src/sim/worker.ts` も DOM を使わない（Worker の `self` と `postMessage` だけ）
- `src/city/render` は模型を読むだけで、書き換えない
- 画面（`src/screens`）は模型の関数を呼ぶだけ。規則を画面に書かない
- 乱数は seed から。`Math.random` と `Date.now` を模型で使わない（時刻は引数で渡す）
- `src/sim` は `src/city`（地形・道路・区画・施設の配置の判定）と `src/game`（スキル段階・資金）を読んでよい。逆向き（`src/city` や `src/game` が `src/sim` を読む）は作らない。`src/learning` と `src/engines` は `src/sim` を読まない（学習は都市の状態に左右されない。`docs/game-design.md` 20 章）

## 4. フロントエンド

- 1 ページのアプリ。画面の切り替えはハッシュ（`#/city`、`#/learn/linux.i.01`）。GitHub Pages の直リンクで 404 にならない
- 都市の描画: 可視範囲だけを描く。建物の SVG は読み込み時に画像化して使い回す。60fps を目指し、重い時は影と動きを減らす
- コンテンツは分野ごとに分けて、必要になった時に読み込む
- オフライン: 一度読んだコンテンツと素材をブラウザに保持する。Phase 12 で検討し、依存を足さずに自作の Service Worker（`src/offline/`。build で `dist/sw.js`）を使うと決めた
  - ページ（`index.html`）は回線を先に試し、つながらなければ保持した物を返す（公開し直した版を、つながった時に取る）
  - `assets/` の下（名前に中身の指紋が付く JS・CSS・フォント・wasm・レッスンの中身）は、保持した物を先に返し、無ければ取って保持する。Service Worker が動き出す前に読んだ物は、ページが一覧を渡して保持させる
  - 全部（約 30MB）を先に取り込むことはしない。読んでいないレッスンを回線無しで開くと、何が起きたか・どうすればよいかを出し、「もう一度読む」でページを開き直す
  - 保持は build ごとの版で分け、新しい版が動き出したら古い版の物を消す。開発用のサーバでは登録しない

## 5. データ

- 全てブラウザ内（IndexedDB を主、設定だけ localStorage）
- 保存データには版番号を付け、版が上がった時の移行関数を `src/save/migrations.ts` に置く
- 書き出し・読み込み（JSON ファイル）で、端末を移れる
- 型は `docs/data-model.md`

## 6. API

- **初回は外部 API を使わない。** 全ての学習と都市はブラウザ内で完結する
- AI を使う機能は作らない（`docs/product-spec.md` の無料要件。将来入れる場合も、無料で、無くても成立する形に限る）

## 7. Cloudflare

- **初回は使わない。** GitHub Pages だけで全機能が成立する
- 将来の候補（`docs/decisions.md` Q-05 が「作る」に決まった場合）: 端末間の同期（Workers ＋ 無料のストレージ）、匿名の利用統計
- 使う場合は `docs/free-services.md` に公式情報を日付付きで記録し、`docs/deployment.md` の手順で Secrets を管理する。GitHub Pages 側に秘密を置かない

## 8. GitHub Pages

- リポジトリ `swallowsaba/swallow` の `devlearn-arena/` を、`https://swallowsaba.github.io/swallow/devlearn-arena/` で公開する
- Vite の `base` は環境変数で切り替える（`docs/deployment.md`）
- 出力は静的ファイルのみ

## 9. 都市の模擬の置き場所と性能

仕組みは `docs/game-design.md` 13〜27 章、型は `docs/data-model.md` 8〜12 章。ここでは、どこで・どう動かし、どれだけ重いかを決める。

### 9.1 置き場所

- 計算は全て `src/sim/` の純粋な関数（`(状態, 命令の列, 日) → 新しい状態`）。React・DOM・Canvas を使わず、`Math.random`・`Date.now` を使わない（3 章）
- **模擬は Web Worker で動かす**（ブラウザ標準。依存を足さない。Vite の `new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })` で束ねる）
  - 理由: 毎週の計算（9.3）は最も重い時に数十ミリ秒かかる。画面と同じ流れで動かすと、その週の区切りで 2〜4 フレームが落ち、都市画面の 60fps（`docs/product-spec.md` 5 章）を守れない。Worker なら描画と並んで動く
  - 画面（`src/screens/city`）は、操作を**日付付きの命令**（置く・申請を出す・公聴会の手・税率・請願の手・速さ）として Worker へ送る。Worker は日の区切りで、受け取った順に命令を当てる。同じ命令の列からは同じ結果になる（`docs/game-design.md` 26 章）
  - Worker は、1 日ごとに画面に要る差分（日付・資金・財政・支持率・政治資本・申請の段階・建物の変化・知らせ）を、1 週ごとにヒートマップの値（`Float32Array` を移す。写さない）とグラフの点と説明の文を返す
  - 公聴会・議会の採決・選挙の窓を開いている間とレッスンの間は、画面が「止める」を送る（`docs/game-design.md` 13.1）
  - Worker を作れない時（古いブラウザ・テスト）は、同じ関数を画面と同じ流れで動かす（`src/sim/worker.ts` を通さず、同じ命令の受け口を直接呼ぶ）。単体テストは関数を直接呼ぶ
- 保存: 模擬の状態は Worker が持つ。自動保存（`docs/data-model.md` 7 章）の時に、画面が Worker に写しを求め、受け取った物を保存データに入れる。読み込みでは、保存データを Worker に渡して始める
- 内容（反対の理由・議員・請願・公約・新聞と説明の型の文）は `content/politics/`（`docs/content-spec.md` 7 章）。読み込み時に zod で検証し、Worker に渡す

### 9.2 住民を分布で持つ理由（`docs/game-design.md` 13.2）

| 持ち方 | 毎週の計算の量（技術都市・人口 5 万） | 保存の大きさ |
|---|---|---|
| 一人一人（5 万人。住まい・通勤先・満足） | 5 万人 × 通勤の道の探索・12 の要因 = 数百万〜千万回の操作。人口に比例して増える | 5 万人 × 10 項 ≈ 数 MB |
| **区画の建物ごとの分布（採る）** | 建物 最大 約 4,000 × 12 層 × 12 要因 ≈ 58 万回。人口が増えても建物の数で頭打ち | 4,000 × 12 層 ≈ 5 万の数 ≈ 200KB |

- 地図は 96×96 = 9,216 マス。区画にできるのは、水・道路・施設を除いた最大で約 4,000 マス（1 マス 1 建物）
- 通勤は、地図を 8×8 マスの地区（12×12 = 144 地区）に分けて、地区から地区への流れで計算する

### 9.3 性能の見積もり

最も重い時（地図の全てを使った技術都市: 建物 4,000・施設と公共サービス 60・申請 6）。値は手元の PC の目安で、G1 と G12 で計測して `docs/progress/` に記録する。

| 計算 | いつ | 量 | 目安の時間 |
|---|---|---|---|
| 申請の段階・工事・電力の割り振り・事業者の売上・知らせ | 毎日 | 建物 4,000 と地区 144 を 1 回ずつ | 0.5ms 以下 |
| 道路の距離（地区ごとの幅優先の探索） | 毎週（道路が変わった週だけ） | 144 地区 × 9,216 マス ≈ 130 万 | 10〜20ms |
| 通勤の流れと混み具合 | 毎週 | 人の住む地区 × 仕事のある地区 × 3 帯 × 道の長さ（約 50）≈ 50 万〜300 万 | 5〜25ms |
| 地価・騒音・行き届き（マスごとの足し算） | 毎週 | 発生源（工業の建物 最大 1,000 × 半径 4 の 81 マス など）≈ 20 万 | 1〜3ms |
| 家賃・引っ越し・満足と支持率（内訳を含む） | 毎週 | 4,000 × 12 層 × 12 要因 ≈ 58 万 | 3〜6ms |
| 申請の見込み（完成した形を仮に入れた 1 週分） | 申請を出した時・反対の受付の終わり・公聴会の手ごと | 上の 1 週分（道路が変わらないので探索は使い回す）| 10〜30ms |
| 合計（最も重い週） | | | 30〜60ms（Worker の中。画面のフレームは落とさない） |

- 3 倍の速さでは 1 週が 4.7 秒。最も重い週でも Worker の使う時間は 1〜2% に収まる
- 画面の側: 毎日の差分を受けて状態を書き換える 1ms 以下。ヒートマップは週に 1 回、マスの色を画面の外の Canvas に描き、毎フレームはそれを 1 枚の画像として重ねるだけ（4 章の「可視範囲だけを描く」と同じ考え）
- 記憶: マスごとの値（9,216 × 約 12 種 × 4 バイト ≈ 450KB）と、建物の分布（約 200KB）。グラフの記録と内訳は 9.4
- 計測の道具: `tools/bench-sim.mjs`（最も重い形の都市を作り、1 日と 1 週と申請の見込みの時間を出す。G1 で作る。`docs/testing-strategy.md` 10 章）。目安を超えたら、計算を地区の単位に粗くしてから実装を進める

### 9.4 記録の大きさ

- 週ごとのグラフの点: 直近 208 週は全て、それより前は 4 週ごと（`docs/game-design.md` 14 章）。10 年遊んで約 330 点 × 6 値
- 支持率の内訳: 週ごとに、要因 12 × 層 12 の点と、原因ごとの上位 20 件。直近 8 週だけを全て持ち、それより前は持たない（説明は直近 4 週で作る）
- 新聞: 1 任期分の記事の全文、それより前は見出しだけ
- 保存データ全体の目安: 1MB 以下（今の IndexedDB の保存の形のまま入る。`docs/data-model.md` 7 章）
