# DevLearn Arena

ブラウザだけで動く、Kubernetes / Network / Git / GitHub の学習プラットフォーム。
出力をハードコードせず、内部に状態機械を実装し、その状態から表示を導出する。

現在 **P1（カーネル）** まで。
シェル・仮想ファイルシステム・タイムトラベル・レッスン判定が動く。
Git / Kubernetes / Network / GitHub の各エンジンは P2 以降。

`/sandbox` を開くと、実際にコマンドを打って挙動を確認できる。

シェルは変数展開・コマンド置換・単語分割・パス名展開（グロブ）・パイプ・
リダイレクト・ヒアドキュメント・`&&` / `||` / `;` に対応する。
パイプの各段はサブシェルとして扱い、`cd` と変数の変更は外に漏らさない。
仮想時計を進めるのは `sleep` で、実時間は一切参照しない。

## 置き場所

Swallow リポジトリの直下に `devlearn-arena/` として置く。
既存の `deploy.yml` が `VITE_BASE=/<repo>/devlearn-arena/` を渡してビルドするので、
アプリ側の base 設定は不要（`vite.config.ts` が `process.env.VITE_BASE` を読む）。

デプロイ側でやることは `deploy/README.md` を参照。

## 動かす

```bash
npm install            # 初回。package-lock.json をコミットすること
npm run dev            # http://localhost:5173/
```

## 検証する

```bash
npm run verify         # typecheck + lint + unit test
npm run test:cov       # カバレッジ（src/lib, src/content, src/engines）
npm run e2e            # Playwright。/devlearn-arena/ 配下で配信して検証
```

`npm run build` は Swallow の deploy.yml から直接呼ばれるため、
**型チェックを含めない**（1つの型エラーでリポジトリ全体のデプロイが止まらないように）。
手元でまとめて確認したいときは `npm run build:strict`。

## 構造

```
src/engines/kernel/   シェル（字句解析→構文解析→展開→実行）、仮想FS、補完、行編集、ジャーナル
src/engines/lesson/   状態アサーションによるレッスン判定
src/engines/          React 非依存の純粋 TS。決定論（Date.now と Math.random を禁止）
src/visual/    engines の状態を props で受けるだけの描画層
src/content/   カリキュラム（データ。ロジックを置かない）
src/features/  画面
src/store/     Zustand スライス
src/lib/       永続化・XP・SPA フォールバックなどの共通処理
deploy/        既存ワークフローへの追記スニペットと新規 CI
```

## ルーティングと 404

`BrowserRouter` + `basename={import.meta.env.BASE_URL}`。
GitHub Pages はサイトルートの 404.html しか配信しないため、
`deploy/404-fallback.step.yml` が生成するルートの 404.html が
`/<repo>/devlearn-arena/?p=<パス>` へ振り替え、`src/lib/spaFallback.ts` が元の URL に戻す。
