# Phase 0 仕様・設計と片付け

記録した日: 2026-10-02

## 実装したこと

- 今の仕様書以外の指示書・設計書を `docs/archive/` へ移した: `docs/design/` `docs/game/` `docs/games/` `docs/review/`、
  `PLAN.md`（→ `PLAN-fc.md`）、`README-SETUP.md`（→ `README-SETUP-fc.md`）、旧 `README.md`（→ `README-p1.md`）、
  索引から外れた `docs/lesson-samples.md`（`docs/lessons/` に置き換わった）、確認ページの道具 `tools/review.mjs`（→ `old-tools/`）。
  一覧は `docs/archive/README.md`
- 既存のコードを調べ、再利用・置き換え・候補を理由付きで `docs/archive/inventory.md` に書いた。
  不要になる依存（three 一式・framer-motion・react-router-dom・tailwind 一式）と削除の時期も同じ表にある
- 再利用する模擬環境が使う依存（`@noble/hashes` `js-yaml`）を `docs/architecture.md` 2 章の表に理由付きで足した
- 新しい `src/city/` の場所を空けるため、以前の 2D の街（旧 `src/city/`）を `src/legacy/city/` へ移した（削除は Phase 2）
- ESLint に層の境界の規則を入れた: `src/city`（`render/` を除く）・`src/game`・`src/learning`・`src/engines` は
  画面の包み（react・three・zustand など）を import せず、`window` `document` Canvas などに触れず、`Date` と `Math.random` を使わない。
  `src/city/render` は画面の包みだけを禁じる。わざと破ったファイルで 5 件の誤りが出ることを確かめた
- `src/__tests__/layers.test.ts` の見張りの対象を `city`（`render/` を除く）・`learning` に広げた

## 完成条件

| 条件 | 結果 |
|---|---|
| 一覧ができている | 合格。`docs/archive/inventory.md` |
| 既存のテストが全て通る | 合格。154 ファイル・5371 件が通る（6 件の飛ばしは、まだ無い層 `game` `learning` `city` の見張り） |
| `docs/` が新しい仕様書だけになっている | 合格。`docs/` 直下は `docs/README.md` の索引にある文書と `lessons/`・`progress/`・`archive/` だけ |

## テスト

- `npm run typecheck`: 通過
- `npm run lint`: 通過（以前は `tools/review.mjs` の 1 件で落ちていた。道具を `docs/archive/` へ移し、`docs/archive/` を lint の対象から外した）
- `npm run test`: 通過

## 視覚確認

なし（この Phase は画面を作らない）。

## 次への条件

完成条件・テスト・視覚確認を満たし、記録した。**次への条件を満たした。**
