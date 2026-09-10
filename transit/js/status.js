/**
 * 運行情報の解釈
 * ------------------------------------------------------------------
 * ODPT の odpt:TrainInformation は自由文テキストが主体で、
 * 「どの区間が止まっているか」を機械的に確定することはできない。
 * ここでできるのは次の 4 つまで:
 *   1. 平常運転かどうかの判定
 *   2. 遅延 / 運転見合わせ / 運転再開 などの大まかな深刻度分類
 *   3. 本文に含まれる駅名の抽出(区間の「手がかり」であって確定ではない)
 *   4. 本文に書かれた遅れ時分の抽出(「約10分の遅れ」など)
 *
 * 区間の確定はユーザーの手動指定に委ねる。UI はその導線を必ず出す。
 *
 * 【誤判定を避けるための決まりごと】
 * ・否定形を先に見る。「遅れはありません」を遅延と判定しない。
 * ・「運転を再開しました」は、見合わせの語が同居していても再開として扱う。
 * ・odpt:trainInformationStatus が「平常運転」なら、本文に何が書いてあっても平常。
 * ・古い情報(dc:date が離れている)は現在の状況として扱わない。
 */

/** これより古い情報は「現在の運行情報」として扱わない(分) */
export const STALE_AFTER_MINUTES = 180;

/* 否定形 — これに当たる部分は判定から取り除く */
const NEGATION_PATTERNS = [
  /遅れ(は|も)?(ございません|ありません|出ていません|発生していません|解消)/g,
  /遅延(は|も)?(ございません|ありません|発生していません|解消)/g,
  /運転見合わせ(は|も)?(ございません|ありません|解除)/g,
  /運休(は|も)?(ございません|ありません)/g,
  /影響(は|も)?(ございません|ありません)/g,
  /ダイヤ(の)?乱れ(は|も)?(ございません|ありません|解消)/g,
];

const NORMAL_PATTERNS = [/平常/, /通常どおり/, /通常通り/, /遅れなく/, /現在.{0,6}異常(は|も)?(ありません|ございません)/];
const SUSPEND_PATTERNS = [/運転(を)?見合わせ/, /運休/, /折り返し運転/, /直通運転.{0,6}中止/];
const DELAY_PATTERNS = [/遅延/, /遅れ/, /ダイヤが乱れ/, /ダイヤの乱れ/, /間隔が乱れ/];
const RESUMED_PATTERNS = [/運転(を)?再開/, /運転再開/, /平常運転に戻/];

export const SEVERITY = {
  NORMAL: 'normal',
  INFO: 'info',
  DELAY: 'delay',
  SUSPENDED: 'suspended',
};

export const SEVERITY_LABEL = {
  normal: '平常運転',
  info: 'お知らせ',
  delay: '遅延',
  suspended: '運転見合わせ',
};

export const SEVERITY_RANK = { normal: 0, info: 1, delay: 2, suspended: 3 };

/**
 * @param {Array} items  Worker が返した運行情報
 * @param {import('./network.js').TransitNetwork} net
 * @param {{now?:Date}} opts
 */
export function analyzeStatus(items, net, opts = {}) {
  const now = opts.now || new Date();
  /** @type {Map<string, object>} 路線ID → 状況 */
  const byRailway = new Map();
  const list = [];
  const stale = [];

  for (const item of items || []) {
    const text = String(item.text || '');
    const status = String(item.status || '');
    const severity = classify(status, text);
    const stations = extractStations(`${status} ${text}`, net, item.railway);
    const ageMinutes = ageInMinutes(item.date, now);

    const entry = {
      railway: item.railway || null,
      railwayTitle: item.railway ? net.railwayTitle(item.railway) : operatorTitle(net, item.operator),
      operator: item.operator || null,
      severity,
      status: status || SEVERITY_LABEL[severity],
      text: text || status || '',
      date: item.date || null,
      ageMinutes,
      delayMinutes: severity === SEVERITY.DELAY ? extractDelayMinutes(`${status} ${text}`) : null,
      stationHints: stations,
    };

    // 古い情報は現在の状況として扱わない(捨てずに別枠で見せる)
    if (ageMinutes != null && ageMinutes > STALE_AFTER_MINUTES && severity !== SEVERITY.NORMAL) {
      stale.push(entry);
      continue;
    }

    list.push(entry);
    if (severity === SEVERITY.NORMAL) continue;

    // 路線が指定されていれば その路線に、
    // 指定が無い(事業者全体の情報)ならその事業者の全路線に反映する。
    // 以前は路線指定の無い情報が経路の警告に一切出ていなかった。
    const targets = entry.railway ? [entry.railway] : railwaysOfOperator(net, entry.operator);
    for (const rw of targets) {
      const prev = byRailway.get(rw);
      if (!prev || SEVERITY_RANK[severity] > SEVERITY_RANK[prev.severity]) byRailway.set(rw, entry);
    }
  }

  list.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  const disrupted = list.filter((e) => e.severity === SEVERITY.SUSPENDED || e.severity === SEVERITY.DELAY);
  return { list, byRailway, disrupted, stale };
}

/**
 * 深刻度の判定。
 * status(odpt:trainInformationStatus)は事業者が付ける短い区分なので、
 * 本文より優先する。無ければ本文から推定する。
 */
export function classify(status, text) {
  const shortStatus = String(status || '').trim();

  // 事業者が「平常運転」と言っているなら本文に何が書かれていても平常
  if (shortStatus && NORMAL_PATTERNS.some((r) => r.test(shortStatus)) && !RESUMED_PATTERNS.some((r) => r.test(shortStatus))) {
    return SEVERITY.NORMAL;
  }

  const raw = `${shortStatus} ${String(text || '')}`;
  const blob = stripNegations(raw);
  const hadNegation = blob !== raw;

  // 再開は見合わせより先に見る(「見合わせていましたが再開しました」対策)
  if (RESUMED_PATTERNS.some((r) => r.test(blob))) return SEVERITY.INFO;
  if (SUSPEND_PATTERNS.some((r) => r.test(blob))) return SEVERITY.SUSPENDED;
  if (DELAY_PATTERNS.some((r) => r.test(blob))) return SEVERITY.DELAY;
  if (NORMAL_PATTERNS.some((r) => r.test(blob))) return SEVERITY.NORMAL;

  // 「遅れはありません」のように否定だけで成り立つ文は平常運転。
  // ここを「お知らせ」にすると、何も起きていないのに画面に出てしまう。
  if (hadNegation) return SEVERITY.NORMAL;

  return blob.trim() ? SEVERITY.INFO : SEVERITY.NORMAL;
}

/** 否定形の言い回しを判定対象から取り除く */
export function stripNegations(text) {
  let out = String(text || '');
  for (const r of NEGATION_PATTERNS) out = out.replace(new RegExp(r.source, 'g'), '　');
  return out;
}

/** 「約10分の遅れ」「10分程度の遅れ」から分数を取り出す。取れなければ null。 */
export function extractDelayMinutes(text) {
  const t = stripNegations(String(text || ''));
  // 「最大30分」「約10分から20分」なども拾えるよう、遅れの語の近くにある分数を採る
  const m = /(\d{1,3})\s*分(程度|ほど|前後|以上)?(の|の間)?\s*(の)?(遅れ|遅延)/.exec(t) || /(遅れ|遅延).{0,8}?(\d{1,3})\s*分/.exec(t);
  if (!m) return null;
  const n = Number(m[1] && /^\d+$/.test(m[1]) ? m[1] : m[2]);
  return Number.isFinite(n) && n > 0 && n <= 300 ? n : null;
}

/** 情報の古さ(分)。日付が無い・読めない場合は null。 */
export function ageInMinutes(dateStr, now = new Date()) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return Math.max(0, Math.round((now.getTime() - d.getTime()) / 60000));
}

function railwaysOfOperator(net, operatorUrn) {
  const id = String(operatorUrn || '').split(':').pop();
  if (!id) return [];
  const out = [];
  for (const rw of net.railways.values()) if (rw.operator === id) out.push(rw.id);
  return out;
}

/** 本文に登場する、その路線上の駅名を拾う(区間推定の手がかり) */
function extractStations(text, net, railwayId) {
  if (!text) return [];
  const rw = railwayId ? net.railways.get(railwayId) : null;
  const pool = rw ? rw.stations : [];
  const hits = [];
  for (const sid of pool) {
    const title = net.stationTitle(sid);
    if (title && title.length >= 2 && text.includes(title)) hits.push({ station: sid, title });
  }
  return hits.slice(0, 4);
}

function operatorTitle(net, operatorUrn) {
  const id = String(operatorUrn || '').split(':').pop();
  const op = (net.operators || []).find((o) => o.id === id);
  return op ? op.title : id || '不明な事業者';
}

/**
 * 経路に運行情報の警告を付ける。
 * @returns {Array} 警告(severity 降順)
 */
export function warningsForRoute(route, analysis) {
  const out = [];
  const seen = new Set();
  for (const leg of route.legs) {
    if (leg.transfer || leg.via || leg.walkAccess || !leg.railway) continue;
    const info = analysis.byRailway.get(leg.railway);
    if (!info) continue;
    if (info.severity === SEVERITY.NORMAL) continue;
    if (seen.has(leg.railway)) continue;
    seen.add(leg.railway);
    out.push(info);
  }
  out.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  return out;
}

/**
 * 遅延を考慮した到着見込み。
 * ODPT の無料データに列車ごとの遅れは含まれないため、
 * 運行情報の本文に書かれた遅れ時分を足しただけの「目安」である。
 *
 * @returns {{minutes:number, arrival:number, lines:Array<string>}|null}
 */
export function delayEstimate(route) {
  const warnings = route.warnings || [];
  let worst = 0;
  const lines = [];
  for (const w of warnings) {
    if (w.severity !== SEVERITY.DELAY) continue;
    if (!w.delayMinutes) continue;
    worst = Math.max(worst, w.delayMinutes);
    lines.push(`${w.railwayTitle} 約${w.delayMinutes}分`);
  }
  if (!worst) return null;
  return { minutes: worst, arrival: route.arrival + worst, lines };
}
