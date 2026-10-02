import { DOMAINS } from '@/city/facilityInfo';
import { DIFFICULTY_NAMES, lessonMeta } from '@/game/lessons';
import { dayOf } from '@/game/time';
import type { Progress, XpEvent } from '@/game/types';
import { XP_TABLE } from '@/game/xp';

/**
 * 成長画面の学習履歴（docs/game-design.md 9 章: いつ・何を・どれだけ理解したか）。
 * レッスンは日ごとに 1 行にまとめ、クイズの初回正解・実戦の結果・まとめまで行ったかを添える。
 */

export interface HistoryEntry {
  key: string;
  /** 時刻（HH:MM） */
  time: string;
  title: string;
  /** 初級・中級・上級 / 復習 / ミッション / スキル */
  tag: string;
  /** どれだけ理解したか */
  details: string[];
  xp: number;
}

export interface HistoryDay {
  day: string;
  label: string;
  xp: number;
  entries: HistoryEntry[];
}

const domainName = (id: string): string => DOMAINS.find((d) => d.id === id)?.name ?? id;

export function historyOf(progress: Progress): HistoryDay[] {
  type Draft = HistoryEntry & { at: string };
  const byDay = new Map<string, Map<string, Draft>>();
  const entry = (at: string, key: string, make: () => Omit<Draft, 'at' | 'time' | 'key' | 'xp' | 'details'>): Draft => {
    const day = dayOf(at);
    const days = byDay.get(day) ?? new Map<string, Draft>();
    byDay.set(day, days);
    let e = days.get(key);
    if (!e) {
      e = { ...make(), key: `${day}|${key}`, at, time: at.slice(11, 16), details: [], xp: 0 };
      days.set(key, e);
    }
    if (at > e.at) {
      e.at = at;
      e.time = at.slice(11, 16);
    }
    return e;
  };

  for (const lp of Object.values(progress.lessons)) {
    const meta = lessonMeta(lp.lessonId);
    const make = () => ({ title: meta?.title ?? lp.lessonId, tag: meta ? DIFFICULTY_NAMES[meta.difficulty] : '' });
    const days = new Set([...lp.quiz.map((q) => dayOf(q.at)), ...lp.practice.map((p) => dayOf(p.at))]);
    for (const day of days) {
      const quiz = lp.quiz.filter((q) => dayOf(q.at) === day && q.tryNo === 1);
      const practice = lp.practice.filter((p) => dayOf(p.at) === day);
      const last = [...lp.quiz.filter((q) => dayOf(q.at) === day), ...practice].map((x) => x.at).sort().at(-1);
      if (!last) continue;
      const e = entry(last, lp.lessonId, make);
      if (quiz.length > 0) e.details.push(`クイズ 初回正解 ${String(quiz.filter((q) => q.correct).length)} / ${String(quiz.length)} 問`);
      const ok = practice.filter((p) => p.success);
      if (ok.length > 0) {
        const hints = Math.min(...ok.map((p) => p.hintsUsed));
        e.details.push(hints === 0 ? '実戦 ヒント無しで成功' : `実戦 ヒント ${String(hints)} 段で成功`);
        if (ok.some((p) => p.recoveredFromError)) e.details.push('エラーから自力で回復');
      } else if (practice.length > 0) e.details.push(`実戦 ${String(practice.length)} 回挑戦（まだ成功していない）`);
    }
  }

  for (const ev of progress.xpLog) addEvent(ev);
  function addEvent(ev: XpEvent): void {
    switch (ev.source) {
      case 'lesson-complete':
      case 'quiz':
      case 'practice':
      case 'troubleshoot': {
        const meta = lessonMeta(ev.ref);
        const e = entry(ev.at, ev.ref, () => ({ title: meta?.title ?? ev.ref, tag: meta ? DIFFICULTY_NAMES[meta.difficulty] : '' }));
        e.xp += ev.amount;
        if (ev.source === 'lesson-complete' && !e.details.includes('まとめまで到達')) e.details.unshift('まとめまで到達');
        break;
      }
      case 'review': {
        const lessonId = ev.ref.replace(/^review\./, '');
        const e = entry(ev.at, `review|${ev.ref}`, () => ({ title: lessonMeta(lessonId)?.title ?? lessonId, tag: '復習' }));
        e.xp += ev.amount;
        if (e.details.length === 0) e.details.push('予定日に正解');
        break;
      }
      case 'mission': {
        const e = entry(ev.at, `mission|${ev.ref}`, () => ({ title: ev.ref, tag: 'ミッション' }));
        e.xp += ev.amount;
        if (e.details.length === 0) e.details.push('達成');
        break;
      }
      case 'skill-up': {
        const steps = Math.max(1, Math.round(ev.amount / XP_TABLE.skillUp));
        const e = entry(ev.at, `skill|${ev.ref}|${ev.at}`, () => ({ title: `${domainName(ev.ref)} の段階が ${String(steps)} 段上がった`, tag: 'スキル' }));
        e.xp += ev.amount;
        break;
      }
    }
  }

  // 2 回目の修了など、XP の無いまとめも履歴に残す
  for (const lp of Object.values(progress.lessons)) {
    if (!lp.completedAt) continue;
    const e = byDay.get(dayOf(lp.completedAt))?.get(lp.lessonId);
    if (!e) continue;
    if (!e.details.includes('まとめまで到達')) e.details.unshift('まとめまで到達');
    if (lp.completedAt > e.at) {
      e.at = lp.completedAt;
      e.time = lp.completedAt.slice(11, 16);
    }
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([day, entries]) => {
      const list: HistoryEntry[] = [...entries.values()].sort((a, b) => (a.at < b.at ? 1 : -1)).map((e) => ({ key: e.key, time: e.time, title: e.title, tag: e.tag, details: e.details, xp: e.xp }));
      const [, m, d] = day.split('-');
      return { day, label: `${String(Number(m))}月${String(Number(d))}日`, xp: list.reduce((s, e) => s + e.xp, 0), entries: list };
    });
}
