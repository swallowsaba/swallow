/**
 * 描画
 * ------------------------------------------------------------------
 * 失敗を黙って空表示にしないことがこのファイルの最大の責務。
 * ・取得できなかったものは「取得失敗」と書く
 * ・推定値は「推定」と書く
 * ・古い運行情報は表示しない
 */

import { formatDuration, toClockTime, formatFetchedAt, secondsSince } from './time.js';
import { SEVERITY, SEVERITY_LABEL } from './status.js';
import { formatDistance } from './geo.js';

export const $ = (sel) => document.querySelector(sel);

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
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

  for (const o of health?.unavailable || []) {
    const li = el('li', null, `${o.title}(現在無効)`);
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

export function renderStatus(analysis, { failed, errors, onExcludeRailway }) {
  const card = $('#status-card');
  const body = $('#status-body');
  body.replaceChildren();
  card.hidden = false;

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

function renderRoute(route, rank, { net, analysis, onExcludeRailway }) {
  const warnings = route.warnings || [];
  const worst = warnings.reduce(
    (acc, w) => (w.severity === SEVERITY.SUSPENDED ? 'danger' : acc === 'danger' ? 'danger' : w.severity === SEVERITY.DELAY ? 'warn' : acc),
    null
  );

  const card = el('article', `route${worst ? ` route--${worst}` : ''}`);

  /* --- ヘッダ --- */
  const head = el('div', 'route__head');
  head.append(el('span', 'route__rank', `第${rank}案`));
  head.append(el('span', 'route__time', formatDuration(route.rideMinutes)));
  head.append(el('span', 'route__span', `${toClockTime(route.departure)} → ${toClockTime(route.arrival)}`));
  const meta = el('div', 'route__meta');
  meta.append(el('div', null, `乗換 ${route.transfers} 回`));
  if (route.waitMinutes > 0) meta.append(el('div', 'muted', `待ち ${formatDuration(route.waitMinutes)}`));
  head.append(meta);
  if (route.estimatedOnly) {
    const b = el('span', 'badge badge--est', '一部推定');
    b.title = '列車時刻表を取得できなかった区間があり、駅数から所要時間を推定しています。';
    head.append(b);
  }
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
  const ride = route.legs.filter((l) => !l.transfer);
  route.legs.forEach((leg, idx) => {
    if (leg.transfer) {
      legs.append(
        legRow({
          time: '',
          station: net.stationTitle(leg.from) === net.stationTitle(leg.to) ? '' : `→ ${net.stationTitle(leg.to)}`,
          line: leg.kind === 'walk' ? `徒歩で乗り換え(約${Math.round(leg.minutes)}分)` : `乗り換え(約${Math.round(leg.minutes)}分)`,
          walk: true,
        })
      );
      return;
    }
    const rw = net.railways.get(leg.railway);
    const detailParts = [];
    if (leg.trainType) detailParts.push(trainTypeLabel(leg.trainType));
    if (leg.destination) detailParts.push(`${net.stationTitle(leg.destination)}行`);
    if (leg.trainNo) detailParts.push(`${leg.trainNo}`);
    detailParts.push(`${leg.stops}駅`);

    const row = legRow({
      time: toClockTime(leg.departure),
      station: net.stationTitle(leg.from),
      line: rw ? rw.title : leg.railway,
      lineColor: rw?.color || null,
      detail: detailParts.join(' / '),
      estimated: leg.estimated,
    });
    legs.append(row);

    // 最後の乗車レグの後に到着駅を出す
    const isLastRide = ride[ride.length - 1] === leg;
    if (isLastRide) {
      legs.append(
        legRow({
          time: toClockTime(leg.arrival),
          station: net.stationTitle(leg.to),
          line: '到着',
          last: true,
        })
      );
    }
  });
  card.append(legs);

  return card;
}

function legRow({ time, station, line, lineColor, detail, walk, last, estimated }) {
  const row = el('div', `leg${walk ? ' leg--walk' : ''}`);
  row.append(el('div', 'leg__time', time || ''));

  const rail = el('div', 'leg__rail');
  const dot = el('span', 'leg__dot');
  if (lineColor) dot.style.borderColor = lineColor;
  if (last) dot.style.borderColor = 'var(--accent)';
  rail.append(dot);
  row.append(rail);

  const bodyEl = el('div', 'leg__body');
  if (station) bodyEl.append(el('div', 'leg__station', station));
  if (line) {
    const l = el('div', 'leg__line');
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
