/**
 * 徒歩(任意地点からの接続)
 * ==================================================================
 * 地図上の任意の位置を出発地・到着地・経由地にできるようにするための計算。
 *
 * 【正直に言っておくこと】
 * 徒歩の経路検索はしていない。使えるのは駅・バス停の座標だけで、
 * 歩道のネットワークデータは持っていないし、無料で規約に沿って
 * 使える徒歩ルーティング API も無い。
 *
 * そこでここでは
 *      直線距離 × 迂回係数 ÷ 分速
 * という単純な見積りをしている。実際の道のりは建物・川・線路で
 * 変わるので、**必ず「推定」と明示して表示する**こと。
 */

/** 既定値(transit/data/config.json で上書きできる) */
export const WALK_DEFAULTS = {
  /** 分速(m)。国土交通省の慣行値 80m/分 */
  speedMetersPerMinute: 80,
  /** 直線距離に対する実際の道のりの比。市街地のおおよその実測値 */
  detourFactor: 1.3,
  /**
   * 徒歩の距離に上限は設けない。
   * 遠ければ「徒歩◯分」と正直に出すだけで、検索を止めることはしない。
   * どうしても切りたい場合だけ config.json の walkMaxKm に数値を入れる。
   */
  maxKm: Infinity,
  /** 1 地点あたりに検討する駅の数 */
  maxCandidates: 2,
  /** これを超える徒歩は「遠い」と注意書きを添える(分)。検索は止めない。 */
  farWarningMinutes: 30,
};

export function walkSettings(config = {}) {
  return {
    speedMetersPerMinute: num(config.walkSpeedMetersPerMinute, WALK_DEFAULTS.speedMetersPerMinute),
    detourFactor: num(config.walkDetourFactor, WALK_DEFAULTS.detourFactor),
    maxKm: num(config.walkMaxKm, WALK_DEFAULTS.maxKm),
    maxCandidates: Math.max(1, Math.round(num(config.walkMaxCandidates, WALK_DEFAULTS.maxCandidates))),
    farWarningMinutes: num(config.walkFarWarningMinutes, WALK_DEFAULTS.farWarningMinutes),
  };
}

function num(v, fallback) {
  if (v === null || v === undefined || v === '') return fallback;
  const n = Number(v);
  // Infinity(上限なし)も正しい設定値として通す
  if (n === Infinity) return Infinity;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * 直線距離(km)から徒歩の所要時間(分)を見積もる。
 * 端数は切り上げ。0km でも最低 1 分は見る(改札まで歩くため)。
 */
export function walkMinutes(km, settings = WALK_DEFAULTS) {
  const meters = Math.max(0, km) * 1000 * settings.detourFactor;
  return Math.max(1, Math.ceil(meters / settings.speedMetersPerMinute));
}

/**
 * 任意地点から徒歩で行ける駅の候補を作る。
 *
 * @param {{lat:number, lon:number}} point
 * @param {import('./network.js').TransitNetwork} net
 * @param {object} settings walkSettings() の結果
 * @returns {Array<{groupId:string, title:string, km:number, minutes:number}>}
 */
export function accessCandidates(point, net, settings = WALK_DEFAULTS) {
  if (!point || point.lat == null || point.lon == null || !net) return [];
  const near = net.nearestGroups(point.lat, point.lon, settings.maxCandidates * 3);
  const out = [];
  for (const n of near) {
    // 既定では maxKm は Infinity。距離で候補を捨てない。
    if (Number.isFinite(settings.maxKm) && n.km > settings.maxKm) continue;
    out.push({
      groupId: n.group.id,
      title: n.group.title,
      km: n.km,
      minutes: walkMinutes(n.km, settings),
    });
    if (out.length >= settings.maxCandidates) break;
  }
  return out;
}

/**
 * 徒歩が長い経路かどうか。長くても検索は通す。呼び出し側で注意書きを出すためだけに使う。
 * @returns {?{minutes:number, title:string, km:number}}
 */
export function farWalk(candidates, settings = WALK_DEFAULTS) {
  const limit = settings.farWarningMinutes || WALK_DEFAULTS.farWarningMinutes;
  const worst = (candidates || []).reduce((a, c) => (!a || c.minutes > a.minutes ? c : a), null);
  if (!worst || worst.minutes <= limit) return null;
  return { minutes: worst.minutes, title: worst.title, km: worst.km };
}

/** 地点かどうか(駅・バス停ではなく緯度経度で指定されたもの) */
export function isPoint(spec) {
  return Boolean(spec && spec.kind === 'point' && spec.lat != null && spec.lon != null);
}

/**
 * 出発側の徒歩レグ。地点から駅へ歩く。
 * @returns {object} route.legs に前置きするレグ
 */
export function accessLegFrom(point, candidate) {
  return {
    walkAccess: true,
    kind: 'walk',
    side: 'from',
    fromTitle: point.label,
    toTitle: candidate.title,
    lat: point.lat,
    lon: point.lon,
    minutes: candidate.minutes,
    km: candidate.km,
    estimated: true,
  };
}

/** 到着側の徒歩レグ。駅から地点へ歩く。 */
export function accessLegTo(point, candidate) {
  return {
    walkAccess: true,
    kind: 'walk',
    side: 'to',
    fromTitle: candidate.title,
    toTitle: point.label,
    lat: point.lat,
    lon: point.lon,
    minutes: candidate.minutes,
    km: candidate.km,
    estimated: true,
  };
}

/**
 * 区間の検索結果に、両端の徒歩を足して 1 本の経路にする。
 *
 * 出発地が地点のとき、利用者は指定した時刻に「地点を」出る。
 * したがって駅での検索開始時刻は 指定時刻 + 徒歩時間 になり、
 * 経路全体の出発時刻は指定時刻そのものに戻す。
 *
 * @param {object} route 駅→駅の経路
 * @param {?object} fromLeg accessLegFrom の結果
 * @param {?object} toLeg   accessLegTo の結果
 */
export function attachWalk(route, fromLeg, toLeg) {
  if (!fromLeg && !toLeg) return route;
  const legs = [...(fromLeg ? [fromLeg] : []), ...route.legs, ...(toLeg ? [toLeg] : [])];
  const departure = fromLeg ? route.departure - fromLeg.minutes : route.departure;
  const arrival = toLeg ? route.arrival + toLeg.minutes : route.arrival;
  return {
    ...route,
    legs,
    departure,
    arrival,
    rideMinutes: arrival - departure,
    walkMinutes: (fromLeg?.minutes || 0) + (toLeg?.minutes || 0) + (route.walkMinutes || 0),
    hasWalkAccess: true,
    estimatedOnly: route.estimatedOnly || false,
  };
}

/**
 * 地点を含む検索の組み合わせを作る。
 * 通信量が候補数の掛け算で増えるため、上限で必ず打ち切る。
 *
 * @returns {Array<{from:object, to:object, fromLeg:?object, toLeg:?object}>}
 */
export function accessCombos(fromSpec, toSpec, net, settings = WALK_DEFAULTS, maxCombos = 3) {
  const fromList = isPoint(fromSpec) ? accessCandidates(fromSpec, net, settings) : [null];
  const toList = isPoint(toSpec) ? accessCandidates(toSpec, net, settings) : [null];

  if (isPoint(fromSpec) && !fromList.length) return [];
  if (isPoint(toSpec) && !toList.length) return [];

  const combos = [];
  for (const f of fromList) {
    for (const t of toList) {
      if (f && t && f.groupId === t.groupId) continue; // 同じ駅に歩いて戻るだけの経路は無意味
      combos.push({
        from: f ? { groupId: f.groupId, label: f.title, busOnly: false } : fromSpec,
        to: t ? { groupId: t.groupId, label: t.title, busOnly: false } : toSpec,
        fromLeg: f ? accessLegFrom(fromSpec, f) : null,
        toLeg: t ? accessLegTo(toSpec, t) : null,
      });
    }
  }
  // 徒歩が短い順。通信を使い切る前に、いちばんありそうな組み合わせから試す。
  combos.sort(
    (a, b) => (a.fromLeg?.minutes || 0) + (a.toLeg?.minutes || 0) - ((b.fromLeg?.minutes || 0) + (b.toLeg?.minutes || 0))
  );
  return combos.slice(0, maxCombos);
}
