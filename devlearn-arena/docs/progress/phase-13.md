# Phase 13 テスト

記録を始めた日: 2026-10-16。終えた日: 2026-10-16

## 実装したこと（コミットの順）

- 13-1 学習フローの E2E を分野ごとに（`e2e/domains.spec.ts`。`docs/testing-strategy.md` 7 章）: found.b.04・linux.i.01 と、15 分野の初級 1 本ずつ（lab は初級が無い）。どれも前提を学ばずに始め、実戦でわざと 1 度誤ってエラーの案内（内容 → 原因候補 → ヒント）を見てから、直して 7 段を通す。
  実戦の形は端末・設定の編集・SQL・置く・つなぐ・並べる・読み取って答える、の全て。撮影の台本 `tools/scenarios/domain.mjs` の `runLesson` を E2E からも呼ぶ
  - 見つけた不具合: 並べるの記録の文が、札を全て並びから外した時に崩れていた（先に失敗するテストを書いて直した）
- 13-2 学習フローの残り（`e2e/flow.spec.ts`）: 前提なしで中級（k8s.i.08）・上級（linux.a.01。範囲外で準備中の案内）を入口の札から始められ、ロックの言葉がどこにも無い。7 段の途中で Esc で中断し、リロードして開き直すと進んだ段から再開する。直リンク（`#/learn/…`・`#/lesson/…`・`#/glossary/…`・`#/growth`・`#/missions`・`#/settings`）とリロードで同じ画面が出る
  - 見つけた不具合: 直リンクやリロードでレッスン・ミッションの画面が初めから都市を覆って開くと、都市を描かないので読み込み中の演出が残り、画面を隠していた。覆う画面が開いたら演出を下げる（`e2e/boot.spec.ts` に先に失敗する E2E を書いた。直す前は失敗し、直した後は通ることを確かめた）
- 13-3 秘密情報の検査（`tools/secret-scan.mjs`・`npm run secrets`。`docs/testing-strategy.md` 9 章・`docs/deployment.md` 6 章）: git が持つ全てのファイル・`dist/`・このプロジェクトのコミットの文から、鍵・トークンの形（秘密鍵・GitHub・AWS・Google・Slack・AI の API キー・決済・Cloudflare・秘密の値を書いた設定）と、置いてはいけないファイル（`.env`・鍵のファイル・`.dev.vars`）を探す。
  ssh-keygen の模擬（sec.b.04）が seed から作る形だけの鍵は、場所と理由を書いて外す（`ALLOW`）。`src/__tests__/secret-scan.test.ts` が、見つける物・見つけない物・外し方を確かめる
  - CI（`.github/workflows/ci.yml`）: ビルドの後に秘密情報の検査を足した。E2E を公開と同じ `/swallow/devlearn-arena/` で配信するようにした
  - `.gitignore` に `.env*` を足した（`docs/deployment.md` 1 章。見本の `.env.example` は除く）
- 13-4 出典（`CREDITS.md`。D5）: ライブラリの欄が「主なもの」だけで、`@noble/hashes`・`@xterm/xterm`・`@xterm/addon-fit`・`js-yaml` と、sql.js が同梱する SQLite の WebAssembly が載っていなかった。
  公開する物に入る包み（`dependencies` の 13 個）を全て、ライセンスと使っている場所の表にした。効果音（波形から作る）も載せた。`src/__tests__/credits.test.ts` が、全ての包みがライセンスと一緒に載っていることを確かめる（先に失敗するテストを書いた）

## テスト

- `npm run typecheck` `npm run lint` `npm run test`: 全て通過（175 ファイル・1,917 件。試し台を除く）
- `npm run secrets`: 何も見つからない（2,602 ファイルとコミットの文）
- E2E（`E2E_BASE=/swallow/devlearn-arena/ npx playwright test`。`npm run build` の結果を `vite preview` で公開と同じサブディレクトリから配信）: **30 件すべて通過**（2.8 分）
  - ゲームループ（`loop`）・キーボードだけ（`keyboard`）・学習フロー 17 本（`domains`）・中断と再開・前提なし・直リンク（`flow` 3 本）・読み込みの演出（`boot` 2 本）・覆う間は都市を描かない（`covered`）・レッスンの枠（`lesson-layout`）・ミニマップ（2 本）・オフライン（`offline`）・保存（`saves` 3 本）
  - 手元の Git Bash で `E2E_BASE=/swallow/…` と書くと、`/swallow/…` が Windows の場所に書き換えられて全て落ちる（アプリの不具合ではない）。PowerShell から動かした

`docs/testing-strategy.md` の章ごと:

| 章 | 結果 | 根拠 |
|---|---|---|
| 1 共通 | 合格 | 3 つの検査を通してからコミットした。見つけた不具合（13-1・13-2・13-4）は先に失敗するテストを書いた |
| 2 単体 | 合格 | 都市（座標・描画順・配置・道路・成長・seed）・ゲーム（XP・スキル・段階）・学習（段・クイズ・推奨・グラフ・復習）・模擬環境・保存（往復・移行・壊れたデータ）・層の境界（`layers.test.ts` と ESLint）・見た目の規則（`visual-rules.test.ts`・`banned.test.ts`） |
| 3 コンテンツ | 合格 | `validate.test.ts`（7 段・用語・誤答の理由・クイズの種類・最後のヒントで通る）・`catalog.test.ts`（循環なし・ロックを持てない形）。ビルドの前にも `scripts/validate-content.mts` が掛かる |
| 4 統合 | 合格 | `src/__tests__/loop.test.ts`（学習 → XP・スキル・資金 → 都市）・`missions.test.ts`（達成 → 報酬 → 都市）・`saves.spec.ts`（保存 → 再読み込み → 同じ状態） |
| 5 UI | 合格 | 部品のテスト（情報パネル・入口の札・クイズ・用語の小窓・エラーの小窓）、`loop.spec.ts` のゲームループ、`keyboard.spec.ts`、`contrast.test.ts` |
| 6 撮影 | 合格 | 下の視覚確認 |
| 7 学習フロー | 合格 | 13-1・13-2 |
| 8 セーブ | 合格 | `saves.spec.ts`（自動保存 → リロード・別のブラウザで読み込み・壊れたファイルで消えない・やり直し）と `src/save/*.test.ts`（版の移行） |
| 9 公開環境 | 公開前の分は合格 | サブディレクトリ配信の E2E・直リンクとリロード・秘密情報の検査を CI で。公開 URL への E2E と撮影は Phase 14 |

## 計測

- 都市画面の fps（`SHOOT_FPS=1`、`tools/scenarios/inspect.mjs` の町、毎フレーム描き直し）: 1920×1080 で 57.3fps（描いた物 389）、1280×720 で 60.0fps（描いた物 295）
- 常時の UI の割合（同じ台本）: 1920×1080 で 10.9%、1280×720 で 19.6%。情報パネルを開くと 22.3%・37.9%（開いている間だけで、常時ではない）
- 名札: 置けた 6 / 6・重なり 0（両方の大きさ）
- 動き: 2 秒あけて撮った 2 枚（`p13-motion`）で 30,157 画素（1.5%）が変わった。車・人が動いている

## 視覚確認

撮影: `.tmp-shootall13.sh`（手元の一時の台本。Phase 12 と同じ撮影の台本を順に動かす）で `shots/p13-1920x1080/` と `shots/p13-1280x720/` に 127 枚ずつ撮った。ページの誤りは、読めなかった時の画面を撮るためにわざと回線を切った 1 件（`ERR_INTERNET_DISCONNECTED`）だけ。

開いて確かめた画面: 都市（初め・町・名札・学習の後の知らせと情報パネル・動き）・知識グラフ・学習ライブラリ・レッスン（解説・実戦の端末とエラーの小窓・設定の編集・SQL・つなぐ）・ミッションの実戦と達成・成長・設定と保存（読み込む前の中身・やり直しの確かめ）。1280×720 は名札・学習ライブラリ・SQL・つなぐ・ミッション・解説・成長・やり直しの確かめ。

| # | 結果 | 確かめたこと |
|---|---|---|
| V1 | 合格 | 都市画面の常時の UI は 10.9% / 19.6%。都市ビューが 80% 以上 |
| V2 | 合格 | 上の帯の計器・斜めに切った金のボタン・角を削った窓。ウェブページの見た目の画面は無い |
| V3 | 合格 | 建物・施設に奥行き・側面・屋根・影。レッスン・ミッションの背景は施設の中の奥行きのある部屋 |
| V4 | 合格 | 施設は窓・入口・屋上の機器・塀・木・駐車場を持ち、道路に面している。区画の建物も窓と屋根の形が様々 |
| V5 | 合格 | 標準のボタン・青いリンク・枠線だけの表が無い |
| V6 | 合格 | 見出し M PLUS 1・本文 Noto Sans JP・数字 Barlow Condensed・端末 JetBrains Mono |
| V7 | 合格 | 同じ形の札が 6 枚以上並ぶ画面は無い（学習ライブラリの一覧を除く） |
| V8 | 合格 | レッスン・ミッションは施設の中の部屋を背景にし、上の帯に施設の名前 |
| V9 | 合格 | V1 の数値 |
| V10 | 合格 | 名札の重なり 0（両方の大きさ） |
| V11 | 合格 | 絵文字は無い（`visual-rules.test.ts`・撮影） |

1280×720 で長いレッスンの題名（「コンピュータは何をしてい…」）は省略の印で切れる。上の帯の段の並びに場所を譲る作りで、崩れではない。

## 完成条件（`docs/acceptance-criteria.md`）

| # | 結果 | 根拠 |
|---|---|---|
| G1 | 合格 | 起動直後は都市画面（`loop.spec.ts`・`boot.spec.ts`・撮影 `city`） |
| G2 | 合格 | 移動・拡大縮小・回転（`keyboard.spec.ts`・`loop.spec.ts`・`camera.test.ts`） |
| G3 | 合格 | 施設を選ぶと情報パネル、おすすめから始める（`loop.spec.ts`・`InfoPanel.test.tsx`・`inspect.mjs` で 19 種全ての情報パネル） |
| G4 | 合格 | 7 段を通す（`domains.spec.ts` 17 本）。中断と再開（`flow.spec.ts`） |
| G5 | 合格 | XP とスキルが式の通り（`xp.test.ts`・`skill.test.ts`・`LessonScreen.test.tsx`） |
| G6 | 合格 | 戻ると変化の場所へカメラが寄り、選ばれ、知らせが出る（`loop.spec.ts`・撮影 `p8-after-notice`） |
| F1 | 合格 | 直線・曲線・橋・区画・施設・公園と置けない理由（`place.test.ts`） |
| F2 | 合格 | 区画の建物が条件で建ち、育つ（`growth.test.ts`） |
| F3 | 合格 | 分野の 15 施設が Lv1〜Lv5 を持ち、Lv ごとに違う（`assets/facilities.test.ts`・撮影 `p9-levels`） |
| F4 | 合格 | 技術力と都市規模の両方で上がり、霧が晴れる（`stage.test.ts`・`growth.test.ts`） |
| F5 | 合格 | 6 本を受け、達成し、記念碑が都市に置ける（`src/__tests__/missions.test.ts`・`MissionScreen.test.tsx`・撮影 `p9-*`） |
| F6 | 合格 | 学習ライブラリ・知識グラフ・成長・用語集・設定（各画面のテストと `flow.spec.ts` の直リンク・撮影） |
| F7 | 合格 | 保存・読み込み・書き出し・やり直し（`saves.spec.ts`・`src/save/*.test.ts`） |
| U1〜U7 | 合格 | 上の視覚確認と計測。U5 は `keyboard.spec.ts`・`contrast.test.ts`、U7 は `minimap.spec.ts` |
| L1 | 合格 | 前提なしで中級・上級を始められ、ロックを持てない形（`flow.spec.ts`・`domains.spec.ts`・`catalog.test.ts`） |
| L2 | 合格 | 推奨順・推奨前提・関連・次に学ぶとよい（`recommend.test.ts`・`LearnScreen.test.tsx`・撮影 `p5-graph`・レッスンの下の帯） |
| L3 | 合格 | 全レッスンが 7 段、解説にコマンドを書かない（`validate.test.ts`） |
| L4 | 合格 | 本文の用語が用語集にあり、押すと説明（`validate.test.ts`・`LessonScreen.test.tsx` の用語の小窓・撮影 `p6-term`） |
| L5 | 合格 | クイズの形が 3 種類以上、誤答に理由（`validate.test.ts`） |
| L6 | 合格 | 模擬環境の状態で判定し、最後のヒントで通る（`validate.test.ts`・各模擬のテスト） |
| L7 | 合格 | エラー → 内容 → 原因候補 → ヒント → 再挑戦（`domains.spec.ts` 17 本でわざと誤る・撮影 `p7-error`） |
| L8 | 合格 | 推奨学習順でコンテナが Docker の前、Kubernetes は独立した分野（`catalog.test.ts`・`graph.test.ts`） |
| L9 | 合格 | 初回公開の範囲（Q-04）のレッスンが全 16 分野で揃う（`validate.test.ts`。書き起こしたレッスン 131 本） |
| P1 | 合格 | 稼ぎ防止（`xp.test.ts`・`loop.test.ts`） |
| P2 | 合格 | スキルの「何をしたからこの値か」（`GrowthScreen.test.tsx`・撮影 `p4-growth-linux`） |
| P3 | 合格 | どの分野の組み合わせでも段階が上がる（`stage.test.ts`） |
| P4 | 合格 | 報酬に「できるようになったこと / なること」（`LessonScreen.test.tsx`・`MissionScreen.test.tsx`・撮影 `p9-mission-result`） |
| D1 | Phase 14 | 公開 URL で動くこと。公開前に確かめられる分（公開と同じサブディレクトリで配信した E2E 30 件・直リンクとリロード）は合格 |
| D2 | Phase 14 | 手元で build・test・lint・型検査が通る。CI で通ることは、push した後の Phase 14 で確かめる |
| D3 | 合格 | `npm run secrets` で何も見つからない。CI に組み込んだ |
| D4 | 合格 | 外へ通信するのは Service Worker が同じ場所の静的ファイルを取りに行く所だけ（`src/offline/sw.ts`）。外部のサービスは使っていない（`docs/free-services.md` 1 章の一覧と一致。2 章の同梱する部品に、載っていなかった xterm.js・js-yaml・@noble/hashes を足した） |
| D5 | 合格 | 13-4。`credits.test.ts` |

D1・D2 は公開してからでないと確かめられない（`docs/development-plan.md` Phase 14 の完成条件「公開 URL で E2E が通る」）。Phase 13 では公開前に確かめられる全てを確かめ、残りを Phase 14 で確かめる。

## 次への条件

完成条件（公開してから確かめる D1・D2 を除く全項目）・テスト・視覚確認を満たし、記録した。次への条件を満たした。
