# Phase 15 必要に応じて Cloudflare Workers

記録した日: 2026-10-16

## 結果: 不要

`docs/development-plan.md` Phase 15 は「`docs/decisions.md` で決まった機能のみ」を作り、「決まっていない場合は、この Phase を『不要』と記録して完了」とする。

- Workers を使う機能は、どれも決まっていない
  - `docs/decisions.md` Q-05（アカウントと端末間の同期）は「初回は無し（ブラウザ内保存と、保存データの書き出し・読み込み）。必要と決まった場合だけ Phase 15 で Cloudflare Workers の無料枠を検討」のまま。「未決」にも、Workers に関わる利用者の判断は無い
  - `docs/architecture.md` 6・7 章: 初回は外部 API も Cloudflare も使わず、GitHub Pages だけで全機能が成立する
- GitHub Pages だけで全機能が動くことは、Phase 14 で公開 URL への E2E 32 件と撮影で確かめた（`docs/progress/phase-14.md`）
- 端末間の移動は、保存データの書き出し・読み込みでできる（`e2e/saves.spec.ts`「書き出したファイルを別のブラウザで読み込むと同じ状態になる」）

## 作らなかった物

- `worker/devlearn-arena/` は作らない。Cloudflare のアカウント・Secrets・CORS の設定も無い
- `docs/free-services.md` は更新しない。Cloudflare は 4 章「使う可能性があるもの（決まった場合だけ）」に参考値のまま残り、使う前に公式情報で確かめる決まり（`CLAUDE.md` 10 章）も変わらない

## 完成条件の確かめ

| 条件 | 結果 |
|---|---|
| 無料枠の範囲で動き、秘密が GitHub Pages 側に無い | 該当なし（Workers を使わない）。GitHub Pages 側に秘密が無いことは、CI の秘密情報の検査で確かめている |
| Workers が止まってもゲームと学習が続けられる | 該当なし（Workers に依存していない。全ての学習と都市はブラウザ内で完結する） |
| テスト（API・CORS・Secrets・エラー時の動作） | 該当なし |
| 視覚確認（該当画面） | 該当なし（画面の変更は無い） |

## 次への条件

決まっている機能が無いので、この Phase を「不要」と記録して完了した。次への条件を満たした。
