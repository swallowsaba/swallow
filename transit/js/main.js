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
import { currentPosition, GeoError, formatDistance } from './geo.js';
import { toServiceMoment, calendarFor, dateKey } from './time.js';
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
  excludes: [], // {id, type:'railway'|'range', railway, from?, to?}
  sort: 'time',
  routes: [],
  analysis: null,
  statusFailed: false,
  statusErrors: [],
  stamps: { networkAt: null, timetableAt: null, statusAt: null },
  stores: { timetables: new Map(), trains: new Map() },
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
    ui.renderCoverage(res.data);
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
  $('#depart-input').addEventListener('change', updateCalendarNote);

  $('#swap-btn').addEventListener('click', () => {
    const a = state.from;
    state.from = state.to;
    state.to = a;
    $('#from-input').value = state.from?.label || '';
    $('#to-input').value = state.to?.label || '';
    $('#from-hint').textContent = state.from ? '' : '未選択';
    $('#to-hint').textContent = state.to ? '' : '未選択';
  });

  $('#locate-btn').addEventListener('click', useCurrentLocation);

  setupAutocomplete('#from-input', '#from-list', '#from-hint', 'from');
  setupAutocomplete('#to-input', '#to-list', '#to-hint', 'to');

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
function setupAutocomplete(inputSel, listSel, hintSel, which) {
  const input = $(inputSel);
  const list = $(listSel);
  let timer = null;

  const pick = async (item) => {
    if (item.kind === 'geocode') {
      ui.hideSuggest(list);
      input.setAttribute('aria-expanded', 'false');
      await geocodeInto(which, item.query, input, list, hintSel);
      return;
    }
    state[which] = { groupId: item.value, label: item.label };
    input.value = item.label;
    $(hintSel).textContent = item.sub || '';
    $(hintSel).classList.remove('is-error');
    ui.hideSuggest(list);
    input.setAttribute('aria-expanded', 'false');
  };

  input.addEventListener('input', () => {
    state[which] = null;
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
      if (!state[which] && input.value.trim()) {
        $(hintSel).textContent = '候補から駅を選んでください';
        $(hintSel).classList.add('is-error');
      }
    }, 150);
  });
}

function railwaysOfGroup(group) {
  const names = new Set();
  for (const sid of group.members) {
    const st = state.net.stations.get(sid);
    if (st) names.add(state.net.railwayTitle(st.railway));
  }
  return [...names];
}

async function geocodeInto(which, query, input, list, hintSel) {
  $(hintSel).textContent = '住所を検索しています…';
  $(hintSel).classList.remove('is-error');
  try {
    const res = await state.api.geocode(query);
    const hits = res.data.results || [];
    if (!hits.length) {
      $(hintSel).textContent = '該当する住所が見つかりませんでした';
      $(hintSel).classList.add('is-error');
      return;
    }
    const near = state.net.nearestGroups(hits[0].lat, hits[0].lon, 4);
    if (!near.length) {
      $(hintSel).textContent = '対応範囲内に駅が見つかりませんでした';
      $(hintSel).classList.add('is-error');
      return;
    }
    $(hintSel).textContent = `${hits[0].title} の最寄駅`;
    ui.renderSuggest(
      list,
      near.map((n) => ({
        type: 'station',
        label: n.group.title,
        sub: `${hits[0].title} から ${formatDistance(n.km)}`,
        value: n.group.id,
      })),
      (item) => {
        state[which] = { groupId: item.value, label: item.label };
        input.value = item.label;
        $(hintSel).textContent = item.sub;
        ui.hideSuggest(list);
      }
    );
  } catch (e) {
    $(hintSel).textContent = e instanceof ApiError ? messageFor(e.code, e.message) : '住所検索に失敗しました';
    $(hintSel).classList.add('is-error');
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
  if (state.from.groupId === state.to.groupId) {
    ui.addAlert('warn', { title: '出発地と到着地が同じです', body: '別の駅を指定してください。' });
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
  state.lastQuery = { from: state.from, to: state.to, minutes, calendar: cal.urn };

  try {
    /* --- 1) 運行情報(先に取る。警告と迂回の材料になる) --- */
    await refreshStatus();

    /* --- 2) 候補経路(通信なし) --- */
    const { excludedRailways, excludedEdges } = buildExclusionSets();
    const candidates = findCandidateRoutes(state.net, state.from.groupId, state.to.groupId, {
      excludedRailways,
      excludedEdges,
    });

    if (!candidates.length) {
      ui.renderEmpty(
        '条件に合う経路が見つかりませんでした',
        state.excludes.length
          ? '除外している路線・区間が多すぎる可能性があります。除外を1つずつ解除してみてください。'
          : '対応範囲内の路線だけでは接続できない可能性があります。「対応範囲」をご確認ください。'
      );
      return;
    }

    /* --- 3) 時刻表をバインド(通信あり) --- */
    ui.renderLoading('時刻表を取得しています…');
    const bound = await bindSchedule(candidates, {
      api: state.api,
      net: state.net,
      calendarUrn: cal.urn,
      departAt: minutes,
      stores: state.stores,
    });

    state.stamps.timetableAt = bound.fetchedAt || state.stamps.timetableAt;
    ui.renderStamps({ ...state.stamps, statusFailed: state.statusFailed });

    for (const w of bound.warnings) {
      ui.addAlert('warn', { title: '一部のデータを取得できませんでした', body: w.message });
    }

    if (!bound.routes.length) {
      ui.renderEmpty(
        'この時刻に乗れる列車が見つかりませんでした',
        '終電後の可能性があります。出発時刻を変えるか、翌日で検索してください。'
      );
      return;
    }

    /* --- 4) 運行情報の警告を付与 --- */
    for (const r of bound.routes) {
      r.warnings = state.analysis ? warningsForRoute(r, state.analysis) : [];
    }

    // 運転見合わせに当たる経路は後ろに回す(消しはしない。判断材料として残す)
    state.routes = bound.routes;
    renderSorted();

    const suspended = bound.routes.filter((r) => (r.warnings || []).some((w) => w.severity === SEVERITY.SUSPENDED));
    if (suspended.length === bound.routes.length && bound.routes.length > 0) {
      ui.addAlert('warn', {
        title: 'すべての候補が運転見合わせの影響を受けています',
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
  ui.renderStatus(state.analysis || { list: [], byRailway: new Map(), disrupted: [] }, {
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
  ui.renderRoutes(sorted, {
    net: state.net,
    analysis: state.analysis,
    onExcludeRailway: (rw) => addExclude({ type: 'railway', railway: rw }),
  });
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
  if (state.net && state.from && state.to) {
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
