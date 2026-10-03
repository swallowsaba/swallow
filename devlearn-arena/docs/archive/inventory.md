# 既存のコードの判定（Phase 0）

`docs/decisions.md` D-05 による一覧。リポジトリにある既存のコードが、**今の仕様書の要件を満たすか**を判定し、
再利用する物と置き換える物を理由付きで並べる。調べた日: 2026-10-02。

- **再利用**: 今の仕様の要件を満たす。そのまま使う（必要なら足す）
- **候補**: 要件を一部満たす。表に書いた Phase で、使うか作り直すかを決める
- **置き換え**: 要件を満たさない。新しい物ができた Phase で削除する（それまではテストを通したまま残す）

判定の基準は、主に次の仕様。

- 層の境界・決定論（`docs/architecture.md` 3 章）
- コンテンツはデータ（`content/` の JSON）として持つ（`docs/content-spec.md` 1 章）
- 判定は模擬環境の状態で行う（`docs/content-spec.md` 2.4）
- 都市は Canvas 2D の等角投影、3D エンジンは入れない（`docs/decisions.md` D-01）
- 画面の切り替えはハッシュ（`docs/architecture.md` 4 章）
- 見た目は `src/ui/tokens.ts` と指定のフォントだけ（`docs/visual-design.md`）

## 1. 模擬環境（`src/engines/`）

| 場所 | 判定 | 理由 | 扱う Phase |
|---|---|---|---|
| `src/engines/kernel/`（シェル・仮想ファイルシステム・権限・プロセス・補完・行編集・時計・乱数） | **再利用** | React・DOM に触れない純粋な TS。時刻は模擬の時計、乱数は seed（`rng.ts`）。テストが揃っている。仮想端末の要件（`docs/learning-design.md` 6 章）を満たす。足りないもの: `systemctl` などのサービス（linux.i.01 の `service` 判定） | Phase 7 で `systemctl` を足す |
| `src/engines/git/` | **再利用** | Git の状態（オブジェクト・参照・作業ツリー・統合・衝突）を持つ純粋な TS。`git` の判定（`CheckSpec` の `git`）に使える | Phase 7・10 |
| `src/engines/github/` | **再利用** | プルリクエスト・Actions の模擬。`docs/architecture.md` 3 章の `github/` に当たる | Phase 10（cicd と共有） |
| `src/engines/k8s/` | **再利用** | クラスタ・スケジューラ・コントローラ・ロールアウトの模擬。`k8s` の判定に使える | Phase 10 |
| `src/engines/net/` | **再利用** | 機器・経路・DNS・TCP の模擬。`net` の判定に使える | Phase 10 |
| `src/engines/kernel/commands/`（`ls` `cd` `git` `kubectl` `gh` など） | **再利用** | 上の模擬を端末から操作するコマンド | Phase 7 |
| `src/engines/lesson/`（任務・判定・手順・用語・図の ID） | **置き換え** | 判定を関数（`assert`）で書いており、**コンテンツをデータとして持つ**要件（`docs/content-spec.md` 1 章・`CheckSpec`）を満たさない。学びの流れが 5 段で、7 段（解説 → 理解 → クイズ → 実戦 → 結果 → まとめ → XP）と合わない。中身（手順・ヒント・誤りの診断）は書き起こしの参考にする | Phase 5〜7 で `content/` と `src/learning/` に置き換え、Phase 10 で削除 |
| `src/engines/city/`（`civic.ts`） | **置き換え** | 以前の「状態を写した街」の模型。都市の作り（`docs/city-design.md`）と別物。Phase 2 の時点で、旧画面の `src/features/map/` だけが使っている | 旧画面（`src/features/map/`）と一緒に削除 |

## 2. 都市

| 場所 | 判定 | 理由 | 扱う Phase |
|---|---|---|---|
| `src/legacy/city/`（旧 `src/city/`。SVG の 2D の街と、模擬環境の状態から街を作る模型） | **置き換え** | 街が「学習の状態の写像」で、道路・区画・施設を学習者が置く都市（`docs/decisions.md` D-03）ではない。React の部品が模型と同じ所にあり、層の境界を破る。新しい `src/city/` の場所を空けるため、Phase 0 で `src/legacy/city/` へ移した | 新しい都市は Phase 2 で置き換えた。ただし旧作業画面 `src/features/park/`（Phase 6・7 で削除）が import しているため、それと一緒に削除する |
| `src/city3d/`（three.js の 3D の街） | **置き換え** | 3D エンジンを使う（`docs/decisions.md` D-01 で不採用） | 同上（`src/features/park/` が import している）。道すじからは外れていて、画面には出ない |
| `src/features/citymap/` `src/features/map/` | **置き換え** | 3D の街の枠と、全体図の島。都市画面（`docs/ui-design.md` 3 章）と別物 | Phase 1 で道すじから外した。`src/features/park/` が import しているため、それと一緒に削除 |

## 3. 画面と見た目の部品

| 場所 | 判定 | 理由 | 扱う Phase |
|---|---|---|---|
| `src/App.tsx`（`BrowserRouter` の道すじ） | **置き換え** | 画面の切り替えはハッシュ（`#/city`）と決まっている（`docs/architecture.md` 4 章）。起動直後が都市画面でない | Phase 1 |
| `src/features/park/`（作業画面と旧 HUD） | **置き換え** | 起動直後の画面が学習の作業画面。都市が主役の画面構成（`docs/ui-design.md` 3 章）ではない | Phase 1 で道すじから外し、Phase 6・7 で削除 |
| `src/features/track/` `lesson/` `sandbox/` `dashboard/` `settings/` `glossary/` `NotFoundPage.tsx` | **置き換え** | クリーム色の旧画面。学習サイト風で、指定のフォントと tokens を使っていない | 新しい画面ができた Phase（5・6・11）で削除 |
| `src/features/terminal/`（xterm の端末） | **再利用**（Phase 7 で判定） | 仮想端末として動き、模擬環境とつながっている。`@xterm/*` を `docs/architecture.md` 2 章の表に足し、`src/screens/lesson/terminal/` へ移した。色と字は tokens から引くように直した。図から打ち込む部品（`typist`）と時間をさかのぼる部品（`TimeScrubber`）は使わないので削除 | Phase 7 |
| `src/lesson/`（学びの 5 段・遊べる図解） | **置き換え** | 5 段で 7 段と合わない。図はコンテンツ（`content/figures/` の SVG）として持つ決まり（`docs/visual-design.md` 6 章） | Phase 6 で削除 |
| `src/visual/`（クラスタ・Git・ネットワーク・PR の図） | **置き換え** | 旧来の図。レッスンの図は `content/figures/` に置く | Phase 6 で削除 |
| `src/ui/`（`Shell` `Onboarding` `XpToast` `Term` など） | **置き換え** | クリーム色の部品。`src/ui/tokens.ts` と指定のフォントを使っていない。`Splitter.tsx`（左右の境を動かす）は Phase 6 のレッスン画面で使えるか見る | Phase 1 から順に。全て Phase 12 までに削除 |
| `src/styles/index.css` `tailwind.config.ts` `postcss.config.js` | **置き換え** | 遊園地風のクリーム色の値。Tailwind は `docs/architecture.md` 2 章の表に無い | 旧画面を消した Phase で削除 |
| `src/i18n/`（日本語と英語の文言） | **置き換え** | 旧画面の文言。初回は日本語のみ（`docs/decisions.md` Q-02） | 旧画面と一緒に削除 |

## 4. ゲーム・学習・保存

| 場所 | 判定 | 理由 | 扱う Phase |
|---|---|---|---|
| `src/lib/xp.ts` `achievements.ts` | **置き換え** | XP の曲線とランクが `docs/game-design.md` 3 章・9 章と違う。実績は仕様に無い | Phase 4（`src/game/`） |
| `src/lib/review.ts`（SM-2 の簡易版） | **置き換え** | 復習の間隔は 1・3・7・14・30 日と決まっている（`docs/learning-design.md` 11 章） | Phase 8〜11（`src/learning/`） |
| `src/lib/storage/` `src/store/` | **置き換え** | 保存の形が `docs/data-model.md` 7 章（`SaveData`・版と移行・IndexedDB の `save` ストア）と違う。IndexedDB の包み（`idb.ts`）の書き方は参考にする | Phase 11（`src/save/`） |
| `src/lib/spaFallback.ts` `scripts/postbuild.mjs` | **置き換え** | `BrowserRouter` の直リンクのための振り替え。ハッシュの道すじでは不要 | Phase 1 で道すじを替えた後、Phase 14 で削除 |
| `src/lib/sfx.ts` `useSfx.ts`（Web Audio で合成する効果音） | **候補** | 音声ファイルを持たず、既定は無音。`docs/decisions.md` Q-03 の既定の案（自作の効果音・既定は消音）に合う | Phase 12 |
| `src/lib/date.ts` | **置き換え** | 旧画面の日付の扱い | 旧画面と一緒に削除 |
| `src/legacy/content/`（旧 `src/content/`。旧 `catalog`・`tracks`・用語辞書） | **置き換え** | コンテンツが TypeScript のコードで、`content/` の JSON ではない。分野が 5 つ（今の仕様は 16） | Phase 5 で新しい `src/content/` の場所を空けるため `src/legacy/content/` へ移し、新しい読み込み（`content/` の JSON と zod）に置き換えた。旧画面と一緒に削除 |
| `scripts/check-docs-links.mts` | **置き換え** | 旧カタログの出典を確かめる道具 | 旧カタログと一緒に削除 |

## 5. 道具・設定

| 場所 | 判定 | 理由 | 扱う Phase |
|---|---|---|---|
| `tools/shoot.mjs` `shoot-all.mjs` `scenes.mjs` `browser.mjs` `motion-check.mjs` | **候補** | Playwright で撮る仕組みは使える。ただし大きさが 1600×900（仕様は 1920×1080）で、場面が旧画面 | Phase 1 で `npm run shoot -- <名前> <パス>` に作り直す |
| `tools/review.mjs`（確認ページ） | **置き換え** | 以前の進め方（人の承認を待つ）の道具。`docs/archive/old-tools/` へ移した | Phase 0 で移動済み |
| `e2e/smoke.spec.ts` | **置き換え** | 旧画面の E2E | Phase 8 でゲームループの E2E（`e2e/loop.spec.ts`）に置き換えて削除済み |
| `deploy/`（CI と 404 の振り替え） | **候補** | `docs/deployment.md` と照らす | Phase 14 |
| `eslint.config.js` | **再利用** | Phase 0 で層の境界の規則（`src/city`（`render/` を除く）・`src/game`・`src/learning`・`src/engines` は画面の包み・DOM・Canvas・`Date`・`Math.random` を使わない）を入れた | — |
| `src/__tests__/layers.test.ts` | **再利用** | 層の境界の二重の見張り。対象を `city`・`learning` に広げた | — |

## 6. 依存

| 依存 | 判定 | 理由 | 削除の時期 |
|---|---|---|---|
| `three` `@react-three/fiber` `@react-three/drei` `@types/three` | **削除** | 3D エンジン（`docs/decisions.md` D-01 で不採用） | `src/city3d/` の削除と同時（旧作業画面の削除の時。上の 2 章） |
| `framer-motion` | **削除** | 表に無い。画面の切り替えの動き（0.3 秒以内）は CSS で足りる | 旧画面の削除と同時 |
| `react-router-dom` | **削除** | 表に無い。ハッシュの道すじは自作の小さな仕組みで足りる | Phase 1 で使わなくし、旧画面の削除と同時に外す |
| `tailwindcss` `postcss` `autoprefixer` | **削除** | 表に無い。見た目は tokens から引く | 旧画面の削除と同時 |
| `@xterm/xterm` `@xterm/addon-fit` | **再利用** | 端末の表示。Phase 7 で `docs/architecture.md` 2 章の表に理由を足した | — |
| `@noble/hashes` | **再利用** | Git の模擬がオブジェクトの名前（SHA-1）を計算するのに使う。`docs/architecture.md` 2 章に追記した | — |
| `js-yaml` | **再利用** | Kubernetes の模擬が YAML のマニフェストを読むのに使う。設定の編集（`docs/learning-design.md` 6 章）でも使う。`docs/architecture.md` 2 章に追記した | — |
| `react` `react-dom` `zustand` `zod` `vite` `vitest` `@playwright/test` `typescript` `eslint` 一式 `jsdom` | **再利用** | 表にある（`jsdom` は Vitest で部品を試す環境） | — |
| 表にあって未導入: `@fontsource/*` `sql.js` | — | Phase 1（フォント）と Phase 7（DB）で入れる | — |

## 7. 削除の記録

| Phase | 削除した物 | 理由 |
|---|---|---|
| 6 | `src/lesson/` `src/visual/` | 5 段の学びと旧来の図。7 段のレッスン画面（`src/screens/lesson/`）と `content/figures/` に置き換えた |
| 6 | `src/features/park/`（旧作業画面）と、それだけが使っていた `src/city3d/` `src/features/citymap/` `src/features/map/` `src/legacy/city/` `src/features/sandbox/` | 都市画面（Phase 1〜3）とレッスン画面（Phase 6）に置き換えた。起動から辿れない（`src/main.tsx` からの import に無い） |
| 6 | `src/features/lesson/` `src/features/glossary/` `src/features/track/` `src/features/dashboard/` | クリーム色の旧画面。レッスン画面・用語集・学習ライブラリ・成長画面に置き換えた |
| 6 | `src/features/terminal/useDiagramRunner.ts`、`src/__tests__/terminal.test.tsx`、`src/legacy/ui/motion.test.tsx` | 削除した旧図・旧作業画面を動かす物と、そのテスト。端末の表示（`TerminalView`）は Phase 7 の判定まで残す |
| 6 | `three` `@react-three/fiber` `@react-three/drei` `@types/three` | `src/city3d/` の削除と同時（6 章の表） |
| 7 | `src/features/terminal/TimeScrubber.tsx` `typist.ts` | 旧作業画面で図から打ち込む・時間をさかのぼる部品。実戦の端末（`src/screens/lesson/terminal/`）では使わない |
