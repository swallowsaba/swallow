/**
 * 1 本前 / 1 本後
 * ------------------------------------------------------------------
 * 経路を組み直すための下ごしらえ。通信も DOM も触らないので、
 * ここだけ切り出してテストできるようにしてある。
 *
 * 組み直し方そのものは main.js(shiftRoute)にある。要点だけ書くと:
 *   1 本後 … 最初の乗車時刻 + 1 分から前向きに引き直す
 *   1 本前 … まず最初の区間だけ逆向きに引いて「1 本前の発車時刻」を出し、
 *            そこから先は前向きに引き直す(後ろ向きのままだと終点側が動く)
 */

/** 経路の最初の乗車レグ。徒歩・経由・乗り換えは乗り物ではない。 */
export function firstRide(route) {
  return (route?.legs || []).find(
    (l) => !l.transfer && !l.via && !l.walkAccess && Number.isFinite(l.departure)
  ) || null;
}

/**
 * この経路に「1 本前/後」を出せるか。
 *
 * 出せないもの:
 *   ・経由地つき … 区間ごとに引き直す必要があり、滞在時間の持ち方も変わる
 *   ・バス、バス+鉄道 … 鉄道の時刻表の仕組みでは組み直せない
 *   ・徒歩のみ … そもそも便が無い
 * 出せない案にボタンを出して押せなくするより、理由を添えて無効にする。
 */
export function canShiftRoute(route) {
  if (!route || route.walkOnly) return false;
  if (route.viaCount) return false;
  if (route.kind === 'bus' || route.kind === 'mixed') return false;
  if (route.source === 'gtfs' || route.source === 'walk') return false;
  return Boolean(firstRide(route));
}

/**
 * 組み直しのために、両端の徒歩を外して本体だけにする。
 * 徒歩レグは時刻を持たないので、引き直した後に付け直す(walk.js の attachWalk)。
 */
export function splitForShift(route) {
  const legs = route?.legs || [];
  const fromLeg = legs.find((l) => l.walkAccess && l.side === 'from') || null;
  const toLeg = legs.find((l) => l.walkAccess && l.side === 'to') || null;
  const core = legs.filter((l) => !l.walkAccess && !l.via);
  const rideLegs = core.filter((l) => !l.transfer);
  return { fromLeg, toLeg, core, rideLegs };
}
