import { describe, expect, it } from 'vitest';
import { completionXp, practiceXp, quizXp, reviewXp, skillUpXp, troubleshootXp } from './xp';

/** docs/game-design.md 3 章の表と、稼ぎを防ぐ規則・端数（docs/decisions.md D-10） */
const first = { repeat: false };
const again = { repeat: true };

describe('XP の表（docs/game-design.md 3 章）', () => {
  it('レッスンのまとめまで到達（初回）: 初級 30 / 中級 50 / 上級 80', () => {
    expect(completionXp('b', first)).toBe(30);
    expect(completionXp('i', first)).toBe(50);
    expect(completionXp('a', first)).toBe(80);
  });

  it('クイズに初回で正解 5、2 回目以降で正解 2（1 問ごと）。誤答は 0', () => {
    expect(quizXp({ correct: true, tryNo: 1, alreadyCorrect: false }, first)).toBe(5);
    expect(quizXp({ correct: true, tryNo: 2, alreadyCorrect: false }, first)).toBe(2);
    expect(quizXp({ correct: true, tryNo: 3, alreadyCorrect: false }, first)).toBe(2);
    expect(quizXp({ correct: false, tryNo: 1, alreadyCorrect: false }, first)).toBe(0);
  });

  it('実戦を成功（ヒント無し）: 初級 20 / 中級 35 / 上級 55。失敗は 0', () => {
    expect(practiceXp({ difficulty: 'b', success: true, hintsUsed: 0 }, first)).toBe(20);
    expect(practiceXp({ difficulty: 'i', success: true, hintsUsed: 0 }, first)).toBe(35);
    expect(practiceXp({ difficulty: 'a', success: true, hintsUsed: 0 }, first)).toBe(55);
    expect(practiceXp({ difficulty: 'a', success: false, hintsUsed: 0 }, first)).toBe(0);
  });

  it('実戦を成功（ヒントあり）は上の半分。上級は 27.5 → 28（四捨五入）', () => {
    expect(practiceXp({ difficulty: 'b', success: true, hintsUsed: 1 }, first)).toBe(10);
    expect(practiceXp({ difficulty: 'i', success: true, hintsUsed: 3 }, first)).toBe(18);
    expect(practiceXp({ difficulty: 'a', success: true, hintsUsed: 2 }, first)).toBe(28);
  });

  it('エラーから自力で回復して成功すると +10。回復しても失敗なら 0', () => {
    expect(troubleshootXp({ success: true, recoveredFromError: true }, first)).toBe(10);
    expect(troubleshootXp({ success: true, recoveredFromError: false }, first)).toBe(0);
    expect(troubleshootXp({ success: false, recoveredFromError: true }, first)).toBe(0);
  });

  it('スキルが次の段階に上がると 50（上がった段の数だけ）', () => {
    expect(skillUpXp(0, 1)).toBe(50);
    expect(skillUpXp(1, 3)).toBe(100);
    expect(skillUpXp(2, 2)).toBe(0);
    expect(skillUpXp(3, 2)).toBe(0);
  });

  it('復習は予定日（以降）に正解すると 10。予定日の前や誤答は 0', () => {
    expect(reviewXp({ correct: true, due: '2026-10-03', day: '2026-10-03' })).toBe(10);
    expect(reviewXp({ correct: true, due: '2026-10-03', day: '2026-10-05' })).toBe(10);
    expect(reviewXp({ correct: true, due: '2026-10-03', day: '2026-10-02' })).toBe(0);
    expect(reviewXp({ correct: false, due: '2026-10-03', day: '2026-10-03' })).toBe(0);
  });
});

describe('稼ぎを防ぐ規則（docs/game-design.md 3 章）', () => {
  it('同じレッスンを 2 回目以降に終えても、まとめの XP は 0', () => {
    for (const d of ['b', 'i', 'a'] as const) expect(completionXp(d, again)).toBe(0);
  });

  it('2 回目以降はクイズと実戦が 1/4。端数は行動ごとに四捨五入（5 ÷ 4 = 1.25 → 1、2 ÷ 4 = 0.5 → 1）', () => {
    expect(quizXp({ correct: true, tryNo: 1, alreadyCorrect: false }, again)).toBe(1);
    expect(quizXp({ correct: true, tryNo: 2, alreadyCorrect: false }, again)).toBe(1);
    expect(practiceXp({ difficulty: 'b', success: true, hintsUsed: 0 }, again)).toBe(5);
    expect(practiceXp({ difficulty: 'i', success: true, hintsUsed: 0 }, again)).toBe(9);
    expect(practiceXp({ difficulty: 'a', success: true, hintsUsed: 0 }, again)).toBe(14);
    expect(practiceXp({ difficulty: 'a', success: true, hintsUsed: 1 }, again)).toBe(7);
    expect(troubleshootXp({ success: true, recoveredFromError: true }, again)).toBe(3);
  });

  it('3 回以上の誤答の後に正解した問題（総当たり）は 0', () => {
    expect(quizXp({ correct: true, tryNo: 3, alreadyCorrect: false }, first)).toBe(2);
    expect(quizXp({ correct: true, tryNo: 4, alreadyCorrect: false }, first)).toBe(0);
    expect(quizXp({ correct: true, tryNo: 9, alreadyCorrect: false }, first)).toBe(0);
  });

  it('同じ回で既に正解した問題に、もう一度正解しても 0', () => {
    expect(quizXp({ correct: true, tryNo: 2, alreadyCorrect: true }, first)).toBe(0);
  });
});
