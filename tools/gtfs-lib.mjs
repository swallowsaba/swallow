/**
 * GTFS → 検索用索引  (変換の中身)
 * ==================================================================
 * ここは純粋な変換だけを書く。ネットワークもファイル読み書きもしない。
 * そうしておくと、合成データでテストできる。
 *
 * 【なぜ索引を作るのか】
 * GTFS は「1 事業者ぶんの全時刻表」が入った ZIP で、展開すると数十 MB になる。
 * ブラウザに丸ごと渡すことはできないし、Cloudflare Workers の無料枠
 * (CPU 10ms / メモリ 128MB)でも展開できない。
 *
 * そこで GitHub Actions 側で
 *   ・バス停の索引(名前・座標・通る系統) … 1 ファイル
 *   ・系統ごとの時刻表            … 系統ごとに 1 ファイル
 * に割っておく。ブラウザは索引を 1 回読んだあと、
 * 必要な系統のファイルだけを取りに行けばよくなる。
 */

/* ------------------------------------------------------------------ *
 *  CSV
 * ------------------------------------------------------------------ */

/**
 * GTFS の CSV を読む。
 * 引用符の中のカンマ・改行・二重引用符に対応する(素朴な split では壊れる)。
 * @returns {{header:string[], rows:string[][]}}
 */
export function parseCsv(text) {
  const src = String(text || '').replace(/^﻿/, ''); // BOM
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < src.length; i += 1) {
    const c = src[i];
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i += 1;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return { header: [], rows: [] };
  return { header: rows[0].map((h) => h.trim()), rows: rows.slice(1) };
}

/** CSV をオブジェクトの配列にする */
export function readTable(text) {
  const { header, rows } = parseCsv(text);
  const idx = new Map(header.map((h, i) => [h, i]));
  return rows.map((r) => {
    const o = {};
    for (const [h, i] of idx) o[h] = r[i] ?? '';
    return o;
  });
}

/* ------------------------------------------------------------------ *
 *  時刻
 * ------------------------------------------------------------------ */

/**
 * GTFS の "25:10:00" を営業日基準の分に直す。
 * 24 時を超える表記はそのまま(1510 分)にする。既存の経路探索と同じ扱い。
 * @returns {?number}
 */
export function gtfsTimeToMinutes(v) {
  const m = /^(\d{1,3}):(\d{2})(?::(\d{2}))?$/.exec(String(v || '').trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min > 59) return null;
  return h * 60 + min;
}

/** "20260910" → "2026-09-10" */
export function gtfsDate(v) {
  const s = String(v || '').trim();
  return /^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}

/* ------------------------------------------------------------------ *
 *  索引づくり
 * ------------------------------------------------------------------ */

/**
 * GTFS のテキスト群から索引を作る。
 *
 * @param {Object<string,string>} files ファイル名 → 中身(テキスト)
 * @param {{operator:string, title:string, license:string}} meta
 * @returns {{index:object, patterns:Array<object>, warnings:string[]}}
 */
export function buildIndex(files, meta) {
  const warnings = [];
  const need = ['stops.txt', 'routes.txt', 'trips.txt', 'stop_times.txt'];
  for (const f of need) {
    if (!files[f]) throw new Error(`GTFS に ${f} がありません`);
  }

  /* --- 1) バス停 --- */
  const stopRows = readTable(files['stops.txt']);
  const stopById = new Map();
  const stops = [];
  for (const r of stopRows) {
    // location_type 1 は「駅/のりば群」。停留所そのものは 0(または空)。
    if (r.location_type && r.location_type !== '0') continue;
    const lat = Number(r.stop_lat);
    const lon = Number(r.stop_lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const i = stops.length;
    stops.push({ i, n: normalizeStopName(r.stop_name), y: round6(lat), x: round6(lon), r: [] });
    stopById.set(r.stop_id, i);
  }
  if (!stops.length) throw new Error('停留所が 1 件も取れませんでした');

  /* --- 2) 系統(route)と便(trip) --- */
  const routeRows = readTable(files['routes.txt']);
  const routeById = new Map();
  for (const r of routeRows) {
    routeById.set(r.route_id, {
      short: (r.route_short_name || '').trim(),
      long: (r.route_long_name || '').trim(),
    });
  }

  const tripRows = readTable(files['trips.txt']);
  const trips = new Map(); // trip_id → {route, service, headsign}
  for (const t of tripRows) {
    trips.set(t.trip_id, {
      route: t.route_id,
      service: t.service_id,
      headsign: (t.trip_headsign || '').trim(),
    });
  }

  /* --- 3) 便ごとの停車順と時刻 --- */
  const bySeq = new Map(); // trip_id → [{seq, stop, dep}]
  for (const st of readTable(files['stop_times.txt'])) {
    const si = stopById.get(st.stop_id);
    if (si === undefined) continue;
    const dep = gtfsTimeToMinutes(st.departure_time || st.arrival_time);
    if (dep == null) continue;
    if (!bySeq.has(st.trip_id)) bySeq.set(st.trip_id, []);
    bySeq.get(st.trip_id).push({ seq: Number(st.stop_sequence) || 0, stop: si, dep });
  }

  /**
   * 停車パターンが同じ便はまとめる。
   * GTFS は 1 本ごとに全停留所を持つので、そのままでは同じ並びを何百回も書くことになる。
   */
  const patternMap = new Map(); // key → {stops, route, headsign, service, runs:[[時刻...]]}
  for (const [tripId, list] of bySeq) {
    const t = trips.get(tripId);
    if (!t) continue;
    list.sort((a, b) => a.seq - b.seq);
    const seqStops = list.map((x) => x.stop);
    const key = `${t.route}|${t.service}|${t.headsign}|${seqStops.join(',')}`;
    if (!patternMap.has(key)) {
      patternMap.set(key, {
        route: t.route,
        service: t.service,
        headsign: t.headsign,
        stops: seqStops,
        runs: [],
      });
    }
    patternMap.get(key).runs.push(list.map((x) => x.dep));
  }

  const patterns = [];
  for (const p of patternMap.values()) {
    const info = routeById.get(p.route) || {};
    p.runs.sort((a, b) => a[0] - b[0]);
    patterns.push({
      i: patterns.length,
      // 系統名。short が無い事業者もあるので long で補う。
      n: info.short || info.long || p.route,
      d: p.headsign, // 行き先
      c: p.service, // 運行日(calendar の service_id)
      s: p.stops, // 停留所の並び(索引)
      t: p.runs, // 便ごとの発車時刻(分)
    });
  }
  if (!patterns.length) throw new Error('便が 1 件も取れませんでした');

  // バス停 → その停留所を通る系統
  for (const p of patterns) {
    for (const si of new Set(p.s)) stops[si].r.push(p.i);
  }

  /* --- 4) 運行日 --- */
  const calendars = buildCalendars(files, warnings);
  const used = new Set(patterns.map((p) => p.c));
  for (const c of used) {
    if (!calendars[c]) {
      warnings.push(`運行日 ${c} の定義が見つかりません。この系統は日付で絞り込めません。`);
      // 定義が無いものは「毎日運行」と決めつけない。空にして、使う側で警告する。
      calendars[c] = { d: null, add: [], del: [] };
    }
  }

  /* --- 5) 名前の索引(検索はここから始まる) --- */
  const byName = {};
  for (const s of stops) {
    if (!byName[s.n]) byName[s.n] = [];
    byName[s.n].push(s.i);
  }

  return {
    index: {
      v: 1,
      operator: meta.operator,
      title: meta.title,
      license: meta.license,
      generatedAt: meta.generatedAt || null,
      source: meta.source || null,
      feedStart: feedRange(files).start,
      feedEnd: feedRange(files).end,
      stopCount: stops.length,
      patternCount: patterns.length,
      stops,
      byName,
      calendars,
    },
    patterns,
    warnings,
  };
}

/** calendar.txt と calendar_dates.txt から運行日の定義を作る */
function buildCalendars(files, warnings) {
  const out = {};
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

  if (files['calendar.txt']) {
    for (const r of readTable(files['calendar.txt'])) {
      // 日〜土を 7 ビットのマスクにする(日曜が最下位)
      let mask = 0;
      DAYS.forEach((d, i) => {
        if (r[d] === '1') mask |= 1 << i;
      });
      out[r.service_id] = {
        d: mask,
        from: gtfsDate(r.start_date),
        to: gtfsDate(r.end_date),
        add: [],
        del: [],
      };
    }
  }

  if (files['calendar_dates.txt']) {
    for (const r of readTable(files['calendar_dates.txt'])) {
      const date = gtfsDate(r.date);
      if (!date) continue;
      if (!out[r.service_id]) out[r.service_id] = { d: 0, from: null, to: null, add: [], del: [] };
      if (r.exception_type === '1') out[r.service_id].add.push(date);
      else if (r.exception_type === '2') out[r.service_id].del.push(date);
    }
  }

  if (!Object.keys(out).length) warnings.push('calendar.txt / calendar_dates.txt が無く、運行日を判定できません。');
  return out;
}

/** feed_info.txt があれば有効期間を取る */
function feedRange(files) {
  if (!files['feed_info.txt']) return { start: null, end: null };
  const rows = readTable(files['feed_info.txt']);
  if (!rows.length) return { start: null, end: null };
  return { start: gtfsDate(rows[0].feed_start_date), end: gtfsDate(rows[0].feed_end_date) };
}

/**
 * 停留所名の表記ゆれをならす。
 * 全角英数と全角スペースだけを直す。「駅前」などは意味が変わるので触らない。
 */
export function normalizeStopName(name) {
  return String(name || '')
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
    .trim();
}

function round6(n) {
  return Math.round(n * 1e6) / 1e6;
}

/**
 * 索引を配布用のファイルに割る。
 * 系統は 1 ファイルにまとめず、まとまり(shard)ごとに分ける。
 * ファイル数が多すぎても Git が重くなるので、1 ファイルにおよそ 40 系統入れる。
 *
 * @returns {Object<string,string>} 相対パス → JSON 文字列
 */
export function splitForWeb(index, patterns, { perShard = 40 } = {}) {
  const files = {};
  const shardOf = new Map();

  for (let start = 0; start < patterns.length; start += perShard) {
    const shard = Math.floor(start / perShard);
    const slice = patterns.slice(start, start + perShard);
    for (const p of slice) shardOf.set(p.i, shard);
    files[`patterns/${shard}.json`] = JSON.stringify({ v: 1, patterns: slice });
  }

  // 索引側に「どの系統がどのファイルか」を持たせる
  const meta = { ...index, perShard, shardCount: Math.ceil(patterns.length / perShard) };
  files['index.json'] = JSON.stringify(meta);
  return files;
}
