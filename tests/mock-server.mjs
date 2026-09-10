/**
 * 開発用モックサーバ
 *   node tests/mock-server.mjs [port]
 *
 * transit/ を静的配信しつつ、/v1/* を Worker の代わりに応答する。
 * ODPT のトークンもネットワークも不要で UI を動かせる。
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { buildIndex, splitForWeb } from '../tools/gtfs-lib.mjs';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'transit');
const PORT = Number(process.argv[2] || 8099);

/* ---------------- モックデータ(Worker の出力形式) ---------------- */
const RW_G = 'odpt.Railway:TokyoMetro.Ginza';
const RW_M = 'odpt.Railway:TokyoMetro.Marunouchi';
const RW_A = 'odpt.Railway:Toei.Asakusa';

const G = ['Shibuya', 'Omotesando', 'Aoyamaitchome', 'Akasakamitsuke', 'Shimbashi', 'Nihombashi', 'Ueno'];
const M = ['Shinjuku', 'Yotsuya', 'Akasakamitsuke', 'Kokkaigijidomae', 'Ginza', 'Tokyo', 'Otemachi'];
const A = ['Gotanda', 'Shimbashi', 'Higashiginza', 'Nihombashi', 'Asakusa'];

const TITLE = {
  Shibuya: '渋谷', Omotesando: '表参道', Aoyamaitchome: '青山一丁目', Akasakamitsuke: '赤坂見附',
  Shimbashi: '新橋', Nihombashi: '日本橋', Ueno: '上野', Shinjuku: '新宿', Yotsuya: '四ツ谷',
  Kokkaigijidomae: '国会議事堂前', Ginza: '銀座', Tokyo: '東京', Otemachi: '大手町',
  Gotanda: '五反田', Higashiginza: '東銀座', Asakusa: '浅草',
};
const LATLON = {
  Shibuya: [35.6580, 139.7016], Omotesando: [35.6652, 139.7124], Aoyamaitchome: [35.6725, 139.7240],
  Akasakamitsuke: [35.6772, 139.7370], Shimbashi: [35.6665, 139.7583], Nihombashi: [35.6819, 139.7742],
  Ueno: [35.7118, 139.7770], Shinjuku: [35.6905, 139.7005], Yotsuya: [35.6862, 139.7300],
  Kokkaigijidomae: [35.6739, 139.7449], Ginza: [35.6717, 139.7650], Tokyo: [35.6812, 139.7671],
  Otemachi: [35.6863, 139.7663], Gotanda: [35.6258, 139.7233], Higashiginza: [35.6693, 139.7672],
  Asakusa: [35.7112, 139.7967],
};

const sid = (rw, n) => `odpt.Station:${rw.split(':')[1]}.${n}`;
const mkStations = (rw, names) =>
  names.map((n) => {
    const [lat, lon] = LATLON[n];
    return {
      id: sid(rw, n), title: TITLE[n], railway: rw,
      operator: rw.split(':')[1].split('.')[0], lat, lon, connecting: [],
    };
  });

const NETWORK = {
  fetchedAt: new Date().toISOString(),
  operators: [
    { id: 'Toei', title: '東京都交通局', short: '都営', license: 'CC BY 4.0' },
    { id: 'TokyoMetro', title: '東京メトロ', short: 'メトロ', license: '公共交通オープンデータ基本ライセンス' },
  ],
  unsupported: [{ title: 'JR東日本', reason: 'チャレンジ2026限定ライセンス' }],
  bus: { operators: [{ id: 'Toei', title: '東京都交通局', short: '都営バス', license: 'CC BY 4.0' }] },
  railways: [
    { id: RW_G, title: '銀座線', operator: 'TokyoMetro', color: '#FF9500', ascending: 'odpt.RailDirection:TokyoMetro.Asakusa', descending: 'odpt.RailDirection:TokyoMetro.Shibuya', stations: G.map((n) => sid(RW_G, n)) },
    { id: RW_M, title: '丸ノ内線', operator: 'TokyoMetro', color: '#F62E36', ascending: 'odpt.RailDirection:TokyoMetro.Ikebukuro', descending: 'odpt.RailDirection:TokyoMetro.Ogikubo', stations: M.map((n) => sid(RW_M, n)) },
    { id: RW_A, title: '浅草線', operator: 'Toei', color: '#E85298', ascending: 'odpt.RailDirection:Toei.Oshiage', descending: 'odpt.RailDirection:Toei.Nishimagome', stations: A.map((n) => sid(RW_A, n)) },
  ],
  stations: [...mkStations(RW_G, G), ...mkStations(RW_M, M), ...mkStations(RW_A, A)],
  errors: [],
};

const HEALTH = {
  ok: true,
  fetchedAt: new Date().toISOString(),
  tokenConfigured: true,
  geocoder: 'gsi',
  supported: [
    { id: 'Toei', title: '東京都交通局', short: '都営', license: 'CC BY 4.0', note: '浅草線ほか' },
    { id: 'TokyoMetro', title: '東京メトロ', short: 'メトロ', license: '公共交通オープンデータ基本ライセンス', note: '銀座線・丸ノ内線ほか' },
  ],
  unavailable: [],
  unsupported: [
    { title: 'JR東日本', reason: 'チャレンジ2026限定ライセンス(コンテスト目的外の利用不可)' },
    { title: '東急電鉄', reason: 'チャレンジ2026限定ライセンス' },
  ],
  challenge: { enabled: false, tokenConfigured: false, flagSet: false, note: 'チャレンジ限定データは無効です。' },
  bus: {
    operators: [{ id: 'Toei', title: '東京都交通局', short: '都営バス', license: 'CC BY 4.0' }],
    note: 'バスは直通便のみを都度検索します。',
    discontinued: [
      { id: 'KeioBus', title: '京王バス', reason: 'ODPT の API 形式データが 2025年6月末で提供終了(後継は GTFS のみ)' },
    ],
  },
};

const STATUS = {
  fetchedAt: new Date().toISOString(),
  items: [
    { id: 's1', operator: 'odpt.Operator:TokyoMetro', railway: RW_G, status: '平常運転', text: '平常どおり運転しています。', date: new Date().toISOString() },
    { id: 's2', operator: 'odpt.Operator:TokyoMetro', railway: RW_M, status: '遅延', text: '四ツ谷駅での急病人救護の影響で、約10分の遅れが出ています。', date: new Date().toISOString() },
    { id: 's3', operator: 'odpt.Operator:Toei', railway: RW_A, status: '運転見合わせ', text: '新橋駅〜日本橋駅間で発生した人身事故の影響で、運転を見合わせています。', date: new Date().toISOString() },
  ],
  errors: [],
};

/** 5 分間隔のダイヤを機械的に生成する */
function buildTimetables() {
  const out = new Map();
  const push = (station, rw, direction, offset, trainPrefix) => {
    const rows = [];
    for (let t = 5 * 60; t < 24 * 60; t += 5) {
      const h = String(Math.floor(t / 60)).padStart(2, '0');
      const m = String(t % 60).padStart(2, '0');
      rows.push({
        time: `${h}:${m}`,
        no: `${trainPrefix}${t}`,
        train: `odpt.TrainTimetable:${rw.split(':')[1]}.${trainPrefix}${t}`,
        dest: [],
        type: 'odpt.TrainType:TokyoMetro.Local',
      });
    }
    if (!out.has(station)) out.set(station, []);
    out.get(station).push({ id: `${station}|${direction}`, station, railway: rw, direction, calendar: 'odpt.Calendar:Weekday', rows });
    trainMeta.set(`${rw}|${trainPrefix}`, { rw, offset });
  };
  const trainMeta = new Map();

  for (const [rw, names] of [[RW_G, G], [RW_M, M], [RW_A, A]]) {
    const railway = NETWORK.railways.find((r) => r.id === rw);
    names.forEach((n) => {
      push(sid(rw, n), rw, railway.ascending, 0, 'UP');
      push(sid(rw, n), rw, railway.descending, 0, 'DN');
    });
  }
  return out;
}
const TIMETABLES = buildTimetables();

/** 列車 ID から停車時刻を組み立てる(各駅 2 分) */
function buildTrain(id) {
  const m = /^odpt\.TrainTimetable:([A-Za-z]+)\.([A-Za-z]+)\.(UP|DN)(\d+)$/.exec(id);
  if (!m) return null;
  const [, operator, line, dir, startStr] = m;
  const rw = `odpt.Railway:${operator}.${line}`;
  const railway = NETWORK.railways.find((r) => r.id === rw);
  if (!railway) return null;
  const seq = dir === 'UP' ? railway.stations : [...railway.stations].reverse();
  const start = Number(startStr);
  const stops = seq.map((station, i) => {
    const t = start + i * 2;
    const hh = String(Math.floor(t / 60)).padStart(2, '0');
    const mm = String(t % 60).padStart(2, '0');
    return { dep: `${hh}:${mm}`, depSt: station, arr: `${hh}:${mm}`, arrSt: station };
  });
  return {
    id, railway: rw, direction: dir === 'UP' ? railway.ascending : railway.descending,
    calendar: 'odpt.Calendar:Weekday', no: `${dir}${start}`, type: 'odpt.TrainType:TokyoMetro.Local',
    dest: [seq[seq.length - 1]], stops,
  };
}

/* ---------------- バスのモック ---------------- */
const BUS_P = 'odpt.BusroutePattern:Toei.Shibu88.8206.1';
const BUS_CAL = 'odpt.Calendar:Specific.Toei.09-100';
const POLE_A = 'odpt.BusstopPole:Toei.ShibuyaStation.636.1';
const POLE_M = 'odpt.BusstopPole:Toei.RoppongiDori.700.1';
const POLE_B = 'odpt.BusstopPole:Toei.ShimbashiStation.737.2';

const BUS_P2 = 'odpt.BusroutePattern:Toei.Sakura01.1.1';
const POLE_SAKURA = 'odpt.BusstopPole:Toei.Sakuradai.100.1';
const POLE_UENO = 'odpt.BusstopPole:Toei.UenoStation.300.1';

const BUS_STOPS = {
  渋谷駅前: [{ id: POLE_A, title: '渋谷駅前', operator: 'Toei', lat: 35.6585, lon: 139.7002, patterns: [BUS_P] }],
  新橋駅前: [{ id: POLE_B, title: '新橋駅前', operator: 'Toei', lat: 35.6665, lon: 139.7583, patterns: [BUS_P] }],
  桜台三丁目: [{ id: POLE_SAKURA, title: '桜台三丁目', operator: 'Toei', lat: 35.74, lon: 139.66, patterns: [BUS_P2] }],
};

const BUS_PATTERN2 = {
  id: BUS_P2,
  title: '桜０１ 上野駅前行',
  busroute: 'odpt.Busroute:Toei.Sakura01',
  direction: '1',
  operator: 'Toei',
  order: [
    { i: 1, pole: POLE_SAKURA, note: '桜台三丁目' },
    { i: 2, pole: 'odpt.BusstopPole:Toei.Mid2.250.1', note: '桜台一丁目' },
    { i: 3, pole: POLE_UENO, note: '上野駅前' },
  ],
};

const BUS_PATTERN = {
  id: BUS_P,
  title: '渋８８ 新橋駅前行',
  busroute: 'odpt.Busroute:Toei.Shibu88',
  direction: '1',
  operator: 'Toei',
  order: [
    { i: 1, pole: POLE_A, note: '渋谷駅前' },
    { i: 2, pole: POLE_M, note: '六本木通り' },
    { i: 3, pole: POLE_B, note: '新橋駅前' },
  ],
};

/** 毎日を平日ダイヤ扱いにして、いつテストしても当たるようにする */
function busCalendarDays() {
  const out = [];
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  for (let i = -400; i < 400; i += 1) {
    const d = new Date(base.getTime() + i * 86400000);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

function busTimetableFor(pole) {
  if (pole === POLE_SAKURA) {
    const rows = [];
    for (let t = 6 * 60; t < 23 * 60; t += 20) {
      rows.push({
        time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`,
        pattern: BUS_P2,
        destPole: POLE_UENO,
        destSign: '上野駅前',
        order: 1,
        isMidnight: false,
      });
    }
    return [{ id: `tt:${pole}`, pole, calendar: BUS_CAL, operator: 'Toei', rows }];
  }
  if (pole !== POLE_A) return [];
  const rows = [];
  for (let t = 6 * 60; t < 23 * 60; t += 15) {
    rows.push({
      time: `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`,
      pattern: BUS_P,
      destPole: POLE_B,
      destSign: '新橋駅前',
      order: 1,
      isMidnight: false,
    });
  }
  return [{ id: `tt:${pole}`, pole, calendar: BUS_CAL, operator: 'Toei', rows }];
}

function busRuns() {
  const runs = [];
  for (let t = 6 * 60; t < 23 * 60; t += 20) {
    const at = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    runs.push({
      id: `run2:${t}`,
      pattern: BUS_P2,
      calendar: BUS_CAL,
      operator: 'Toei',
      stops: [
        { i: 1, pole: POLE_SAKURA, arr: at(t), dep: at(t) },
        { i: 2, pole: 'odpt.BusstopPole:Toei.Mid2.250.1', arr: at(t + 6), dep: at(t + 6) },
        { i: 3, pole: POLE_UENO, arr: at(t + 14), dep: at(t + 14) },
      ],
    });
  }
  for (let t = 6 * 60; t < 23 * 60; t += 15) {
    const at = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    runs.push({
      id: `run:${t}`,
      pattern: BUS_P,
      calendar: BUS_CAL,
      operator: 'Toei',
      stops: [
        { i: 1, pole: POLE_A, arr: at(t), dep: at(t) },
        { i: 2, pole: POLE_M, arr: at(t + 12), dep: at(t + 12) },
        { i: 3, pole: POLE_B, arr: at(t + 28), dep: at(t + 28) },
      ],
    });
  }
  return runs;
}

/* ---------------- サーバ ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8' };

/* ------------------------------------------------------------------ *
 *  GTFS 由来の索引(京王バスを模したもの)
 * ------------------------------------------------------------------ *
 * 本物のファイルはリポジトリに置かない。ここで組み立てて返す。
 */
const GTFS_FEED = {
  'stops.txt':
    'stop_id,stop_name,stop_lat,stop_lon,location_type\n' +
    'S1,渋谷駅前,35.6580,139.7016,0\n' +
    'S2,調布駅北口,35.6520,139.5410,0\n',
  'routes.txt': 'route_id,route_short_name,route_long_name\nR1,渋33,渋谷〜調布\n',
  'trips.txt': 'route_id,service_id,trip_id,trip_headsign\nR1,EVERYDAY,T1,調布駅北口\n',
  'stop_times.txt':
    'trip_id,arrival_time,departure_time,stop_id,stop_sequence\n' +
    'T1,09:05:00,09:05:00,S1,1\n' +
    'T1,09:48:00,09:48:00,S2,2\n',
  'calendar.txt':
    'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n' +
    'EVERYDAY,1,1,1,1,1,1,1,20260101,20271231\n',
};

let gtfsCache = null;
function gtfsFile(rel) {
  if (!gtfsCache) {
    const { index, patterns } = buildIndex(GTFS_FEED, {
      operator: 'KeioBus',
      title: '京王バス',
      license: '公共交通オープンデータ基本ライセンス',
      generatedAt: '2026-09-01T00:00:00Z',
    });
    const web = splitForWeb(index, patterns);
    gtfsCache = {
      'catalog.json': JSON.stringify({
        v: 1,
        updatedAt: new Date().toISOString(),
        operators: [
          {
            id: 'KeioBus',
            title: '京王バス',
            dir: 'KeioBus',
            generatedAt: '2026-09-01T00:00:00Z',
            license: '公共交通オープンデータ基本ライセンス',
          },
        ],
        failed: [],
      }),
    };
    for (const [k, v] of Object.entries(web)) gtfsCache[`KeioBus/${k}`] = v;
  }
  return gtfsCache[rel] || null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (obj, status = 200) => {
    res.writeHead(status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'X-Data-Fetched-At': new Date().toISOString(),
    });
    res.end(JSON.stringify(obj));
  };

  if (url.pathname.startsWith('/v1/')) {
    if (url.pathname === '/v1/health') return send(HEALTH);
    if (url.pathname === '/v1/network') return send(NETWORK);
    if (url.pathname === '/v1/status') return send(STATUS);
    if (url.pathname === '/v1/bus/stops') {
      const names = url.searchParams.getAll('q');
      const stops = [];
      for (const n of names) for (const s of BUS_STOPS[n] || []) stops.push({ ...s, query: n });
      return send({ fetchedAt: new Date().toISOString(), queries: names, stops, errors: [] });
    }
    if (url.pathname === '/v1/bus/calendars') {
      return send({
        fetchedAt: new Date().toISOString(),
        calendars: [{ id: BUS_CAL, title: '平日', operator: 'Toei', days: busCalendarDays() }],
        errors: [],
      });
    }
    if (url.pathname === '/v1/geocode') {
      return send({ fetchedAt: new Date().toISOString(), query: url.searchParams.get('q'), results: [{ title: '東京都千代田区丸の内一丁目', lat: 35.6812, lon: 139.7671 }] });
    }
    const body = await readBody(req);
    if (url.pathname === '/v1/timetables') {
      const out = [];
      for (const s of body.stations || []) out.push(...(TIMETABLES.get(s) || []));
      return send({ fetchedAt: new Date().toISOString(), timetables: out, errors: [] });
    }
    if (url.pathname === '/v1/trains') {
      const trains = (body.trains || []).map(buildTrain).filter(Boolean);
      return send({ fetchedAt: new Date().toISOString(), trains, errors: [] });
    }
    if (url.pathname === '/v1/bus/patterns') {
      const ids = body.ids || [];
      const patterns = [];
      if (ids.includes(BUS_P)) patterns.push(BUS_PATTERN);
      if (ids.includes(BUS_P2)) patterns.push(BUS_PATTERN2);
      return send({ fetchedAt: new Date().toISOString(), patterns, errors: [] });
    }
    if (url.pathname === '/v1/bus/timetables') {
      const timetables = (body.poles || []).flatMap(busTimetableFor);
      return send({ fetchedAt: new Date().toISOString(), timetables, errors: [] });
    }
    if (url.pathname === '/v1/bus/runs') {
      return send({ fetchedAt: new Date().toISOString(), runs: busRuns(), errors: [] });
    }
    return send({ error: { code: 'NOT_FOUND', message: 'unknown' } }, 404);
  }

  // GTFS 由来のバス索引。GitHub Actions が作るファイルをその場で合成して返す。
  if (url.pathname.startsWith('/data/gtfs/')) {
    const rest = url.pathname.slice('/data/gtfs/'.length);
    const body = gtfsFile(rest);
    if (!body) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(body);
    return;
  }

  let p = url.pathname === '/' ? '/index.html' : url.pathname;
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    const data = await fs.readFile(file);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404).end('not found');
  }
});

function readBody(req) {
  return new Promise((resolve) => {
    let s = '';
    req.on('data', (c) => (s += c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(s || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

server.listen(PORT, () => console.log(`mock server: http://localhost:${PORT}/?worker=http://localhost:${PORT}`));
