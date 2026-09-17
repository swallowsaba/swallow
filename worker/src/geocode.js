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

/**
 * 検索語と結果の名前がどれだけ合っているかの点数。
 *
 * 国土地理院の検索は、施設名を渡すと関係のない住所を返してくることがある。
 * 実際「東京スカイツリー」では「茨城県つくば市東」などが返る(「東」に反応している)。
 * そのままでは「見つからない」と見えるので、合っているものを前に出し、
 * 合っていないものは弱い候補として印を付ける。
 */
export function matchScore(query, title) {
  const q = String(query || '').trim();
  const t = String(title || '').trim();
  if (!q || !t) return 0;
  if (t === q) return 100;
  if (t.includes(q)) return 80;
  if (q.includes(t)) return 60;

  // 連続して一致する最長の長さ(2 文字以上を「意味のある一致」とみなす)
  let best = 0;
  for (let i = 0; i < q.length; i += 1) {
    for (let j = i + 2; j <= q.length; j += 1) {
      const part = q.slice(i, j);
      if (part.length <= best) continue;
      if (t.includes(part)) best = part.length;
    }
  }
  return best >= 2 ? 20 + best : 0;
}

/**
 * 施設名が見つからないときに試す、短くした検索語。
 * 「東京スカイツリー」→「スカイツリー」のように、頭の地域名を外すと当たる。
 */
export function fallbackQuery(query) {
  const q = String(query || '').trim();
  // 「東京都」ではなく「東京」を外す。
  // 「東京都庁」から「東京都」を外すと「庁」になってしまい、かえって当たらない。
  for (const prefix of ['東京', '神奈川県', '埼玉県', '千葉県', '横浜市', '川崎市', '千葉市', 'さいたま市']) {
    if (!q.startsWith(prefix)) continue;
    const rest = q.slice(prefix.length);
    // 短くなりすぎた語で引くと、また関係の無いものが返ってくる
    if (rest.length >= 2) return rest;
  }
  return null;
}

export async function geocode(env, query, budget) {
  if ((env.GEOCODER || 'gsi') === 'off') {
    throw new OdptError('GEOCODER_UNAVAILABLE', '住所検索は無効化されています', 503);
  }
  if (!budget.take(1)) {
    throw new OdptError('BUDGET_EXHAUSTED', 'サブリクエストの上限に達しました', 503);
  }

  let results = await lookup(query);

  // 名前が合っているものが 1 つも無ければ、短くした語でもう一度だけ試す
  if (!results.some((r) => matchScore(query, r.title) > 0)) {
    const alt = fallbackQuery(query);
    if (alt && budget.take(1)) {
      try {
        const more = await lookup(alt);
        // 点数は**元の検索語**で付ける。
        // 「東京タワー」→「タワー」で引き直すと
        // 「愛宕警察署東京タワー前交番」が返ってくる。これは元の語を含むので
        // 高い点が付き、ただの「◯◯パークタワー」より上に来る。
        const scored = more.map((r) => ({
          ...r,
          score: matchScore(query, r.title) || matchScore(alt, r.title),
        }));
        if (scored.some((r) => r.score > 0)) results = scored;
      } catch {
        /* 追加の検索が失敗しても、最初の結果はそのまま返す */
      }
    }
  }

  // 同じ場所が重複して返ることがあるのでまとめ、合っている順に並べる
  const seen = new Set();
  const out = [];
  for (const r of results) {
    const key = `${r.title}|${r.lat.toFixed(5)}|${r.lon.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const score = r.score != null ? r.score : matchScore(query, r.title);
    out.push({ title: r.title, lat: r.lat, lon: r.lon, score, weak: score === 0 });
  }
  out.sort((a, b) => b.score - a.score);
  return out.slice(0, 5);
}

async function lookup(query) {
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

  return (Array.isArray(data) ? data : [])
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
    .slice(0, 12);
}
