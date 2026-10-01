# 仕様書の索引

**最上位の規則は `CLAUDE.md`。** この索引は、各文書の責務と読む順番を示す。
同じ内容を複数の文書に書かない。ある事柄を決めている文書は 1 つだけで、他の文書はそこを参照する。

## 文書と責務

| 文書 | 責務（この文書だけが決めること） |
|---|---|
| `CLAUDE.md` | 開発の最上位ルール。禁止事項。仕様変更の手続き。参照の順番 |
| `docs/product-spec.md` | 何を作るか。目的・対象者・基本体験・機能一覧・非機能要件・無料要件・公開要件 |
| `docs/game-design.md` | ゲームとしての仕組み。ゲームループ・XP・スキル・ミッション・報酬・難易度・都市成長の規則 |
| `docs/learning-design.md` | 教え方。教育方針・レッスンの流れ・初心者対応・用語・クイズ・実戦・エラー学習の原則 |
| `docs/curriculum.md` | 何を教えるか。全分野・テーマ・レッスン一覧・難易度・推奨順・前提・関連・知識グラフ |
| `docs/lesson-samples.md` | 各分野 1 本ずつの完成形レッスン（解説〜まとめまで）。コンテンツ作成の手本 |
| `docs/content-spec.md` | コンテンツのデータ形式。レッスン・問題・実戦・エラー・ヒント・フィードバック・まとめの構造と置き場所 |
| `docs/city-design.md` | 都市の作り。都市構造・道路・建物・施設・発展段階・IT 分野と施設の対応・疑似 3D の描き方の規則 |
| `docs/ui-design.md` | 画面と操作。画面構成・操作・ナビゲーション・パネル・情報表示・PC 向けレイアウト |
| `docs/visual-design.md` | 見た目。ビジュアルコンセプト・フォント・色・建物の描き方・SVG・禁止事項・視覚確認の項目 |
| `docs/architecture.md` | 技術。技術スタックと採用理由・ディレクトリ構造・フロントエンド・データ・API・Cloudflare・GitHub Pages |
| `docs/data-model.md` | データの型。プレイヤー・XP・スキル・学習履歴・建物・都市・ミッション・セーブ |
| `docs/development-plan.md` | 開発の段取り。Phase ごとの目的・対象・対象外・完成条件・テスト・視覚確認・次への条件 |
| `docs/acceptance-criteria.md` | 完成の判定。機能・UI・学習・ゲーム・公開の完成条件 |
| `docs/testing-strategy.md` | テストの方法。単体・統合・UI・学習フロー・セーブ・公開環境・画面確認の手順 |
| `docs/free-services.md` | 使う外部サービスの無料条件と制限 |
| `docs/asset-policy.md` | 素材の扱い。使える素材・ライセンス・SVG・フォント・禁止素材・出典の記録 |
| `docs/deployment.md` | 公開。GitHub・GitHub Actions・GitHub Pages・Cloudflare Workers・環境変数・Secrets・公開手順 |
| `docs/decisions.md` | 要求の食い違いと、その両立案。残っている要決定事項 |

## 文書どうしの関係

```text
product-spec ─┬─ game-design ─┬─ city-design ── visual-design
              │               └─ data-model
              ├─ learning-design ── curriculum ── lesson-samples
              │                     └─ content-spec ── data-model
              ├─ ui-design ── visual-design
              └─ architecture ── data-model / deployment / free-services
development-plan ── acceptance-criteria ── testing-strategy
decisions は全文書に優先して「どちらを採るか」を記録する（CLAUDE.md の次に強い）
```

## Claude Code が読む順番

1. `CLAUDE.md`
2. `docs/decisions.md`（食い違いの決着）
3. `docs/product-spec.md`
4. `docs/game-design.md`
5. `docs/learning-design.md`
6. `docs/curriculum.md`
7. `docs/content-spec.md`（必要なら `docs/lesson-samples.md`）
8. `docs/city-design.md`
9. `docs/ui-design.md`
10. `docs/visual-design.md`
11. `docs/architecture.md`
12. `docs/data-model.md`
13. `docs/development-plan.md`
14. `docs/acceptance-criteria.md`
15. `docs/testing-strategy.md`
16. `docs/deployment.md`（公開の Phase で）
17. `docs/free-services.md` `docs/asset-policy.md`（サービスや素材を使うとき）

毎回すべてを読み直す必要はない。**今の Phase に関係する文書は必ず読む。**
