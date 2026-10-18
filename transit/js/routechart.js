/**
 * 経路の比較チャート
 * ==================================================================
 * 縦軸 = 乗り換え回数 / 横軸 = 時刻。
 *
 *   ・横(PC)に伸びている 1 本の直線 = 1 本の乗り物に乗っている時間
 *   ・段が 1 つ上がる = 乗り換え 1 回
 *   ・点線 = 徒歩
 *
 * 「どれに乗るのか」が線そのものから読めるようにするのが狙い。
 * 乗り換えの区間は曲線でつなぎ、線は一度も途切れさせない。
 * 途切れた線は「別の経路」に見えてしまうため。
 *
 * スマホは画面が縦長なので、軸を入れ替える(時刻が下に流れる)。
 * 横長の図をそのまま縮めると、乗車区間が短く潰れて路線名が置けない。
 */

import { toClockTime, formatDuration } from './time.js';

/* 案の色。路線色とは別物で、「案 1 / 案 2 …」の区別にだけ使う。
   dataviz の検証を通した 7 色(隣り合う組の色覚差を確保したもの)。 */
const SERIES = [
  'var(--rc-1)', 'var(--rc-2)', 'var(--rc-3)', 'var(--rc-4)',
  'var(--rc-5)', 'var(--rc-6)', 'var(--rc-7)',
];

/** 縦長に切り替える幅 */
const NARROW = 760;

/** 乗り物の区間に路線名を書く最小の長さ(px) */
const MIN_LABEL = { vert: 26, horiz: 40 };
/** 正式名称を書ける長さ。これ未満は略称 */
const FULL_LABEL = { vert: 92, horiz: 130 };
/** 「各停・8駅」まで書ける長さ */
const SUB_LABEL = 44;

const SVG_NS = 'http://www.w3.org/2000/svg';

/* ------------------------------------------------------------------ *
 *  経路 → チャート用の形
 * ------------------------------------------------------------------ */

/**
 * 1 本の経路を「段(= 乗り換え回数)つきの区間の列」に畳む。
 *
 * 待ち時間は区間として描かない。描くと線が途切れて別経路に見えるため、
 * 前の区間の降車点と次の区間の乗車点を曲線でつなぐ「渡り」にする。
 */
export function toRuns(route, net) {
  const runs = [];
  if (!route || !Array.isArray(route.legs)) return runs;

  let level = 0;
  let seenRide = false;

  for (const leg of route.legs) {
    if (leg.transfer) continue;       // 渡りとして描くので区間にしない
    if (leg.via) continue;            // 経由地の滞在も渡りに含める

    if (leg.walkAccess) {
      // 徒歩には時刻が入っていないので、経路の両端から割り出す
      const minutes = Math.max(0, Math.round(leg.minutes || 0));
      const at = leg.side === 'to' ? route.arrival - minutes : route.departure;
      runs.push({
        leg,
        walk: true,
        level,
        at,
        off: at + minutes,
        minutes,
        title: leg.side === 'to' ? leg.toTitle : leg.toTitle,
        from: leg.fromTitle,
        to: leg.toTitle,
        name: `徒歩${minutes}分`,
        short: `徒歩${minutes}分`,
        sub: '',
        color: 'var(--walk)',
      });
      continue;
    }

    if (!Number.isFinite(leg.departure) || !Number.isFinite(leg.arrival)) continue;
    if (seenRide) level += 1;
    seenRide = true;

    const rw = !leg.bus && leg.railway && net ? net.railways.get(leg.railway) : null;
    const full = leg.lineTitle || (rw ? rw.title : leg.railway) || (leg.bus ? 'バス' : '路線');
    runs.push({
      leg,
      walk: false,
      bus: Boolean(leg.bus),
      level,
      at: leg.departure,
      off: leg.arrival,
      minutes: Math.max(0, Math.round(leg.arrival - leg.departure)),
      from: leg.fromTitle || (net ? net.stationTitle(leg.from) : ''),
      to: leg.toTitle || (net ? net.stationTitle(leg.to) : ''),
      name: full,
      short: shortLineName(full),
      sub: rideSub(leg),
      color: rideColor(leg, rw),
    });
  }
  return runs;
}

/** 「東京メトロ銀座線」→「銀座線」。短い区間に書けるようにする。 */
function shortLineName(title) {
  const s = String(title || '');
  const t = s
    .replace(/^(東京メトロ|東京都交通局|都営地下鉄|東日本旅客鉄道|JR東日本)/, '')
    .replace(/^JR/, '');
  return t.length >= 2 ? t : s;
}

function rideSub(leg) {
  const parts = [];
  if (leg.bus) {
    if (leg.lineTitle) parts.push(leg.lineTitle);
    if (leg.stops) parts.push(`${leg.stops}停留所`);
  } else {
    const type = trainTypeLabel(leg.trainType);
    if (type) parts.push(type);
    if (leg.stops) parts.push(`${leg.stops}駅`);
  }
  return parts.join('・');
}

/** odpt.TrainType:JR-East.Local → 各停 */
export function trainTypeLabel(urn) {
  const raw = String(urn || '').split('.').pop();
  if (!raw) return '';
  const map = {
    Local: '各停',
    Rapid: '快速',
    Express: '急行',
    LimitedExpress: '特急',
    RapidExpress: '快速急行',
    CommuterRapid: '通勤快速',
    CommuterExpress: '通勤急行',
    SemiExpress: '準急',
    SectionExpress: '区間急行',
    AirportRapidLimitedExpress: 'エアポート快特',
  };
  return map[raw] || raw;
}

function rideColor(leg, rw) {
  if (leg.bus) return 'var(--bus)';
  if (rw && rw.color) return rw.color;
  return 'var(--rail)';
}

/** 経路の一覧 → 描画に必要な形。到着が早い順に並べ、案番号を振る。 */
export function buildModel(routes, net) {
  const items = routes.map((route, i) => {
    const runs = toRuns(route, net);
    const level = runs.length ? runs[runs.length - 1].level : 0;
    return {
      route,
      index: i,
      id: i,
      runs,
      level,
      departure: route.departure,
      arrival: route.arrival,
      color: SERIES[i % SERIES.length],
    };
  });
  const maxLevel = items.reduce((m, it) => Math.max(m, it.level), 0);
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const it of items) {
    for (const run of it.runs) {
      t0 = Math.min(t0, run.at);
      t1 = Math.max(t1, run.off);
    }
    if (Number.isFinite(it.departure)) t0 = Math.min(t0, it.departure);
    if (Number.isFinite(it.arrival)) t1 = Math.max(t1, it.arrival);
  }
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) {
    t0 = 0;
    t1 = 60;
  }
  // 端が詰まると線が枠に貼り付くので、少しだけ余白を取る
  const pad = Math.max(4, Math.round((t1 - t0) * 0.06));
  return { items, maxLevel, t0: t0 - pad, t1: t1 + pad };
}

/* ------------------------------------------------------------------ *
 *  座標
 * ------------------------------------------------------------------ */

function geometry(model, vert, count) {
  const W = vert ? 360 : 760;
  const H = vert ? Math.min(640, 300 + model.maxLevel * 70) : Math.max(260, 150 + (model.maxLevel + 1) * 62);
  const L = vert ? 48 : 84;
  const R = vert ? 18 : 116;
  const T = vert ? 40 : 18;
  // 縦長は、線の終わりの下に「案 N 23:05」を置くので下を少し広く取る
  const B = vert ? 42 : 30;
  const iw = W - L - R;
  const ih = H - T - B;
  const slots = model.maxLevel + 1;
  const colW = iw / slots;
  const lvH = ih / slots;
  const span = model.t1 - model.t0;
  const tPos = (m) => (vert ? T + ((m - model.t0) / span) * ih : L + ((m - model.t0) / span) * iw);
  const lvPos = (lv) => (vert ? L + (lv + 0.5) * colW : T + ih - (lv + 0.5) * lvH);
  const spread = ((vert ? colW : lvH) * 0.82) / Math.max(1, count);
  const lane = (lv, i) => lvPos(lv) + (i - (count - 1) / 2) * spread;
  return {
    vert, W, H, L, R, T, B, iw, ih, colW, lvH, slots, tPos, lvPos, lane,
    px: (m, lv, i) => (vert ? lane(lv, i) : tPos(m)),
    py: (m, lv, i) => (vert ? tPos(m) : lane(lv, i)),
  };
}

/** 乗り換えの渡り。向きに応じた S 字 */
function connector(g, x1, y1, x2, y2) {
  if (g.vert) {
    const dy = y2 - y1;
    return `M${r1(x1)},${r1(y1)} C${r1(x1)},${r1(y1 + dy * 0.55)} ${r1(x2)},${r1(y1 + dy * 0.45)} ${r1(x2)},${r1(y2)}`;
  }
  const dx = x2 - x1;
  return `M${r1(x1)},${r1(y1)} C${r1(x1 + dx * 0.55)},${r1(y1)} ${r1(x2 - dx * 0.55)},${r1(y2)} ${r1(x2)},${r1(y2)}`;
}

const r1 = (n) => Math.round(n * 10) / 10;

/* ------------------------------------------------------------------ *
 *  描画
 * ------------------------------------------------------------------ */

function svgEl(name, attrs, text) {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    node.setAttribute(k, String(v));
  }
  if (text != null) node.textContent = String(text);
  return node;
}

/**
 * チャートを 1 枚描く。
 * @param {SVGElement} svg
 * @param {object} model buildModel の結果
 * @param {object} opts { selected, hovered, animate, onPick, onHover }
 */
export function drawChart(svg, model, opts = {}) {
  const { selected = null, hovered = null, animate = false } = opts;
  const vert = (svg.ownerDocument?.defaultView?.innerWidth ?? 1024) < NARROW;
  const count = model.items.length;
  const g = geometry(model, vert, count);
  svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);

  /* 絵と「当たり判定」を別の層に分ける。
     一緒くたに描き直すと、キーボードで線を選んでいる最中に
     その要素ごと消えてしまい、blur → 再描画 → さらに消える、と崩れる。
     当たり判定の線は作り直さず、形(d)だけを差し替える。 */
  let art = svg.querySelector('.rc-art');
  let hits = svg.querySelector('.rc-hits');
  if (!art || !hits) {
    svg.replaceChildren();
    art = svgEl('g', { class: 'rc-art' });
    hits = svgEl('g', { class: 'rc-hits' });
    svg.append(art, hits);
  }
  svg.__rc = { onPick: opts.onPick, onHover: opts.onHover };

  const parts = [];
  const defs = svgEl('defs');
  parts.push(defs);

  /* --- 段(乗り換え回数)の帯 --- */
  for (let lv = 0; lv < g.slots; lv += 1) {
    const c = g.lvPos(lv);
    if (vert) {
      parts.push(svgEl('rect', {
        class: 'rc-band', x: r1(c - g.colW * 0.43), y: g.T,
        width: r1(g.colW * 0.86), height: r1(g.ih), rx: r1(g.colW * 0.43),
      }));
      parts.push(svgEl('text', { class: 'rc-lv', x: r1(c), y: g.T - 20, 'text-anchor': 'middle' }, `${lv}回`));
      parts.push(svgEl('text', { class: 'rc-lvs', x: r1(c), y: g.T - 8, 'text-anchor': 'middle' },
        lv === 0 ? '乗換なし' : '乗り換え'));
    } else {
      parts.push(svgEl('rect', {
        class: 'rc-band', x: g.L, y: r1(c - g.lvH * 0.40),
        width: r1(g.iw), height: r1(g.lvH * 0.80), rx: r1(Math.min(g.lvH * 0.40, 22)),
      }));
      parts.push(svgEl('text', { class: 'rc-lv', x: g.L - 12, y: r1(c - 1), 'text-anchor': 'end' }, `${lv}回`));
      parts.push(svgEl('text', { class: 'rc-lvs', x: g.L - 12, y: r1(c + 12), 'text-anchor': 'end' },
        lv === 0 ? '乗り換えなし' : '乗り換え'));
    }
  }

  /* --- 時刻の目盛 --- */
  const step = tickStep(model.t1 - model.t0);
  for (let m = Math.ceil(model.t0 / step) * step; m <= model.t1; m += step) {
    const label = toClockTime(m);
    if (vert) {
      parts.push(svgEl('line', { class: 'rc-grid', x1: g.L - 4, y1: r1(g.tPos(m)), x2: r1(g.L + g.iw), y2: r1(g.tPos(m)) }));
      parts.push(svgEl('text', { class: 'rc-ax', x: g.L - 9, y: r1(g.tPos(m) + 4), 'text-anchor': 'end' }, label));
    } else {
      parts.push(svgEl('text', { class: 'rc-ax', x: r1(g.tPos(m)), y: r1(g.T + g.ih + 18), 'text-anchor': 'middle' }, label));
    }
  }
  parts.push(vert
    ? svgEl('text', { class: 'rc-ax rc-ax--dim', x: g.L - 9, y: r1(g.T + g.ih + 16), 'text-anchor': 'end' }, '↓時刻')
    : svgEl('text', { class: 'rc-ax rc-ax--dim', x: r1(g.L + g.iw + 6), y: r1(g.T + g.ih + 18) }, '時刻 →'));

  /* --- 経路の線 --- */
  model.items.forEach((item, i) => {
    const on = selected === item.id;
    const hov = hovered === item.id && selected === null;
    const dim = (selected !== null && !on) || (hovered !== null && selected === null && !hov);
    const w = on ? 6.2 : hov ? 5.8 : 5.0;

    item.runs.forEach((run, k) => {
      const x1 = g.px(run.at, run.level, i);
      const y1 = g.py(run.at, run.level, i);
      const x2 = g.px(run.off, run.level, i);
      const y2 = g.py(run.off, run.level, i);
      const color = dim ? 'var(--rc-dim)' : run.color;
      parts.push(svgEl('path', {
        class: `rc-ln${run.walk ? ' rc-ln--walk' : ''}${on ? ' is-on' : ''}`,
        d: `M${r1(x1)},${r1(y1)} L${r1(x2)},${r1(y2)}`,
        stroke: color,
        'stroke-width': r1(run.walk ? w * 0.52 : w),
        'stroke-dasharray': run.walk ? `0.1 ${r1(w * 1.35)}` : null,
        opacity: dim ? 0.55 : 1,
      }));

      const next = item.runs[k + 1];
      if (!next) return;
      const x3 = g.px(next.at, next.level, i);
      const y3 = g.py(next.at, next.level, i);
      let stroke;
      if (dim) {
        stroke = 'var(--rc-dim)';
      } else {
        // 前の路線色 → 次の路線色へ。乗り換えが「つながっている」ことを色でも出す。
        const id = `rc-g${i}-${k}`;
        const grad = svgEl('linearGradient', {
          id, x1: r1(x2), y1: r1(y2), x2: r1(x3), y2: r1(y3), gradientUnits: 'userSpaceOnUse',
        });
        grad.append(svgEl('stop', { offset: '0', 'stop-color': run.color }));
        grad.append(svgEl('stop', { offset: '1', 'stop-color': next.color }));
        defs.append(grad);
        stroke = `url(#${id})`;
      }
      parts.push(svgEl('path', {
        class: 'rc-ln rc-ln--link',
        d: connector(g, x2, y2, x3, y3),
        stroke,
        'stroke-width': on ? 4.2 : 3.4,
        opacity: dim ? 0.5 : 0.92,
      }));
    });
  });

  /* --- 乗り物の名前。選択中・ポイント中の案にだけ出す --- */
  const focus = selected !== null ? selected : hovered;
  if (focus !== null) {
    const i = model.items.findIndex((it) => it.id === focus);
    const item = model.items[i];
    if (item) {
      item.runs.forEach((run) => {
        const x1 = g.px(run.at, run.level, i);
        const y1 = g.py(run.at, run.level, i);
        const x2 = g.px(run.off, run.level, i);
        const y2 = g.py(run.off, run.level, i);
        const len = vert ? y2 - y1 : x2 - x1;
        if (len < (vert ? MIN_LABEL.vert : MIN_LABEL.horiz)) return;
        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        const label = len > (vert ? FULL_LABEL.vert : FULL_LABEL.horiz) ? run.name : run.short;
        const sub = !run.walk && run.sub && len > SUB_LABEL ? run.sub : '';
        if (vert) {
          parts.push(svgEl('text', { class: 'rc-nm rc-fu', x: r1(mx + 12), y: r1(my), fill: run.color }, label));
          if (sub) parts.push(svgEl('text', { class: 'rc-sub rc-fu', x: r1(mx + 12), y: r1(my + 12.5) }, sub));
        } else {
          parts.push(svgEl('text', { class: 'rc-nm rc-fu', x: r1(mx), y: r1(my - 11), 'text-anchor': 'middle', fill: run.color }, label));
          if (sub) parts.push(svgEl('text', { class: 'rc-sub rc-fu', x: r1(mx), y: r1(my + 18), 'text-anchor': 'middle' }, sub));
        }
      });

      /* 乗り換え駅。選択中のみ(ポイント中に出すとちらつく) */
      if (selected !== null) {
        item.runs.forEach((run, k) => {
          const next = item.runs[k + 1];
          if (!next || next.level === run.level) return;
          const x = g.px(run.off, run.level, i);
          const y = g.py(run.off, run.level, i);
          const wait = Math.max(0, Math.round(next.at - run.off));
          parts.push(svgEl('circle', { class: 'rc-node', cx: r1(x), cy: r1(y), r: 4.6 }));
          const name = run.to || next.from || '';
          const detail = `${toClockTime(run.off)} 着${wait ? ` / ${wait}分待ち` : ''}`;
          if (vert) {
            parts.push(svgEl('text', { class: 'rc-stn rc-fu', x: r1(x + 11), y: r1(y - 16) }, name));
            parts.push(svgEl('text', { class: 'rc-sub rc-fu', x: r1(x + 11), y: r1(y - 4) }, detail));
          } else {
            parts.push(svgEl('text', { class: 'rc-stn rc-fu', x: r1(x + 9), y: r1(y - 9) }, name));
            parts.push(svgEl('text', { class: 'rc-sub rc-fu', x: r1(x + 9), y: r1(y + 4) }, detail));
          }
        });
      }
    }
  }

  /* --- 案の名前と到着時刻。重なったらずらして引き出し線でつなぐ --- */
  const placed = layoutEndLabels(model, g, vert);
  const labels = [];
  model.items.forEach((item, i) => {
    const on = selected === item.id;
    const hov = hovered === item.id && selected === null;
    const dim = (selected !== null && !on) || (hovered !== null && selected === null && !hov);
    const spot = placed.get(i);
    if (!spot) return;
    const { x0, y0, y } = spot;
    // 縦長は線の真下に置くが、枠からはみ出す位置では内側へ寄せる
    const x = vert ? Math.min(Math.max(x0, g.L + 30), g.W - 30) : g.L + g.iw + 10;

    const cls = `rc-end${dim ? ' is-dim' : ''}${on ? ' is-on' : ''}`;
    const color = on ? 'var(--accent)' : item.color;
    parts.push(svgEl('circle', { class: `rc-dot${dim ? ' is-dim' : ''}`, cx: r1(x0), cy: r1(y0), r: 3.6, fill: dim ? 'var(--rc-dim)' : color }));
    if (vert) {
      if (y - y0 > 2) {
        parts.push(svgEl('line', { class: 'rc-lead', x1: r1(x0), y1: r1(y0), x2: r1(x0), y2: r1(y + 3), stroke: dim ? 'var(--rc-dim)' : color }));
      }
      labels.push(svgEl('text', { class: cls, x: r1(x), y: r1(y + 15), 'text-anchor': 'middle', fill: dim ? 'var(--ink-3)' : color },
        `案${item.index + 1} ${toClockTime(item.arrival)}`));
    } else {
      parts.push(svgEl('path', {
        class: 'rc-lead', d: `M${r1(x0 + 5)},${r1(y0)} L${r1(x - 5)},${r1(y)}`,
        stroke: dim ? 'var(--rc-dim)' : color, fill: 'none',
      }));
      labels.push(svgEl('text', { class: cls, x: r1(x), y: r1(y + 4), fill: dim ? 'var(--ink-3)' : color },
        `案${item.index + 1} ${toClockTime(item.arrival)}`));
    }
  });
  // 文字は点より後ろに回す。別の案の点が文字に乗ると読めなくなるため。
  parts.push(...labels);

  art.replaceChildren(...parts);

  /* --- 当たり判定。線そのものは細いので、太い透明な線を重ねる --- */
  model.items.forEach((item, i) => {
    const d = hitPath(item, g, i);
    let hit = hits.children[i];
    if (!hit) {
      hit = svgEl('path', { class: 'rc-hit', tabindex: '0', role: 'button' });
      // 毎回付け替えると focus が飛ぶので、作るときに 1 度だけ付ける。
      // 呼び出し先は svg.__rc から都度読む。
      const id = () => Number(hit.dataset.id);
      hit.addEventListener('click', () => svg.__rc?.onPick?.(id()));
      hit.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        svg.__rc?.onPick?.(id());
      });
      hit.addEventListener('pointerenter', () => svg.__rc?.onHover?.(id()));
      hit.addEventListener('pointerleave', () => svg.__rc?.onHover?.(null));
      hit.addEventListener('focus', () => svg.__rc?.onHover?.(id()));
      hit.addEventListener('blur', () => svg.__rc?.onHover?.(null));
      hits.append(hit);
    }
    hit.dataset.id = String(item.id);
    hit.setAttribute('d', d);
    hit.setAttribute('aria-label', `案${item.index + 1} ${toClockTime(item.arrival)}着 乗換${item.level}回`);
    hit.toggleAttribute('hidden', !d);
  });
  while (hits.children.length > model.items.length) hits.lastElementChild.remove();

  if (animate && !prefersReducedMotion(svg)) {
    art.querySelectorAll('.rc-ln').forEach((node, i) => {
      node.animate(
        [{ opacity: 0 }, { opacity: node.getAttribute('opacity') || 1 }],
        { duration: 260, delay: Math.min(i * 24, 480), fill: 'backwards' }
      );
    });
  }
  return g;
}

/**
 * 到着ラベルの位置を決める。
 *
 * 1 件ずつ「重なっていたら下へ」とやると、下端で頭打ちになったときに
 * 全部が同じ場所に潰れる。まとめて並べてから、はみ出したぶんを
 * 上へ詰め直す。
 */
export function layoutEndLabels(model, g, vert) {
  const pts = [];
  model.items.forEach((item, i) => {
    const last = item.runs[item.runs.length - 1];
    if (!last) return;
    pts.push({ i, x0: g.px(last.off, last.level, i), y0: g.py(last.off, last.level, i) });
  });
  const gap = 18;                 // ラベル 1 行ぶん
  const bottom = g.H - 6;

  // 縦長は列ごとに、横長は右端 1 列にまとめる
  const groups = [];
  if (vert) {
    for (const p of pts.slice().sort((a, b) => a.x0 - b.x0)) {
      const tail = groups[groups.length - 1];
      if (tail && Math.abs(p.x0 - tail.x) < 58) {
        tail.list.push(p);
        tail.x = p.x0;
      } else {
        groups.push({ x: p.x0, list: [p] });
      }
    }
  } else if (pts.length) {
    groups.push({ x: 0, list: pts });
  }

  const out = new Map();
  for (const grp of groups) {
    const list = grp.list.slice().sort((a, b) => a.y0 - b.y0);
    let y = -Infinity;
    for (const p of list) {
      y = Math.max(p.y0, y + gap);
      p.y = y;
    }
    const over = list[list.length - 1].y - bottom;
    if (over > 0) {
      // 上へ詰める。ただしラベルが自分の線より上に出ないところまで。
      const headroom = list.reduce((m, p) => Math.min(m, p.y - p.y0), Infinity);
      const shift = Math.min(over, Math.max(0, headroom));
      for (const p of list) p.y -= shift;
    }
    for (const p of list) out.set(p.i, { x0: p.x0, y0: p.y0, y: p.y });
  }
  return out;
}

function hitPath(item, g, i) {
  const d = [];
  item.runs.forEach((run, k) => {
    const x1 = g.px(run.at, run.level, i);
    const y1 = g.py(run.at, run.level, i);
    if (!k) d.push(`M${r1(x1)},${r1(y1)}`);
    d.push(`L${r1(g.px(run.off, run.level, i))},${r1(g.py(run.off, run.level, i))}`);
    const next = item.runs[k + 1];
    if (next) {
      d.push(connector(g, g.px(run.off, run.level, i), g.py(run.off, run.level, i),
        g.px(next.at, next.level, i), g.py(next.at, next.level, i)).replace(/^M[^C]*/, ''));
    }
  });
  return d.length > 1 ? d.join(' ') : '';
}

function prefersReducedMotion(node) {
  const view = node.ownerDocument?.defaultView;
  return Boolean(view && view.matchMedia && view.matchMedia('(prefers-reduced-motion: reduce)').matches);
}

/** 目盛の間隔(分)。線の本数が多くなりすぎないように選ぶ。 */
export function tickStep(span) {
  for (const s of [10, 15, 30, 60, 120, 180]) {
    if (span / s <= 8) return s;
  }
  return 360;
}

/** 案の要約行(一覧に出す文言) */
export function summaryOf(item) {
  const r = item.route;
  const bits = [formatDuration(r.rideMinutes)];
  bits.push(`乗換${r.transfers}回`);
  if (r.walkMinutes > 0) bits.push(`歩き${Math.round(r.walkMinutes)}分`);
  return bits.join(' ・ ');
}

/** 乗り物の並び(小田急 → 千代田線 → 銀座線) */
export function lineupOf(item) {
  return item.runs.filter((run) => !run.walk).map((run) => run.short);
}
