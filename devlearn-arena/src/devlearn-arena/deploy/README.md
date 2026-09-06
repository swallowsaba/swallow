# デプロイ（Swallow 構成への組み込み）

このアプリはリポジトリ直下の `devlearn-arena/` に置く前提。
既存の `deploy.yml` が `VITE_BASE=/<repo>/devlearn-arena/` を渡してビルドし、
`dist/` を `_site/devlearn-arena/` へ複製してくれるため、**アプリ側の設定変更は不要**。

公開URL: `https://<user>.github.io/<repo>/devlearn-arena/`

## 既存 deploy.yml に必要な変更

1つだけ。`404-fallback.step.yml` のステップを、
`Build subprojects and assemble site` と `Setup Pages` のあいだに挿入する。
既存の行は変更しない。

これが無いと、`/devlearn-arena/lesson/git/01/objects` のような URL に
直接アクセス・リロードした時に GitHub の既定 404 が出る
（GitHub Pages が読む 404.html はサイトルートの1枚だけで、
サブフォルダの 404.html は使われないため）。

## 新規に追加するファイル

`ci.yml` をリポジトリの `.github/workflows/ci.yml` として追加する。
型チェック・lint・ユニットテスト・ビルド・E2E を GitHub の貸しマシン上で回す。
手元に Node / npm は要らない。deploy.yml とは独立。

- `package-lock.json` が無くても動く（無ければ `npm install` にフォールバック）
- 4つの検証は途中で止めず全部走らせ、最後にまとめて成否を判定する
  （1回のログで全部の不具合が見えるようにするため）
- 初回実行後、artifact の `package-lock` をダウンロードして
  `devlearn-arena/package-lock.json` にコミットすると、以降は `npm ci` になる

## 変更を提案しないが、気づいた点

| 箇所 | 現状 | 補足 |
|---|---|---|
| `actions/upload-pages-artifact@v4` | `touch "$OUT/.nojekyll"` が実際にはアップロードされていない | v4 でドットファイルが除外されるようになったため。ただし `deploy-pages` 経由では Jekyll ビルドが走らないので実害なし。意図通りにするなら `include-hidden-files: true` を付けるか v5 へ |
| `npm install` フォールバック | lockfile が無いプロジェクトは毎回解決が変わる | 各プロジェクトに `package-lock.json` をコミットすれば `npm ci` 経路になり、ファイル内コメントにある `cache: npm` も有効化できる |
| ビルド失敗時 | 1 プロジェクトの失敗で全体が停止（`exit 1`） | 意図的な設計だと理解している。プロジェクトが増えたら「失敗したものだけ飛ばして続行」にするか要判断 |
