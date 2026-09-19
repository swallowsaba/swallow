/**
 * 首都圏ルート検索 — エントリポイント
 * ------------------------------------------------------------------
 * 画面の状態管理と、各モジュールの結線だけを行う。
 */

import { resolveWorkerUrl, IS_PLACEHOLDER_URL } from './config.js';
import { TransitApi, ApiError, messageFor } from './api.js';
import { loadNetwork, clearNetworkCache } from './network.js';
import { findCandidateRoutes, bindSchedule, edgeKey } from './router.js';
import { analyzeStatus, warningsForRoute, SEVERITY } from './status.js';
import { findBusRoutes, findIntermodalRoutes, setBusOperatorTitles } from './bus.js';
import { findAllGtfsRoutes, loadCatalog, stopsInBounds, indexStatus, STOP_MIN_ZOOM } from './gtfs.js';
import { currentPosition, GeoError, formatDistance } from './geo.js';
import { toServiceMoment, calendarFor, dateKey } from './time.js';
import { TransitMap, routeToSegments } from './map.js';
import { combineSegments, buildPoints, validatePoints } from './via.js';
import { walkSettings, accessCombos, attachWalk, isPoint, walkMinutes, farWalk, accessCandidates, walkOnlyRoute } from './walk.js';
import { railCategory, busCategory, RAIL_CATEGORIES, BUS_CATEGORIES, categoryOrder } from './category.js';
import * as ui from './ui.js';

const { $ } = ui;

/* ------------------------------------------------------------------ *
 *  状態
 * ------------------------------------------------------------------ */
const state = {
  api: null,
  net: null,
  health: null,
  config: null,
  holidays: [],
  from: null, // {groupId, label}
  to: null,
  vias: [], // [{id, spec:{groupId,label,busOnly}|null, stay:分}]
  excludes: [], // {id, type:'railway'|'range', railway, from?, to?}
  sort: 'time',
  routes: [],
  analysis: null,
  statusFailed: false,
  statusErrors: [],
  stamps: { networkAt: null, timetableAt: null, statusAt: null },
  stores: { timetables: new Map(), trains: new Map() },
  busStore: {}, // カレンダーなど、セッション中使い回すもの
  gtfsCatalog: null, // GTFS から取り込んだ事業者の目録
  map: null,
  mapOpen: false,
  knownBusStops: new Map(), // 地図に出せるバス停(名前検索や経路で見つかったもの)
  sortedRoutes: [], // 画面に出ている並び順
  shownRoute: null, // 地図に描いている経路
  includeBus: true,
  includeIntermodal: true,
  searching: false,
  lastQuery: null,
};

/* ------------------------------------------------------------------ *
 *  初期化
 * ------------------------------------------------------------------ */
init().catch((e) => {
  ui.addAlert('error', {
    title: '初期化に失敗しました',
    body: '画面を再読み込みしてください。解消しない場合は Worker の URL 設定を確認してください。',
    detail: String(e && e.message ? e.message : e),
  });
});

async function init() {
  setDepartToNow();
  bindStaticHandlers();

  state.api = new TransitApi(resolveWorkerUrl());

  if (IS_PLACEHOLDER_URL()) {
    ui.addAlert('error', {
      title: 'Worker の URL が未設定です',
      body: 'transit/js/config.js の DEFAULT_WORKER_URL を、デプロイした Worker の URL に書き換えてください。動作確認だけなら URL の末尾に ?worker=https://... を付けても指定できます。',
    });
  }

  // ローカル設定(手動メンテのデータ)
  const [config, holidays] = await Promise.all([
    fetchJson('./data/config.json', {}),
    fetchJson('./data/holidays.json', { dates: [] }),
  ]);
  state.config = config;
  state.holidays = holidays.dates || [];
  updateCalendarNote();

  // 取り込んだデータの出典は、ライセンスで表示が義務づけられている。
  // Worker の状態に関係なく、必ず先に出す
  // (Worker が落ちていても、索引を配信している以上は出典が要るため)。
  const catalog = await loadCatalog().catch(() => ({ operators: [] }));
  state.gtfsCatalog = catalog;
  ui.renderAttributions(catalog);

  // Worker の疎通と対応範囲
  try {
    const res = await state.api.health();
    state.health = res.data;
    // バスの事業者名を覚える(レグの表示と、除外の判定に使う)
    setBusOperatorTitles(res.data?.bus?.operators || []);
    // GTFS から取り込んだ事業者があれば、それも「対応している」側に出す
    ui.renderCoverage(res.data, catalog);
    if (!res.data.tokenConfigured) {
      ui.addAlert('warn', {
        title: 'ODPT のアクセストークンが未設定です',
        body: 'トークン不要の CC BY データ(都営)のみ利用できます。東京メトロなどを使うには Worker に ODPT_TOKEN を設定してください。',
      });
    }
  } catch (e) {
    handleApiError(e, 'Worker に接続できませんでした');
    return;
  }

  // 路線ネットワーク
  try {
    const { network, cached, fetchedAt } = await loadNetwork(state.api, state.config);
    state.net = network;
    state.stamps.networkAt = fetchedAt || network.fetchedAt;
    ui.renderStamps(state.stamps);
    populateExcludeSelectors();
    if (network.errors?.length) {
      ui.addAlert('warn', {
        title: '一部の路線データを取得できませんでした',
        body: network.errors.map((e) => `${e.operator}: ${e.type}`).join(' / ') + ' — その事業者の経路は提案されません。',
      });
    }
    if (cached) {
      ui.addAlert('info', {
        title: '保存済みの路線データを使用しています',
        body: '路線・駅の情報は 24 時間ブラウザに保存されます。時刻表と運行情報は毎回取得します。',
        actions: [{ label: '路線データを再取得', onClick: reloadNetwork }],
      });
    }
  } catch (e) {
    handleApiError(e, '路線データを取得できませんでした');
    return;
  }

  renderVias();
  ui.renderExcludes(state.excludes, state.net, removeExclude, clearExcludes);
  ui.renderEmpty('出発地と到着地を入力してください', '駅名のほか、「現在地」ボタンや住所からも指定できます。');
}

async function reloadNetwork() {
  clearNetworkCache();
  ui.clearAlerts();
  try {
    const { network, fetchedAt } = await loadNetwork(state.api, state.config, { force: true });
    state.net = network;
    state.stamps.networkAt = fetchedAt || network.fetchedAt;
    ui.renderStamps(state.stamps);
    populateExcludeSelectors();
  } catch (e) {
    handleApiError(e, '路線データを再取得できませんでした');
  }
}

/* ------------------------------------------------------------------ *
 *  イベント結線
 * ------------------------------------------------------------------ */
function bindStaticHandlers() {
  $('#coverage-toggle').addEventListener('click', (e) => {
    const panel = $('#coverage-panel');
    panel.hidden = !panel.hidden;
    e.currentTarget.setAttribute('aria-expanded', String(!panel.hidden));
  });

  $('#now-btn').addEventListener('click', setDepartToNow);

  const busToggle = $('#include-bus');
  const mixToggle = $('#include-intermodal');
  state.includeBus = busToggle.checked;
  state.includeIntermodal = mixToggle.checked;
  const syncBusToggles = () => {
    state.includeBus = busToggle.checked;
    mixToggle.disabled = !busToggle.checked;
    state.includeIntermodal = busToggle.checked && mixToggle.checked;
    if (state.lastQuery) runSearch();
  };
  busToggle.addEventListener('change', syncBusToggles);
  mixToggle.addEventListener('change', syncBusToggles);
  $('#depart-input').addEventListener('change', updateCalendarNote);

  $('#swap-btn').addEventListener('click', () => {
    const a = state.from;
    state.from = state.to;
    state.to = a;
    $('#from-input').value = state.from?.label || '';
    $('#to-input').value = state.to?.label || '';
    $('#from-hint').textContent = state.from ? '' : '未選択';
    $('#to-hint').textContent = state.to ? '' : '未選択';
    // 経由地の順序も逆にしないと、指定した通り道にならない
    state.vias.reverse();
    renderVias();
  });

  $('#locate-btn').addEventListener('click', useCurrentLocation);

  $('#map-toggle').addEventListener('click', toggleMap);
  $('#map-locate').addEventListener('click', async () => {
    try {
      const pos = await currentPosition();
      if (!state.mapOpen) toggleMap();
      state.map?.focus(pos.lat, pos.lon, 15);
    } catch (e) {
      ui.addAlert('warn', { title: '現在地を取得できませんでした', body: e instanceof GeoError ? e.message : '' });
    }
  });

  setupAutocomplete('#from-input', '#from-list', '#from-hint', placeFor('from'));
  setupAutocomplete('#to-input', '#to-list', '#to-hint', placeFor('to'));

  $('#via-add').addEventListener('click', addVia);

  $('#status-toggle').addEventListener('click', ui.toggleStatus);

  $('#search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    runSearch();
  });

  for (const btn of document.querySelectorAll('.sorter__btn')) {
    btn.addEventListener('click', () => {
      state.sort = btn.dataset.sort;
      for (const b of document.querySelectorAll('.sorter__btn')) b.classList.toggle('is-active', b === btn);
      renderSorted();
    });
  }

  $('#ex-railway').addEventListener('change', populateStationSelectors);
  $('#ex-add-line').addEventListener('click', () => {
    const rw = $('#ex-railway').value;
    if (!rw) return;
    addExclude({ type: 'railway', railway: rw });
  });
  $('#ex-add-range').addEventListener('click', () => {
    const rw = $('#ex-railway').value;
    const from = $('#ex-from').value;
    const to = $('#ex-to').value;
    if (!rw || !from || !to || from === to) {
      ui.addAlert('warn', { title: '区間を指定してください', body: '同じ駅どうしは指定できません。' });
      return;
    }
    addExclude({ type: 'range', railway: rw, from, to });
  });

  // バスの除外を開いたときにだけ、GTFS の系統一覧を読みに行く。
  // 起動時に読むと、使わない人にも数 MB の通信が発生してしまう。
  $('#ex-bus-details')?.addEventListener('toggle', (e) => {
    if (!e.currentTarget.open || state.busLinesLoaded) return;
    state.busLinesLoaded = true;
    const note = $('#ex-bus-note');
    if (note) note.textContent = '系統の一覧を読み込んでいます…';
    populateBusExcludeSelectors({ withGtfs: true });
  });
  $('#ex-bus-operator').addEventListener('change', populateBusLineSelector);
  $('#ex-add-bus-operator').addEventListener('click', () => {
    const op = $('#ex-bus-operator').value;
    if (!op) return;
    addExclude({ type: 'busOperator', operatorTitle: op });
  });
  $('#ex-add-bus-line').addEventListener('click', () => {
    const op = $('#ex-bus-operator').value;
    const line = $('#ex-bus-line').value;
    if (!op || !line) {
      ui.addAlert('warn', { title: '系統を選んでください', body: '事業者と系統の両方を選ぶ必要があります。' });
      return;
    }
    addExclude({ type: 'busLine', operatorTitle: op, lineTitle: line });
  });
}

/* ------------------------------------------------------------------ *
 *  入力補助
 * ------------------------------------------------------------------ */
/**
 * 駅名・バス停名・住所のオートコンプリート。
 * 出発/到着だけでなく経由地でも使うため、書き込み先は place で受け取る。
 * @param {HTMLElement|string} inputSel
 * @param {HTMLElement|string} listSel
 * @param {HTMLElement|string} hintSel
 * @param {{get:Function, set:Function}} place
 */
function setupAutocomplete(inputSel, listSel, hintSel, place) {
  const input = typeof inputSel === 'string' ? $(inputSel) : inputSel;
  const list = typeof listSel === 'string' ? $(listSel) : listSel;
  const hint = typeof hintSel === 'string' ? $(hintSel) : hintSel;
  let timer = null;

  const pick = async (item) => {
    if (item.kind === 'geocode') {
      ui.hideSuggest(list);
      input.setAttribute('aria-expanded', 'false');
      await geocodeInto(place, item.query, input, list, hint);
      return;
    }
    if (item.kind === 'busstop') {
      ui.hideSuggest(list);
      input.setAttribute('aria-expanded', 'false');
      await busStopInto(place, item.query, input, hint);
      return;
    }
    // GTFS から取り込んだ停留所。索引が手元にあるので問い合わせは要らない。
    if (item.kind === 'gtfsstop') {
      rememberBusStops([
        { id: `gtfs:${item.operator}:${item.label}`, title: item.label, lat: item.lat, lon: item.lon },
      ]);
      place.set({ groupId: null, label: item.label, busOnly: true });
      input.value = item.label;
      hint.textContent = `${item.operatorTitle}「${item.label}」(取り込み済みダイヤ・鉄道の経路は対象外)`;
      hint.classList.remove('is-error');
      ui.hideSuggest(list);
      input.setAttribute('aria-expanded', 'false');
      return;
    }
    place.set({ groupId: item.value, label: item.label, busOnly: false });
    input.value = item.label;
    hint.textContent = item.sub || '';
    hint.classList.remove('is-error');
    ui.hideSuggest(list);
    input.setAttribute('aria-expanded', 'false');
  };

  input.addEventListener('input', () => {
    place.set(null);
    clearTimeout(timer);
    timer = setTimeout(async () => {
      const q = input.value.trim();
      if (!q || !state.net) {
        ui.hideSuggest(list);
        input.setAttribute('aria-expanded', 'false');
        return;
      }
      const groups = state.net.searchGroups(q);
      const items = groups.map((g) => ({
        type: 'station',
        label: g.title,
        sub: railwaysOfGroup(g).join(' / '),
        value: g.id,
      }));

      // GTFS から取り込んだ停留所も候補に並べる。
      // 索引はブラウザ内にあるので、ここでの検索に通信は発生しない
      // (索引そのものの取得は 1 回だけ・以後はキャッシュ)。
      // 索引の初回読み込みは数秒かかることがある。その間に駅だけ出して黙っていると
      // 「バス停が無い」と誤解されるので、先に駅を出したうえで読み込み中と伝える。
      const status = await indexStatus().catch(() => ({ none: true, ready: true }));
      if (input.value.trim() !== q) return;
      if (!status.none && !status.ready) {
        const withNotice = [...items, { type: 'section', label: 'バス停を読み込んでいます…' }];
        ui.renderSuggest(list, withNotice, pick);
        input.setAttribute('aria-expanded', String(!list.hidden));
      }

      const gtfsItems = await gtfsSuggestItems(q);
      // 待っている間に入力が変わっていたら、古い結果は捨てる
      if (input.value.trim() !== q) return;
      if (gtfsItems.length) {
        items.push({ type: 'section', label: 'バス停(取り込み済みダイヤ)' });
        items.push(...gtfsItems);
      }

      if (q.length >= 2) {
        items.push({ type: 'section', label: '駅名で見つからないとき' });
        items.push({
          type: 'station',
          kind: 'busstop',
          label: `「${q}」をバス停として検索`,
          sub: '都営バスの停留所名で指定します',
          query: q,
        });
        items.push({
          type: 'station',
          kind: 'geocode',
          label: `「${q}」を地名・施設名(スポット)で検索`,
          sub: '住所のほか、東京タワー・上野動物園などの施設名でも探せます',
          query: q,
        });
      }
      ui.renderSuggest(list, items, pick);
      input.setAttribute('aria-expanded', String(!list.hidden));
    }, 180);
  });

  input.addEventListener('blur', () => {
    setTimeout(() => {
      ui.hideSuggest(list);
      input.setAttribute('aria-expanded', 'false');
      if (!place.get() && input.value.trim()) {
        hint.textContent = '候補から駅を選んでください';
        hint.classList.add('is-error');
      }
    }, 150);
  });
}

/**
 * GTFS から取り込んだ停留所を、候補として並べられる形にする。
 * 索引が無い(まだ取り込んでいない)ときは黙って空を返す。
 * 同じ名前の停留所は事業者ごとに 1 つにまとめる(のりばの数だけ並べない)。
 */
async function gtfsSuggestItems(query) {
  if (!query) return [];
  try {
    const { suggestGtfsStops } = await import('./gtfs.js');
    const found = await suggestGtfsStops(query);
    const seen = new Set();
    const items = [];
    for (const s of found) {
      const key = `${s.operator}:${s.title}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        type: 'station',
        kind: 'gtfsstop',
        label: s.title,
        sub: `${s.operatorTitle}(バス停)`,
        operator: s.operator,
        operatorTitle: s.operatorTitle,
        lat: s.lat,
        lon: s.lon,
      });
      if (items.length >= 8) break;
    }
    return items;
  } catch {
    // 取り込み前・索引が読めない、は「候補が無い」と同じ扱いにする
    return [];
  }
}

/** state.from / state.to への読み書き */
function placeFor(which) {
  return {
    get: () => state[which],
    set: (spec) => {
      state[which] = spec;
    },
  };
}

function railwaysOfGroup(group) {
  const names = new Set();
  for (const sid of group.members) {
    const st = state.net.stations.get(sid);
    if (st) names.add(state.net.railwayTitle(st.railway));
  }
  return [...names];
}

/**
 * バス停名として確定する。駅ではないので groupId は持たない。
 * この場合、鉄道単独の経路は出せず、バス(と乗り継ぎ)だけが対象になる。
 */
async function busStopInto(place, query, input, hint) {
  hint.textContent = 'バス停を探しています…';
  hint.classList.remove('is-error');
  try {
    const { busStopNameCandidates } = await import('./bus.js');
    const res = await state.api.busStops(busStopNameCandidates(query));
    const stops = res.data.stops || [];
    if (!stops.length) {
      // ODPT に無くても、GTFS から取り込んだ事業者にあるかもしれない
      const { suggestGtfsStops } = await import('./gtfs.js');
      const alt = await suggestGtfsStops(query);
      if (alt.length) {
        const first = alt[0];
        rememberBusStops(alt.map((a) => ({ id: `gtfs:${a.operator}:${a.title}`, title: a.title, lat: a.lat, lon: a.lon })));
        place.set({ groupId: null, label: first.title, busOnly: true });
        input.value = first.title;
        hint.textContent = `${first.operatorTitle}「${first.title}」(取り込み済みダイヤ・鉄道の経路は対象外)`;
        return;
      }
      hint.textContent = 'そのバス停は見つかりませんでした(正式名で入力してください)';
      hint.classList.add('is-error');
      return;
    }
    rememberBusStops(stops);
    const label = stops[0].title;
    place.set({ groupId: null, label, busOnly: true });
    input.value = label;
    hint.textContent = `都営バス「${label}」(鉄道の経路は対象外になります)`;
  } catch (e) {
    hint.textContent = e instanceof ApiError ? messageFor(e.code, e.message) : 'バス停を検索できませんでした';
    hint.classList.add('is-error');
  }
}

/**
 * 住所・地名・施設名(スポット)で探す。
 *
 * 以前は見つけた場所を**最寄駅に置き換えて**しまっていたが、それでは
 * 「東京タワーから」と指定できない。スポットそのものを地点として選べるようにし、
 * 最寄駅は別の選択肢として並べる。
 * 地点を選んだ場合は、そこから駅までの徒歩を推定して経路に含める
 * (地図で任意の地点を選んだときと同じ扱い)。
 */
async function geocodeInto(place, query, input, list, hint) {
  hint.textContent = '地名・施設名を検索しています…';
  hint.classList.remove('is-error');
  try {
    // 点数付けと言い直しは Worker 側でもやっているが、
    // Worker が古いままでも動くよう、ブラウザ側でも必ず通す。
    // (実際 Worker を更新し忘れて「見つからない」状態が続いた)
    let hits = scoreHits(query, (await state.api.geocode(query)).data.results || []);

    if (!hits.some((h) => !h.weak)) {
      const alt = fallbackQuery(query);
      if (alt) {
        try {
          const more = scoreHits(query, (await state.api.geocode(alt)).data.results || [], alt);
          if (more.some((h) => !h.weak)) hits = more;
        } catch {
          /* 言い直しが失敗しても、最初の結果はそのまま使う */
        }
      }
    }

    if (!hits.length) {
      hint.textContent = '該当する場所が見つかりませんでした(正式名称で試してください)';
      hint.classList.add('is-error');
      return;
    }

    const settings = walkSettings(state.config || {});
    const items = [];

    // 1) 見つかった場所そのもの(最大 5 件)。これが本命。
    // 名前が合っているものだけを「見つかった場所」として出す。
    // 合っていないもの(地名の一部に反応しただけの住所)は分けて、印を付ける。
    const strong = hits.filter((h) => !h.weak);
    const weak = hits.filter((h) => h.weak);

    const pushHits = (list, heading, mark) => {
      if (!list.length) return;
      items.push({ type: 'section', label: heading });
      for (const h of list.slice(0, 5)) {
        const near = state.net?.nearestGroups(h.lat, h.lon, 1) || [];
        const sub = near.length
          ? `${mark}最寄: ${near[0].group.title} まで徒歩 約${walkMinutes(near[0].km, settings)}分(推定)`
          : `${mark}対応範囲に駅がありません`;
        items.push({ type: 'station', kind: 'spot', label: h.title, sub, lat: h.lat, lon: h.lon });
      }
    };

    pushHits(strong, '見つかった場所(ここを出発・到着にできます)', '');
    pushHits(weak, '名前が一致しなかった候補', '入力とは別の場所かもしれません / ');

    // 2) 先頭の場所の最寄駅。駅を使いたいときはこちら。
    const top = strong[0] || hits[0];
    const near = state.net?.nearestGroups(top.lat, top.lon, 4) || [];
    if (near.length) {
      items.push({ type: 'section', label: `${top.title} の最寄駅` });
      for (const n of near) {
        items.push({
          type: 'station',
          label: n.group.title,
          sub: `${top.title} から ${formatDistance(n.km)}`,
          value: n.group.id,
        });
      }
    }

    hint.textContent = strong.length
      ? `${strong.length} 件見つかりました`
      : '名前が一致する場所は見つかりませんでした(候補は下に出ています)';
    ui.renderSuggest(list, items, (item) => {
      if (item.kind === 'spot') {
        // 地点として確定する。駅に置き換えない。
        place.set({
          kind: 'point',
          lat: item.lat,
          lon: item.lon,
          label: item.label,
          busOnly: false,
          groupId: null,
        });
        input.value = item.label;
        hint.textContent = `${item.label}(地点) — ${item.sub}`;
        hint.classList.remove('is-error');
        ui.hideSuggest(list);
        // 地図を開いているなら、その場所に印を出す
        state.map?.markPoint?.(`spot:${item.label}`, item.lat, item.lon, item.label);
        return;
      }
      place.set({ groupId: item.value, label: item.label, busOnly: false });
      input.value = item.label;
      hint.textContent = item.sub;
      hint.classList.remove('is-error');
      ui.hideSuggest(list);
    });
  } catch (e) {
    hint.textContent = e instanceof ApiError ? messageFor(e.code, e.message) : '地名・施設名の検索に失敗しました';
    hint.classList.add('is-error');
  }
}

async function useCurrentLocation() {
  const btn = $('#locate-btn');
  btn.disabled = true;
  $('#from-hint').textContent = '現在地を取得しています…';
  $('#from-hint').classList.remove('is-error');
  try {
    const pos = await currentPosition();
    const near = state.net.nearestGroups(pos.lat, pos.lon, 4);
    if (!near.length) {
      $('#from-hint').textContent = '現在地の近くに対応範囲の駅が見つかりませんでした';
      $('#from-hint').classList.add('is-error');
      return;
    }
    $('#from-hint').textContent = '最寄駅の候補から選んでください';
    ui.renderSuggest($('#from-list'), ui.nearestSuggestItems(near), (item) => {
      state.from = { groupId: item.value, label: item.label };
      $('#from-input').value = item.label;
      $('#from-hint').textContent = item.sub;
      ui.hideSuggest($('#from-list'));
    });
  } catch (e) {
    $('#from-hint').textContent = e instanceof GeoError ? e.message : '現在地を取得できませんでした';
    $('#from-hint').classList.add('is-error');
  } finally {
    btn.disabled = false;
  }
}

/* ------------------------------------------------------------------ *
 *  経由地
 * ------------------------------------------------------------------ */
const MAX_VIAS = 3;
/** 地点を含むときに試す「最寄駅の組み合わせ」の上限。増やすと通信量が増える。 */
/** これより長い「徒歩だけ」の案は出さない(現実的でないため) */
const WALK_ONLY_MAX_MINUTES = 45;
const MAX_WALK_COMBOS = 3;
let viaSeq = 0;

function addVia() {
  if (state.vias.length >= MAX_VIAS) {
    ui.addAlert('warn', {
      title: `経由地は ${MAX_VIAS} か所までです`,
      body: '区間ごとに時刻表を取得するため、これ以上増やすと無料枠を使い切る恐れがあります。',
    });
    return;
  }
  viaSeq += 1;
  state.vias.push({ id: `v${viaSeq}`, spec: null, stay: 0 });
  renderVias();
  // 追加した行にすぐ入力できるようにする
  $(`#via-input-v${viaSeq}`)?.focus();
}

function removeVia(id) {
  state.vias = state.vias.filter((v) => v.id !== id);
  renderVias();
  if (state.lastQuery) runSearch();
}

/**
 * 経由地の行を描き直す。
 * 入力途中の値は state 側(spec)にしか無いので、DOM を作り直しても消えない。
 */
function renderVias() {
  const list = $('#via-list');
  list.replaceChildren();

  state.vias.forEach((via, i) => {
    const row = ui.el('div', 'via');
    row.dataset.id = via.id;
    row.append(ui.el('span', 'via__no', `経由 ${i + 1}`));

    const field = ui.el('div', 'via__field');
    const input = ui.el('input', 'input');
    input.type = 'text';
    input.id = `via-input-${via.id}`;
    input.placeholder = '駅名・バス停名・住所';
    input.autocomplete = 'off';
    input.value = via.spec?.label || '';
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-autocomplete', 'list');

    const suggest = ui.el('ul', 'suggest');
    suggest.id = `via-list-${via.id}`;
    suggest.setAttribute('role', 'listbox');
    suggest.hidden = true;

    const hint = ui.el('p', 'field__hint');
    hint.id = `via-hint-${via.id}`;
    field.append(input, suggest, hint);
    row.append(field);

    const stay = ui.el('label', 'via__stay');
    stay.append(document.createTextNode('滞在'));
    const num = ui.el('input', 'input');
    num.type = 'number';
    num.min = '0';
    num.max = '480';
    num.step = '5';
    num.value = String(via.stay || 0);
    num.setAttribute('aria-label', `経由 ${i + 1} でとどまる時間(分)`);
    num.addEventListener('change', () => {
      via.stay = Math.max(0, Math.min(480, Number(num.value) || 0));
      num.value = String(via.stay);
      if (state.lastQuery) runSearch();
    });
    stay.append(num, document.createTextNode('分'));
    row.append(stay);

    const del = ui.el('button', 'btn btn--ghost btn--sm via__del', '削除');
    del.type = 'button';
    del.addEventListener('click', () => removeVia(via.id));
    row.append(del);

    list.append(row);

    setupAutocomplete(input, suggest, hint, {
      get: () => via.spec,
      set: (spec) => {
        via.spec = spec;
      },
    });
  });

  $('#via-add').disabled = state.vias.length >= MAX_VIAS;
}

/* ------------------------------------------------------------------ *
 *  地図
 * ------------------------------------------------------------------ */

function toggleMap() {
  const el = $('#map');
  const wrap = $('#map-wrap');
  const note = $('#map-note');
  const btn = $('#map-toggle');

  if (state.mapOpen) {
    wrap.hidden = true;
    note.hidden = true;
    $('#map-legend').hidden = true;
    setMapStatus('');
    btn.textContent = '地図を開く';
    btn.setAttribute('aria-expanded', 'false');
    state.mapOpen = false;
    return;
  }

  wrap.hidden = false;
  note.hidden = false;
  $('#map-legend').hidden = false;
  btn.textContent = '地図を閉じる';
  btn.setAttribute('aria-expanded', 'true');
  state.mapOpen = true;

  if (!state.map) {
    state.map = new TransitMap(el, {
      onPickStation: (groupId, title, which) => {
        applyPick(which, { groupId, label: title, busOnly: false }, '地図から選択');
      },
      onPickBusStop: (stop, which) => {
        applyPick(
          which,
          { groupId: null, label: stop.title, busOnly: true },
          `バス停「${stop.title}」(鉄道の経路は対象外になります)`
        );
      },
      /** 地図をタップした座標そのものを地点として使う */
      onPickPoint: (pos, which) => {
        const spec = {
          kind: 'point',
          lat: pos.lat,
          lon: pos.lon,
          label: pointLabel(pos.lat, pos.lon),
          busOnly: false,
          groupId: null,
        };
        const near = state.net?.nearestGroups(pos.lat, pos.lon, 1) || [];
        const hint = near.length
          ? `地図上の地点(最寄: ${near[0].group.title} まで徒歩 約${walkMinutes(near[0].km, walkSettings(state.config || {}))}分・推定)`
          : '地図上の地点';
        const key = applyPick(which, spec, hint);
        if (key) state.map?.markPoint(key, pos.lat, pos.lon, spec.label);
      },
      /** ポップアップに出す説明 */
      describePoint: (lat, lon) => {
        const near = state.net?.nearestGroups(lat, lon, 1) || [];
        if (!near.length) return '対応範囲に駅がありません';
        const settings = walkSettings(state.config || {});
        const min = walkMinutes(near[0].km, settings);
        return `最寄: ${near[0].group.title} ${formatDistance(near[0].km)}(徒歩 約${min}分・推定)`;
      },
      onStationBusStops: (group) => loadBusStopsForStation(group),
      // 表示範囲が変わったら、その範囲の GTFS バス停を出す
      onViewChange: (view) => showGtfsStopsInView(view),
    });
  }

  if (!state.map.init()) {
    wrap.hidden = true;
    note.hidden = true;
    $('#map-legend').hidden = true;
    state.mapOpen = false;
    btn.textContent = '地図を開く';
    ui.addAlert('warn', {
      title: '地図を読み込めませんでした',
      body: '地図ライブラリ(Leaflet)を CDN から取得できませんでした。ネットワークを確認してください。地図以外の機能はそのまま使えます。',
    });
    return;
  }

  if (state.net) state.map.renderStations(state.net);
  state.map.addBusStops([...state.knownBusStops.values()]);
  state.map.refresh();
  // 開いた時点で、その範囲のバス停を出しにいく。
  // 動かすまで出ないと「バス停が無い」ように見えてしまう。
  const view = state.map.viewport?.();
  if (view) showGtfsStopsInView(view);
  // 検索済みなら、開いた時点で経路を描いておく
  autoShowRouteOnMap();
}

/** 地点の表示名。座標を出しておかないと、あとで何処だったか判らなくなる。 */
function pointLabel(lat, lon) {
  return `地点 ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
}

/**
 * 地図で選んだものを 出発 / 到着 / 経由 に入れる。
 * @returns {?string} 地点の印を残すためのキー
 */
function applyPick(which, spec, hint) {
  if (which === 'via') {
    if (state.vias.length >= MAX_VIAS) {
      ui.addAlert('warn', {
        title: `経由地は ${MAX_VIAS} か所までです`,
        body: '不要な経由地を削除してから追加してください。',
      });
      return null;
    }
    viaSeq += 1;
    const id = `v${viaSeq}`;
    state.vias.push({ id, spec, stay: 0 });
    renderVias();
    const hintEl = $(`#via-hint-${id}`);
    if (hintEl) hintEl.textContent = hint;
    ui.addAlert('info', {
      title: `経由地に「${spec.label}」を追加しました`,
      body: '滞在時間を指定して検索してください。',
    });
    return `via:${id}`;
  }

  state[which] = spec;
  $(`#${which}-input`).value = spec.label;
  $(`#${which}-hint`).textContent = hint;
  $(`#${which}-hint`).classList.remove('is-error');
  return which;
}

/** 駅名からその駅のバス停を引いて地図に足す */
async function loadBusStopsForStation(group) {
  try {
    const { busStopNameCandidates } = await import('./bus.js');
    const res = await state.api.busStops(busStopNameCandidates(group.title));
    const stops = res.data.stops || [];
    rememberBusStops(stops);
    const added = state.map?.addBusStops(stops) ?? 0;
    ui.addAlert(added ? 'info' : 'warn', {
      title: added ? `${group.title} 周辺のバス停を ${added} 件表示しました` : `${group.title} の名前ではバス停が見つかりませんでした`,
      body: added ? 'バス停をタップすると出発地・到着地に設定できます。' : 'バス停の正式名で検索してみてください。',
    });
  } catch (e) {
    ui.addAlert('warn', { title: 'バス停を取得できませんでした', body: e?.message || '' });
  }
}

/**
 * 表示範囲にある GTFS のバス停を地図に出す。
 *
 * ODPT の API では停留所を範囲で検索できないが、GTFS の索引は
 * 全停留所の座標を手元に持っているので、映っている範囲のものを出せる。
 */
let gtfsStopNoticeShown = false;
// 地図は動かすたびに呼ばれる。古い呼び出しの結果で新しい表示を上書きしないよう、
// 最後の呼び出しだけが画面に書けるようにする。
let gtfsStopRequest = 0;
async function showGtfsStopsInView(view) {
  if (!state.map?.ready) return;
  const token = ++gtfsStopRequest;
  const isCurrent = () => token === gtfsStopRequest;

  try {
    // 索引は事業者ごとに数 MB ある。初回は待たされるので、
    // 黙って待たせず「読み込み中」と、どこまで進んだかを出す。
    const before = await indexStatus();
    if (!isCurrent()) return;
    if (!before.none && !before.ready) {
      const msg = `バス停のデータを読み込んでいます…(${before.loaded}/${before.total} 事業者)`;
      setMapStatus(msg, { busy: true });
      setMapHint(msg, { busy: true });
    }

    const { stops, truncated, tooWide, empty, total } = await stopsInBounds(view, {
      zoom: view.zoom,
      onProgress: ({ done, total: n, title }) => {
        if (!isCurrent() || before.ready) return;
        const msg = `バス停のデータを読み込んでいます… ${title}(${done}/${n} 事業者)`;
        setMapStatus(msg, { busy: true });
        setMapHint(msg, { busy: true });
      },
    });
    if (!isCurrent()) return;

    // 読み込みは終わったので、重ねている表示は消す(地図が見えなくなるため)
    setMapStatus('');

    if (empty) {
      // まだ取り込んでいない。黙って何も出さないと不具合に見えるので 1 度だけ伝える。
      if (!gtfsStopNoticeShown) {
        gtfsStopNoticeShown = true;
        ui.addAlert('info', {
          title: '京王バス・小田急バス・西東京バスはまだ取り込んでいません',
          body:
            'これらの事業者は ODPT が API 形式の提供を終了したため、GTFS を取り込む必要があります。' +
            'GitHub の Actions で「GTFS 取り込み」を 1 回実行すると、バス停が地図に出るようになります(手順は GTFS.md)。',
        });
      }
      return;
    }

    if (tooWide) {
      setMapStatus('');
      setMapHint(`バス停はもう少し拡大すると表示されます(ズーム ${STOP_MIN_ZOOM} 以上)。`);
      return;
    }

    rememberBusStops(stops);
    state.map.addBusStops(stops);
    // 何件中何件を出しているのかを必ず書く。
    // 「全部出ている」のか「間引かれている」のかが分からないのが一番困るため。
    // 新しく追加した数ではなく「いま出ている数」を書く。
    // 追加が 0 件でも表示はされているので、黙ると「消えた」ように見える。
    // どの事業者のぶんが出ているかも書く。
    // 「都営バスが出ない」といった取りこぼしに、画面を見ただけで気づけるようにする。
    const byOperator = new Map();
    for (const s of stops) {
      byOperator.set(s.operatorTitle, (byOperator.get(s.operatorTitle) || 0) + 1);
    }
    const breakdown = [...byOperator.entries()].map(([name, n]) => `${name} ${n}`).join(' / ');

    if (!stops.length) {
      setMapHint('この範囲にバス停はありません。');
    } else if (truncated) {
      setMapHint(
        `この範囲のバス停 ${total} 件のうち ${stops.length} 件だけ表示しています` +
          `(各社から均等に選んでいます)。拡大すると残りも出ます。 — ${breakdown}`
      );
    } else {
      setMapHint(`この範囲のバス停をすべて表示しています(${stops.length} 件) — ${breakdown}`);
    }
  } catch (e) {
    setMapStatus('');
    setMapHint(`バス停を表示できませんでした(${e.message})`);
  }
}

/**
 * 地図の下の補足行。
 * 読み込み中は aria-busy と目印を付けて、待っているのか終わったのかを分かるようにする。
 */
function setMapHint(text, { busy = false } = {}) {
  const el = $('#map-hint');
  if (!el) return;
  el.textContent = text || '';
  el.hidden = !text;
  el.classList.toggle('is-loading', Boolean(text) && busy);
  if (busy && text) el.setAttribute('aria-busy', 'true');
  else el.removeAttribute('aria-busy');
}

/**
 * 地図に重ねて出す状態表示。
 * 下の補足行は小さくて見落とされるので、読み込み中は地図の上に出す。
 * 読み終わったら消す(ずっと出していると地図が見えない)。
 */
function setMapStatus(text, { busy = false } = {}) {
  const el = $('#map-status');
  if (!el) return;
  el.textContent = text || '';
  el.hidden = !text;
  el.classList.toggle('is-loading', Boolean(text) && busy);
  if (busy && text) el.setAttribute('aria-busy', 'true');
  else el.removeAttribute('aria-busy');
}

/** 見つかったバス停を覚えておく(地図に出せるのはここにあるものだけ) */
function rememberBusStops(stops) {
  for (const s of stops || []) {
    if (s && s.id && s.lat != null && s.lon != null) state.knownBusStops.set(s.id, s);
  }
}

/**
 * 選ばれた経路を地図に描く。
 * 地図が閉じていれば開いてから描く(「地図で見る」を押したとき)。
 */
function showRouteOnMap(route, { open = false } = {}) {
  if (!state.net) return;
  if (open && !state.mapOpen) toggleMap();
  if (!state.map || !state.mapOpen || !state.map.ready) return;
  state.shownRoute = route;
  const segments = routeToSegments(route, state.net, state.knownBusStops);
  state.map.renderRoute(segments);
  // 経路に含まれるバス停も地図に出しておく
  state.map.addBusStops([...state.knownBusStops.values()]);
  ui.markShownRoute(route);
}

/** 検索のたびに、いちばん上の経路を自動で地図に描く */
function autoShowRouteOnMap() {
  if (!state.mapOpen || !state.map?.ready) return;
  const first = state.sortedRoutes?.[0];
  if (first) showRouteOnMap(first);
  else state.map.clearRoute();
}

/* ------------------------------------------------------------------ *
 *  日時
 * ------------------------------------------------------------------ */
function setDepartToNow() {
  const d = new Date();
  d.setSeconds(0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  $('#depart-input').value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  updateCalendarNote();
}

function departDate() {
  const v = $('#depart-input').value;
  const d = v ? new Date(v) : new Date();
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function updateCalendarNote() {
  if (!state.holidays) return;
  const { serviceDate, minutes } = toServiceMoment(departDate());
  const cal = calendarFor(serviceDate, state.holidays);
  const crossesMidnight = minutes >= 1440;
  $('#calendar-note').textContent =
    `${dateKey(serviceDate)} の${cal.label}で計算します` +
    (crossesMidnight ? '(深夜帯のため前日ダイヤ扱い)' : '') +
    '。年末年始などの臨時ダイヤには対応していません。';
}

/* ------------------------------------------------------------------ *
 *  除外
 * ------------------------------------------------------------------ */
function populateExcludeSelectors() {
  const sel = $('#ex-railway');
  sel.replaceChildren();
  sel.append(new Option('路線を選択', ''));

  // 「JR」「地下鉄」「私鉄」のような、普通に使われている言い方で区切る。
  // 事業者 ID やデータ提供元(ODPT)の都合は、使う人には関係がない。
  // 路線名だけだと何社ぶんか判らないので、選択肢には事業者名も添える。
  const byCategory = new Map();
  for (const rw of state.net.railways.values()) {
    const cat = railCategory(rw.id, state.net.operatorIdOf(rw.id));
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(rw);
  }
  const cats = [...byCategory.keys()].sort(
    (a, b) => categoryOrder(RAIL_CATEGORIES, a) - categoryOrder(RAIL_CATEGORIES, b)
  );
  for (const cat of cats) {
    const group = document.createElement('optgroup');
    group.label = cat;
    const list = byCategory.get(cat).sort((a, b) => {
      const oa = state.net.operatorTitle(a.id);
      const ob = state.net.operatorTitle(b.id);
      return oa.localeCompare(ob, 'ja') || a.title.localeCompare(b.title, 'ja');
    });
    for (const rw of list) {
      // 事業者名が判らないときは路線名だけ。内部の ID は絶対に出さない。
      const op = state.net.operatorTitle(rw.id);
      const label = op && !rw.title.startsWith(op) ? `${op} ${rw.title}` : rw.title;
      group.append(new Option(label, rw.id));
    }
    sel.append(group);
  }
  populateStationSelectors();
  populateBusExcludeSelectors();
}

/**
 * バスの除外の選択肢を作る。
 *
 * 系統の一覧をどこから取るかは事業者によって違う。
 *  ・GTFS を取り込んだ事業者 … 索引に全系統名が入っているので全部出せる
 *  ・ODPT の API の事業者     … 全系統を列挙する手段が無いので、
 *                               「いま出ている検索結果に現れた系統」だけ出す
 * ここを曖昧にすると「系統が出てこない」と見えるので、画面にも理由を書く。
 */
async function populateBusExcludeSelectors({ withGtfs = false } = {}) {
  const sel = $('#ex-bus-operator');
  if (!sel) return;

  const byOperator = new Map();

  // 1) GTFS から取り込んだ事業者(全系統)
  //    索引は事業者ごとに数 MB あるので、**バスの除外を開いたときだけ**読む。
  //    起動時に読むと、除外を使わない人にも毎回そのぶんの通信が発生する。
  if (withGtfs) {
    try {
      const { gtfsBusLines } = await import('./gtfs.js');
      const note = $('#ex-bus-note');
      const lines = await gtfsBusLines((p) => {
        if (note) note.textContent = `${p.title} の系統を読み込んでいます…(${p.done}/${p.total})`;
      });
      for (const o of lines) {
        byOperator.set(o.operatorTitle, {
          full: !o.partial,
          partial: o.partial,
          operatorId: o.operator,
          routes: new Set(o.routes),
        });
      }
    } catch {
      /* 未取り込みなら候補が減るだけ */
    }
  } else {
    // すでに読み込んである事業者があれば、通信せずにそのぶんだけ使う
    for (const [title, entry] of state.busLinesByOperator || []) {
      if (entry.full) byOperator.set(title, entry);
    }
  }

  // 2) ODPT の API の事業者(対応範囲に出ているもの。系統は結果から拾う)
  for (const o of state.health?.bus?.operators || []) {
    if (!byOperator.has(o.title)) {
      byOperator.set(o.title, { full: false, operatorId: o.id, routes: new Set() });
    }
  }

  // 3) いま出ている検索結果に現れた系統を足す
  for (const r of state.routes || []) {
    for (const leg of r.legs || []) {
      if (!leg.bus || !leg.operatorTitle) continue;
      if (!byOperator.has(leg.operatorTitle)) {
        byOperator.set(leg.operatorTitle, { full: false, operatorId: leg.operator || null, routes: new Set() });
      }
      if (leg.lineTitle) byOperator.get(leg.operatorTitle).routes.add(leg.lineTitle);
    }
  }

  const prev = sel.value;
  sel.replaceChildren();
  sel.append(new Option('事業者を選択', ''));

  // バスも「公営バス / 民営バス」で区切る。事業者 ID では通じない。
  const byCategory = new Map();
  for (const [title, entry] of byOperator) {
    const cat = busCategory(entry.operatorId, title);
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat).push(title);
  }
  const cats = [...byCategory.keys()].sort(
    (a, b) => categoryOrder(BUS_CATEGORIES, a) - categoryOrder(BUS_CATEGORIES, b)
  );
  const names = [];
  for (const cat of cats) {
    const group = document.createElement('optgroup');
    group.label = cat;
    for (const title of byCategory.get(cat).sort((a, b) => a.localeCompare(b, 'ja'))) {
      group.append(new Option(title, title));
      names.push(title);
    }
    sel.append(group);
  }
  if (prev && names.includes(prev)) sel.value = prev;

  state.busLinesByOperator = byOperator;
  populateBusLineSelector();
}

function populateBusLineSelector() {
  const sel = $('#ex-bus-line');
  const note = $('#ex-bus-note');
  if (!sel) return;
  sel.replaceChildren();

  const opTitle = $('#ex-bus-operator').value;
  const entry = state.busLinesByOperator?.get(opTitle);
  if (!opTitle || !entry) {
    sel.append(new Option('先に事業者を選択', ''));
    if (note) note.textContent = '';
    return;
  }

  const routes = [...entry.routes].sort((a, b) => String(a).localeCompare(String(b), 'ja'));
  if (!routes.length) {
    sel.append(new Option('系統が判りません', ''));
  } else {
    sel.append(new Option('系統を選択', ''));
    for (const r of routes) sel.append(new Option(r, r));
  }

  // 系統が出ないときに黙っていると「壊れている」と見えるので、
  // なぜ出ないのか・どうすれば出るのかまで書く。
  if (note) {
    if (routes.length && entry.full) {
      note.textContent = `${opTitle} は取り込み済みのため全系統(${routes.length} 件)から選べます。`;
    } else if (routes.length && entry.partial) {
      note.textContent = `${opTitle} の系統は多いため、先頭の ${routes.length} 件だけ読み込んでいます。目的の系統が無いときは、一度検索してから経路カードの「この系統を除外」をお使いください。`;
    } else if (routes.length) {
      note.textContent = `${opTitle} は全系統の一覧を取得できないため、検索結果に出た系統(${routes.length} 件)だけ選べます。事業者ごと除外はいつでもできます。`;
    } else {
      note.textContent = `${opTitle} の系統はまだ判りません。一度検索すると、出てきた系統を選べるようになります(経路カードの「この系統を除外」からも指定できます)。事業者ごと除外は今すぐできます。`;
    }
  }
}

function populateStationSelectors() {
  const rwId = $('#ex-railway').value;
  const from = $('#ex-from');
  const to = $('#ex-to');
  from.replaceChildren();
  to.replaceChildren();
  const rw = state.net?.railways.get(rwId);
  if (!rw) {
    from.append(new Option('先に路線を選択', ''));
    to.append(new Option('先に路線を選択', ''));
    return;
  }
  for (const sid of rw.stations) {
    from.append(new Option(state.net.stationTitle(sid), sid));
    to.append(new Option(state.net.stationTitle(sid), sid));
  }
  if (rw.stations.length > 1) to.selectedIndex = 1;
}

function addExclude(ex) {
  const id =
    ex.type === 'railway'
      ? `rw:${ex.railway}`
      : ex.type === 'busOperator'
        ? `bo:${ex.operatorTitle}`
        : ex.type === 'busLine'
          ? `bl:${ex.operatorTitle}:${ex.lineTitle}`
          : `rg:${ex.railway}:${ex.from}:${ex.to}`;
  if (state.excludes.some((e) => e.id === id)) return;
  state.excludes.push({ ...ex, id });
  ui.renderExcludes(state.excludes, state.net, removeExclude, clearExcludes);
  if (state.lastQuery) runSearch();
}

function removeExclude(id) {
  state.excludes = state.excludes.filter((e) => e.id !== id);
  ui.renderExcludes(state.excludes, state.net, removeExclude, clearExcludes);
  if (state.lastQuery) runSearch();
}

function clearExcludes() {
  state.excludes = [];
  ui.renderExcludes(state.excludes, state.net, removeExclude, clearExcludes);
  if (state.lastQuery) runSearch();
}

/**
 * その経路が、除外したバスを使っているか。
 * 事業者ごと除外と、系統ごと除外の両方を見る。
 */
function usesExcludedBus(route) {
  const ops = new Set();
  const lines = new Set();
  for (const ex of state.excludes) {
    if (ex.type === 'busOperator') ops.add(ex.operatorTitle);
    if (ex.type === 'busLine') lines.add(`${ex.operatorTitle} ${ex.lineTitle}`);
  }
  if (!ops.size && !lines.size) return false;

  for (const leg of route.legs || []) {
    if (!leg.bus) continue;
    if (ops.has(leg.operatorTitle)) return true;
    if (lines.has(`${leg.operatorTitle} ${leg.lineTitle}`)) return true;
  }
  return false;
}

/** 除外設定を探索用の集合に変換 */
function buildExclusionSets() {
  const excludedRailways = new Set();
  const excludedEdges = new Set();
  for (const ex of state.excludes) {
    if (ex.type === 'railway') {
      excludedRailways.add(ex.railway);
      continue;
    }
    const rw = state.net.railways.get(ex.railway);
    if (!rw) continue;
    const a = state.net.indexOnRailway(ex.railway, ex.from);
    const b = state.net.indexOnRailway(ex.railway, ex.to);
    if (a < 0 || b < 0) continue;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    for (let i = lo; i < hi; i += 1) {
      excludedEdges.add(edgeKey(ex.railway, rw.stations[i], rw.stations[i + 1]));
      excludedEdges.add(edgeKey(ex.railway, rw.stations[i + 1], rw.stations[i]));
    }
  }
  return { excludedRailways, excludedEdges };
}

/* ------------------------------------------------------------------ *
 *  検索
 * ------------------------------------------------------------------ */
/**
 * 1 区間(出発地 → 到着地)を検索する。
 * 経由地があるときは、これを順に呼んで結果をつなぐ。
 */
/**
 * 地点(地図でタップした座標)を含む区間の検索。
 * 最寄駅の候補ごとに徒歩時間を見積もり、駅から先は通常の検索にかける。
 */
async function searchSegmentWithWalk(fromSpec, toSpec, departAt, ctx) {
  if (!isPoint(fromSpec) && !isPoint(toSpec)) return searchSegment(fromSpec, toSpec, departAt, ctx);

  const settings = walkSettings(state.config || {});
  const combos = accessCombos(fromSpec, toSpec, state.net, settings, MAX_WALK_COMBOS);

  // 徒歩が長くても検索は止めない。長いことだけ伝える。
  for (const spec of [fromSpec, toSpec]) {
    if (!isPoint(spec)) continue;
    const far = farWalk(accessCandidates(spec, state.net, settings), settings);
    if (far) {
      ui.addAlert('info', {
        title: `「${spec.label}」から最寄駅まで徒歩 約${far.minutes}分あります`,
        body: `いちばん近いのは ${far.title}(直線 ${formatDistance(far.km)})です。距離による打ち切りはしていないので、このまま経路を計算します。`,
      });
    }
  }
  // 歩いて行ける距離なら、徒歩だけの案も作る。
  // 近い 2 地点では最寄駅が同じになって鉄道の案が 1 本も出ないことがあり、
  // そのとき「経路が見つかりません」とだけ返すのは事実に反する(歩けば着く)。
  const onlyWalk = walkOnlyRoute(fromSpec, toSpec, departAt, settings);
  const walkCandidates = onlyWalk && onlyWalk.walkMinutes <= WALK_ONLY_MAX_MINUTES ? [onlyWalk] : [];

  if (!combos.length) {
    return {
      routes: walkCandidates,
      railRoutes: [],
      warnings: [],
      fetchedAt: null,
      candidateCount: 0,
      directCount: 0,
      mixedCount: 0,
      busCount: 0,
      // 徒歩の案すら作れないときだけ「駅が無い」と言う
      noStationNearby: !walkCandidates.length,
    };
  }

  const results = [];
  for (const combo of combos) {
    // 地点を「その時刻に出る」ので、駅で乗るのは徒歩時間のぶん後になる
    const at = departAt + (combo.fromLeg?.minutes || 0);
    const seg = await searchSegment(combo.from, combo.to, at, ctx);
    results.push({ seg, combo });
  }

  const routes = [];
  const railRoutes = [];
  for (const { seg, combo } of results) {
    for (const r of seg.routes) routes.push(attachWalk(r, combo.fromLeg, combo.toLeg));
    for (const r of seg.railRoutes) railRoutes.push(r);
  }
  // 同じ駅・同じ便の重複を落とす
  const seen = new Set();
  const unique = routes.filter((r) => {
    const key = `${r.departure}-${r.arrival}-${r.legs.map((l) => l.railway || l.pattern || l.kind || '').join('|')}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // 乗り物の案より歩いた方が早いことがある(近い 2 地点)。
  // 並べ替えは所要時間順なので、足しておけば自然に上に来る。
  const withWalk = walkCandidates.length ? [...unique, ...walkCandidates] : unique;

  return {
    routes: withWalk,
    railRoutes,
    warnings: results.flatMap((x) => x.seg.warnings),
    fetchedAt: results.map((x) => x.seg.fetchedAt).filter(Boolean).pop() || null,
    candidateCount: results.reduce((n, x) => n + x.seg.candidateCount, 0),
    directCount: results.reduce((n, x) => n + x.seg.directCount, 0),
    mixedCount: results.reduce((n, x) => n + x.seg.mixedCount, 0),
    busCount: results.reduce((n, x) => n + x.seg.busCount, 0),
    walkCombos: combos.length,
  };
}

async function searchSegment(fromSpec, toSpec, departAt, ctx) {
  const { excludedRailways, excludedEdges, cal, serviceDate } = ctx;

  // バス停を指定している側があるときは、鉄道単独の経路は成立しない
  const candidates =
    fromSpec.groupId && toSpec.groupId
      ? findCandidateRoutes(state.net, fromSpec.groupId, toSpec.groupId, { excludedRailways, excludedEdges })
      : [];

  const railPromise = candidates.length
    ? bindSchedule(candidates, {
        api: state.api,
        net: state.net,
        calendarUrn: cal.urn,
        departAt,
        stores: state.stores,
      })
    : Promise.resolve({ routes: [], warnings: [], fetchedAt: null });

  /**
   * 複合経路の中間区間を鉄道で解く。乗り継ぎ駅が変わるだけで
   * 通常検索と同じ処理なので、時刻表のキャッシュはそのまま効く。
   */
  const railSearch = async (fromGroupId, toGroupId, at) => {
    const cands = findCandidateRoutes(state.net, fromGroupId, toGroupId, { excludedRailways, excludedEdges });
    if (!cands.length) return { routes: [], warnings: [], fetchedAt: null };
    return bindSchedule(cands.slice(0, 2), {
      api: state.api,
      net: state.net,
      calendarUrn: cal.urn,
      departAt: at,
      stores: state.stores,
    });
  };

  const busPromise = state.includeBus
    ? (async () => {
        const direct = await findBusRoutes(state.api, fromSpec.label, toSpec.label, {
          departAt,
          serviceDate,
          store: state.busStore,
        });
        rememberBusStops([...(direct.context?.originStops || []), ...(direct.context?.destStops || [])]);
        if (!state.includeIntermodal) return { ...direct, searched: true, directCount: direct.routes.length, mixedCount: 0 };
        // バス停の検索結果は使い回して、無駄なリクエストを増やさない
        const mixed = await findIntermodalRoutes(
          { api: state.api, net: state.net, railSearch },
          fromSpec.label,
          toSpec.label,
          {
            fromGroupId: fromSpec.groupId,
            toGroupId: toSpec.groupId,
            departAt,
            serviceDate,
            store: state.busStore,
            context: direct.context,
          }
        );
        rememberBusStops([...(direct.context?.originStops || []), ...(direct.context?.destStops || [])]);
        return {
          routes: [...direct.routes, ...mixed.routes],
          warnings: [...direct.warnings, ...mixed.warnings],
          fetchedAt: mixed.fetchedAt || direct.fetchedAt,
          searched: true,
          directCount: direct.routes.length,
          mixedCount: mixed.routes.length,
        };
      })().catch(() => ({ routes: [], warnings: [], fetchedAt: null, searched: false, directCount: 0, mixedCount: 0 }))
    : Promise.resolve({ routes: [], warnings: [], fetchedAt: null, searched: false, directCount: 0, mixedCount: 0 });

  /**
   * ODPT が API 形式の提供をやめた事業者(京王バス等)は、
   * GitHub Actions が作った GTFS 由来の索引から探す。Worker は通らない。
   */
  const gtfsPromise = state.includeBus
    ? findAllGtfsRoutes(fromSpec.label, toSpec.label, { departAt, serviceDate }).catch((e) => ({
        routes: [],
        warnings: [{ message: `GTFS の索引を読めませんでした(${e.message})` }],
        stops: [],
        operators: [],
      }))
    : Promise.resolve({ routes: [], warnings: [], stops: [], operators: [] });

  const [bound, bus, gtfs] = await Promise.all([railPromise, busPromise, gtfsPromise]);
  rememberBusStops(gtfs.stops);

  // 運行情報の警告を付与(鉄道のみ。バスの運行情報は ODPT に無い)
  for (const r of bound.routes) {
    r.warnings = state.analysis ? warningsForRoute(r, state.analysis) : [];
  }

  // 除外したバスを使う経路は、ここで落とす。
  // 鉄道の除外は探索の段階で効かせているが、バスは探索が別経路なので
  // 結果側で落とす。ブラウザ内の処理なので追加の通信は発生しない。
  const keptBus = bus.routes.filter((r) => !usesExcludedBus(r));
  const keptGtfs = gtfs.routes.filter((r) => !usesExcludedBus(r));

  return {
    routes: [...bound.routes, ...keptBus, ...keptGtfs],
    railRoutes: bound.routes,
    warnings: [...bound.warnings, ...bus.warnings, ...gtfs.warnings],
    fetchedAt: bound.fetchedAt || bus.fetchedAt || null,
    candidateCount: candidates.length,
    directCount: (bus.directCount || 0) + keptGtfs.length,
    mixedCount: bus.mixedCount || 0,
    busCount: keptBus.length + keptGtfs.length,
    gtfsCount: keptGtfs.length,
    busExcluded: bus.routes.length - keptBus.length + (gtfs.routes.length - keptGtfs.length),
    gtfsOperators: gtfs.operators || [],
  };
}

async function runSearch() {
  if (state.searching) return;
  if (!state.net) {
    ui.addAlert('error', { title: '路線データが読み込まれていません', body: '画面を再読み込みしてください。' });
    return;
  }
  if (!state.from || !state.to) {
    ui.addAlert('warn', { title: '出発地と到着地を選んでください', body: '候補の一覧から駅を選択すると検索できます。' });
    return;
  }
  const pending = state.vias.filter((v) => !v.spec);
  if (pending.length) {
    ui.addAlert('warn', {
      title: '経由地が確定していません',
      body: '候補の一覧から選ぶか、使わない経由地は「削除」してください。',
    });
    return;
  }

  const { points, vias } = buildPoints(state.from, state.vias, state.to);
  const problem = validatePoints(points);
  if (problem) {
    ui.addAlert('warn', { title: '指定を見直してください', body: problem });
    return;
  }
  if (points.some((p) => p.busOnly) && !state.includeBus) {
    ui.addAlert('warn', {
      title: 'バス停を指定するには「都営バスも使う」を有効にしてください',
      body: 'バス停は鉄道の経路探索には使えません。',
    });
    return;
  }
  if (state.api.isBlocked) {
    showRateLimit(state.api.blockedSeconds);
    return;
  }

  state.searching = true;
  $('#search-btn').disabled = true;
  ui.clearAlerts();
  ui.renderLoading('経路を計算しています…');

  const { serviceDate, minutes } = toServiceMoment(departDate());
  const cal = calendarFor(serviceDate, state.holidays);
  state.lastQuery = {
    from: state.from,
    to: state.to,
    vias: vias.map((v) => `${v.label}/${v.stay}`).join(','),
    minutes,
    calendar: cal.urn,
  };

  try {
    /* --- 1) 運行情報(先に取る。警告と迂回の材料になる) --- */
    await refreshStatus();

    /* --- 2) 区間ごとに検索する(経由地が無ければ 1 区間) --- */
    const { excludedRailways, excludedEdges } = buildExclusionSets();
    const ctx = { excludedRailways, excludedEdges, cal, serviceDate };
    const segCount = points.length - 1;

    const segments = [];
    let departAt = minutes;
    let failedAt = -1;

    for (let i = 0; i < segCount; i += 1) {
      ui.renderLoading(
        segCount === 1
          ? '時刻表を取得しています…'
          : `時刻表を取得しています…(区間 ${i + 1}/${segCount}: ${points[i].label} → ${points[i + 1].label})`
      );
      const seg = await searchSegmentWithWalk(points[i], points[i + 1], departAt, ctx);
      segments.push(seg);
      if (!seg.routes.length) {
        failedAt = i;
        break;
      }
      // 次の区間は「最も早く着ける時刻 + 滞在時間」から探す
      const earliest = Math.min(...seg.routes.map((r) => r.arrival));
      departAt = earliest + (vias[i]?.stay || 0);
    }

    state.stamps.timetableAt = segments.map((s) => s.fetchedAt).filter(Boolean).pop() || state.stamps.timetableAt;
    ui.renderStamps({ ...state.stamps, statusFailed: state.statusFailed });

    for (const w of segments.flatMap((s) => s.warnings)) {
      ui.addAlert('warn', { title: '一部のデータを取得できませんでした', body: w.message });
    }

    /* --- 3) 経路が出なかった区間の説明 --- */
    if (failedAt >= 0) {
      const seg = segments[failedAt];
      const where = segCount === 1 ? '' : `区間 ${failedAt + 1}(${points[failedAt].label} → ${points[failedAt + 1].label})で `;
      if (seg.noStationNearby) {
        ui.renderEmpty(
          `${where}指定した地点から使える駅がありませんでした`,
          '対応範囲(「対応範囲」ボタンで確認できます)に駅が 1 つも見つかりません。距離による制限はかけていません。'
        );
      } else if (!seg.candidateCount && !seg.busCount) {
        ui.renderEmpty(
          `${where}経路が見つかりませんでした`,
          state.excludes.length
            ? '除外している路線・区間が多すぎる可能性があります。除外を1つずつ解除してみてください。'
            : '対応範囲内の鉄道とバスでは接続できませんでした。「対応範囲」をご確認ください。'
        );
      } else {
        ui.renderEmpty(
          `${where}この時刻に乗れる便が見つかりませんでした`,
          '終電・最終バスの後の可能性があります。出発時刻を変えるか、滞在時間を短くしてください。'
        );
      }
      return;
    }

    /* --- 4) 区間をつなぐ --- */
    const all = segCount === 1 ? segments[0].routes : combineSegments(segments, vias, minutes, 3);

    if (!all.length) {
      ui.renderEmpty(
        '経由地を順に通る経路を組み立てられませんでした',
        '滞在時間を短くするか、経由地を減らしてお試しください。'
      );
      return;
    }

    state.routes = all;
    renderSorted();
    // 結果に出た系統を、除外の選択肢に反映する
    // (ODPT の事業者は全系統を列挙できないため、出たものから拾うしかない)
    // ここでは索引を読みに行かない(読み込み済みのぶんだけ使う)
    populateBusExcludeSelectors();

    const excludedBus = segments.reduce((n, s) => n + (s.busExcluded || 0), 0);
    if (excludedBus > 0) {
      ui.addAlert('info', {
        title: `除外したバスを使う経路を ${excludedBus} 件はずしました`,
        body: '「除外する路線・区間」から解除すると戻ります。',
      });
    }

    /* --- 5) 補足 --- */
    const directCount = segments.reduce((n, s) => n + s.directCount, 0);
    const mixedCount = segments.reduce((n, s) => n + s.mixedCount, 0);
    if (directCount + mixedCount > 0) {
      const parts = [];
      if (directCount) parts.push(`直通バス ${directCount} 件`);
      if (mixedCount) parts.push(`バスと鉄道の乗り継ぎ ${mixedCount} 件`);
      ui.addAlert('info', {
        title: 'バスを使う経路も候補に入れています',
        body:
          `${parts.join(' / ')}。バス停と駅の間は徒歩 ${state.config?.busStationWalkMinutes ?? 5} 分として計算しています` +
          '(実際の距離は考慮していません)。渋滞による遅れは反映されません。',
      });
    }

    const gtfsOps = segments.flatMap((x) => x.gtfsOperators || []);
    if (gtfsOps.length) {
      const seen = new Map(gtfsOps.map((o) => [o.id, o]));
      ui.addAlert('info', {
        title: `${[...seen.values()].map((o) => o.title).join('・')} は取り込み済みのダイヤで計算しています`,
        body:
          `${[...seen.values()]
            .map((o) => `${o.title}: ${o.generatedAt ? o.generatedAt.slice(0, 10) : '取得日不明'} 取り込み`)
            .join(' / ')}。` +
          'これらの事業者は ODPT が API 形式の提供を終了したため、GTFS を定期的に取り込んで使っています。' +
          '取り込み後のダイヤ改正は反映されません。',
      });
    }

    if (segCount > 1) {
      ui.addAlert('info', {
        title: `経由地 ${segCount - 1} か所を通る経路です`,
        body:
          '区間ごとに検索し、前の区間の到着時刻と滞在時間を守って次の区間をつないでいます。' +
          '所要時間には経由地での滞在時間も含まれます。',
      });
    }

    const railRoutes = segments.flatMap((s) => s.railRoutes);
    const suspended = railRoutes.filter((r) => (r.warnings || []).some((w) => w.severity === SEVERITY.SUSPENDED));
    if (railRoutes.length > 0 && suspended.length === railRoutes.length) {
      ui.addAlert('warn', {
        title: 'すべての鉄道経路が運転見合わせの影響を受けています',
        body: '「除外する路線・区間」で該当路線を外すと、迂回する経路を計算します。',
      });
    }
  } catch (e) {
    handleApiError(e, '経路を計算できませんでした');
  } finally {
    state.searching = false;
    $('#search-btn').disabled = false;
  }
}

async function refreshStatus() {
  try {
    const res = await state.api.status();
    state.statusFailed = false;
    state.statusErrors = res.data.errors || [];
    state.stamps.statusAt = res.fetchedAt || res.data.fetchedAt;
    state.analysis = analyzeStatus(res.data.items || [], state.net);
  } catch (e) {
    // 運行情報だけの失敗では検索を止めない。ただし「取得失敗」を必ず出す。
    state.statusFailed = true;
    state.analysis = null;
    state.statusErrors = [];
    state.stamps.statusAt = null;
    if (e instanceof ApiError && e.code === 'RATE_LIMITED') throw e;
  }
  ui.renderStatus(state.analysis || { list: [], byRailway: new Map(), disrupted: [], stale: [] }, {
    failed: state.statusFailed,
    errors: state.statusErrors,
    onExcludeRailway: (rw) => addExclude({ type: 'railway', railway: rw }),
    onExcludeBusLine: ({ operatorTitle, lineTitle }) =>
      addExclude({ type: 'busLine', operatorTitle, lineTitle }),
  });
  ui.renderStamps({ ...state.stamps, statusFailed: state.statusFailed });
}

function renderSorted() {
  const rank = (r) => ((r.warnings || []).some((w) => w.severity === SEVERITY.SUSPENDED) ? 1 : 0);
  const sorted = [...state.routes].sort((a, b) => {
    const byWarning = rank(a) - rank(b);
    if (byWarning !== 0) return byWarning;
    if (state.sort === 'transfers') return a.transfers - b.transfers || a.rideMinutes - b.rideMinutes;
    if (state.sort === 'arrival') return a.arrival - b.arrival || a.transfers - b.transfers;
    return a.rideMinutes - b.rideMinutes || a.transfers - b.transfers;
  });
  state.sortedRoutes = sorted;
  ui.renderRoutes(sorted, {
    net: state.net,
    analysis: state.analysis,
    shownRoute: state.shownRoute,
    onExcludeRailway: (rw) => addExclude({ type: 'railway', railway: rw }),
    onExcludeBusLine: ({ operatorTitle, lineTitle }) =>
      addExclude({ type: 'busLine', operatorTitle, lineTitle }),
    onShowOnMap: (route) => {
      showRouteOnMap(route, { open: true });
      $('#map-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
  });
  // 地図が開いていれば、先頭の経路をそのまま描く
  autoShowRouteOnMap();
}

/* ------------------------------------------------------------------ *
 *  エラー表示
 * ------------------------------------------------------------------ */
function handleApiError(e, title) {
  if (e instanceof ApiError && e.code === 'RATE_LIMITED') {
    showRateLimit(e.retryAfter || 60);
    return;
  }
  ui.clearResults();
  ui.renderEmpty(title, e instanceof ApiError ? messageFor(e.code, e.message) : '不明なエラーが発生しました。');
  ui.addAlert('error', {
    title,
    body: e instanceof ApiError ? messageFor(e.code, e.message) : String(e && e.message ? e.message : e),
    detail: e instanceof ApiError && e.detail ? e.detail : null,
    actions: [{ label: 'もう一度試す', onClick: () => runSearch() }],
  });
}

let rateLimitTimer = null;
function showRateLimit(seconds) {
  ui.clearAlerts();
  ui.clearResults();
  const box = ui.addAlert('error', {
    title: 'アクセスが集中しています',
    body: '無料枠の上限に達しました。しばらく待ってから再試行してください。この間、運行情報は表示しません(古い情報を最新のように見せないためです)。',
  });
  const countdown = ui.el('div', 'alert__detail');
  box.append(countdown);
  $('#search-btn').disabled = true;

  let remain = Math.max(1, seconds);
  const tick = () => {
    countdown.textContent = `再試行できるまで あと ${remain} 秒`;
    remain -= 1;
    if (remain < 0) {
      clearInterval(rateLimitTimer);
      countdown.textContent = '再試行できます。';
      $('#search-btn').disabled = false;
    }
  };
  clearInterval(rateLimitTimer);
  tick();
  rateLimitTimer = setInterval(tick, 1000);

  // 429 中でも、静的な路線データだけで「乗換回数の概算」は出せる
  if (state.net && state.from?.groupId && state.to?.groupId) {
    const { excludedRailways, excludedEdges } = buildExclusionSets();
    const rough = findCandidateRoutes(state.net, state.from.groupId, state.to.groupId, {
      excludedRailways,
      excludedEdges,
    });
    if (rough.length) {
      ui.renderEmpty(
        '時刻を確定できないため、経路の概算のみ表示します',
        rough
          .slice(0, 3)
          .map(
            (r, i) =>
              `第${i + 1}案: ${r.legs
                .filter((l) => !l.transfer)
                .map((l) => state.net.railwayTitle(l.railway))
                .join(' → ')}(乗換 ${r.transfers} 回・所要 約${Math.round(r.estimatedMinutes)}分 ※概算)`
          )
          .join(' / ')
      );
    }
  }
}

/* ------------------------------------------------------------------ */
async function fetchJson(url, fallback) {
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    ui.addAlert('warn', {
      title: `${url} を読み込めませんでした`,
      body: '既定値で動作します(乗換時間や祝日判定の精度が下がります)。',
      detail: String(e && e.message),
    });
    return fallback;
  }
}

/**
 * 住所検索の結果に点数を付けて並べ替える。
 *
 * 国土地理院の検索は、施設名を渡すと関係のない住所を返すことがある
 * (「東京タワー」で「茨城県つくば市東」など)。Worker 側でも同じ処理を
 * しているが、Worker の更新を忘れても画面が壊れないよう、ここでも必ず通す。
 * 既に点数が付いているものはそのまま使う。
 */
function scoreHits(query, results, altQuery) {
  const seen = new Set();
  const out = [];
  for (const r of results || []) {
    if (r.lat == null || r.lon == null) continue;
    const key = `${r.title}|${r.lat.toFixed(5)}|${r.lon.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const score =
      r.score != null ? r.score : titleScore(query, r.title) || (altQuery ? titleScore(altQuery, r.title) : 0);
    out.push({ ...r, score, weak: score === 0 });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/** 検索語と名前の一致の強さ。worker/src/geocode.js と同じ考え方。 */
function titleScore(query, title) {
  const q = String(query || '').trim();
  const s = String(title || '').trim();
  if (!q || !s) return 0;
  if (s === q) return 100;
  if (s.includes(q)) return 80;
  if (q.includes(s)) return 60;
  let best = 0;
  for (let i = 0; i < q.length; i += 1) {
    for (let j = i + 2; j <= q.length; j += 1) {
      const part = q.slice(i, j);
      if (part.length <= best) continue;
      if (s.includes(part)) best = part.length;
    }
  }
  return best >= 2 ? 20 + best : 0;
}

/** 見つからないときに試す、頭の地域名を外した検索語 */
function fallbackQuery(query) {
  const q = String(query || '').trim();
  for (const prefix of ['東京', '神奈川県', '埼玉県', '千葉県', '横浜市', '川崎市', '千葉市', 'さいたま市']) {
    if (!q.startsWith(prefix)) continue;
    const rest = q.slice(prefix.length);
    if (rest.length >= 2) return rest;
  }
  return null;
}
