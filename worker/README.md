# kanto-transit-proxy (Cloudflare Worker)

首都圏ルート提案ツールの ODPT プロキシ。**このフォルダは GitHub Pages に公開されません。**

## 責務

| する | しない |
|---|---|
| ODPT のアクセストークン付与(フロントには出さない) | 経路探索(無料プランの CPU 10ms では回らない) |
| CORS(許可オリジンのみ) | データの事前取得・永続化 |
| Workers Cache による短時間キャッシュ | 運賃の計算 |
| JSON-LD の間引き(転送量 1/5〜1/10) | チャレンジ限定ライセンスのデータの取得 |

## エンドポイント

| メソッド | パス | 内容 | サブリクエスト上限 | Cache-Control |
|---|---|---|---|---|
| GET | `/v1/health` | 疎通・対応事業者・トークンの有無 | 0 | `max-age=300` |
| GET | `/v1/network` | 路線・駅・駅順 | 事業者数 × 2 | `max-age=86400` |
| GET | `/v1/status` | 運行情報 | 事業者数 | `max-age=60` |
| POST | `/v1/timetables` | 駅時刻表(`{stations:[], calendar}`) | 20 | `max-age=21600` |
| POST | `/v1/trains` | 列車時刻表(`{trains:[]}` / `{queries:[]}`) | 20 | `max-age=21600` |
| GET | `/v1/geocode?q=` | 住所 → 緯度経度 | 1 | `max-age=86400` |
| GET | `/v1/bus/stops?q=` | バス停を名前で引く(複数可) | 8 | `max-age=86400` |
| GET | `/v1/bus/calendars` | バスのカレンダー(適用日の配列) | 事業者数 | `max-age=86400` |
| POST | `/v1/bus/patterns` | 系統の停車順(`{ids:[]}`) | 20 | `max-age=21600` |
| POST | `/v1/bus/timetables` | バス停の時刻表(`{poles:[]}`) | 20 | `max-age=21600` |
| POST | `/v1/bus/runs` | 便別の全停車時刻(`{runs:[{pattern,calendar}]}`) | 10 | `max-age=21600` |

### バスが鉄道と別扱いな理由

ODPT の API は 1 レスポンス 1000 件が上限で**ページングが無い**。都営バスの停留所ポールは
これを大きく超えるため、鉄道のように「全件取得してグラフを作る」ことができない
(全件 JSON は全国分になるのでこれも使えない)。

そのためバスは、両端のバス停が持つ「自分を通る系統の一覧」の**積集合**を取って
直通系統を特定する方式にしている。通信ゼロで直通の有無が判るため、
1 検索あたり Worker リクエスト 5 回以内に収まる。
反面、**バス同士の乗り継ぎと、鉄道とバスをまたぐ経路は出せない。**

一部でも取得に失敗したレスポンスは `X-Partial: 1` を返し、Cache-Control を 300 秒に短縮します
(欠損したデータを長時間キャッシュに固定しないため)。

## レスポンスヘッダ

```
X-Data-Fetched-At: 2026-08-29T14:03:12.000Z   ODPT から取得した時刻(UI に表示)
X-Cache-Status:    HIT | MISS                  Workers Cache の状態
X-Data-Source:     odpt | gsi
X-Partial:         0 | 1                        一部失敗の有無
```

## エラーコード

| code | HTTP | 意味 |
|---|---|---|
| `FORBIDDEN_ORIGIN` | 403 | `ALLOWED_ORIGINS` に無いオリジン |
| `RATE_LIMITED` | 429 | 上流または自身のレート制限(`Retry-After` 付き) |
| `UPSTREAM_ERROR` | 502 | ODPT が 5xx |
| `UPSTREAM_TIMEOUT` | 504 | ODPT が 8 秒以内に応答しない |
| `UNAUTHORIZED` | 401 | トークン未設定 / 拒否 |
| `BATCH_TOO_LARGE` | 400 | バッチが 20 件超 |
| `BAD_REQUEST` | 400 | パラメータ不正 |
| `NOT_FOUND` | 404 | 未知のパス |
| `GEOCODER_UNAVAILABLE` | 503 | 住所検索に到達できない / 無効化されている |

## 設定

| 種別 | キー | 説明 |
|---|---|---|
| Secret | `ODPT_TOKEN` | `wrangler secret put ODPT_TOKEN`。**Git に入れない** |
| Var | `ALLOWED_ORIGINS` | カンマ区切りの完全一致リスト。`*` は使わない |
| Var | `ENABLED_OPERATORS` | 対応事業者の絞り込み(空なら全件) |
| Var | `GEOCODER` | `gsi`(既定)/ `off` |

トークン未設定時は、基本ライセンスの事業者(東京メトロなど)が自動的に対象から外れ、
CC BY の都営のみで動作します。エラーで止まりません。

## コマンド

```bash
npm install
npx wrangler login
npx wrangler deploy
npx wrangler secret put ODPT_TOKEN
npx wrangler tail                 # 本番ログ
npx wrangler dev                  # ローカル
```

## テスト

```bash
node ../tests/worker.test.mjs
```

`fetch` をモックして実行するため、ODPT のトークンもネットワークも不要です。
CORS・バッチ上限・サブリクエスト数・トークン漏れの有無を検証します。

## 出典表示

ODPT のデータを利用する画面には次の掲示が必要です(`transit/index.html` のフッタに実装済み)。

- 出典が公共交通オープンデータセンターであること
- データの正確性・完全性は保証されないこと
- 事業者へ直接問い合わせないよう促す文言
