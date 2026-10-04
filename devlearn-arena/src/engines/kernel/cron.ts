/**
 * cron の模型（docs/lessons/linux.md の linux.i.08）。純粋な関数。
 *
 * - 登録は利用者ごとに /var/spool/cron/crontabs/<利用者>（本物と同じ場所）。1 行が「分 時 日 月 曜日 コマンド」
 * - 欄は * ・数・範囲（1-5）・並び（1,15）・間隔（*\/10）
 * - 機械の今の時刻は __NOW（年-月-日 時:分）。timeskip で進めると、その間に来た時刻の仕事が動く
 */

export const CRONTAB_DIR = '/var/spool/cron/crontabs';
/** この機械の初めの時刻 */
export const START_TIME = '2026-10-03 09:00';

export interface CronEntry {
  minute: Set<number>;
  hour: Set<number>;
  day: Set<number>;
  month: Set<number>;
  weekday: Set<number>;
  /** 日と曜日の両方に * 以外を書いた時は、どちらかに合えば動く（本物と同じ） */
  dayStar: boolean;
  weekdayStar: boolean;
  command: string;
}

const FIELDS = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day-of-month', min: 1, max: 31 },
  { name: 'month', min: 1, max: 12 },
  { name: 'day-of-week', min: 0, max: 7 },
] as const;

function parseField(text: string, min: number, max: number): Set<number> | null {
  const out = new Set<number>();
  for (const part of text.split(',')) {
    const m = /^(\*|(\d+)(?:-(\d+))?)(?:\/(\d+))?$/.exec(part);
    if (!m) return null;
    const step = m[4] === undefined ? 1 : Number(m[4]);
    const lo = m[1] === '*' ? min : Number(m[2]);
    const hi = m[1] === '*' ? max : m[3] === undefined ? (m[4] === undefined ? lo : max) : Number(m[3]);
    if (step < 1 || lo < min || hi > max || lo > hi) return null;
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** crontab の本文を読む。誤りは本物と同じ形（何行目のどの欄か）で返す */
export function parseCrontab(text: string): { entries: CronEntry[] } | { error: string } {
  const entries: CronEntry[] = [];
  const lines = text.split('\n');
  for (const [i, raw] of lines.entries()) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    // 変数の行（PATH=… や MAILTO=…）は、そのまま認める
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 6) return { error: `"-":${String(i + 1)}: bad command` };
    const sets: Set<number>[] = [];
    for (const [k, f] of FIELDS.entries()) {
      const set = parseField(parts[k] ?? '', f.min, f.max);
      if (set === null) return { error: `"-":${String(i + 1)}: bad ${f.name === 'day-of-month' ? 'day-of-month' : f.name}` };
      sets.push(set);
    }
    const [minute, hour, day, month, weekday] = sets as [Set<number>, Set<number>, Set<number>, Set<number>, Set<number>];
    if (weekday.has(7)) weekday.add(0);
    entries.push({ minute, hour, day, month, weekday, dayStar: parts[2] === '*', weekdayStar: parts[4] === '*', command: parts.slice(5).join(' ') });
  }
  return { entries };
}

export interface SimTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export function parseTime(text: string): SimTime {
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(text);
  if (!m) throw new Error(`時刻 ${text} が読めない`);
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: Number(m[4]), minute: Number(m[5]) };
}

const pad = (n: number): string => String(n).padStart(2, '0');

export function formatTime(t: SimTime): string {
  return `${String(t.year)}-${pad(t.month)}-${pad(t.day)} ${pad(t.hour)}:${pad(t.minute)}`;
}

const leap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function daysIn(year: number, month: number): number {
  if (month === 2) return leap(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

/** 1 分進める（模型の層は Date を使わず、暦を自分で数える） */
export function nextMinute(t: SimTime): SimTime {
  if (t.minute < 59) return { ...t, minute: t.minute + 1 };
  if (t.hour < 23) return { ...t, hour: t.hour + 1, minute: 0 };
  if (t.day < daysIn(t.year, t.month)) return { ...t, day: t.day + 1, hour: 0, minute: 0 };
  if (t.month < 12) return { ...t, month: t.month + 1, day: 1, hour: 0, minute: 0 };
  return { year: t.year + 1, month: 1, day: 1, hour: 0, minute: 0 };
}

/** 曜日（0 が日曜）。坂本の方法 */
export function weekdayOf(t: SimTime): number {
  const offsets = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
  const y = t.month < 3 ? t.year - 1 : t.year;
  return (y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) + (offsets[t.month - 1] ?? 0) + t.day) % 7;
}

export function matches(e: CronEntry, t: SimTime): boolean {
  if (!e.minute.has(t.minute) || !e.hour.has(t.hour) || !e.month.has(t.month)) return false;
  const day = e.day.has(t.day);
  const week = e.weekday.has(weekdayOf(t));
  if (e.dayStar || e.weekdayStar) return day && week;
  return day || week;
}
