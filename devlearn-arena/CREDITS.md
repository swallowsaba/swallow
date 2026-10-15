# 出典とライセンス

外部由来の素材・フォント・ライブラリを全て記録する（`docs/asset-policy.md`）。素材を足すコミットで、この表も更新する。

## フォント

| 名前 | 作者 | ライセンス | 出典 | 使っている場所 |
|---|---|---|---|---|
| M PLUS 1 | M+ FONTS PROJECT | SIL OFL 1.1（OFL-1.1） | `@fontsource/m-plus-1` | 見出し |
| Noto Sans JP | Google | SIL OFL 1.1（OFL-1.1） | `@fontsource/noto-sans-jp` | 本文・UI |
| Barlow Condensed | Jeremy Tribby | SIL OFL 1.1（OFL-1.1） | `@fontsource/barlow-condensed` | 数字 |
| JetBrains Mono | JetBrains | SIL OFL 1.1（OFL-1.1） | `@fontsource/jetbrains-mono` | 端末・コード |

## ライブラリ

公開する物に入る包み（`package.json` の `dependencies`）を全て載せる。`src/__tests__/credits.test.ts` が、全ての包みがライセンスと一緒にここにあることを確かめる。

| 包み | 作者 | ライセンス | 使っている場所 |
|---|---|---|---|
| `react` | Meta Platforms, Inc. と貢献者 | MIT | 画面 |
| `react-dom` | Meta Platforms, Inc. と貢献者 | MIT | 画面 |
| `zustand` | Paul Henschel と貢献者 | MIT | 都市・学習の記録の状態 |
| `zod` | Colin McDonnell | MIT | コンテンツと保存データの形の検証 |
| `@xterm/xterm` | The xterm.js authors | MIT | 実戦の端末 |
| `@xterm/addon-fit` | The xterm.js authors | MIT | 実戦の端末の大きさ合わせ |
| `sql.js` | sql.js の貢献者 | MIT（中の SQLite は public domain） | 実戦のブラウザ内 SQL（`sql-wasm.wasm` を同梱） |
| `js-yaml` | Vladimir Zapparov と貢献者 | MIT | 実戦の設定ファイル（YAML）の読み取り |
| `@noble/hashes` | Paul Miller | MIT | 模擬環境のハッシュ（Git のオブジェクトの ID・Kubernetes の参加に使う証明書のハッシュ） |

開発にだけ使う道具（公開する物には入らない）: Vite（MIT）・TypeScript（Apache-2.0）・Vitest（MIT）・Playwright（Apache-2.0）・ESLint（MIT）・jsdom（MIT）。

## 画像・音

| 名前 | 作者 | ライセンス | 出典 | 使っている場所 |
|---|---|---|---|---|
| 施設・建物・アイコン・図 | 本プロジェクト | 自作 | — | 全体 |
| 効果音（4 種） | 本プロジェクト | 自作（`src/lib/sfx.ts` が波形から作る。音声ファイルを持たない） | — | 正解・修了・エラーなど |
| 施設の Lv1〜Lv5（15 施設 × 5 枚）と公園の類 | 本プロジェクト | 自作（`src/city/generate/facilityModels.ts` から生成） | — | 都市の施設（`src/city/assets/facilities/`） |
| 記念碑（6 種。ミッションの報酬） | 本プロジェクト | 自作（`src/city/generate/facilities/monuments.ts` から生成） | — | 都市の記念碑（`src/city/assets/props/`） |
| 施設の中の景色（15 枚） | 本プロジェクト | 自作（`src/city/generate/interiors.ts` から生成） | — | レッスン画面の背景（`src/screens/lesson/backdrops/`） |
