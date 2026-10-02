/**
 * 端末の時計（画面の層だけが読む。模型には時刻を引数で渡す。docs/architecture.md 3 章）。
 * 時刻は端末の地方時の ISO 文字列（2026-10-02T20:14:11+09:00）にする。先頭の 10 文字が端末の日付。
 */
const pad = (n: number): string => String(Math.abs(n)).padStart(2, '0');

export function localIso(d: Date): string {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${sign}${pad(Math.trunc(off / 60))}:${pad(off % 60)}`;
}

export const nowIso = (): string => localIso(new Date());
export const today = (): string => nowIso().slice(0, 10);
