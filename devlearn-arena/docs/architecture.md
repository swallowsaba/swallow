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
| sql.js（SQLite の WebAssembly 版、MIT） | DB の実戦 | ブラウザ内で本物の SQL を実行できる。サーバ不要 | 外部の DB サービス（有料・秘密情報が要る） |
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
      cicd/                  パイプラインの実行（github の Actions と共有）
      monitor/               ログ・メトリクス・トレースの模擬
      db/                    sql.js の包み
    content/                 コンテンツの読み込みと検証
    save/                    保存と読み込み・版の移行
  tools/                     開発用のスクリプト（画面の撮影など）
  e2e/                       Playwright
```

### 層の境界（破らない）

- `src/city` `src/game` `src/learning` `src/engines` は React・DOM・Canvas を import しない（ESLint で禁止）
- `src/city/render` は模型を読むだけで、書き換えない
- 画面（`src/screens`）は模型の関数を呼ぶだけ。規則を画面に書かない
- 乱数は seed から。`Math.random` と `Date.now` を模型で使わない（時刻は引数で渡す）

## 4. フロントエンド

- 1 ページのアプリ。画面の切り替えはハッシュ（`#/city`、`#/learn/linux.i.01`）。GitHub Pages の直リンクで 404 にならない
- 都市の描画: 可視範囲だけを描く。建物の SVG は読み込み時に画像化して使い回す。60fps を目指し、重い時は影と動きを減らす
- コンテンツは分野ごとに分けて、必要になった時に読み込む
- オフライン: 一度読んだコンテンツと素材をブラウザに保持する（Service Worker は Phase 12 で検討）

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
