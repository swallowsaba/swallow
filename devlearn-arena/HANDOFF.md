# DevLearn Arena 引き継ぎ資料

このファイルと、リポジトリ直下の元の指示書（実装指示プロンプト）を読んでから作業すること。
**確認を求めず、最後まで実装を進めること。** 途中で人間に問いを投げない。

## 作業環境

- リポジトリ: 複数プロジェクトが同居する Swallow 構成。本体は `devlearn-arena/`
- `.github/workflows/deploy.yml` は共有物。**触らない**（触る必要がある場合のみ、末尾に追記）
- `.github/workflows/ci.yml` が型チェック・lint・テスト・ビルド・E2E を回す
- 検証は `cd devlearn-arena && npm run verify`（typecheck + lint + test）と `npm run e2e`
- **`npm run build` に型チェックを入れない**。1プロジェクトの型エラーでリポジトリ全体のデプロイが止まるため

## 完了済み

### P0 基盤
Vite + React 18 + TS(strict, noUncheckedIndexedAccess) + Tailwind + Zustand + zod。
`BrowserRouter` + `basename={import.meta.env.BASE_URL}`。base path は CI が
`VITE_BASE=/<repo>/devlearn-arena/` を渡す。サブフォルダの SPA は GitHub Pages が
ルートの 404.html しか配信しないため、deploy.yml が生成するルート 404.html が
`?p=<パス>` へ振り替え、`src/lib/spaFallback.ts` が元の URL に戻す。

### P1 カーネル（`src/engines/kernel/`）
字句解析 → 構文解析 → 展開 → 実行。変数展開、コマンド置換（`$( )` は空白を跨いで1単語）、
単語分割、ブレース展開、パス名展開、パイプ（各段はサブシェル。cwd と変数は漏れない）、
リダイレクト、ヒアドキュメント、`&&`/`||`/`;`。仮想FSは「絶対パス → ノード」の平坦な Map。
コマンド 35 個。Tab補完、行編集、履歴。ジャーナル（全スナップショット保持、巻き戻し可）。

### P2 Git（`src/engines/git/`）— 進行中
- `objects.ts` 本物と同じ形式でシリアライズし SHA-1。既知ハッシュのテストあり
- `repository.ts` refs/HEAD/index/reflog、status（3面差分）、commit、branch、switch、
  mergeBase(LCA)、planMerge、reset、diff、unstage、materialize
- `merge.ts` 3-way マージとコンフリクトマーカ
- `commands/git.ts` サブコマンド 16 個
- 保存: `serialize.ts` で objects を base64 直列化

## 残作業（この順に進める）

1. **P2 の残り**: `rebase`（todo list 実行機）、`cherry-pick`、`revert`、`stash`、`bisect`、
   `tag`、`worktree`、`submodule`、仮想リモート（別インスタンスの Repository）と
   `clone/fetch/pull/push`。push は fast-forward 判定、非FFなら
   `! [rejected] ... (fetch first)`。`--force-with-lease` の差も再現
2. **Git トラックの任務**: `src/engines/lesson/missions.ts` に追加。
   判定は必ず状態アサーション。`check`（人が読める条件）と `diagnose`（惜しい点）を必ず付ける
3. **P3 Kubernetes**: apiServer / scheduler / controllers / kubelet / network / clock。
   宣言的ループ（apply は desired state を置くだけ、reconcile が tick で解消）。
   `ClusterCanvas` 可視化。kubectl 実装
4. **P4 Network**: packet / device / stack / tcp / dns / http / subnet。`PacketFlow` 可視化
5. **P5 GitHub**: PR、Actions（workflow YAML を実際にパースして job DAG 評価）
6. **P6**: 全カリキュラム 210 本、BOSS、間隔反復、実績、i18n、a11y/perf

## 守ること

- **出力をハードコードしない。** 状態機械を実装し、状態から出力を導出する
- エンジン層は React 非依存・決定論。`Date` と `Math.random` は ESLint で禁止済み。
  時刻は `SimClock` から、乱数は seeded RNG から取る
- エラーメッセージは本物に寄せる（文言・終了コード）
- 1ファイル 400 行を超えたら分割
- `any` 禁止。未使用の依存追加禁止
- テストを必ず書く。特にエンジンは本物との一致を検証する
- 失敗を罰にしない。学習画面に HP や撤退は入れない
- UI は木枠・クリーム・金の看板の外装。暗いターミナル配色には戻さない
- 学習画面は左＝ターミナル、右＝可視化。仕切りはドラッグで動く
- 可視化は斜め45度にしない。正面から見える形にする

## 進め方

各段階で `npm run verify` を通してからコミットする。落ちたら直す。
人間に確認を求めず、残作業を上から順に片付ける。
