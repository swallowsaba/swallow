import type { CSSProperties } from 'react';
import { entryOf } from '@/content/catalog';
import { termOf } from '@/content/glossary';
import type { Lesson } from '@/content/schema';
import { Rich } from '../Rich';
import { Figure } from './Figure';
import { Slot, StepButtons, type OnTerm } from './widgets';

/**
 * まとめ（docs/learning-design.md 2 章）。要点 3 つ以内・次に学ぶとよいこと・関連用語。解説の繰り返しにしない。
 */
export function SummaryStage({ lesson, onTerm, onLesson, right, action, onBack, onNext }: {
  lesson: Lesson;
  onTerm: OnTerm;
  onLesson: (id: string) => void;
  right: HTMLElement | null;
  action: HTMLElement | null;
  onBack: () => void;
  onNext: () => void;
}) {
  const s = lesson.summary;
  return (
    <section className="stage stage-summary" aria-label="まとめ" data-testid="stage-summary">
      <h2 className="stage-heading">まとめ</h2>
      <ol className="summary-points">
        {s.points.map((pt, i) => (
          <li key={i} className="summary-point">
            <span className="summary-point-no num">{i + 1}</span>
            <span><Rich text={pt ?? ''} onTerm={onTerm} /></span>
          </li>
        ))}
      </ol>

      <h3 className="stage-subheading">次に学ぶとよい</h3>
      <ul className="summary-next">
        {s.next.map((id) => {
          const e = entryOf(id);
          if (!e) return null;
          return (
            <li key={id}>
              <button type="button" className="lesson-link" style={{ '--c': `var(--domain-${e.domain})` } as CSSProperties} onClick={() => onLesson(id)} title="入口の札を開く">
                <span className="lesson-link-swatch" />
                {e.title}
              </button>
              <span className="summary-next-goal">{e.goal}</span>
            </li>
          );
        })}
      </ul>

      <h3 className="stage-subheading">関連用語</h3>
      <p className="summary-terms">
        {s.terms.map((id) => (
          <button key={id} type="button" className="summary-term" onClick={(ev) => onTerm(id, ev.currentTarget)}>
            {termOf(id)?.word ?? id}
          </button>
        ))}
      </p>

      <Slot to={right}>
        <Figure id={lesson.explain.figures[0] ?? ''} />
      </Slot>
      <Slot to={action}>
        <StepButtons onBack={onBack} backLabel="結果へ戻る" onNext={onNext} nextLabel="XP / スキルを見る" />
      </Slot>
    </section>
  );
}
