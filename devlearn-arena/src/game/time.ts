/**
 * 時刻と日付の計算（模型の層は Date を使わない。docs/architecture.md 3 章）。
 * 時刻は端末の地方時の ISO 文字列（2026-10-02T20:14:11+09:00）、日付は YYYY-MM-DD。
 */

const ISO = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

/** 1970-01-01 からの日数（グレゴリオ暦） */
function daysFromCivil(y: number, m: number, d: number): number {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(z: number): [number, number, number] {
  const zz = z + 719468;
  const era = Math.floor(zz / 146097);
  const doe = zz - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  return [yoe + era * 400 + (m <= 2 ? 1 : 0), m, d];
}

const pad = (n: number, w = 2): string => String(n).padStart(w, '0');

function dayString(days: number): string {
  const [y, m, d] = civilFromDays(days);
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

function parse(at: string): { days: number; seconds: number; zone: string; offsetMinutes: number } {
  const m = ISO.exec(at);
  if (!m) throw new Error(`時刻の形が違う: ${at}`);
  const [, y, mo, d, h, mi, s, zone] = m as unknown as [string, string, string, string, string, string, string | undefined, string];
  const offsetMinutes = zone === 'Z' ? 0 : (zone.startsWith('-') ? -1 : 1) * (Number(zone.slice(1, 3)) * 60 + Number(zone.slice(4, 6)));
  return { days: daysFromCivil(Number(y), Number(mo), Number(d)), seconds: Number(h) * 3600 + Number(mi) * 60 + Number(s ?? 0), zone, offsetMinutes };
}

/** 端末の日付（時刻の先頭の 10 文字。地方時で書かれているので、そのまま端末の日付になる） */
export const dayOf = (at: string): string => at.slice(0, 10);

/** 時刻の前後を比べるための値（世界時の秒） */
export function instantOf(at: string): number {
  const p = parse(at);
  return p.days * 86400 + p.seconds - p.offsetMinutes * 60;
}

/** 日付に n 日を足す */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return dayString(daysFromCivil(y, m, d) + n);
}

/** 時刻に n 分を足す（時差の表記は保つ） */
export function plusMinutes(at: string, n: number): string {
  const p = parse(at);
  const total = p.days * 86400 + p.seconds + n * 60;
  const days = Math.floor(total / 86400);
  const sec = total - days * 86400;
  return `${dayString(days)}T${pad(Math.floor(sec / 3600))}:${pad(Math.floor((sec % 3600) / 60))}:${pad(sec % 60)}${p.zone}`;
}
