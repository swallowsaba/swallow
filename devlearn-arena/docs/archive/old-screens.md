# 以前の画面の一覧

DevLearn FC に方針を変える前の画面と、その画面だけが使う部品。
**消すのは `PLAN.md` の第 9 章（9-3）**。それまでは残し、テストも通したままにする。

消すときは、下の「残すもの」を壊さないこと。残すものが以前の画面の部品を import していたら、
先に新しい画面側へ移してから消す。

## 画面（道すじ）

`src/App.tsx` にある道すじ。全て以前の画面で、新しい画面（`src/screens/`）に置き換える。

| 道すじ | ファイル | 何の画面か | 置き換え先 |
|---|---|---|---|
| `/` | `src/features/park/HomeRedirect.tsx` | 入口。全体図か作業画面へ飛ばす | 事務所（9-4） |
| `/world/:trackId` | `src/features/park/ParkPage.tsx` | 3D の街の上に旧 HUD を重ねた作業画面（端末・課題の札・下の道具） | 練習（第 6 章）と街（第 4 章） |
| `/map` | `src/features/map/WorldMapPage.tsx` | 全体図の島。5 つの街を地方の地図に描く | 街の画面（9-4） |
| `/track/:trackId` | `src/features/track/TrackPage.tsx` | クリーム色の、章と任務の一覧 | 日程・練習 |
| `/lesson/:trackId/:chapterNo/:lessonSlug` | `src/features/lesson/LessonPage.tsx` | クリーム色の学習画面 | 練習（第 6 章） |
| `/sandbox` | `src/features/sandbox/SandboxPage.tsx` | クリーム色の砂場 | 無し（練習の端末で足りる） |
| `/dashboard` | `src/features/dashboard/DashboardPage.tsx` | クリーム色の成績（実績・復習の列） | 事務所・選手 |
| `/settings` | `src/features/settings/SettingsPage.tsx` | クリーム色の設定 | 設定（9-2） |
| `/glossary` | `src/features/glossary/GlossaryPage.tsx` | クリーム色の用語集 | 練習の「登場」の段の説明 |
| `*` | `src/features/NotFoundPage.tsx` | クリーム色の「見つからない」 | 新しい骨組みで作り直す |

## 見た目の部品

| 場所 | 中身 |
|---|---|
| `src/city3d/` | 街づくりの 3D（three.js）。建物・道・車・人・空・海岸 |
| `src/city/` | 3D が使えないときの 2D の街（SVG）と、街の模型 |
| `src/features/citymap/` | 3D の街を映す右側の枠と、斜めの 2D 描画 |
| `src/features/map/` | 全体図の島（地方の地図） |
| `src/features/park/` | `ParkPage` と旧 HUD（`hud/` の上の帯・課題の札・下の道具・建物の札・声・成長の記録・壊して直す） |
| `src/features/park/WorldView.tsx` `EditorPanel.tsx` `MissionPicker.tsx` | 作業画面の中の旧い枠 |
| `src/ui/Shell.tsx` | クリーム色の外枠（上の帯とメニュー） |
| `src/ui/Onboarding.tsx` | 初回だけ出るクリーム色の案内 |
| `src/ui/XpToast.tsx` `src/ui/components/` `src/ui/Term.tsx` `src/ui/ErrorBoundary.tsx` `src/ui/FooterBar.tsx` | クリーム色の共通部品 |
| `src/styles/index.css` の `--wood` `--cream` など | 遊園地風のクリーム色と木の色のトークン |
| `tailwind.config.ts` の `wood` `cream` など | 同上を Tailwind に渡す設定 |
| `src/lesson/experience/` `src/lesson/flow/` `src/lesson/diagrams/views/` | 旧 HUD の見た目で描いた、学びの 5 段と遊べる図解の画面 |
| `src/visual/` | 旧来の図（クラスタ・Git・ネットワーク・PR）の描画 |
| `src/content/city/` `src/engines/city/` | 街づくりの 3D 用の中身と模型 |
| `docs/archive/hud-mockup.html` | 旧 HUD の見本 |

## 残すもの（作り直さない）

| 場所 | 理由 |
|---|---|
| `src/engines/`（`city/` を除く） | シェル・Git・k8s・ネットワーク・GitHub の本物の仕組み。練習と試合で使う |
| `src/features/terminal/` | 端末（xterm）。見た目の色だけ新しいトークンに合わせる |
| `src/content/`（`city/` を除く） | 任務の中身・用語辞書。練習の中身の元にする |
| `src/lesson/flow/steps.ts` `quiz.ts`、`src/lesson/experience/sim.ts` `scenarios.ts` | 5 段の型と体験の模型。画面ではない |
| `src/lib/` | 間隔反復（`review.ts`）・経験値・保存 |
| `src/store/` | 保存の仕組み。第 2 章で足す |
