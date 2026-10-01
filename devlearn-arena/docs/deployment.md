# 公開（デプロイ）

技術の構造は `docs/architecture.md`、サービスの制限は `docs/free-services.md`。
この文書は**公開の手順と、秘密の扱い**を決める。

## 1. GitHub

- リポジトリ: `swallowsaba/swallow`（複数のプロジェクトを持つ）。このプロジェクトは `devlearn-arena/` 以下
- 既定のブランチ: `main`
- コミットは意味のある単位で。大きな変更を一度に入れない
- `.gitignore` に `node_modules/` `dist/` `shots/` `.env*` を入れる

## 2. GitHub Actions

| ワークフロー | きっかけ | すること |
|---|---|---|
| `ci.yml` | プルリクエストと main への push | 型検査・lint・単体テスト・コンテンツの検査・秘密情報の検査・ビルド |
| `deploy.yml`（他のプロジェクトと共有） | main への push | リポジトリ内の各プロジェクトをビルドし、GitHub Pages に公開 |

- `deploy.yml` は他のプロジェクトと共有している。`devlearn-arena` の部分だけを変更し、他のプロジェクトの部分を壊さない
- `worker/` フォルダ（Cloudflare Workers 用の別プロジェクト）は Pages の公開対象から外す（既存の扱いを保つ）
- E2E は時間がかかるため、main への push で 1 回だけ実行する

## 3. GitHub Pages

- 公開 URL: `https://swallowsaba.github.io/swallow/devlearn-arena/`
- Vite の `base` を環境変数 `VITE_BASE` で渡す（既定 `/swallow/devlearn-arena/`、手元では `/`）
- 画面の切り替えはハッシュ（`#/...`）なので、直リンクとリロードで 404 にならない。念のため `404.html` を `index.html` の写しとして出力する
- アセットは相対パスか `import.meta.env.BASE_URL` から作る。絶対パス（`/assets/...`）を書かない
- HTTPS は GitHub Pages が提供する

## 4. Cloudflare Workers

**初回は使わない**（`docs/architecture.md` 7 章）。使うと決まった場合の手順:

1. `docs/free-services.md` を公式情報で更新する
2. `worker/devlearn-arena/` に Workers のプロジェクトを作る（Pages の公開対象外）
3. Secrets は `wrangler secret put` で Cloudflare に置く。リポジトリには置かない
4. CORS は公開 URL のオリジンだけを許可する
5. 無料枠を超えたら止まる設定にする
6. Workers が止まってもアプリが動くことを E2E で確かめる

## 5. 環境変数

| 名前 | 置き場所 | 中身 | 秘密か |
|---|---|---|---|
| `VITE_BASE` | ビルドのコマンド | 公開のベースパス | 秘密ではない |
| `VITE_BUILD_ID` | ビルドのコマンド | コミットの短い ID（表示用） | 秘密ではない |

**`VITE_` で始まる変数はブラウザに埋め込まれて公開される。秘密を入れてはいけない。**

## 6. Secrets

- 初回の公開に必要な秘密は**無い**（GitHub Pages の公開は Actions の標準の権限で行う）
- 将来必要になった秘密は、GitHub の Repository secrets か Cloudflare の Secrets に置く
- 秘密をコード・設定ファイル・コミットの文・Issue に書かない
- 秘密情報の検査を CI で実行する（`docs/testing-strategy.md` 9 章）
- 誤ってコミットした場合: 直ちに無効化（鍵の再発行）→ 履歴から除去 → 再発防止、の順に対処する

## 7. 公開の手順

1. main に変更が入る
2. `ci.yml` が通っていることを確かめる
3. `deploy.yml` が公開する
4. 公開 URL に対して E2E と撮影を実行する
5. 結果を `docs/progress/` に記録する

## 8. 公開前の確認

- [ ] `npm run build` が通る
- [ ] `npm run test` が通る
- [ ] `npm run lint` が通る
- [ ] `npm run typecheck` が通る
- [ ] サブディレクトリ配信で動く（`npm run preview -- --base /swallow/devlearn-arena/`）
- [ ] アセットのパスが全て解決する（コンソールに 404 が無い）
- [ ] 直リンクとリロードで画面が出る
- [ ] 保存がリロード後も残る
- [ ] PC の画面（1920×1080 と 1280×720）で表示が崩れない
- [ ] HTTPS で配信されている
- [ ] 秘密情報の検査で何も見つからない
- [ ] `CREDITS.md` が同梱物と一致する
