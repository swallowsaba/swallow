import { useState } from 'react';
import type { Lesson } from '@/content/schema';
import { explainPages } from '@/learning/lessonFlow';
import { Rich } from '../Rich';
import { Figure } from './Figure';
import { Slot, StepButtons, type OnTerm } from './widgets';

/**
 * 解説（docs/learning-design.md 3 章）。何か → なぜ必要か → 何に使うか → どんな場面で使うか を 1 画面ずつ。
 * 状況説明があれば、最後にその場面を示す。右に図。コマンドを打たせない。
 */
export function ExplainStage({ lesson, onTerm, right, action, onDone }: {
  lesson: Lesson;
  onTerm: OnTerm;
  right: HTMLElement | null;
  action: HTMLElement | null;
  onDone: () => void;
}) {
  const pages = explainPages(lesson.explain);
  const [i, setI] = useState(0);
  const page = pages[i] ?? pages[0];
  if (!page) return null;
  const last = i === pages.length - 1;
  return (
    <section className="stage stage-explain" aria-label="解説" data-testid="stage-explain">
      <p className="stage-goal"><span className="stage-goal-label">到達目標</span><Rich text={lesson.goal} onTerm={onTerm} /></p>
      <nav className="stage-pages" aria-label="解説の問い">
        {pages.map((p, k) => (
          <button key={p.key} type="button" className={`stage-page${k === i ? ' is-current' : ''}${k < i ? ' is-done' : ''}`} aria-current={k === i ? 'step' : undefined} onClick={() => setI(k)}>
            <span className="num">{k + 1}</span>{p.title}
          </button>
        ))}
      </nav>
      <h2 className="stage-heading" data-testid="explain-title">{page.title}</h2>
      <p className="stage-text" data-testid="explain-text"><Rich text={page.text} onTerm={onTerm} /></p>
      <Slot to={right}>
        <Figure id={page.figure} />
      </Slot>
      <Slot to={action}>
        <StepButtons
          onBack={i > 0 ? () => setI(i - 1) : undefined}
          onNext={last ? onDone : () => setI(i + 1)}
          nextLabel={last ? '理解を確かめる' : `次へ（${pages[i + 1]?.title ?? ''}）`}
        />
      </Slot>
    </section>
  );
}
