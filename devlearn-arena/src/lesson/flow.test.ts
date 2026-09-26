import { describe, expect, it } from 'vitest';
import { termsIn } from '@/content/glossary';
import { jargonIn } from '@/engines/lesson/glossary';
import { allMissions, mainMissions } from '@/engines/lesson/registry';
import type { LessonDefinition } from '@/engines/lesson/types';
import { hasThing } from './experience/towns';
import { SCENARIOS } from './experience/scenarios';

/**
 * 学びの流れ（CLAUDE.md）。どの任務も「体験 → 登場 → 確かめ → 操作 → 振り返り」の 5 段を持つ。
 * 文章で説明してからコマンドを打たせる作りを、ここで禁じる。
 */

const built: readonly LessonDefinition[] = allMissions().map((m) => m.build());
const main = new Set(mainMissions().map((m) => m.id));

const nonEmpty = (text: string | undefined): boolean => (text ?? '').trim() !== '';

describe('全任務が 5 段を持つ', () => {
  it('体験・登場・確かめ・操作・振り返りがそろっている', () => {
    for (const lesson of built) {
      const where = lesson.id;
      expect({ where, experience: nonEmpty(lesson.experience.goal) && nonEmpty(lesson.experience.trouble) }).toEqual({ where, experience: true });
      expect({ where, reveal: nonEmpty(lesson.reveal.facility) && nonEmpty(lesson.reveal.replaces) }).toEqual({ where, reveal: true });
      expect({ where, terms: lesson.reveal.terms.length > 0 }).toEqual({ where, terms: true });
      expect({ where, quiz: lesson.quiz.length >= 1 && lesson.quiz.length <= 2 }).toEqual({ where, quiz: true });
      expect({ where, steps: lesson.steps.length > 0 }).toEqual({ where, steps: true });
      expect({ where, recap: nonEmpty(lesson.recap.before) && nonEmpty(lesson.recap.after) }).toEqual({ where, recap: true });
      expect({ where, lines: lesson.recap.lines.filter(nonEmpty).length }).toEqual({ where, lines: 3 });
    }
  });

  it('登場の段は「さっき手でやっていたことを代わりにやる」施設として紹介する', () => {
    for (const lesson of built) {
      expect({ id: lesson.id, recalls: lesson.reveal.replaces.includes('さっき') }).toEqual({ id: lesson.id, recalls: true });
    }
  });
});

describe('操作の段', () => {
  it('全手順が purpose（何を確かめるか）と afterward（街で何が起きたか）を持つ', () => {
    for (const lesson of built) {
      lesson.steps.forEach((step, i) => {
        const where = `${lesson.id} の ${String(i + 1)} 手目`;
        expect({ where, purpose: nonEmpty(step.purpose) }).toEqual({ where, purpose: true });
        expect({ where, afterward: nonEmpty(step.afterward) }).toEqual({ where, afterward: true });
      });
    }
  });

  it('目的は 1 行で書く（改行を含まず、長すぎない）', () => {
    for (const lesson of built.filter((l) => main.has(l.id))) {
      for (const step of lesson.steps) {
        expect({ id: lesson.id, line: step.purpose.includes('\n') || step.purpose.length > 60 }).toEqual({ id: lesson.id, line: false });
        expect({ id: lesson.id, line: step.afterward.includes('\n') || step.afterward.length > 70 }).toEqual({ id: lesson.id, line: false });
      }
    }
  });
});

describe('用語は登場の段より前に出さない', () => {
  it('用語辞書の語が、体験の段の文言に出てこない', () => {
    for (const lesson of built.filter((l) => main.has(l.id))) {
      const { title, goal, trouble } = lesson.experience;
      const found = termsIn([title, goal, trouble]).map((t) => t.term);
      expect({ id: lesson.id, found }).toEqual({ id: lesson.id, found: [] });
    }
  });

  it('説明の要る言葉（用語集の common でない語）も、体験の段には出てこない', () => {
    for (const lesson of built.filter((l) => main.has(l.id))) {
      const { title, goal, trouble } = lesson.experience;
      const found = jargonIn([title, goal, trouble].join('\n')).map((c) => c.term);
      expect({ id: lesson.id, found }).toEqual({ id: lesson.id, found: [] });
    }
  });
});

describe('確かめの段', () => {
  it('全任務が 1 問以上のクイズを持ち、そのうち 1 問以上が街の中で答える形である', () => {
    for (const lesson of built) {
      const inTown = lesson.quiz.filter((q) => q.kind === 'pick' || q.kind === 'order').length;
      expect({ id: lesson.id, inTown: inTown >= 1 }).toEqual({ id: lesson.id, inTown: true });
    }
  });

  it('町で押して答えるクイズの答えは、その町に建っている物である', () => {
    for (const lesson of built.filter((l) => main.has(l.id))) {
      for (const quiz of lesson.quiz) {
        if (quiz.kind !== 'pick') continue;
        expect(quiz.answer.length).toBeGreaterThan(0);
        for (const id of quiz.answer) {
          expect({ id: lesson.id, answer: id, exists: hasThing(lesson.experience.kind, id) }).toEqual({
            id: lesson.id,
            answer: id,
            exists: true,
          });
        }
      }
    }
  });

  it('並べるクイズは 3 枚以上、選ぶクイズは答えが選択肢の中にある', () => {
    for (const lesson of built.filter((l) => main.has(l.id))) {
      for (const quiz of lesson.quiz) {
        if (quiz.kind === 'order') expect(quiz.cards.length).toBeGreaterThanOrEqual(3);
        if (quiz.kind === 'choice') expect(quiz.options[quiz.answer]).toBeDefined();
        expect(nonEmpty(quiz.why)).toBe(true);
      }
    }
  });
});

describe('登場の段の矢印', () => {
  it('用語を結ぶ先は、体験の町に建っている物である', () => {
    for (const lesson of built.filter((l) => main.has(l.id))) {
      for (const pointer of lesson.reveal.terms) {
        expect({ id: lesson.id, term: pointer.term, exists: hasThing(lesson.experience.kind, pointer.points) }).toEqual({
          id: lesson.id,
          term: pointer.term,
          exists: true,
        });
      }
    }
  });
});

describe('体験の遊び', () => {
  it('どの任務の遊びも、その分野の町とひねりで遊べる', () => {
    for (const lesson of built.filter((l) => main.has(l.id))) {
      const scenario = SCENARIOS[lesson.experience.twist];
      expect({ id: lesson.id, kind: scenario.kind }).toEqual({ id: lesson.id, kind: lesson.experience.kind });
    }
  });
});
