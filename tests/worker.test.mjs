/**
 * Worker のユニットテスト(fetch をモックして実行)
 *   node tests/worker.test.mjs
 *
 * 確認事項:
 *   - CORS 許可オリジン以外は 403
 *   - アクセストークンがレスポンスに漏れない
 *   - バッチ上限を超えたら 400
 *   - 上流の失敗が握りつぶされずエラーコードで返る
 *   - サブリクエスト数が無料枠(50)を超えない
 */

import assert from 'node:assert/strict';
import worker from '../worker/src/index.js';

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`  FAIL ${name}\n       ${e.message}`);
    process.exitCode = 1;
  }
}

const ORIGIN = 'https://example.github.io';
const ENV = {
  ODPT_TOKEN: 'SECRET-TOKEN-DO-NOT-LEAK',
  ALLOWED_ORIGINS: `${ORIGIN},http://localhost:8080`,
  ENABLED_OPERATORS: 'Toei,TokyoMetro',
  GEOCODER: 'gsi',
};

/** fetch を差し替えて、呼ばれた URL を記録する */
function installMockFetch(handler) {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return handler(String(url), calls.length);
  };
  return calls;
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const req = (path, { method = 'GET', body = null, origin = ORIGIN } = {}) =>
  new Request(`https://worker.example.dev${path}`, {
    method,
    headers: origin ? { Origin: origin, 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

console.log('\nCORS');
await test('許可されていないオリジンは 403', async () => {
  installMockFetch(() => jsonResponse([]));
  const res = await worker.fetch(req('/v1/health', { origin: 'https://evil.example.com' }), ENV, {});
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, 'FORBIDDEN_ORIGIN');
});

await test('許可オリジンのプリフライトは 204 で CORS ヘッダ付き', async () => {
  const res = await worker.fetch(req('/v1/network', { method: 'OPTIONS' }), ENV, {});
  assert.equal(res.status, 204);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), ORIGIN);
  assert.equal(res.headers.get('Access-Control-Max-Age'), '86400');
});

console.log('\n/v1/health');
await test('対応/非対応の事業者を返し、トークンは漏らさない', async () => {
  const res = await worker.fetch(req('/v1/health'), ENV, {});
  assert.equal(res.status, 200);
  const text = await res.text();
  assert(!text.includes(ENV.ODPT_TOKEN), 'アクセストークンがレスポンスに含まれている');
  const body = JSON.parse(text);
  assert.equal(body.tokenConfigured, true);
  assert.equal(body.supported.length, 2);
  assert(body.unsupported.some((o) => o.title === 'JR東日本'), 'JR東日本が非対応一覧に出ていない');
});

console.log('\n/v1/network');
await test('事業者ごとに Railway と Station を取得し、必要フィールドだけ返す', async () => {
  const calls = installMockFetch((url) => {
    if (url.includes('odpt:Railway')) {
      return jsonResponse([
        {
          'owl:sameAs': 'odpt.Railway:Toei.Asakusa',
          'dc:title': '浅草線',
          'odpt:operator': 'odpt.Operator:Toei',
          'odpt:color': '#E85298',
          'odpt:ascendingRailDirection': 'odpt.RailDirection:Toei.Nishimagome',
          'odpt:stationOrder': [
            { 'odpt:index': 2, 'odpt:station': 'odpt.Station:Toei.Asakusa.Takanawadai' },
            { 'odpt:index': 1, 'odpt:station': 'odpt.Station:Toei.Asakusa.Gotanda' },
          ],
          'odpt:internalField': 'この項目は落とされるべき',
        },
      ]);
    }
    return jsonResponse([
      {
        'owl:sameAs': 'odpt.Station:Toei.Asakusa.Gotanda',
        'odpt:stationTitle': { ja: '五反田', en: 'Gotanda' },
        'odpt:railway': 'odpt.Railway:Toei.Asakusa',
        'geo:lat': 35.625,
        'geo:long': 139.723,
      },
    ]);
  });

  const res = await worker.fetch(req('/v1/network'), ENV, {});
  const text = await res.text();
  assert(!text.includes(ENV.ODPT_TOKEN), 'アクセストークンがレスポンスに含まれている');
  assert(!text.includes('internalField'), '不要フィールドが間引かれていない');
  const body = JSON.parse(text);

  // 事業者 2 社 × (Railway + Station) = 4 サブリクエスト
  assert.equal(calls.length, 4, `サブリクエスト数が想定と違う: ${calls.length}`);
  assert(calls.length <= 50, '無料枠のサブリクエスト上限を超えている');

  // basic ホストにだけトークンが付き、public には付かない
  const basic = calls.filter((c) => c.startsWith('https://api.odpt.org/'));
  const pub = calls.filter((c) => c.startsWith('https://api-public.odpt.org/'));
  assert.equal(basic.length, 2);
  assert.equal(pub.length, 2);
  assert(basic.every((c) => c.includes('acl%3AconsumerKey=') || c.includes('acl:consumerKey=')));
  assert(pub.every((c) => !c.includes('consumerKey')));

  // stationOrder は index 順に並べ直される
  assert.deepEqual(body.railways[0].stations, [
    'odpt.Station:Toei.Asakusa.Gotanda',
    'odpt.Station:Toei.Asakusa.Takanawadai',
  ]);
  assert.equal(res.headers.get('X-Data-Fetched-At') != null, true);
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=86400');
});

await test('一部の事業者が失敗しても他は返し、errors と X-Partial を立てる', async () => {
  installMockFetch((url) => {
    if (url.startsWith('https://api.odpt.org/')) return jsonResponse({ message: 'boom' }, 500);
    return jsonResponse([]);
  });
  const res = await worker.fetch(req('/v1/network'), ENV, {});
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('X-Partial'), '1');
  // 欠損したまま長時間キャッシュしない
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=300');
  const body = await res.json();
  assert(body.errors.length >= 1);
});

console.log('\n/v1/status');
await test('運行情報は 60 秒キャッシュ', async () => {
  installMockFetch(() =>
    jsonResponse([
      {
        'owl:sameAs': 'odpt.TrainInformation:Toei.Asakusa',
        'dc:date': '2026-08-29T14:03:00+09:00',
        'odpt:operator': 'odpt.Operator:Toei',
        'odpt:railway': 'odpt.Railway:Toei.Asakusa',
        'odpt:trainInformationText': { ja: '平常どおり運転しています。' },
      },
    ])
  );
  const res = await worker.fetch(req('/v1/status'), ENV, {});
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=60');
  const body = await res.json();
  assert.equal(body.items[0].text, '平常どおり運転しています。');
});

console.log('\nバッチ上限');
await test('21 件以上の時刻表リクエストは 400 で拒否', async () => {
  installMockFetch(() => jsonResponse([]));
  const stations = Array.from({ length: 21 }, (_, i) => `odpt.Station:Toei.Asakusa.S${i}`);
  const res = await worker.fetch(req('/v1/timetables', { method: 'POST', body: { stations } }), ENV, {});
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'BATCH_TOO_LARGE');
});

await test('20 件ちょうどは受け付け、サブリクエストも 20 で収まる', async () => {
  const calls = installMockFetch(() => jsonResponse([]));
  const stations = Array.from({ length: 20 }, (_, i) => `odpt.Station:Toei.Asakusa.S${i}`);
  const res = await worker.fetch(req('/v1/timetables', { method: 'POST', body: { stations } }), ENV, {});
  assert.equal(res.status, 200);
  assert.equal(calls.length, 20);
  assert(calls.length <= 50);
});

await test('対応範囲外の事業者はエラーとして返る(黙って空にしない)', async () => {
  installMockFetch(() => jsonResponse([]));
  const res = await worker.fetch(
    req('/v1/timetables', { method: 'POST', body: { stations: ['odpt.Station:JR-East.Yamanote.Tokyo'] } }),
    ENV,
    {}
  );
  const body = await res.json();
  assert.equal(body.timetables.length, 0);
  assert.equal(body.errors.length, 1);
  assert(body.errors[0].message.includes('対応範囲外'));
});

console.log('\nエラー伝播');
await test('上流の 401 は UNAUTHORIZED として返る', async () => {
  installMockFetch(() => jsonResponse({}, 401));
  const res = await worker.fetch(
    req('/v1/timetables', { method: 'POST', body: { stations: ['odpt.Station:TokyoMetro.Ginza.Shibuya'] } }),
    ENV,
    {}
  );
  const body = await res.json();
  assert.equal(body.errors[0].message.includes('トークン'), true);
});

await test('トークン未設定なら basic ライセンスの事業者は自動的に外れる', async () => {
  const calls = installMockFetch(() => jsonResponse([]));
  const res = await worker.fetch(req('/v1/network'), { ...ENV, ODPT_TOKEN: '' }, {});
  const body = await res.json();
  assert.equal(body.operators.length, 1);
  assert.equal(body.operators[0].id, 'Toei');
  assert(calls.every((c) => c.startsWith('https://api-public.odpt.org/')));
});

console.log('\n未知のパス');
await test('未知のエンドポイントは 404', async () => {
  const res = await worker.fetch(req('/v1/nope'), ENV, {});
  assert.equal(res.status, 404);
});



/* ------------------------------------------------------------------ *
 *  追加: トークンの前後空白
 * ------------------------------------------------------------------ */
console.log('\nトークンの前後空白');
await test('前後に空白・改行が混ざっていても除去して送る', async () => {
  const calls = installMockFetch(() => jsonResponse([]));
  await worker.fetch(req('/v1/network'), { ...ENV, ODPT_TOKEN: `  ${ENV.ODPT_TOKEN}\n` }, {});
  const basic = calls.filter((c) => c.startsWith('https://api.odpt.org/'));
  assert(basic.length > 0);
  for (const c of basic) {
    const key = new URL(c).searchParams.get('acl:consumerKey');
    assert.equal(key, ENV.ODPT_TOKEN, `空白が除去されていない: ${JSON.stringify(key)}`);
  }
});

await test('空白だけのトークンは未設定として扱う', async () => {
  const calls = installMockFetch(() => jsonResponse([]));
  const res = await worker.fetch(req('/v1/network'), { ...ENV, ODPT_TOKEN: '   ' }, {});
  const body = await res.json();
  assert.equal(body.operators.length, 1);
  assert.equal(body.operators[0].id, 'Toei');
  assert(calls.every((c) => c.startsWith('https://api-public.odpt.org/')));
});

await test('/v1/health で空白混入を検知できる(トークン自体は返さない)', async () => {
  const res = await worker.fetch(req('/v1/health'), { ...ENV, ODPT_TOKEN: `${ENV.ODPT_TOKEN} ` }, {});
  const text = await res.text();
  assert(!text.includes(ENV.ODPT_TOKEN), 'トークンが漏れている');
  const body = JSON.parse(text);
  assert.equal(body.tokenConfigured, true);
  assert.equal(body.tokenHadWhitespace, true);
  assert.equal(body.tokenLength, ENV.ODPT_TOKEN.length);
});



/* ------------------------------------------------------------------ *
 *  チャレンジ2026 の切り替え
 * ------------------------------------------------------------------ */
console.log('\nチャレンジ2026 の切り替え');

const CH_ENV = {
  ...ENV,
  ENABLED_OPERATORS: '',
  ENABLE_CHALLENGE: '1',
  ODPT_CHALLENGE_TOKEN: 'CHALLENGE-TOKEN-DO-NOT-LEAK',
};

await test('既定ではチャレンジ事業者は無効(JR東は非対応一覧に残る)', async () => {
  const res = await worker.fetch(req('/v1/health'), { ...ENV, ENABLED_OPERATORS: '' }, {});
  const body = await res.json();
  assert.equal(body.challenge.enabled, false);
  assert(!body.supported.some((o) => o.id === 'JR-East'), 'JR東が有効になっている');
  assert(body.unsupported.some((o) => o.title === 'JR東日本'), 'JR東が非対応一覧から消えている');
});

await test('フラグだけでトークンが無ければ有効にしない', async () => {
  const res = await worker.fetch(req('/v1/health'), { ...ENV, ENABLE_CHALLENGE: '1' }, {});
  const body = await res.json();
  assert.equal(body.challenge.enabled, false);
  assert.equal(body.challenge.flagSet, true);
  assert.equal(body.challenge.tokenConfigured, false);
});

await test('トークンだけでフラグが無ければ有効にしない', async () => {
  const res = await worker.fetch(
    req('/v1/health'),
    { ...ENV, ODPT_CHALLENGE_TOKEN: 'x'.repeat(64) },
    {}
  );
  const body = await res.json();
  assert.equal(body.challenge.enabled, false);
});

await test('両方そろえば JR東・小田急ほかが有効になる', async () => {
  const res = await worker.fetch(req('/v1/health'), CH_ENV, {});
  const text = await res.text();
  assert(!text.includes(CH_ENV.ODPT_CHALLENGE_TOKEN), 'チャレンジトークンが漏れている');
  const body = JSON.parse(text);
  assert.equal(body.challenge.enabled, true);
  const ids = body.supported.map((o) => o.id);
  for (const id of ['JR-East', 'Odakyu', 'Tokyu', 'Keio', 'Tobu', 'Seibu', 'Keikyu', 'Sotetsu']) {
    assert(ids.includes(id), `${id} が有効になっていない`);
  }
  assert.equal(body.supported.length, 15, `事業者数が想定と違う: ${body.supported.length}`);
  assert(!body.unsupported.some((o) => o.title === 'JR東日本'), 'JR東が非対応一覧に残っている');
});

await test('チャレンジ事業者は api-challenge へ、専用トークンで問い合わせる', async () => {
  const calls = installMockFetch(() => jsonResponse([]));
  await worker.fetch(req('/v1/network'), { ...CH_ENV, ENABLED_OPERATORS: 'Toei,TokyoMetro,JR-East' }, {});
  const ch = calls.filter((c) => c.startsWith('https://api-challenge.odpt.org/'));
  const basic = calls.filter((c) => c.startsWith('https://api.odpt.org/'));
  const pub = calls.filter((c) => c.startsWith('https://api-public.odpt.org/'));
  assert.equal(ch.length, 2, 'JR東への問い合わせが api-challenge に出ていない');
  assert.equal(basic.length, 2);
  assert.equal(pub.length, 2);
  for (const c of ch) {
    assert.equal(new URL(c).searchParams.get('acl:consumerKey'), CH_ENV.ODPT_CHALLENGE_TOKEN);
    assert(new URL(c).searchParams.get('odpt:operator'), 'odpt.Operator:JR-East');
  }
  // 基本ライセンス側には基本トークンが使われる(取り違えていない)
  for (const c of basic) {
    assert.equal(new URL(c).searchParams.get('acl:consumerKey'), ENV.ODPT_TOKEN);
  }
});

await test('ハイフンを含む事業者 ID(JR-East)を解釈できる', async () => {
  const calls = installMockFetch(() => jsonResponse([]));
  const res = await worker.fetch(
    req('/v1/timetables', { method: 'POST', body: { stations: ['odpt.Station:JR-East.Yamanote.Tokyo'] } }),
    CH_ENV,
    {}
  );
  const body = await res.json();
  assert.equal(body.errors.length, 0, `対応範囲外と判定されている: ${JSON.stringify(body.errors)}`);
  assert.equal(calls.length, 1);
  assert(calls[0].startsWith('https://api-challenge.odpt.org/'));
});

await test('チャレンジ無効時は JR東の駅を対応範囲外として拒否する', async () => {
  const calls = installMockFetch(() => jsonResponse([]));
  const res = await worker.fetch(
    req('/v1/timetables', { method: 'POST', body: { stations: ['odpt.Station:JR-East.Yamanote.Tokyo'] } }),
    { ...ENV, ENABLED_OPERATORS: '' },
    {}
  );
  const body = await res.json();
  assert.equal(calls.length, 0, 'チャレンジ無効なのに問い合わせている');
  assert.equal(body.errors.length, 1);
});


/* ------------------------------------------------------------------ *
 *  バス
 * ------------------------------------------------------------------ */
console.log('\nバス');

await test('バス停は名前で引き、トークン不要の public ホストに出る', async () => {
  const calls = installMockFetch(() => jsonResponse([]));
  const res = await worker.fetch(
    req('/v1/bus/stops?q=%E6%B8%8B%E8%B0%B7%E9%A7%85%E5%89%8D'),
    { ...ENV, ENABLED_BUS_OPERATORS: 'Toei' },
    {}
  );
  assert.equal(res.status, 200);
  assert.equal(calls.length, 1);
  const u = new URL(calls[0]);
  assert.equal(u.origin + u.pathname, 'https://api-public.odpt.org/api/v4/odpt:BusstopPole');
  assert.equal(u.searchParams.get('dc:title'), '渋谷駅前');
  assert.equal(u.searchParams.get('odpt:operator'), 'odpt.Operator:Toei');
  assert.equal(u.searchParams.get('acl:consumerKey'), null, 'CC BY データにトークンを付けている');
});

await test('バス停の q は 8 件まで', async () => {
  installMockFetch(() => jsonResponse([]));
  const qs = Array.from({ length: 7 }, (_, i) => `q=s${i}`).join('&');
  const res = await worker.fetch(req(`/v1/bus/stops?${qs}`), ENV, {});
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'BATCH_TOO_LARGE');
});

await test('バス停の応答は必要フィールドだけに間引かれる', async () => {
  installMockFetch(() =>
    jsonResponse([
      {
        'owl:sameAs': 'odpt.BusstopPole:Toei.ShibuyaStation.636.1',
        'dc:title': '渋谷駅前',
        'odpt:kana': 'しぶやえきまえ',
        'geo:lat': 35.658527,
        'geo:long': 139.700208,
        'odpt:operator': 'odpt.Operator:Toei',
        'odpt:busstopPoleNumber': '1',
        'odpt:busroutePattern': ['odpt.BusroutePattern:Toei.Shibu88.8206.1'],
        'odpt:unusedField': '落とされるべき',
      },
    ])
  );
  const res = await worker.fetch(
    req('/v1/bus/stops?q=%E6%B8%8B%E8%B0%B7%E9%A7%85%E5%89%8D'),
    { ...ENV, ENABLED_BUS_OPERATORS: 'Toei' },
    {}
  );
  const text = await res.text();
  assert(!text.includes('unusedField'), '不要フィールドが残っている');
  const body = JSON.parse(text);
  assert.equal(body.stops[0].title, '渋谷駅前');
  assert.deepEqual(body.stops[0].patterns, ['odpt.BusroutePattern:Toei.Shibu88.8206.1']);
  assert.equal(body.stops[0].query, '渋谷駅前');
});

await test('系統は停車順に並べ直して返す', async () => {
  installMockFetch(() =>
    jsonResponse([
      {
        'owl:sameAs': 'odpt.BusroutePattern:Toei.Shibu88.8206.1',
        'dc:title': '渋８８ 新橋駅前行',
        'odpt:busroute': 'odpt.Busroute:Toei.Shibu88',
        'odpt:direction': '1',
        'odpt:operator': 'odpt.Operator:Toei',
        'odpt:busstopPoleOrder': [
          { 'odpt:index': 3, 'odpt:busstopPole': 'odpt.BusstopPole:Toei.C.3.1', 'odpt:note': 'C' },
          { 'odpt:index': 1, 'odpt:busstopPole': 'odpt.BusstopPole:Toei.A.1.1', 'odpt:note': 'A' },
          { 'odpt:index': 2, 'odpt:busstopPole': 'odpt.BusstopPole:Toei.B.2.1', 'odpt:note': 'B' },
        ],
      },
    ])
  );
  const res = await worker.fetch(
    req('/v1/bus/patterns', { method: 'POST', body: { ids: ['odpt.BusroutePattern:Toei.Shibu88.8206.1'] } }),
    ENV,
    {}
  );
  const body = await res.json();
  assert.deepEqual(body.patterns[0].order.map((o) => o.note), ['A', 'B', 'C']);
});

await test('バスのカレンダーは 24 時間キャッシュ', async () => {
  installMockFetch(() => jsonResponse([]));
  const res = await worker.fetch(req('/v1/bus/calendars'), ENV, {});
  assert.equal(res.headers.get('Cache-Control'), 'public, max-age=86400');
});

await test('対応範囲外のバス事業者はエラーとして返る', async () => {
  // 京王バスは ODPT が API 形式の提供を終了しており、どの設定でも扱えない
  const calls = installMockFetch(() => jsonResponse([]));
  const res = await worker.fetch(
    req('/v1/bus/timetables', { method: 'POST', body: { poles: ['odpt.BusstopPole:KeioBus.X.1.1'] } }),
    ENV,
    {}
  );
  const body = await res.json();
  assert.equal(calls.length, 0);
  assert.equal(body.errors.length, 1);
  assert(body.errors[0].message.includes('対応範囲外'));
});

await test('チャレンジ限定のバス事業者は未有効化なら問い合わせない', async () => {
  const calls = installMockFetch(() => jsonResponse([]));
  const res = await worker.fetch(
    req('/v1/bus/timetables', { method: 'POST', body: { poles: ['odpt.BusstopPole:KokusaiKogyoBus.X.1.1'] } }),
    ENV,
    {}
  );
  const body = await res.json();
  assert.equal(calls.length, 0, 'チャレンジ未有効化なのに問い合わせている');
  assert.equal(body.errors.length, 1);
});

await test('/v1/health に提供終了した事業者を理由つきで出す', async () => {
  const res = await worker.fetch(req('/v1/health'), ENV, {});
  const body = await res.json();
  const keio = body.bus.discontinued.find((o) => o.id === 'KeioBus');
  assert(keio, '京王バスが出ていない');
  assert(keio.reason.includes('提供終了'), `理由が不十分: ${keio.reason}`);
  assert(keio.reason.includes('GTFS'), '後継フォーマットが書かれていない');
});

await test('/v1/health にバス事業者が出る(トークンありで 5 社)', async () => {
  const res = await worker.fetch(req('/v1/health'), { ...ENV, ENABLED_BUS_OPERATORS: '' }, {});
  const body = await res.json();
  const ids = body.bus.operators.map((o) => o.id);
  assert.deepEqual(ids, ['Toei', 'TokyuBus', 'SeibuBus', 'SotetsuBus', 'YokohamaMunicipal']);
  assert(!ids.includes('Kanachu'), 'チャレンジ事業者が有効になっている');
  assert(body.bus.unavailable.some((o) => o.id === 'Kanachu'), '神奈中が無効一覧に出ていない');
});

await test('トークン未設定なら CC BY の都営バスだけになる', async () => {
  const res = await worker.fetch(req('/v1/health'), { ...ENV, ODPT_TOKEN: '', ENABLED_BUS_OPERATORS: '' }, {});
  const body = await res.json();
  assert.deepEqual(body.bus.operators.map((o) => o.id), ['Toei']);
  assert(body.bus.unavailable.some((o) => o.id === 'SeibuBus' && o.reason.includes('ODPT_TOKEN')));
});

await test('チャレンジを有効にすると神奈中バスが使える', async () => {
  const res = await worker.fetch(req('/v1/health'), { ...CH_ENV, ENABLED_BUS_OPERATORS: '' }, {});
  const body = await res.json();
  assert(body.bus.operators.some((o) => o.id === 'Kanachu'), '神奈中バスが有効になっていない');
});

await test('基本ライセンスのバス事業者は api.odpt.org にトークン付きで問い合わせる', async () => {
  const calls = installMockFetch(() => jsonResponse([]));
  await worker.fetch(
    req('/v1/bus/stops?q=%E5%B2%A1%E7%94%B0%E4%B8%80%E6%9C%AC%E6%9D%89'),
    { ...ENV, ENABLED_BUS_OPERATORS: 'Toei,SeibuBus' },
    {}
  );
  assert.equal(calls.length, 2);
  const basic = calls.find((c) => c.startsWith('https://api.odpt.org/'));
  const pub = calls.find((c) => c.startsWith('https://api-public.odpt.org/'));
  assert(basic && pub, '基本ライセンスと CC BY の両方に問い合わせていない');
  assert.equal(new URL(basic).searchParams.get('acl:consumerKey'), ENV.ODPT_TOKEN);
  assert.equal(new URL(basic).searchParams.get('odpt:operator'), 'odpt.Operator:SeibuBus');
  assert.equal(new URL(pub).searchParams.get('acl:consumerKey'), null);
});


await test('事業者が多いときは名前を削ってサブリクエスト上限を守る', async () => {
  const calls = installMockFetch(() => jsonResponse([]));
  const qs = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => `q=${n}`).join('&');
  const res = await worker.fetch(req(`/v1/bus/stops?${qs}`), { ...CH_ENV, ENABLED_BUS_OPERATORS: '' }, {});
  const body = await res.json();
  assert(calls.length <= 50, `サブリクエストが上限を超えている: ${calls.length}`);
  // 8 事業者 × 6 名前 = 48 で上限(40)を超えるため、名前が 5 つに削られる
  assert.equal(body.queries.length, 5, '名前が削られていない');
  assert.equal(calls.length, 40);
  assert(
    body.errors?.some((e) => /検索していません/.test(e.message)),
    '削った名前があることを伝えていない'
  );
});

console.log(`\n${passed} 件のテストが成功${process.exitCode ? '(失敗あり)' : ''}\n`);
