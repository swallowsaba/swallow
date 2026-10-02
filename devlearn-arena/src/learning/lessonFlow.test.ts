import { describe, expect, it } from 'vitest';
import { loadLesson } from '@/content/lessons';
import type { Lesson, QuizItem, UnderstandItem } from '@/content/schema';
import { LESSONS } from '@/game/lessons';
import { answerQuiz, emptyProgress, enterLesson, reachStage } from '@/game/progress';
import {
  choiceOrder, explainPages, judgeQuiz, judgeUnderstand, openStages, resumeQuiz, resumeStage, shuffled, solvedQuiz, STAGE_NAMES, STAGES, triesOf,
} from './lessonFlow';

const DAY1 = '2026-10-02T19:00:00+09:00';
const at = (min: number): string => `2026-10-02T19:${String(min).padStart(2, '0')}:00+09:00`;

async function lesson(id: string): Promise<Lesson> {
  const l = await loadLesson(id);
  if (!l) throw new Error(id);
  return l;
}

describe('7 段（docs/learning-design.md 2 章）', () => {
  it('解説 → 理解 → クイズ → 実戦 → 結果 → まとめ → XP / スキル の順', () => {
    expect(STAGES.map((s) => STAGE_NAMES[s])).toEqual(['解説', '理解', 'クイズ', '実戦', '結果', 'まとめ', 'XP / スキル']);
  });

  it('進んだ段までは戻って見られ、その先は開かない', () => {
    expect(openStages('explain')).toEqual(['explain']);
    expect(openStages('quiz')).toEqual(['explain', 'understand', 'quiz']);
  });
});

describe('解説（docs/learning-design.md 3 章）', () => {
  it('何か → なぜ必要か → 何に使うか → どんな場面で使うか の順に 1 画面ずつ。状況説明は最後に', async () => {
    const pages = explainPages((await lesson('found.b.04')).explain);
    expect(pages.map((p) => p.title)).toEqual(['何か', 'なぜ必要か', '何に使うか', 'どんな場面で使うか', 'こんな場面']);
    for (const p of pages) expect(p.figure).toBe('found-b04-tree');
  });

  it('状況説明が無ければ 4 画面', async () => {
    const explain = { ...(await lesson('linux.i.01')).explain };
    delete explain.situation;
    expect(explainPages(explain).map((p) => p.key)).toEqual(['what', 'why', 'use', 'when']);
  });
});

describe('並びを混ぜる', () => {
  it('同じ seed からは同じ順。正しい順のままにはしない。中身は変えない', () => {
    const items = ['a', 'b', 'c', 'd'];
    expect(shuffled(items, 'x.q1')).toEqual(shuffled(items, 'x.q1'));
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) {
      const s = shuffled(items, seed);
      expect(s).not.toEqual(items);
      expect([...s].sort()).toEqual(items);
    }
    expect(shuffled(['a', 'b'], 'any')).toEqual(['b', 'a']);
  });
});

describe('理解の判定（採点しない。docs/learning-design.md 4 章）', () => {
  const see = 'use' as const;
  it('図の一部を押す: 正しい部分だけを押したら正解。違えば押した違う部分と、見直す解説の箇所', () => {
    const item: UnderstandItem = { kind: 'figure-pick', figure: 'f', prompt: 'p', answer: ['minato'], see };
    expect(judgeUnderstand(item, { kind: 'figure-pick', parts: ['minato'] })).toEqual({ correct: true, wrong: [], see: null });
    expect(judgeUnderstand(item, { kind: 'figure-pick', parts: ['home'] })).toEqual({ correct: false, wrong: ['home'], see });
  });

  it('順番に並べる: 位置の違う物を返す', () => {
    const item: UnderstandItem = { kind: 'order', prompt: 'p', items: ['1', '2', '3'] };
    expect(judgeUnderstand(item, { kind: 'order', items: ['1', '2', '3'] }).correct).toBe(true);
    expect(judgeUnderstand(item, { kind: 'order', items: ['1', '3', '2'] })).toEqual({ correct: false, wrong: ['3', '2'], see: null });
  });

  it('状況説明・はい／いいえ・関係性', () => {
    const s: UnderstandItem = { kind: 'situation', prompt: 'p', choices: [{ id: 'a', text: 'x', correct: true }, { id: 'b', text: 'y', correct: false, whyNot: 'z' }] };
    expect(judgeUnderstand(s, { kind: 'situation', choiceId: 'a' }).correct).toBe(true);
    expect(judgeUnderstand(s, { kind: 'situation', choiceId: 'b' }).wrong).toEqual(['b']);
    const y: UnderstandItem = { kind: 'yesno', prompt: 'p', answer: false, why: 'w', see: 'situation' };
    expect(judgeUnderstand(y, { kind: 'yesno', value: false }).correct).toBe(true);
    expect(judgeUnderstand(y, { kind: 'yesno', value: true }).see).toBe('situation');
    const r: UnderstandItem = { kind: 'relation', prompt: 'p', a: 'a', b: 'b', answer: 'cause', why: 'w' };
    expect(judgeUnderstand(r, { kind: 'relation', value: 'cause' }).correct).toBe(true);
    expect(judgeUnderstand(r, { kind: 'relation', value: 'before' }).correct).toBe(false);
  });

  it('用語と説明を結ぶ: 全て正しく結んだら正解。違う組の左を返す', () => {
    const item: UnderstandItem = { kind: 'match', prompt: 'p', pairs: [['A', '1'], ['B', '2'], ['C', '3']] };
    expect(judgeUnderstand(item, { kind: 'match', pairs: [['C', '3'], ['A', '1'], ['B', '2']] }).correct).toBe(true);
    expect(judgeUnderstand(item, { kind: 'match', pairs: [['A', '2'], ['B', '1'], ['C', '3']] }).wrong).toEqual(['A', 'B']);
    expect(judgeUnderstand(item, { kind: 'match', pairs: [['A', '1']] }).correct).toBe(false);
  });

  it('答えの形が問題と違えば誤りとして落とす', () => {
    expect(() => judgeUnderstand({ kind: 'yesno', prompt: 'p', answer: true, why: 'w' }, { kind: 'relation', value: 'cause' })).toThrow();
  });
});

describe('クイズの判定（docs/learning-design.md 5 章）', () => {
  const choice: QuizItem = {
    id: 'q', kind: 'choice', prompt: 'p', explanation: 'e',
    choices: [{ id: 'a', text: 'A', correct: true }, { id: 'b', text: 'B', correct: false, whyNot: 'なぜ違うか' }],
  };

  it('正答を選べば正解。誤答を選べば、その選択肢（なぜ違うか付き）を返す', () => {
    expect(judgeQuiz(choice, { choiceIds: ['a'] }).correct).toBe(true);
    const j = judgeQuiz(choice, { choiceIds: ['b'] });
    expect(j.correct).toBe(false);
    expect(j.wrongPicked.map((c) => c.whyNot)).toEqual(['なぜ違うか']);
    expect(judgeQuiz(choice, { choiceIds: [] }).correct).toBe(false);
  });

  it('複数選択: 正答を全て、誤答を選ばずに選んだ時だけ正解', () => {
    const multi: QuizItem = {
      ...choice, kind: 'multi',
      choices: [{ id: 'a', text: 'A', correct: true }, { id: 'b', text: 'B', correct: true }, { id: 'c', text: 'C', correct: false, whyNot: 'w' }],
    };
    expect(judgeQuiz(multi, { choiceIds: ['b', 'a'] }).correct).toBe(true);
    expect(judgeQuiz(multi, { choiceIds: ['a'] }).missed.map((c) => c.id)).toEqual(['b']);
    expect(judgeQuiz(multi, { choiceIds: ['a', 'b', 'c'] }).correct).toBe(false);
  });

  it('並べ替え: 正しい順の時だけ正解。位置の違う手順を返す', () => {
    const order: QuizItem = { id: 'q', kind: 'order', prompt: 'p', explanation: 'e', order: ['1', '2', '3'] };
    expect(judgeQuiz(order, { order: ['1', '2', '3'] }).correct).toBe(true);
    expect(judgeQuiz(order, { order: ['2', '1', '3'] }).misplaced).toEqual(['2', '1']);
  });

  it('見本の 2 本の全ての問題: 正答を選べば正解、どの誤答を選んでも不正解', async () => {
    for (const id of ['found.b.04', 'linux.i.01']) {
      for (const q of (await lesson(id)).quiz) {
        if (q.kind === 'order') {
          expect(judgeQuiz(q, { order: q.order ?? [] }).correct).toBe(true);
          continue;
        }
        const choices = q.choices ?? [];
        expect(judgeQuiz(q, { choiceIds: choices.filter((c) => c.correct).map((c) => c.id) }).correct, `${id} ${q.id}`).toBe(true);
        for (const c of choices.filter((x) => !x.correct)) expect(judgeQuiz(q, { choiceIds: [c.id] }).correct, `${id} ${q.id} ${c.id}`).toBe(false);
      }
    }
  });
});

describe('選択肢を出す順', () => {
  it('見本の 2 本で、正答がいつも同じ位置に来ない。同じ問題はいつも同じ順', async () => {
    const firsts: boolean[] = [];
    for (const id of ['found.b.04', 'linux.i.01']) {
      for (const q of (await lesson(id)).quiz) {
        const shown = choiceOrder(q.choices ?? [], `${id}.${q.id}`);
        expect(shown).toEqual(choiceOrder(q.choices ?? [], `${id}.${q.id}`));
        expect([...shown].map((c) => c.id).sort()).toEqual((q.choices ?? []).map((c) => c.id).sort());
        firsts.push(shown[0]?.correct === true);
      }
    }
    expect(firsts.some((x) => x)).toBe(true);
    expect(firsts.some((x) => !x)).toBe(true);
  });
});

describe('途中から続ける（docs/learning-design.md 2 章）', () => {
  it('学習中なら進んだ段から、クイズは今の回でまだ正解していない最初の問題から', async () => {
    const l = await lesson('found.b.04');
    let p = enterLesson(emptyProgress(), l.id, DAY1);
    expect(resumeStage(p.lessons[l.id])).toBe('explain');
    p = reachStage(p, l.id, 'quiz');
    p = answerQuiz(p, { lessonId: l.id, quizId: 'q1', choiceIds: ['a'], correct: true }, at(5), LESSONS).progress;
    p = answerQuiz(p, { lessonId: l.id, quizId: 'q2', choiceIds: ['b'], correct: false }, at(6), LESSONS).progress;
    const lp = p.lessons[l.id];
    expect(resumeStage(lp)).toBe('quiz');
    expect(resumeQuiz(l, lp)).toBe(1);
    expect([...solvedQuiz(lp)]).toEqual(['q1']);
    expect(triesOf(lp, 'q2')).toBe(1);
  });

  it('前の回の答えは数えない。修了したレッスンは解説から', async () => {
    const l = await lesson('found.b.04');
    let p = enterLesson(emptyProgress(), l.id, DAY1);
    p = answerQuiz(p, { lessonId: l.id, quizId: 'q1', choiceIds: ['a'], correct: true }, at(5), LESSONS).progress;
    const lp = p.lessons[l.id];
    if (!lp) throw new Error('記録が無い');
    const done = { ...lp, status: 'completed' as const, stage: 'done' as const };
    expect(resumeStage(done)).toBe('explain');
    expect(solvedQuiz(done).size).toBe(0);
    const next = { ...lp, startedAt: at(30) };
    expect(resumeQuiz(l, next)).toBe(0);
  });
});
