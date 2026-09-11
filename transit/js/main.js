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
import { findBusRoutes, findIntermodalRoutes } from './bus.js';
import { findAllGtfsRoutes, loadCatalog, stopsInBounds, STOP_MIN_ZOOM } from './gtfs.js';
import { currentPosition, GeoError, formatDistance } from './geo.js';
import { toServiceMoment, calendarFor, dateKey } from './time.js';
import { TransitMap, routeToSegments } from './map.js';
import { combineSegments, buildPoints, validatePoints } from './via.js';
import { walkSettings, accessCombos, attachWalk, isPoint, walkMinutes, farWalk, accessCandidates } from './walk.js';
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

  // Worker の疎通と対応範囲
  try {
    const res = await state.api.health();
    state.health = res.data;
    // GTFS から取り込んだ事業者があれば、それも「対応している」側に出す
    const catalog = await loadCatalog().catch(() => ({ operators: [] }));
    state.gtfsCatalog = catalog;
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
    timer = setTimeout(() => {
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
          label: `「${q}」を住所・地名として検索`,
          sub: '住所から最寄駅を探します',
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

async function geocodeInto(place, query, input, list, hint) {
  hint.textContent = '住所を検索しています…';
  hint.classList.remove('is-error');
  try {
    const res = await state.api.geocode(query);
    const hits = res.data.results || [];
    if (!hits.length) {
      hint.textContent = '該当する住所が見つかりませんでした';
      hint.classList.add('is-error');
      return;
    }
    const near = state.net.nearestGroups(hits[0].lat, hits[0].lon, 4);
    if (!near.length) {
      hint.textContent = '対応範囲内に駅が見つかりませんでした';
      hint.classList.add('is-error');
      return;
    }
    hint.textContent = `${hits[0].title} の最寄駅`;
    ui.renderSuggest(
      list,
      near.map((n) => ({
        type: 'station',
        label: n.group.title,
        sub: `${hits[0].title} から ${formatDistance(n.km)}`,
        value: n.group.id,
      })),
      (item) => {
        place.set({ groupId: item.value, label: item.label, busOnly: false });
        input.value = item.label;
        hint.textContent = item.sub;
        ui.hideSuggest(list);
      }
    );
  } catch (e) {
    hint.textContent = e instanceof ApiError ? messageFor(e.code, e.message) : '住所検索に失敗しました';
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
  const note = $('#map-note');
  const btn = $('#map-toggle');

  if (state.mapOpen) {
    el.hidden = true;
    note.hidden = true;
    $('#map-legend').hidden = true;
    btn.textContent = '地図を開く';
    btn.setAttribute('aria-expanded', 'false');
    state.mapOpen = false;
    return;
  }

  el.hidden = false;
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
    el.hidden = true;
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
async function showGtfsStopsInView(view) {
  if (!state.map?.ready) return;
  try {
    const { stops, truncated, tooWide, empty } = await stopsInBounds(view, { zoom: view.zoom });

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
      setMapHint(`バス停はもう少し拡大すると表示されます(ズーム ${STOP_MIN_ZOOM} 以上)。`);
      return;
    }

    rememberBusStops(stops);
    const added = state.map.addBusStops(stops);
    setMapHint(
      truncated
        ? `この範囲のバス停が多いため一部だけ表示しています。拡大すると残りも出ます。`
        : added
          ? `この範囲のバス停を ${state.knownBusStops.size} 件表示しています。`
          : ''
    );
  } catch (e) {
    setMapHint(`バス停を表示できませんでした(${e.message})`);
  }
}

/** 地図の下の補足行 */
function setMapHint(text) {
  const el = $('#map-hint');
  if (!el) return;
  el.textContent = text || '';
  el.hidden = !text;
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
  const railways = [...state.net.railways.values()].sort((a, b) => a.title.localeCompare(b.title, 'ja'));
  for (const rw of railways) sel.append(new Option(rw.title, rw.id));
  populateStationSelectors();
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
  const id = ex.type === 'railway' ? `rw:${ex.railway}` : `rg:${ex.railway}:${ex.from}:${ex.to}`;
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
  if (!combos.length) {
    return {
      routes: [],
      railRoutes: [],
      warnings: [],
      fetchedAt: null,
      candidateCount: 0,
      directCount: 0,
      mixedCount: 0,
      busCount: 0,
      noStationNearby: true,
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

  return {
    routes: unique,
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

  return {
    routes: [...bound.routes, ...bus.routes, ...gtfs.routes],
    railRoutes: bound.routes,
    warnings: [...bound.warnings, ...bus.warnings, ...gtfs.warnings],
    fetchedAt: bound.fetchedAt || bus.fetchedAt || null,
    candidateCount: candidates.length,
    directCount: (bus.directCount || 0) + gtfs.routes.length,
    mixedCount: bus.mixedCount || 0,
    busCount: bus.routes.length + gtfs.routes.length,
    gtfsCount: gtfs.routes.length,
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
