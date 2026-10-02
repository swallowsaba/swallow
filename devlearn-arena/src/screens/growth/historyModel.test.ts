import { describe, expect, it } from 'vitest';
import { LESSONS } from '@/game/lessons';
import { emptyProgress } from '@/game/progress';
import { applyRecords, type LearningRecord } from '@/game/records';
import { historyOf } from './historyModel';

/** Linux の初級 1 本: q2 を 1 度誤ってから正解・実戦はヒント 1 段で成功・まとめまで */
const run = (at: string): LearningRecord => ({
  kind: 'lesson', lessonId: 'linux.b.01', at,
  quiz: [
    { quizId: 'q1', correct: true }, { quizId: 'q2', correct: false }, { quizId: 'q2', correct: true },
    { quizId: 'q3', correct: true }, { quizId: 'q4', correct: true },
  ],
  practice: [{ success: true, hintsUsed: 1 }],
  complete: true,
});

const learn = (records: LearningRecord[]) => applyRecords(emptyProgress(), records, LESSONS).progress;

describe('成長画面の学習履歴（docs/game-design.md 9 章: いつ・何を・どれだけ理解したか）', () => {
  it('記録が無ければ空', () => {
    expect(historyOf(emptyProgress())).toEqual([]);
  });

  it('1 つのレッスンの回を 1 行にまとめ、クイズの初回正解・実戦の結果・まとめまで到達を添える', () => {
    const days = historyOf(learn([run('2026-10-02T19:00:00+09:00')]));
    expect(days).toHaveLength(1);
    expect(days[0]?.label).toBe('10月2日');
    const lesson = days[0]?.entries.find((e) => e.tag === '初級');
    expect(lesson?.title).toBe(LESSONS.find((l) => l.id === 'linux.b.01')?.title);
    expect(lesson?.details).toEqual(['まとめまで到達', 'クイズ 初回正解 3 / 4 問', '実戦 ヒント 1 段で成功']);
    // クイズ 5×3 + 2・実戦 20 の半分・まとめ 30
    expect(lesson?.xp).toBe(15 + 2 + 10 + 30);
  });

  it('スキルの段階が上がった事も 1 行で残し、その日の XP の合計は得た XP と一致する', () => {
    const progress = learn([run('2026-10-02T19:00:00+09:00')]);
    const [day] = historyOf(progress);
    expect(day?.entries.some((e) => e.tag === 'スキル' && e.title === 'Linux / CLI の段階が 1 段上がった')).toBe(true);
    expect(day?.xp).toBe(progress.xp);
  });

  it('日ごとに分け、新しい日を上にする。2 回目の修了は XP が少なくても「まとめまで到達」が残る', () => {
    const progress = learn([run('2026-10-01T19:00:00+09:00'), run('2026-10-02T19:00:00+09:00')]);
    const days = historyOf(progress);
    expect(days.map((d) => d.label)).toEqual(['10月2日', '10月1日']);
    const again = days[0]?.entries.find((e) => e.tag === '初級');
    expect(again?.details[0]).toBe('まとめまで到達');
    // 2 回目以降: まとめ 0・クイズと実戦は 1/4（初回正解 1×3・2 回目の正解 1・ヒントありの実戦 10÷4 = 2.5 → 3）
    expect(again?.xp).toBe(3 + 1 + 3);
    expect(days.reduce((s, d) => s + d.xp, 0)).toBe(progress.xp);
  });

  it('同じ日に同じレッスンを繰り返しても XP は 1 回分。履歴の行は 1 つのまま', () => {
    const progress = learn([run('2026-10-02T19:00:00+09:00'), run('2026-10-02T21:00:00+09:00')]);
    const [day] = historyOf(progress);
    expect(day?.entries.filter((e) => e.tag === '初級')).toHaveLength(1);
    expect(day?.entries.find((e) => e.tag === '初級')?.time).toBe('21:07');
    expect(day?.xp).toBe(progress.xp);
  });

  it('復習とミッションは、それぞれの印を付けて残す', () => {
    const progress = learn([
      run('2026-10-01T19:00:00+09:00'),
      { kind: 'review', cardId: 'review.linux.b.01', correct: true, at: '2026-10-02T08:00:00+09:00' },
      { kind: 'mission', missionId: 'mission.web-server', xp: 200, funds: 300, at: '2026-10-02T09:00:00+09:00' },
    ]);
    const [day] = historyOf(progress);
    expect(day?.entries.map((e) => [e.tag, e.xp, e.details[0]])).toEqual([
      ['ミッション', 200, '達成'],
      ['復習', 10, '予定日に正解'],
    ]);
  });
});
