/**
 * 運行情報の解釈
 * ------------------------------------------------------------------
 * ODPT の odpt:TrainInformation は自由文テキストが主体で、
 * 「どの区間が止まっているか」を機械的に確定することはできない。
 * ここでできるのは次の 3 つまで:
 *   1. 平常運転かどうかの判定
 *   2. 遅延 / 運転見合わせ / 運転再開 などの大まかな深刻度分類
 *   3. 本文に含まれる駅名の抽出(区間の「手がかり」であって確定ではない)
 *
 * 区間の確定はユーザーの手動指定に委ねる。UI はその導線を必ず出す。
 */

const NORMAL_PATTERNS = [/平常/, /通常どおり/, /通常通り/, /遅れなく/];
const SUSPEND_PATTERNS = [/運転見合わせ/, /運転を見合わせ/, /運休/, /折り返し運転/, /直通運転.*中止/];
const DELAY_PATTERNS = [/遅延/, /遅れ/, /ダイヤが乱れ/, /間隔が乱れ/];
const RESUMED_PATTERNS = [/運転を再開/, /運転再開/];

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
 */
export function analyzeStatus(items, net) {
  /** @type {Map<string, object>} 路線ID → 状況 */
  const byRailway = new Map();
  const list = [];

  for (const item of items || []) {
    const text = String(item.text || '');
    const status = String(item.status || '');
    const blob = `${status} ${text}`;
    const severity = classify(blob);
    const stations = extractStations(blob, net, item.railway);

    const entry = {
      railway: item.railway || null,
      railwayTitle: item.railway ? net.railwayTitle(item.railway) : operatorTitle(net, item.operator),
      operator: item.operator || null,
      severity,
      status: status || SEVERITY_LABEL[severity],
      text: text || status || '',
      date: item.date || null,
      stationHints: stations,
    };
    list.push(entry);
    if (entry.railway) {
      const prev = byRailway.get(entry.railway);
      if (!prev || SEVERITY_RANK[severity] > SEVERITY_RANK[prev.severity]) byRailway.set(entry.railway, entry);
    }
  }

  list.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
  const disrupted = list.filter((e) => e.severity === SEVERITY.SUSPENDED || e.severity === SEVERITY.DELAY);
  return { list, byRailway, disrupted };
}

function classify(text) {
  if (SUSPEND_PATTERNS.some((r) => r.test(text))) return SEVERITY.SUSPENDED;
  if (DELAY_PATTERNS.some((r) => r.test(text))) return SEVERITY.DELAY;
  if (RESUMED_PATTERNS.some((r) => r.test(text))) return SEVERITY.INFO;
  if (NORMAL_PATTERNS.some((r) => r.test(text))) return SEVERITY.NORMAL;
  return text.trim() ? SEVERITY.INFO : SEVERITY.NORMAL;
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
    if (leg.transfer || !leg.railway) continue;
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
