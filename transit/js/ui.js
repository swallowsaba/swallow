/**
 * 描画
 * ------------------------------------------------------------------
 * 失敗を黙って空表示にしないことがこのファイルの最大の責務。
 * ・取得できなかったものは「取得失敗」と書く
 * ・推定値は「推定」と書く
 * ・古い運行情報は表示しない
 */

import { formatDuration, toClockTime, formatFetchedAt, secondsSince } from './time.js';
import { SEVERITY, SEVERITY_LABEL, delayEstimate } from './status.js';
import { formatDistance } from './geo.js';

export const $ = (sel) => document.querySelector(sel);

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

/* ------------------------------------------------------------------ *
 *  乗り物のアイコン
 * ------------------------------------------------------------------ *
 * 色が見えない・見分けにくい人にも判るよう、色とは別に形でも示す。
 * 外部ライブラリは使わずインライン SVG で描く。
 */
const ICON_PATHS = {
  // 電車(前面と窓と車輪)
  rail:
    'M6 2h12a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V5a3 3 0 0 1 3-3Zm0 3v4h5V5H6Zm7 0v4h5V5h-5Zm-1.5 7a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3ZM7 18l-2.5 3.5h3L10 18H7Zm10 0h-3l2.5 3.5h3L17 18Z',
  // バス(横長の車体と前後の車輪)
  bus:
    'M5 2h14a2 2 0 0 1 2 2v11a2 2 0 0 1-1 1.73V19a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1H8v1a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-2.27A2 2 0 0 1 3 15V4a2 2 0 0 1 2-2Zm0 3v6h14V5H5Zm2 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm10 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z',
  // 徒歩(歩いている人)
  walk:
    'M13.5 2.5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM9.8 6h2.6l3.1 3.6 2.4 1.2-.9 1.8-3-1.5-1.3-1.5-.9 3.6 2.6 2.6.9 5.7-2 .3-.8-4.9-3.4-3.2-1.3 5-.5 2.4-2-.4L6 15.2 8 6.6 9.8 6Z',
  // 経由地(旗)
  via: 'M6 2h2v20H6V2Zm3 1h11l-2.5 4L20 11H9V3Z',
};

/** 乗り物のアイコンを 1 つ作る */
export function icon(kind, size = 14) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.classList.add('icon', `icon--${kind}`);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICON_PATHS[kind] || ICON_PATHS.rail);
  path.setAttribute('fill', 'currentColor');
  svg.append(path);
  return svg;
}

/* ------------------------------------------------------------------ *
 *  通知
 * ------------------------------------------------------------------ */

export function clearAlerts() {
  $('#alerts').replaceChildren();
}

/**
 * @param {'error'|'warn'|'info'} level
 * @param {{title:string, body?:string, detail?:string, actions?:Array<{label:string,onClick:Function}>}} opts
 */
export function addAlert(level, opts) {
  const box = el('div', `alert alert--${level}`);
  box.append(el('div', 'alert__title', opts.title));
  if (opts.body) box.append(el('div', null, opts.body));
  if (opts.detail) box.append(el('div', 'alert__detail', opts.detail));
  if (opts.actions?.length) {
    const row = el('div', 'alert__actions');
    for (const a of opts.actions) {
      const b = el('button', 'btn btn--ghost btn--sm', a.label);
      b.type = 'button';
      b.addEventListener('click', a.onClick);
      if (a.id) b.id = a.id;
      row.append(b);
    }
    box.append(row);
  }
  $('#alerts').append(box);
  return box;
}

/* ------------------------------------------------------------------ *
 *  取得時刻スタンプ
 * ------------------------------------------------------------------ */

export function renderStamps({ networkAt, timetableAt, statusAt, statusFailed, statusTtl = 90 }) {
  $('#foot-network-stamp').textContent = `路線データ: ${networkAt ? `${formatFetchedAt(networkAt)} 取得` : '—'}`;
  $('#foot-timetable-stamp').textContent = `時刻表: ${timetableAt ? `${formatFetchedAt(timetableAt)} 取得` : '—'}`;

  const statusEl = $('#foot-status-stamp');
  const cardStamp = $('#status-stamp');
  if (statusFailed) {
    statusEl.textContent = '運行情報: 取得失敗';
    statusEl.classList.add('stamp--stale');
    if (cardStamp) {
      cardStamp.textContent = '取得失敗';
      cardStamp.classList.add('stamp--stale');
    }
    return;
  }
  const stale = statusAt ? secondsSince(statusAt) > statusTtl : true;
  const label = statusAt ? `${formatFetchedAt(statusAt)} 時点` : '—';
  statusEl.textContent = `運行情報: ${label}`;
  statusEl.classList.toggle('stamp--stale', stale);
  if (cardStamp) {
    cardStamp.textContent = label;
    cardStamp.classList.toggle('stamp--stale', stale);
  }
}

/* ------------------------------------------------------------------ *
 *  対応範囲
 * ------------------------------------------------------------------ */

export function renderCoverage(health) {
  const sup = $('#coverage-supported');
  const uns = $('#coverage-unsupported');
  sup.replaceChildren();
  uns.replaceChildren();

  for (const o of health?.supported || []) {
    const li = el('li', null, o.title);
    li.append(el('span', null, `${o.note || ''}(${o.license})`));
    sup.append(li);
  }
  if (!sup.children.length) sup.append(el('li', 'muted', '対応事業者を取得できませんでした'));

  for (const o of health?.bus?.operators || []) {
    const li = el('li', null, `${o.title}(バス)`);
    li.append(el('span', null, `直通便のみ検索(${o.license})`));
    sup.append(li);
  }
  for (const o of health?.unavailable || []) {
    const li = el('li', null, `${o.title}(現在無効)`);
    li.append(el('span', null, o.reason));
    uns.append(li);
  }
  for (const o of health?.bus?.discontinued || []) {
    const li = el('li', null, `${o.title}(バス)`);
    li.append(el('span', null, o.reason));
    uns.append(li);
  }
  for (const o of health?.unsupported || []) {
    const li = el('li', null, o.title);
    li.append(el('span', null, o.reason));
    uns.append(li);
  }
  if (!uns.children.length) uns.append(el('li', 'muted', '—'));
}

/* ------------------------------------------------------------------ *
 *  候補サジェスト
 * ------------------------------------------------------------------ */

/**
 * @param {HTMLElement} listEl
 * @param {Array<{type:'station'|'address'|'section', label:string, sub?:string, value?:any}>} items
 */
export function renderSuggest(listEl, items, onPick) {
  listEl.replaceChildren();
  if (!items.length) {
    listEl.hidden = true;
    return;
  }
  for (const item of items) {
    if (item.type === 'section') {
      const li = el('li', 'suggest__section', item.label);
      li.setAttribute('role', 'presentation');
      listEl.append(li);
      continue;
    }
    const li = el('li', null, item.label);
    li.setAttribute('role', 'option');
    if (item.sub) li.append(el('small', null, item.sub));
    li.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onPick(item);
    });
    listEl.append(li);
  }
  listEl.hidden = false;
}

export function hideSuggest(listEl) {
  listEl.hidden = true;
  listEl.replaceChildren();
}

export function nearestSuggestItems(nearest) {
  return nearest.map((n) => ({
    type: 'station',
    label: n.group.title,
    sub: `現在地から ${formatDistance(n.km)}`,
    value: n.group.id,
  }));
}

/* ------------------------------------------------------------------ *
 *  運行情報
 * ------------------------------------------------------------------ */

/** 運行情報の開閉状態(既定は閉じる) */
let statusOpen = false;

export function setStatusOpen(open) {
  statusOpen = Boolean(open);
  const body = $('#status-body');
  const btn = $('#status-toggle');
  if (!body || !btn) return;
  body.hidden = !statusOpen;
  btn.setAttribute('aria-expanded', String(statusOpen));
}

export function toggleStatus() {
  setStatusOpen(!statusOpen);
}

/** 見出しに出す一行要約。閉じていても異常の有無が判るようにする。 */
export function statusSummary(analysis, { failed, errors }) {
  if (failed) return { text: '取得できませんでした', level: 'suspended' };
  const notable = (analysis?.list || []).filter((e) => e.severity !== SEVERITY.NORMAL);
  const suspended = notable.filter((e) => e.severity === SEVERITY.SUSPENDED).length;
  const delay = notable.filter((e) => e.severity === SEVERITY.DELAY).length;
  const info = notable.filter((e) => e.severity === SEVERITY.INFO).length;
  const failedOps = (errors || []).length;

  const parts = [];
  if (suspended) parts.push(`運転見合わせ ${suspended} 件`);
  if (delay) parts.push(`遅延 ${delay} 件`);
  if (info) parts.push(`お知らせ ${info} 件`);
  if (failedOps) parts.push(`取得失敗 ${failedOps} 件`);

  if (!parts.length) return { text: '平常運転(掲出なし)', level: 'normal' };
  return {
    text: parts.join('・'),
    level: suspended || failedOps ? 'suspended' : delay ? 'delay' : 'normal',
  };
}

export function renderStatus(analysis, { failed, errors, onExcludeRailway }) {
  const card = $('#status-card');
  const body = $('#status-body');
  body.replaceChildren();
  card.hidden = false;

  const sum = statusSummary(analysis, { failed, errors });
  const summaryEl = $('#status-summary');
  if (summaryEl) {
    summaryEl.textContent = sum.text;
    summaryEl.className = `status__summary${sum.level === 'normal' ? '' : ` status__summary--${sum.level}`}`;
  }
  setStatusOpen(statusOpen);

  if (failed) {
    const p = el('p', null, '運行情報を取得できませんでした。遅延・運休は反映されていません。各事業者の公式情報をご確認ください。');
    body.append(p);
    return;
  }

  const notable = analysis.list.filter((e) => e.severity !== SEVERITY.NORMAL);
  if (!notable.length) {
    body.append(el('p', 'muted', '対応路線に運行情報の掲出はありません(平常運転)。'));
  }

  for (const item of notable) {
    const row = el('div', 'status-item');
    row.append(el('span', `badge badge--${item.severity}`, SEVERITY_LABEL[item.severity]));
    row.append(el('div', 'status-item__line', item.railwayTitle));
    if (item.text) row.append(el('div', 'status-item__text', item.text));
    if (item.delayMinutes) {
      row.append(el('div', 'status-item__text muted', `本文から読み取った遅れ: 約${item.delayMinutes}分`));
    }
    if (item.stationHints?.length) {
      row.append(
        el('div', 'status-item__text muted', `本文中の駅名: ${item.stationHints.map((s) => s.title).join('・')}(区間の確定情報ではありません)`)
      );
    }
    if (item.railway && item.severity !== SEVERITY.INFO) {
      const actions = el('div', 'status-item__actions');
      const b = el('button', 'btn btn--ghost btn--sm', 'この路線を除外して再検索');
      b.type = 'button';
      b.addEventListener('click', () => onExcludeRailway(item.railway));
      actions.append(b);
      row.append(actions);
    }
    body.append(row);
  }

  // 古すぎて現在の状況として扱えなかったもの。捨てずに、古いと明示して出す。
  for (const item of analysis.stale || []) {
    const row = el('div', 'status-item status-item--stale');
    row.append(el('span', 'badge badge--est', '古い情報'));
    row.append(el('div', 'status-item__line', item.railwayTitle));
    row.append(
      el(
        'div',
        'status-item__text',
        `${item.text}(${Math.round(item.ageMinutes / 60)}時間以上前の情報のため、現在の状況としては扱っていません)`
      )
    );
    body.append(row);
  }

  for (const e of errors || []) {
    const row = el('div', 'status-item');
    row.append(el('span', 'badge badge--suspended', '取得失敗'));
    row.append(el('div', 'status-item__line', e.operatorTitle || e.operator || '事業者不明'));
    row.append(el('div', 'status-item__text', `運行情報を取得できませんでした(${e.message})`));
    body.append(row);
  }
}

/* ------------------------------------------------------------------ *
 *  除外チップ
 * ------------------------------------------------------------------ */

export function renderExcludes(excludes, net, onRemove, onClear) {
  const card = $('#excludes-card');
  const body = $('#excludes-body');
  body.replaceChildren();
  card.hidden = false;

  if (!excludes.length) {
    body.append(el('span', 'muted', '除外は設定されていません。'));
  }
  for (const ex of excludes) {
    const label =
      ex.type === 'railway'
        ? `${net.railwayTitle(ex.railway)} 全線`
        : `${net.railwayTitle(ex.railway)} ${net.stationTitle(ex.from)}〜${net.stationTitle(ex.to)}`;
    const chip = el('span', 'chip-x', label);
    const btn = el('button', null, '×');
    btn.type = 'button';
    btn.setAttribute('aria-label', `${label} の除外を解除`);
    btn.addEventListener('click', () => onRemove(ex.id));
    chip.append(btn);
    body.append(chip);
  }
  $('#excludes-clear').onclick = onClear;
}

/* ------------------------------------------------------------------ *
 *  検索結果
 * ------------------------------------------------------------------ */

export function renderLoading(message) {
  const body = $('#results-body');
  $('#results-head').hidden = true;
  body.replaceChildren();
  const box = el('div', 'empty');
  const s = el('span', 'spinner');
  const p = el('div');
  p.append(s, document.createTextNode(message));
  box.append(p);
  body.append(box);
}

export function renderEmpty(title, detail) {
  const body = $('#results-body');
  $('#results-head').hidden = true;
  body.replaceChildren();
  const box = el('div', 'empty');
  box.append(el('strong', null, title));
  if (detail) box.append(el('div', null, detail));
  body.append(box);
}

export function clearResults() {
  $('#results-body').replaceChildren();
  $('#results-head').hidden = true;
}

/**
 * @param {Array} routes bindSchedule の結果
 * @param {object} ctx { net, analysis, sort, onExcludeRailway }
 */
export function renderRoutes(routes, ctx) {
  const head = $('#results-head');
  const body = $('#results-body');
  body.replaceChildren();

  if (!routes.length) {
    renderEmpty('条件に合う経路が見つかりませんでした', '出発時刻を早めるか、除外している路線を解除してみてください。');
    return;
  }

  head.hidden = false;
  $('#results-count').textContent = `${routes.length} 件の経路(比較軸: 所要時間・乗換回数)`;

  routes.forEach((route, i) => {
    body.append(renderRoute(route, i + 1, ctx));
  });
}

/** 地図に描いている経路のカードに印を付ける */
export function markShownRoute(route) {
  for (const card of document.querySelectorAll('.route')) {
    card.classList.toggle('route--shown', card.__route === route);
    const btn = card.querySelector('.route__map');
    if (btn) btn.textContent = card.__route === route ? '地図に表示中' : '地図で見る';
  }
}

function renderRoute(route, rank, { net, analysis, shownRoute, onExcludeRailway, onShowOnMap }) {
  const warnings = route.warnings || [];
  const worst = warnings.reduce(
    (acc, w) => (w.severity === SEVERITY.SUSPENDED ? 'danger' : acc === 'danger' ? 'danger' : w.severity === SEVERITY.DELAY ? 'warn' : acc),
    null
  );

  const kindClass = route.kind === 'bus' ? ' route--kind-bus' : route.kind === 'mixed' ? ' route--kind-mixed' : ' route--kind-rail';
  const card = el('article', `route${kindClass}${worst ? ` route--${worst}` : ''}${route === shownRoute ? ' route--shown' : ''}`);
  card.__route = route;

  /* --- ヘッダ --- */
  const head = el('div', 'route__head');
  head.append(el('span', 'route__rank', `第${rank}案`));
  head.append(el('span', 'route__time', formatDuration(route.rideMinutes)));
  head.append(el('span', 'route__span', `${toClockTime(route.departure)} → ${toClockTime(route.arrival)}`));
  const est = delayEstimate(route);
  if (est) {
    const d = el('span', 'route__delay', `遅延見込 ${toClockTime(est.arrival)} 着`);
    d.title = `運行情報に書かれた遅れ(${est.lines.join(' / ')})を足しただけの目安です。列車ごとの実際の遅れは無料データに含まれません。`;
    head.append(d);
  }
  const meta = el('div', 'route__meta');
  meta.append(el('div', null, `乗換 ${route.transfers} 回`));
  if (route.viaCount) meta.append(el('div', null, `経由 ${route.viaCount} 箇所`));
  if (route.stayMinutes > 0) meta.append(el('div', 'muted', `うち滞在 ${formatDuration(route.stayMinutes)}`));
  if (route.walkMinutes > 0) meta.append(el('div', 'muted', `徒歩 ${formatDuration(route.walkMinutes)}(推定)`));
  if (route.waitMinutes > 0) meta.append(el('div', 'muted', `待ち ${formatDuration(route.waitMinutes)}`));
  head.append(meta);
  if (onShowOnMap) {
    const m = el('button', 'btn btn--ghost btn--sm route__map', route === shownRoute ? '地図に表示中' : '地図で見る');
    m.type = 'button';
    m.addEventListener('click', () => onShowOnMap(route));
    head.append(m);
  }
  if (route.kind === 'bus' || route.kind === 'mixed') {
    const b = el('span', 'badge badge--bus', route.kind === 'bus' ? 'バス' : 'バス+鉄道');
    b.title =
      route.kind === 'bus'
        ? '都営バスの直通便です(乗り換えなし)。'
        : 'バスと鉄道を乗り継ぐ経路です。バス停と駅の間は一律の徒歩時間で計算しています。';
    head.append(b);
  }
  if (route.estimatedOnly) {
    const b = el('span', 'badge badge--est', '一部推定');
    b.title = '列車時刻表を取得できなかった区間があり、駅数から所要時間を推定しています。';
    head.append(b);
  }

  /* --- 内訳(電車とバスが何本ずつか) --- */
  const counts = countModes(route);
  const modes = el('div', 'route__modes');
  const modeChip = (kind, label) => {
    const c = el('span', `route__mode route__mode--${kind}`);
    c.append(icon(kind, 13), el('span', null, label));
    return c;
  };
  if (counts.rail) modes.append(modeChip('rail', `電車 ${counts.rail} 本`));
  if (counts.bus) modes.append(modeChip('bus', `バス ${counts.bus} 本`));
  if (counts.walk) modes.append(modeChip('walk', `徒歩 ${counts.walk} 回`));
  if (counts.via) modes.append(modeChip('via', `経由 ${counts.via} 箇所`));
  if (modes.children.length) head.append(modes);

  card.append(head);

  /* --- 警告 --- */
  if (warnings.length) {
    const box = el('div', `route__warnings${worst === 'danger' ? ' route__warnings--danger' : ''}`);
    for (const w of warnings) {
      const p = el('p');
      p.append(el('span', `badge badge--${w.severity}`, SEVERITY_LABEL[w.severity]));
      p.append(document.createTextNode(` ${w.railwayTitle}: ${w.text || w.status}`));
      box.append(p);
    }
    const actions = el('div', 'alert__actions');
    for (const w of warnings) {
      if (!w.railway) continue;
      const b = el('button', 'btn btn--ghost btn--sm', `${w.railwayTitle}を除外`);
      b.type = 'button';
      b.addEventListener('click', () => onExcludeRailway(w.railway));
      actions.append(b);
    }
    if (actions.children.length) box.append(actions);
    card.append(box);
  }

  /* --- 行程 --- */
  const legs = el('div', 'legs');
  const ride = route.legs.filter((l) => !l.transfer && !l.via && !l.walkAccess);
  route.legs.forEach((leg) => {
    if (leg.walkAccess) {
      legs.append(
        legRow({
          mode: 'walk',
          time: leg.side === 'from' ? toClockTime(route.departure) : '',
          station: leg.side === 'from' ? leg.fromTitle : leg.toTitle,
          line: `徒歩 約${Math.round(leg.minutes)}分(${leg.side === 'from' ? leg.toTitle + 'まで' : leg.fromTitle + 'から'})`,
          detail: `直線 ${formatDistance(leg.km)} から算出`,
          estimated: true,
        })
      );
      return;
    }
    if (leg.via) {
      legs.append(
        legRow({
          mode: 'via',
          time: toClockTime(leg.arrival),
          station: leg.label,
          line: stayLabel(leg),
        })
      );
      return;
    }
    if (leg.transfer) {
      legs.append(
        legRow({
          mode: 'walk',
          time: '',
          station:
            legTitle(net, leg, 'from') === legTitle(net, leg, 'to') ? '' : `→ ${legTitle(net, leg, 'to')}`,
          line: leg.kind === 'walk' ? `徒歩で乗り換え(約${Math.round(leg.minutes)}分)` : `乗り換え(約${Math.round(leg.minutes)}分)`,
        })
      );
      return;
    }
    const rw = leg.railway ? net.railways.get(leg.railway) : null;
    const detailParts = [];
    if (leg.bus) {
      if (leg.operatorTitle) detailParts.push(leg.operatorTitle);
      if (leg.destination) detailParts.push(`${leg.destination}行`);
      detailParts.push(`${leg.stops}停留所`);
    } else {
      if (leg.trainType) detailParts.push(trainTypeLabel(leg.trainType));
      if (leg.destination) detailParts.push(`${net.stationTitle(leg.destination)}行`);
      if (leg.trainNo) detailParts.push(`${leg.trainNo}`);
      detailParts.push(`${leg.stops}駅`);
    }

    const row = legRow({
      mode: leg.bus ? 'bus' : 'rail',
      time: toClockTime(leg.departure),
      station: legTitle(net, leg, 'from'),
      line: leg.lineTitle || (rw ? rw.title : leg.railway),
      lineColor: leg.bus ? null : rw?.color || null,
      detail: detailParts.join(' / '),
      estimated: leg.estimated,
    });
    legs.append(row);

    // 最後の乗車レグの後に到着駅を出す
    const isLastRide = ride[ride.length - 1] === leg;
    if (isLastRide) {
      legs.append(
        legRow({
          mode: leg.bus ? 'bus' : 'rail',
          time: toClockTime(leg.arrival),
          station: legTitle(net, leg, 'to'),
          line: '到着',
          last: true,
        })
      );
    }
  });
  card.append(legs);

  return card;
}

/** 経由地での滞在。指定した時間と、実際にあく時間の両方を出す。 */
function stayLabel(leg) {
  const planned = Math.round(leg.plannedStay || 0);
  const actual = Math.round(leg.actualStay || 0);
  if (!planned) return `経由(${actual}分の待ち合わせ)`;
  if (actual > planned) return `ここに ${planned}分 とどまる(次の便まで実際は ${actual}分)`;
  return `ここに ${planned}分 とどまる`;
}

const MODE_LABEL = { bus: 'バス', rail: '電車', walk: '徒歩', via: '経由' };

/** 経路に含まれる電車・バス・徒歩・経由の本数 */
export function countModes(route) {
  let rail = 0;
  let bus = 0;
  let walk = 0;
  let via = 0;
  for (const leg of route.legs || []) {
    if (leg.via) via += 1;
    else if (leg.transfer) {
      if (leg.kind === 'walk') walk += 1;
    } else if (leg.bus) bus += 1;
    else rail += 1;
  }
  return { rail, bus, walk, via };
}

function legRow({ mode, time, station, line, lineColor, detail, last, estimated }) {
  const row = el('div', `leg leg--${mode}`);
  row.append(el('div', 'leg__time', time || ''));

  const rail = el('div', 'leg__rail');
  if (lineColor) rail.style.setProperty('--leg-color', lineColor);
  const dot = el('span', 'leg__dot');
  if (lineColor) dot.style.borderColor = lineColor;
  if (last) dot.style.borderColor = 'var(--accent)';
  rail.append(dot);
  row.append(rail);

  const bodyEl = el('div', 'leg__body');
  if (station) bodyEl.append(el('div', 'leg__station', station));
  if (line) {
    const l = el('div', 'leg__line');
    // 「バス」「電車」を必ず添える。色だけに頼らない。
    if (!last && MODE_LABEL[mode]) {
      const tag = el('span', `leg__mode leg__mode--${mode}`);
      tag.append(icon(mode, 12), el('span', null, MODE_LABEL[mode]));
      l.append(tag);
    }
    const b = el('b', null, line);
    if (lineColor) b.style.color = lineColor;
    l.append(b);
    bodyEl.append(l);
  }
  if (detail) {
    const d = el('div', 'leg__detail', detail);
    if (estimated) {
      const badge = el('span', 'badge badge--est', '推定');
      badge.title = '列車時刻表を取得できず、駅数から所要時間を推定しています。';
      d.append(badge);
    }
    bodyEl.append(d);
  }
  row.append(bodyEl);
  return row;
}

/**
 * レグの駅名/バス停名。バスは ID から名前を復元できないので、
 * 探索側が付けた fromTitle / toTitle を優先する。
 */
function legTitle(net, leg, which) {
  const explicit = which === 'from' ? leg.fromTitle : leg.toTitle;
  if (explicit) return explicit;
  return net.stationTitle(leg[which]);
}

function trainTypeLabel(urn) {
  const raw = String(urn || '').split('.').pop();
  const map = {
    Local: '各停',
    Rapid: '快速',
    Express: '急行',
    LimitedExpress: '特急',
    CommuterRapid: '通勤快速',
    CommuterExpress: '通勤急行',
    SemiExpress: '準急',
    SectionExpress: '区間急行',
    AirportRapidLimitedExpress: 'エアポート快特',
  };
  return map[raw] || raw;
}
