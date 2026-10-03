# 出典とライセンス

外部由来の素材・フォント・ライブラリを全て記録する（`docs/asset-policy.md`）。素材を足すコミットで、この表も更新する。

## フォント

| 名前 | 作者 | ライセンス | 出典 | 使っている場所 |
|---|---|---|---|---|
| M PLUS 1 | M+ FONTS PROJECT | SIL OFL 1.1 | @fontsource/m-plus-1 | 見出し |
| Noto Sans JP | Google | SIL OFL 1.1 | @fontsource/noto-sans-jp | 本文・UI |
| Barlow Condensed | Jeremy Tribby | SIL OFL 1.1 | @fontsource/barlow-condensed | 数字 |
| JetBrains Mono | JetBrains | SIL OFL 1.1 | @fontsource/jetbrains-mono | 端末・コード |

## ライブラリ

`package.json` の依存と一致させる。主なもの: React（MIT）・Vite（MIT）・Zustand（MIT）・zod（MIT）・sql.js（MIT）・Vitest（MIT）・Playwright（Apache-2.0）。

## 画像・音

| 名前 | 作者 | ライセンス | 出典 | 使っている場所 |
|---|---|---|---|---|
| 施設・建物・アイコン・図 | 本プロジェクト | 自作 | — | 全体 |
| 施設の Lv1〜Lv5（15 施設 × 5 枚）と公園の類 | 本プロジェクト | 自作（`src/city/generate/facilityModels.ts` から生成） | — | 都市の施設（`src/city/assets/facilities/`） |
| 記念碑（6 種。ミッションの報酬） | 本プロジェクト | 自作（`src/city/generate/facilities/monuments.ts` から生成） | — | 都市の記念碑（`src/city/assets/props/`） |
| 施設の中の景色（15 枚） | 本プロジェクト | 自作（`src/city/generate/interiors.ts` から生成） | — | レッスン画面の背景（`src/screens/lesson/backdrops/`） |
