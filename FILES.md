# 追加・変更ファイル一覧

対象リポジトリ: 既存の GitHub Pages リポジトリ(Swallow 構成)

## 変更(1 ファイル・1 行)

| ファイル | 変更 | 内容 |
|---|---|---|
| `.github/workflows/deploy.yml` | 1 行 | ビルド対象から `worker` `tests` `tools` を除外。差分は `deploy.yml.patch` |

**既存アプリのファイルは 1 つも変更していません。**
既存の `deploy.yml` そのものには手を触れていません(除外リストに 3 語足すだけ)。

## 追加

### フロントエンド(GitHub Pages に公開される)

| ファイル | 行数 | 役割 |
|---|---|---|
| `transit/index.html` | 231 | 画面構造。経由地・地図カード・出典表示・免責をフッタに含む |
| `transit/css/style.css` | 561 | 無彩色(白/黒)の配色トークン・レスポンシブ・ライト/ダーク対応 |
| `transit/js/config.js` | 32 | **要編集**: Worker の URL(`?worker=` で一時上書き可) |
| `transit/js/main.js` | 1379 | 起動・状態管理・検索フロー・地図連携・エラー表示・429 処理 |
| `transit/js/api.js` | 186 | Worker クライアント。再試行・バッチ分割・429 ブロック |
| `transit/js/network.js` | 309 | 路線グラフ構築・駅グループ化・localStorage キャッシュ |
| `transit/js/router.js` | 459 | 鉄道の経路探索(ダイクストラ)と時刻表バインド |
| `transit/js/bus.js` | 624 | バスの直通探索・バス⇄鉄道の複合経路・停留所名の照合 |
| `transit/js/map.js` | 484 | 地図(Leaflet + 地理院タイル)。駅/バス停/任意地点の選択・経路の乗降地点の表示 |
| `transit/js/via.js` | 179 | 経由地。区間ごとの結果を滞在時間を挟んで 1 本につなぐ(通信なし) |
| `transit/js/gtfs.js` | 332 | GTFS から取り込んだバスの検索と、表示範囲の停留所の抽出。Worker を通さない |
| `transit/js/walk.js` | 197 | 任意地点 → 最寄駅の徒歩の見積り(直線距離ベース・距離の上限なし。必ず推定と表示) |
| `transit/js/status.js` | 232 | 運行情報の分類・否定形の除去・古い情報の除外・遅れ時分の抽出 |
| `transit/js/geo.js` | 50 | 現在地取得(外部 API 不使用) |
| `transit/js/time.js` | 109 | 営業日・カレンダー・24 時超え時刻の正規化 |
| `transit/js/ui.js` | 688 | 描画。取得失敗・推定値を必ず明示 |
| `transit/data/config.json` | — | 乗換時間・徒歩連絡・バス停⇄駅の徒歩分(手動メンテ) |
| `transit/data/holidays.json` | — | 祝日一覧(手動メンテ・年 1 回更新) |

ビルド工程はありません(素の ES モジュール)。`package.json` を置いていないため、
既存ワークフローの静的コピー経路にそのまま乗ります。

地図は Leaflet 1.9.4 を cdnjs から、タイルを地理院タイルから読み込みます。
どちらかが読めない場合でも地図以外の機能はそのまま動きます(理由を画面に表示)。

### Cloudflare Worker(Pages には公開されない)

| ファイル | 役割 |
|---|---|
| `worker/src/index.js` | ルーティング・エラー変換・11 エンドポイント |
| `worker/src/operators.js` | 鉄道事業者のレジストリ(ライセンス区分つき)・トークン選択 |
| `worker/src/bus.js` | バス事業者のレジストリと ODPT のバス系データ取得 |
| `worker/src/odpt.js` | ODPT クライアント・サブリクエスト予算・JSON-LD 整形 |
| `worker/src/geocode.js` | 住所検索(差し替え可能なよう分離) |
| `worker/src/http.js` | CORS・エラーコード・TTL |
| `worker/wrangler.jsonc` | **要編集**: `ALLOWED_ORIGINS` |
| `worker/build-single-file.mjs` | 上記 6 本を 1 ファイルに結合(ダッシュボード貼り付け用) |
| `worker/dist/worker.bundled.js` | **生成物**。ブラウザだけで導入するときはこれを貼り付ける |
| `worker/package.json` | wrangler の依存のみ(手元で npm を使う場合のみ必要) |
| `worker/README.md` | エンドポイント仕様・エラーコード表 |

### GTFS の取り込み(公開されない)

| ファイル | 役割 |
|---|---|
| `.github/workflows/gtfs.yml` | **新規ワークフロー**。月末+手動で GTFS を取り込み、変わったときだけコミット |
| `tools/build-gtfs-index.mjs` | ODPT のカタログから URL を解決し、ZIP を落として索引に変換 |
| `tools/gtfs-lib.mjs` | CSV の読み取りと索引づくり(純粋な変換。テストできる) |
| `tools/gtfs-sources.json` | **取り込み元の一覧**(京王・小田急・西東京・関東)。事業者を足すときはここだけ編集する |
| `transit/data/gtfs/` | **生成物**。ワークフローが作る。手で編集しない |

**要設定**: GitHub の Secret に `ODPT_TOKEN`。手順は `GTFS.md`。

### テスト(公開されない)

| ファイル | 内容 |
|---|---|
| `tests/router.test.mjs` | 経路探索 22 件。時刻正規化・グループ化・除外・時刻表バインド・運行情報 |
| `tests/worker.test.mjs` | Worker 35 件。CORS・トークン漏れ・バッチ上限・部分失敗・エラー伝播・サブリクエスト上限 |
| `tests/bus.test.mjs` | バス 15 件。停留所名の候補生成・系統の突き合わせ・複合経路・推定値の扱い |
| `tests/map.test.mjs` | 地図 15 件。距離計算・経路 → 点列/区間の変換・乗降地点の判定 |
| `tests/via.test.mjs` | 経由地 19 件。滞在時間の整合・区間の結合・重複排除・複数経由 |
| `tests/status.test.mjs` | 運行情報 30 件。否定形・再開・古い情報・遅れ時分・事業者全体の情報 |
| `tests/gtfs.test.mjs` | GTFS 57 件。CSV の解釈・24時超え・運行日と祝日の例外・索引の分割・検索・無駄な通信をしないこと |
| `tests/walk.test.mjs` | 徒歩 26 件。時間の見積り・距離で切り捨てないこと・組み合わせの上限・時刻のずらし |
| `tests/mock-server.mjs` | ODPT 不要で UI を動かせるモックサーバ |
| `tests/ui.smoke.mjs` | Playwright によるスモークテスト(検索・並べ替え・除外・バス・GTFS バス・複合経路・経由地・地図・任意地点・モバイル・ダーク) |

いずれも ODPT のトークンとネットワークを必要としません。

```bash
node tests/router.test.mjs     # 22 passed
node tests/worker.test.mjs     # 35 passed
node tests/bus.test.mjs        # 15 passed
node tests/map.test.mjs        # 15 passed
node tests/via.test.mjs        # 19 passed
node tests/status.test.mjs     # 30 passed
node tests/walk.test.mjs       # 26 passed
node tests/gtfs.test.mjs       # 55 passed
node tests/mock-server.mjs &   # UI を手元で触るとき
node tests/ui.smoke.mjs        # Playwright が必要
```

> スモークテストの地図の部分は、Leaflet を取得できない環境でも
> こちら側のコード(マーカー生成 → タップ → 出発/到着に設定 → 経路描画)を
> 検証できるよう、Leaflet の最小スタブを差し込んで実行します。
> **地図の見た目そのものは、実際にブラウザで開いて確認してください。**

### ドキュメント

| ファイル | 内容 |
|---|---|
| `SETUP.md` | ODPT 登録 → Worker デプロイ → Secrets → CORS → 公開までの手順 |
| `SETUP-ブラウザだけ.md` | 手元に npm を入れずブラウザだけで導入する手順 |
| `BUS.md` | バス機能の対応範囲・**京王バス等が扱えない理由**・データの制約 |
| `VIA.md` | 経由地と滞在時間の考え方・通信量の注意 |
| `GTFS.md` | **京王バス等を使えるようにする手順**・仕組み・スナップショットである断り |
| `MAP.md` | 地図の操作方法・経路の乗降地点表示(線は引かない理由)・任意地点の徒歩の求め方 |
| `STATUS.md` | 運行情報の誤判定の修正内容と、遅延反映の限界 |
| `CHALLENGE2026.md` | 公共交通オープンデータチャレンジ 2026 の参加手順と有効化方法 |
| `deploy.yml.patch` | deploy.yml の差分(1 行) |
| `FILES.md` | このファイル |

> `SETUP.md` などのドキュメントはリポジトリ直下でなくても構いません。
> ただし直下に置いてもワークフローには影響しません(フォルダではなくファイルのため)。
