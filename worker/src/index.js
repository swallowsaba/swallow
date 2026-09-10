/**
 * 首都圏ルート提案ツール — Cloudflare Worker (ODPT プロキシ)
 * ==================================================================
 * 責務
 *   1. ODPT のアクセストークンをフロントから完全に隠す
 *   2. GitHub Pages からの CORS を通す(許可オリジンのみ)
 *   3. Workers Cache に載せてレート制限と無料枠を守る
 *   4. JSON-LD を必要フィールドだけに間引いて転送量を減らす
 *
 * やらないこと
 *   - 経路探索(無料プランの CPU 10ms では回らないため、ブラウザ側で行う)
 *
 * エンドポイント
 *   GET  /v1/health
 *   GET  /v1/network
 *   GET  /v1/status
 *   POST /v1/timetables   { stations: string[], calendar?: string }
 *   POST /v1/trains       { trains: string[] }   または { queries: [{railway,no,calendar}] }
 *   GET  /v1/geocode?q=
 *   GET  /v1/bus/stops?q=  バス停を名前で引く(全件取得はできないため)
 *   GET  /v1/bus/calendars バス事業者のカレンダー(適用日は日付の配列)
 *   POST /v1/bus/patterns  { ids: string[] }
 *   POST /v1/bus/timetables{ poles: string[] }
 *   POST /v1/bus/runs      { runs: [{pattern, calendar}] }
 */

import {
  OPERATORS,
  operatorUrn,
  CHALLENGE_OPERATORS,
  resolveEnabledOperators,
  resolveUnsupported,
  getEnabledOperator,
  odptToken,
  challengeToken,
  challengeEnabled,
} from './operators.js';
import {
  Budget,
  SUBREQUEST_CAP,
  OdptError,
  fetchOdpt,
  shapeRailway,
  shapeStation,
  shapeStationTimetable,
  shapeTrainTimetable,
  shapeTrainInformation,
  operatorOfUrn,
} from './odpt.js';
import { geocode } from './geocode.js';
import {
  BUS_OPERATORS,
  CHALLENGE_BUS_OPERATORS,
  DISCONTINUED_BUS_OPERATORS,
  resolveBusOperators,
  busOperator,
  fetchStopsByTitle,
  fetchPattern,
  fetchPoleTimetables,
  fetchRuns,
  fetchCalendars,
} from './bus.js';
import { ERR, TTL, cacheControl, corsHeaders, errorResponse, json, resolveOrigin } from './http.js';

/** バッチの 1 リクエストあたり最大件数(サブリクエスト上限を守るため) */
const MAX_BATCH = 20;

export default {
  async fetch(request, env, ctx) {
    const { allowed, origin } = resolveOrigin(request, env);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: allowed ? 204 : 403,
        headers: corsHeaders(allowed ? origin : null),
      });
    }
    if (!allowed) {
      return errorResponse(ERR.FORBIDDEN_ORIGIN, 'このオリジンからのアクセスは許可されていません', {
        status: 403,
        origin: null,
      });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const budget = new Budget();
    const fetchedAt = new Date().toISOString();

    try {
      switch (`${request.method} ${path}`) {
        case 'GET /':
        case 'GET /v1/health':
          return handleHealth(env, origin, fetchedAt);
        case 'GET /v1/network':
          return await handleNetwork(env, origin, budget, fetchedAt);
        case 'GET /v1/status':
          return await handleStatus(env, origin, budget, fetchedAt);
        case 'POST /v1/timetables':
          return await handleTimetables(request, env, origin, budget, fetchedAt);
        case 'POST /v1/trains':
          return await handleTrains(request, env, origin, budget, fetchedAt);
        case 'GET /v1/geocode':
          return await handleGeocode(url, env, origin, budget, fetchedAt);
        case 'GET /v1/bus/stops':
          return await handleBusStops(url, env, origin, budget, fetchedAt);
        case 'GET /v1/bus/calendars':
          return await handleBusCalendars(env, origin, budget, fetchedAt);
        case 'POST /v1/bus/patterns':
          return await handleBusPatterns(request, env, origin, budget, fetchedAt);
        case 'POST /v1/bus/timetables':
          return await handleBusTimetables(request, env, origin, budget, fetchedAt);
        case 'POST /v1/bus/runs':
          return await handleBusRuns(request, env, origin, budget, fetchedAt);
        default:
          return errorResponse(ERR.NOT_FOUND, `未知のエンドポイントです: ${path}`, {
            status: 404,
            origin,
          });
      }
    } catch (e) {
      return mapError(e, origin);
    }
  },
};

/* ------------------------------------------------------------------ *
 *  エラー変換
 * ------------------------------------------------------------------ */
function mapError(e, origin) {
  if (e instanceof OdptError) {
    const status = e.status || 502;
    const headers = status === 429 ? { 'Retry-After': '60' } : {};
    const code =
      e.code === 'BUDGET_EXHAUSTED'
        ? ERR.BATCH_TOO_LARGE
        : ERR[e.code] || ERR.UPSTREAM_ERROR;
    return errorResponse(code, e.message, { status, origin, headers });
  }
  return errorResponse(ERR.UPSTREAM_ERROR, '予期しないエラーが発生しました', {
    status: 500,
    origin,
    detail: String(e && e.message ? e.message : e),
  });
}

/* ------------------------------------------------------------------ *
 *  GET /v1/health
 * ------------------------------------------------------------------ */
function handleHealth(env, origin, fetchedAt) {
  const enabled = resolveEnabledOperators(env);
  return json(
    {
      ok: true,
      fetchedAt,
      tokenConfigured: Boolean(odptToken(env)),
      // 登録時に前後の空白が混ざっていないかを確認できるようにする
      // (トークン自体は絶対に返さない)
      tokenLength: odptToken(env).length || undefined,
      tokenHadWhitespace: env.ODPT_TOKEN ? env.ODPT_TOKEN !== odptToken(env) : undefined,
      geocoder: (env.GEOCODER || 'gsi') === 'off' ? null : 'gsi',
      // チャレンジ事業者の状態(トークン自体は返さない)
      challenge: {
        enabled: challengeEnabled(env),
        tokenConfigured: Boolean(challengeToken(env)),
        flagSet: Boolean(String(env.ENABLE_CHALLENGE || '').trim()),
        note: challengeEnabled(env)
          ? 'チャレンジ限定データを利用中。この構成はコンテスト作品としてのみ公開できます。'
          : 'チャレンジ限定データは無効です(JR東日本・大手私鉄は非対応)。',
      },
      supported: enabled.map((o) => ({
        id: o.id,
        title: o.title,
        short: o.short,
        license: o.license,
        note: o.note,
      })),
      unavailable: [...OPERATORS, ...(challengeEnabled(env) ? CHALLENGE_OPERATORS : [])]
        .filter((o) => !enabled.includes(o))
        .map((o) => ({
          id: o.id,
          title: o.title,
          reason:
            o.host === 'basic'
              ? 'ODPT_TOKEN 未設定のため無効'
              : o.host === 'challenge'
                ? 'ODPT_CHALLENGE_TOKEN 未設定のため無効'
                : '設定により無効',
        })),
      unsupported: resolveUnsupported(env),
      bus: {
        operators: resolveBusOperators(env, { token: odptToken(env), challenge: challengeEnabled(env) }).map((o) => ({
          id: o.id,
          title: o.title,
          short: o.short,
          license: o.license,
        })),
        note: 'バスは全停留所を一括取得できないため、対象範囲を絞って都度検索します(バスは 1 本まで)。',
        unavailable: [...BUS_OPERATORS, ...CHALLENGE_BUS_OPERATORS]
          .filter(
            (o) =>
              !resolveBusOperators(env, { token: odptToken(env), challenge: challengeEnabled(env) }).includes(o)
          )
          .map((o) => ({
            id: o.id,
            title: o.title,
            reason:
              o.host === 'basic'
                ? 'ODPT_TOKEN 未設定のため無効'
                : o.host === 'challenge'
                  ? 'チャレンジ2026限定ライセンス(未有効化)'
                  : '設定により無効',
          })),
        // ODPT 側が API 形式の提供をやめた事業者。こちらの設定では復活できない。
        discontinued: DISCONTINUED_BUS_OPERATORS.map((o) => ({
          id: o.id,
          title: o.title,
          reason: `ODPT の API 形式データが ${o.endedOn.replace('-', '年')}月末で提供終了(後継は ${o.successor} のみ)`,
        })),
      },
    },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(TTL.health),
        'X-Data-Fetched-At': fetchedAt,
      },
    }
  );
}

/* ------------------------------------------------------------------ *
 *  GET /v1/network  — 路線・駅・駅順(静的)
 * ------------------------------------------------------------------ */
async function handleNetwork(env, origin, budget, fetchedAt) {
  const ops = resolveEnabledOperators(env);
  const railways = [];
  const stations = [];
  const errors = [];

  // 事業者ごとに Railway と Station を 1 回ずつ = 事業者数 × 2 サブリクエスト
  await Promise.all(
    ops.map(async (op) => {
      const p = { 'odpt:operator': operatorUrn(op.id) };
      try {
        const rs = await fetchOdpt(env, op.host, 'odpt:Railway', p, budget);
        for (const r of rs) railways.push(shapeRailway(r));
      } catch (e) {
        errors.push({ operator: op.id, type: 'Railway', message: e.message });
      }
      try {
        const ss = await fetchOdpt(env, op.host, 'odpt:Station', p, budget);
        for (const s of ss) stations.push(shapeStation(s));
      } catch (e) {
        errors.push({ operator: op.id, type: 'Station', message: e.message });
      }
    })
  );

  const partial = errors.length > 0;
  return json(
    {
      fetchedAt,
      operators: ops.map((o) => ({ id: o.id, title: o.title, short: o.short, license: o.license })),
      unsupported: resolveUnsupported(env),
      railways,
      stations,
      errors,
    },
    {
      origin,
      headers: {
        // 一部でも欠けたレスポンスを 24 時間キャッシュすると欠損が固定されるため短縮する
        'Cache-Control': cacheControl(partial ? 300 : TTL.network),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': partial ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ------------------------------------------------------------------ *
 *  GET /v1/status  — 運行情報
 * ------------------------------------------------------------------ */
async function handleStatus(env, origin, budget, fetchedAt) {
  const ops = resolveEnabledOperators(env);
  const items = [];
  const errors = [];

  await Promise.all(
    ops.map(async (op) => {
      try {
        const rows = await fetchOdpt(
          env,
          op.host,
          'odpt:TrainInformation',
          { 'odpt:operator': operatorUrn(op.id) },
          budget
        );
        for (const r of rows) items.push(shapeTrainInformation(r));
      } catch (e) {
        errors.push({ operator: op.id, operatorTitle: op.title, message: e.message });
      }
    })
  );

  const partial = errors.length > 0;
  return json(
    { fetchedAt, items, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(TTL.status),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': partial ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ------------------------------------------------------------------ *
 *  POST /v1/timetables  — 駅時刻表(バッチ)
 * ------------------------------------------------------------------ */
async function handleTimetables(request, env, origin, budget, fetchedAt) {
  const body = await readJson(request, origin);
  if (body instanceof Response) return body;

  const list = Array.isArray(body.stations) ? body.stations.filter((s) => typeof s === 'string') : [];
  if (!list.length) {
    return errorResponse(ERR.BAD_REQUEST, 'stations が空です', { status: 400, origin });
  }
  if (list.length > MAX_BATCH) {
    return errorResponse(ERR.BATCH_TOO_LARGE, `stations は 1 回あたり ${MAX_BATCH} 件までです`, {
      status: 400,
      origin,
    });
  }

  const calendar = typeof body.calendar === 'string' ? body.calendar : null;
  const results = [];
  const errors = [];

  await Promise.all(
    list.map(async (stationId) => {
      const op = getEnabledOperator(env, operatorOfUrn(stationId));
      if (!op) {
        errors.push({ station: stationId, message: '対応範囲外の事業者です' });
        return;
      }
      const params = { 'odpt:station': stationId };
      if (calendar) params['odpt:calendar'] = calendar;
      try {
        const rows = await fetchOdpt(env, op.host, 'odpt:StationTimetable', params, budget);
        for (const r of rows) results.push(shapeStationTimetable(r));
      } catch (e) {
        errors.push({ station: stationId, message: e.message });
      }
    })
  );

  return json(
    { fetchedAt, timetables: results, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(errors.length ? 300 : TTL.timetable),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': errors.length ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ------------------------------------------------------------------ *
 *  POST /v1/trains  — 列車時刻表(バッチ)
 *   { trains: ["odpt.TrainTimetable:..."] }            … ID 直指定
 *   { queries: [{railway, no, calendar}] }             … 列車番号から引く
 * ------------------------------------------------------------------ */
async function handleTrains(request, env, origin, budget, fetchedAt) {
  const body = await readJson(request, origin);
  if (body instanceof Response) return body;

  const ids = Array.isArray(body.trains) ? body.trains.filter((s) => typeof s === 'string') : [];
  const queries = Array.isArray(body.queries) ? body.queries.filter((q) => q && q.railway && q.no) : [];
  const total = ids.length + queries.length;

  if (!total) {
    return errorResponse(ERR.BAD_REQUEST, 'trains / queries が空です', { status: 400, origin });
  }
  if (total > MAX_BATCH) {
    return errorResponse(ERR.BATCH_TOO_LARGE, `1 回あたり合計 ${MAX_BATCH} 件までです`, {
      status: 400,
      origin,
    });
  }

  const results = [];
  const errors = [];

  const run = async (key, host, params) => {
    try {
      const rows = await fetchOdpt(env, host, 'odpt:TrainTimetable', params, budget);
      if (!rows.length) errors.push({ key, message: '該当する列車時刻表が見つかりません' });
      for (const r of rows) results.push(shapeTrainTimetable(r));
    } catch (e) {
      errors.push({ key, message: e.message });
    }
  };

  await Promise.all([
    ...ids.map((id) => {
      const op = getEnabledOperator(env, operatorOfUrn(id));
      if (!op) {
        errors.push({ key: id, message: '対応範囲外の事業者です' });
        return Promise.resolve();
      }
      // odpt:train が odpt.Train:… を指す事業者もあるため、
      // TrainTimetable の ID として引けない場合は列車番号での検索にフォールバックする。
      if (id.startsWith('odpt.TrainTimetable:')) {
        return run(id, op.host, { 'owl:sameAs': id });
      }
      const no = id.split('.').pop();
      return run(id, op.host, { 'odpt:trainNumber': no });
    }),
    ...queries.map((q) => {
      const op = getEnabledOperator(env, operatorOfUrn(q.railway));
      if (!op) {
        errors.push({ key: `${q.railway}/${q.no}`, message: '対応範囲外の事業者です' });
        return Promise.resolve();
      }
      const params = { 'odpt:railway': q.railway, 'odpt:trainNumber': q.no };
      if (q.calendar) params['odpt:calendar'] = q.calendar;
      return run(`${q.railway}/${q.no}`, op.host, params);
    }),
  ]);

  return json(
    { fetchedAt, trains: results, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(errors.length ? 300 : TTL.timetable),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': errors.length ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ------------------------------------------------------------------ *
 *  GET /v1/geocode?q=
 * ------------------------------------------------------------------ */
async function handleGeocode(url, env, origin, budget, fetchedAt) {
  const q = (url.searchParams.get('q') || '').trim();
  if (!q) {
    return errorResponse(ERR.BAD_REQUEST, 'q が空です', { status: 400, origin });
  }
  if (q.length > 100) {
    return errorResponse(ERR.BAD_REQUEST, 'q が長すぎます', { status: 400, origin });
  }
  const results = await geocode(env, q, budget);
  return json(
    { fetchedAt, query: q, results },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(TTL.geocode),
        'X-Data-Fetched-At': fetchedAt,
        'X-Data-Source': 'gsi',
      },
    }
  );
}

/* ------------------------------------------------------------------ */
async function readJson(request, origin) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object') throw new Error('not an object');
    return body;
  } catch {
    return errorResponse(ERR.BAD_REQUEST, 'JSON ボディを解釈できませんでした', {
      status: 400,
      origin,
    });
  }
}

/* ================================================================== *
 *  バス
 * ------------------------------------------------------------------
 *  バス停は全件取得できない(1000件上限・ページングなし)ため、
 *  すべて「名前で引く / ID を指定して引く」方式にしている。
 * ================================================================== */

/** odpt.BusstopPole:Toei.ShibuyaStation.636.1 → 'Toei' */
function busOperatorOfUrn(urn) {
  const m = /^odpt\.[A-Za-z]+:([A-Za-z0-9-]+)\./.exec(urn || '');
  return m ? busOperator(m[1]) : null;
}

/* ---- GET /v1/bus/stops?q=渋谷駅前[&q=...] ---- */
async function handleBusStops(url, env, origin, budget, fetchedAt) {
  const names = url.searchParams.getAll('q').map((s) => s.trim()).filter(Boolean);
  if (!names.length) {
    return errorResponse(ERR.BAD_REQUEST, 'q が空です', { status: 400, origin });
  }
  if (names.length > 6) {
    return errorResponse(ERR.BATCH_TOO_LARGE, 'q は 1 回あたり 6 件までです', { status: 400, origin });
  }

  const ops = resolveBusOperators(env, { token: odptToken(env), challenge: challengeEnabled(env) });
  // 事業者数 × 名前数がそのままサブリクエスト数になる。
  // 無料枠の上限(50)を超えないよう、超えそうなら名前を削って理由を返す。
  const maxNames = Math.max(1, Math.floor(SUBREQUEST_CAP / Math.max(1, ops.length)));
  const trimmed = names.slice(maxNames);
  const used = names.slice(0, maxNames);
  const stops = [];
  const errors = [];

  for (const name of trimmed) {
    errors.push({ query: name, message: 'サブリクエスト上限のため、この名前は検索していません' });
  }

  await Promise.all(
    ops.flatMap((op) =>
      used.map(async (name) => {
        try {
          const rows = await fetchStopsByTitle(env, op, name, budget);
          for (const s of rows) stops.push({ ...s, query: name });
        } catch (e) {
          errors.push({ operator: op.id, query: name, message: e.message });
        }
      })
    )
  );

  return json(
    { fetchedAt, queries: used, stops, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(errors.length ? 300 : TTL.network),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': errors.length ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ---- GET /v1/bus/calendars ---- */
async function handleBusCalendars(env, origin, budget, fetchedAt) {
  const ops = resolveBusOperators(env, { token: odptToken(env), challenge: challengeEnabled(env) });
  const calendars = [];
  const errors = [];

  await Promise.all(
    ops.map(async (op) => {
      try {
        const rows = await fetchCalendars(env, op, budget);
        for (const c of rows) calendars.push(c);
      } catch (e) {
        errors.push({ operator: op.id, message: e.message });
      }
    })
  );

  return json(
    { fetchedAt, calendars, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(errors.length ? 300 : TTL.network),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': errors.length ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ---- POST /v1/bus/patterns { ids: [...] } ---- */
async function handleBusPatterns(request, env, origin, budget, fetchedAt) {
  const body = await readJson(request, origin);
  if (body instanceof Response) return body;
  const ids = Array.isArray(body.ids) ? body.ids.filter((s) => typeof s === 'string') : [];
  if (!ids.length) return errorResponse(ERR.BAD_REQUEST, 'ids が空です', { status: 400, origin });
  if (ids.length > MAX_BATCH) {
    return errorResponse(ERR.BATCH_TOO_LARGE, `ids は 1 回あたり ${MAX_BATCH} 件までです`, { status: 400, origin });
  }

  const patterns = [];
  const errors = [];
  await Promise.all(
    ids.map(async (id) => {
      const op = busOperatorOfUrn(id);
      if (!op) {
        errors.push({ id, message: '対応範囲外のバス事業者です' });
        return;
      }
      try {
        for (const p of await fetchPattern(env, op, id, budget)) patterns.push(p);
      } catch (e) {
        errors.push({ id, message: e.message });
      }
    })
  );

  return json(
    { fetchedAt, patterns, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(errors.length ? 300 : TTL.timetable),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': errors.length ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ---- POST /v1/bus/timetables { poles: [...] } ---- */
async function handleBusTimetables(request, env, origin, budget, fetchedAt) {
  const body = await readJson(request, origin);
  if (body instanceof Response) return body;
  const poles = Array.isArray(body.poles) ? body.poles.filter((s) => typeof s === 'string') : [];
  if (!poles.length) return errorResponse(ERR.BAD_REQUEST, 'poles が空です', { status: 400, origin });
  if (poles.length > MAX_BATCH) {
    return errorResponse(ERR.BATCH_TOO_LARGE, `poles は 1 回あたり ${MAX_BATCH} 件までです`, { status: 400, origin });
  }

  const timetables = [];
  const errors = [];
  await Promise.all(
    poles.map(async (pole) => {
      const op = busOperatorOfUrn(pole);
      if (!op) {
        errors.push({ pole, message: '対応範囲外のバス事業者です' });
        return;
      }
      try {
        for (const t of await fetchPoleTimetables(env, op, pole, budget)) timetables.push(t);
      } catch (e) {
        errors.push({ pole, message: e.message });
      }
    })
  );

  return json(
    { fetchedAt, timetables, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(errors.length ? 300 : TTL.timetable),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': errors.length ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}

/* ---- POST /v1/bus/runs { runs: [{pattern, calendar}] } ---- */
async function handleBusRuns(request, env, origin, budget, fetchedAt) {
  const body = await readJson(request, origin);
  if (body instanceof Response) return body;
  const list = Array.isArray(body.runs) ? body.runs.filter((r) => r && typeof r.pattern === 'string') : [];
  if (!list.length) return errorResponse(ERR.BAD_REQUEST, 'runs が空です', { status: 400, origin });
  if (list.length > 10) {
    return errorResponse(ERR.BATCH_TOO_LARGE, 'runs は 1 回あたり 10 件までです', { status: 400, origin });
  }

  const runs = [];
  const errors = [];
  await Promise.all(
    list.map(async (r) => {
      const op = busOperatorOfUrn(r.pattern);
      if (!op) {
        errors.push({ pattern: r.pattern, message: '対応範囲外のバス事業者です' });
        return;
      }
      try {
        for (const t of await fetchRuns(env, op, r.pattern, r.calendar || null, budget)) runs.push(t);
      } catch (e) {
        errors.push({ pattern: r.pattern, message: e.message });
      }
    })
  );

  return json(
    { fetchedAt, runs, errors },
    {
      origin,
      headers: {
        'Cache-Control': cacheControl(errors.length ? 300 : TTL.timetable),
        'X-Data-Fetched-At': fetchedAt,
        'X-Partial': errors.length ? '1' : '0',
        'X-Data-Source': 'odpt',
      },
    }
  );
}
