/**
 * 時刻とカレンダーの取り扱い
 * ------------------------------------------------------------------
 * 鉄道の時刻表は「営業日」で動く。0:30 発の列車は前日ダイヤの 24:30 として
 * 表現されるため、すべて「営業日の 0:00 からの経過分」に正規化して扱う。
 */

/** "25:10" / "07:03" → 1510 / 423 (分)。不正値は null。 */
export function toMinutes(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min) || min > 59) return null;
  return h * 60 + min;
}

/** 1510 → "25:10"(営業日表記)。 */
export function toServiceTime(minutes) {
  if (!Number.isFinite(minutes)) return '--:--';
  const h = Math.floor(minutes / 60);
  const m = Math.floor(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** 1510 → "01:10"(実時刻表記。翌日にまたがる場合は 24 を引く)。 */
export function toClockTime(minutes) {
  if (!Number.isFinite(minutes)) return '--:--';
  const wrapped = minutes % 1440;
  return toServiceTime(wrapped);
}

/** 分数 → "1時間23分" */
export function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return '—';
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const rest = m % 60;
  if (h === 0) return `${rest}分`;
  if (rest === 0) return `${h}時間`;
  return `${h}時間${rest}分`;
}

/** 営業日の境界(この時刻より前は前日ダイヤ扱い)。 */
const SERVICE_DAY_START_HOUR = 3;

/**
 * ローカル日時から「営業日」と「営業日 0:00 からの経過分」を求める。
 * @param {Date} date
 * @returns {{serviceDate: Date, minutes: number}}
 */
export function toServiceMoment(date) {
  const d = new Date(date.getTime());
  let minutes = d.getHours() * 60 + d.getMinutes();
  if (d.getHours() < SERVICE_DAY_START_HOUR) {
    d.setDate(d.getDate() - 1);
    minutes += 1440;
  }
  d.setHours(0, 0, 0, 0);
  return { serviceDate: d, minutes };
}

/** YYYY-MM-DD */
export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * ODPT のカレンダー種別を判定する。
 * 祝日は holidays.json(手動メンテ)を参照。年末年始等の臨時ダイヤは
 * ODPT のカレンダー区分に存在しないため対応しない(UI に注記を出す)。
 */
export function calendarFor(serviceDate, holidays) {
  const key = dateKey(serviceDate);
  const day = serviceDate.getDay();
  const isHoliday = Array.isArray(holidays) ? holidays.includes(key) : false;
  if (day === 0 || day === 6 || isHoliday) {
    return { urn: 'odpt.Calendar:SaturdayHoliday', label: '土休日ダイヤ', isHoliday };
  }
  return { urn: 'odpt.Calendar:Weekday', label: '平日ダイヤ', isHoliday: false };
}

/** カレンダー URN の別名候補(事業者によって粒度が違うため) */
export function calendarAliases(urn) {
  if (urn === 'odpt.Calendar:SaturdayHoliday') {
    return ['odpt.Calendar:SaturdayHoliday', 'odpt.Calendar:Saturday', 'odpt.Calendar:Holiday', 'odpt.Calendar:Sunday'];
  }
  return ['odpt.Calendar:Weekday', 'odpt.Calendar:Monday', 'odpt.Calendar:Weekdays'];
}

/** ISO 文字列 → "14:03" 表示 */
export function formatFetchedAt(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 経過秒数 */
export function secondsSince(iso) {
  if (!iso) return Infinity;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return Infinity;
  return (Date.now() - t) / 1000;
}
