/**
 * 経由地
 * ==================================================================
 * 「A → 経由地1(20分滞在)→ 経由地2 → B」のような経路を組み立てる。
 *
 * 【考え方】
 * 経由地があるときは、区間ごとに独立して経路を検索する。
 *   区間1: A  → 経由地1  (指定した出発時刻から)
 *   区間2: 経由地1 → 経由地2 (区間1の最早到着 + 滞在時間 から)
 *   区間3: 経由地2 → B
 *
 * 次の区間の検索開始時刻は「その区間で最も早く着ける時刻 + 滞在時間」にする。
 * こうすると、どの組み合わせを選んでも成立する候補が必ず手に入る。
 *
 * そのうえで、区間ごとの候補を組み合わせて複数案を作る。
 * 組み合わせるときは必ず時刻の整合をとる:
 *   次の区間の発車時刻 >= 前の区間の到着時刻 + 滞在時間
 * を満たさない候補は使わない。追加の通信は一切しない。
 */

/**
 * 区間ごとの候補を結合して、通しの経路を作る。
 *
 * @param {Array<{routes:Array}>} segments 区間ごとの検索結果(前から順)
 * @param {Array<{label:string, stay:number}>} vias 経由地(segments.length - 1 個)
 * @param {number} departAt 全体の出発時刻(営業日基準の分)
 * @param {number} maxVariants 作る案の上限
 * @returns {Array} 結合済みの経路(bindSchedule の結果と同じ形)
 */
export function combineSegments(segments, vias, departAt, maxVariants = 3) {
  if (!segments.length) return [];
  if (segments.some((s) => !s.routes || !s.routes.length)) return [];

  const pools = segments.map((s) => [...s.routes].sort((a, b) => a.arrival - b.arrival || a.transfers - b.transfers));

  const out = [];
  const seen = new Set();

  for (let variant = 0; variant < maxVariants; variant += 1) {
    const picked = [];
    let earliest = departAt;
    let ok = true;

    for (let i = 0; i < pools.length; i += 1) {
      const feasible = pools[i].filter((r) => r.departure >= earliest);
      if (!feasible.length) {
        ok = false;
        break;
      }
      const chosen = feasible[Math.min(variant, feasible.length - 1)];
      picked.push(chosen);
      earliest = chosen.arrival + stayOf(vias, i);
    }
    if (!ok) break;

    const merged = mergeRoutes(picked, vias);
    const sig = signature(merged);
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(merged);
  }

  return out;
}

function stayOf(vias, i) {
  const v = vias[i];
  return v && Number.isFinite(v.stay) ? Math.max(0, v.stay) : 0;
}

/** 選んだ区間経路を 1 本につなぐ */
export function mergeRoutes(picked, vias) {
  const legs = [];
  const warnings = [];
  let transfers = 0;
  let waitMinutes = 0;
  let stayMinutes = 0;
  let hasBus = false;
  let hasRail = false;
  let estimatedOnly = false;

  picked.forEach((r, i) => {
    for (const leg of r.legs || []) {
      legs.push(leg);
      if (leg.transfer) continue;
      if (leg.bus) hasBus = true;
      else hasRail = true;
    }
    transfers += r.transfers || 0;
    waitMinutes += r.waitMinutes || 0;
    if (r.estimatedOnly) estimatedOnly = true;
    for (const w of r.warnings || []) warnings.push(w);

    if (i < picked.length - 1) {
      const next = picked[i + 1];
      const planned = stayOf(vias, i);
      const actual = Math.max(0, next.departure - r.arrival);
      stayMinutes += actual;
      legs.push({
        via: true,
        label: vias[i]?.label || '経由地',
        arrival: r.arrival,
        departure: next.departure,
        plannedStay: planned,
        actualStay: actual,
      });
    }
  });

  const first = picked[0];
  const last = picked[picked.length - 1];
  const departure = first.departure;
  const arrival = last.arrival;

  return {
    kind: hasBus ? (hasRail ? 'mixed' : 'bus') : undefined,
    legs,
    departure,
    arrival,
    rideMinutes: arrival - departure,
    transfers,
    waitMinutes,
    stayMinutes,
    viaCount: picked.length - 1,
    estimatedOnly,
    warnings: dedupeWarnings(warnings),
    segments: picked,
  };
}

function dedupeWarnings(warnings) {
  const seen = new Set();
  const out = [];
  for (const w of warnings) {
    const key = `${w.railway || ''}|${w.severity || ''}|${w.text || w.status || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(w);
  }
  return out;
}

function signature(route) {
  return route.legs
    .map((l) => {
      if (l.via) return `V${l.departure}`;
      if (l.transfer) return 'T';
      return `${l.railway || l.pattern || 'bus'}:${l.from}:${l.to}:${l.departure}`;
    })
    .join('|');
}

/**
 * 画面の入力を検索用の地点リストにする。
 * @returns {{points:Array, vias:Array<{label:string, stay:number}>}}
 */
export function buildPoints(from, vias, to) {
  const usable = (vias || []).filter((v) => v.spec);
  return {
    points: [from, ...usable.map((v) => v.spec), to],
    vias: usable.map((v) => ({ label: v.spec.label, stay: Math.max(0, Number(v.stay) || 0) })),
  };
}

/** 連続する地点が同じでないか調べる。問題があればメッセージを返す。 */
export function validatePoints(points) {
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) return '出発地・経由地・到着地をすべて選んでください。';
    const sameStation = a.groupId && b.groupId && a.groupId === b.groupId;
    const sameStop = a.busOnly && b.busOnly && a.label === b.label;
    if (sameStation || sameStop) return `「${a.label}」が連続しています。同じ地点は続けて指定できません。`;
  }
  return null;
}
