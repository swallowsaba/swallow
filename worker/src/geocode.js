/**
 * 住所 → 緯度経度(ジオコーディング)
 * ------------------------------------------------------------------
 * 【重要】既定で使う国土地理院の住所検索エンドポイントは、地理院地図が
 * 内部的に利用しているもので、公式に「公開API」として仕様が公表されて
 * いるものではありません。無償・キー不要で広く使われていますが、
 * 予告なく変更・停止される可能性があります。
 *
 * そのため本アプリでは:
 *   - 失敗しても致命的にしない(必ず駅名検索にフォールバックできる設計)
 *   - 現在地(ブラウザの Geolocation API)は外部APIを一切使わない
 *   - GEOCODER=off で無効化できる
 * としています。恒久運用する場合は、国土数値情報「位置参照情報」を
 * 静的データとして同梱する方式への差し替えを推奨します(README 参照)。
 */

import { OdptError } from './odpt.js';

const GSI_ENDPOINT = 'https://msearch.gsi.go.jp/address-search/AddressSearch';
const GEOCODE_TIMEOUT_MS = 6000;

/** 首都圏のおおよその範囲。範囲外は弾いて誤検索を減らす。 */
const BBOX = { minLat: 34.9, maxLat: 36.4, minLon: 138.8, maxLon: 140.9 };

export async function geocode(env, query, budget) {
  if ((env.GEOCODER || 'gsi') === 'off') {
    throw new OdptError('GEOCODER_UNAVAILABLE', '住所検索は無効化されています', 503);
  }
  if (!budget.take(1)) {
    throw new OdptError('BUDGET_EXHAUSTED', 'サブリクエストの上限に達しました', 503);
  }

  const url = `${GSI_ENDPOINT}?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
  } catch (e) {
    clearTimeout(timer);
    throw new OdptError('GEOCODER_UNAVAILABLE', '住所検索サービスに接続できませんでした', 503);
  }
  clearTimeout(timer);

  if (!res.ok) {
    throw new OdptError('GEOCODER_UNAVAILABLE', `住所検索サービスが HTTP ${res.status} を返しました`, 503);
  }

  let data;
  try {
    data = await res.json();
  } catch {
    throw new OdptError('GEOCODER_UNAVAILABLE', '住所検索の応答を解釈できませんでした', 503);
  }

  const results = (Array.isArray(data) ? data : [])
    .map((f) => {
      const c = f?.geometry?.coordinates;
      if (!Array.isArray(c) || c.length < 2) return null;
      const lon = Number(c[0]);
      const lat = Number(c[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { title: f?.properties?.title || query, lat, lon };
    })
    .filter(Boolean)
    .filter((r) => r.lat >= BBOX.minLat && r.lat <= BBOX.maxLat && r.lon >= BBOX.minLon && r.lon <= BBOX.maxLon)
    .slice(0, 5);

  return results;
}
