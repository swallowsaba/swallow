import { useMemo, useState } from 'react';
import type { Lesson, QuizItem } from '@/content/schema';
import type { Outcome } from '@/game/progress';
import type { LessonProgress } from '@/game/types';
import { choiceOrder, isMulti, judgeQuiz, resumeQuiz, shuffled, solvedQuiz, triesOf, type QuizJudge } from '@/learning/lessonFlow';
import { Rich } from '../Rich';
import { Figure } from './Figure';
import { ChoiceList, Feedback, OrderPicker, Slot, StepButtons, type ChoiceView, type OnTerm } from './widgets';

/**
 * クイズ（docs/learning-design.md 5 章）。1 問ずつ答え、判定する。
 * 誤答には「なぜ違うか」を添えて、もう一度答えられる。正答には「なぜ正しいか」と、ほかの選択肢がなぜ違うかを添える。
 * XP は src/game の規則で決まる（初回の正解 5・2 回目以降 2・総当たりは 0）。
 */

const QUIZ_KIND_NAMES: Record<QuizItem['kind'], string> = {
  choice: '選択',
  multi: '複数選択',
  situation: '状況判断',
  cause: '原因特定',
  predict: '結果予測',
  term: '用語理解',
  order: '並べ替え',
};

export function QuizStage({ lesson, lp, onTerm, right, action, onAnswer, onDone }: {
  lesson: Lesson;
  lp: LessonProgress | undefined;
  onTerm: OnTerm;
  right: HTMLElement | null;
  action: HTMLElement | null;
  onAnswer: (quizId: string, choiceIds: string[], correct: boolean) => Outcome;
  onDone: () => void;
}) {
  const [i, setI] = useState(() => resumeQuiz(lesson, lp));
  const solved = solvedQuiz(lp);
  const q = lesson.quiz[i];
  if (!q) return null;
  const last = i === lesson.quiz.length - 1;
  return (
    <section className="stage stage-quiz" aria-label="クイズ" data-testid="stage-quiz">
      <p className="stage-count">
        <span className="stage-kind">{QUIZ_KIND_NAMES[q.kind]}</span>
        <span className="num">{i + 1} / {lesson.quiz.length}</span>
        <span className="stage-dots" aria-label="答えた問題">
          {lesson.quiz.map((x) => <span key={x.id} className={`stage-dot${solved.has(x.id) ? ' is-ok' : ''}${x.id === q.id ? ' is-current' : ''}`} />)}
        </span>
      </p>
      <QuestionView key={`${lesson.id}-${q.id}`} lesson={lesson} q={q} lp={lp} solvedBefore={solved.has(q.id)} onTerm={onTerm} right={right} onAnswer={onAnswer} />
      <Slot to={action}>
        <StepButtons
          onBack={i > 0 ? () => setI(i - 1) : undefined}
          onNext={last ? onDone : () => setI(i + 1)}
          nextEnabled={solved.has(q.id)}
          nextLabel={last ? '実戦へ' : '次の問題へ'}
        />
      </Slot>
    </section>
  );
}

function QuestionView({ lesson, q, lp, solvedBefore, onTerm, right, onAnswer }: {
  lesson: Lesson;
  q: QuizItem;
  lp: LessonProgress | undefined;
  solvedBefore: boolean;
  onTerm: OnTerm;
  right: HTMLElement | null;
  onAnswer: (quizId: string, choiceIds: string[], correct: boolean) => Outcome;
}) {
  const multi = isMulti(q);
  const correctIds = (q.choices ?? []).filter((c) => c.correct).map((c) => c.id);
  // 前に正解した問題は、正解の形で見せる（途中から続けた時・戻って見た時）
  const [picked, setPicked] = useState<string[]>(solvedBefore ? correctIds : []);
  const [order, setOrder] = useState<string[]>(solvedBefore ? [...(q.order ?? [])] : []);
  const [judge, setJudge] = useState<QuizJudge | null>(solvedBefore ? judgeQuiz(q, { choiceIds: correctIds, order: q.order ?? [] }) : null);
  const [xp, setXp] = useState<number | null>(null);
  const pool = useMemo(() => (q.kind === 'order' ? shuffled(q.order ?? [], `${lesson.id}.${q.id}`) : []), [q, lesson.id]);
  const done = judge?.correct === true;
  const tries = triesOf(lp, q.id);

  const submit = (): void => {
    const j = judgeQuiz(q, { choiceIds: picked, order });
    setJudge(j);
    const outcome = onAnswer(q.id, q.kind === 'order' ? order : picked, j.correct);
    const gained = outcome.events.filter((e) => e.source === 'quiz').reduce((s, e) => s + e.amount, 0);
    if (j.correct) setXp(gained);
  };

  const shown = useMemo(() => choiceOrder(q.choices ?? [], `${lesson.id}.${q.id}`), [q, lesson.id]);
  const views: ChoiceView[] = shown.map((c) => {
    const on = picked.includes(c.id);
    if (!judge) return { id: c.id, text: c.text };
    if (judge.correct) return { id: c.id, text: c.text, mark: c.correct ? 'ok' : undefined, note: c.correct ? undefined : c.whyNot };
    // 誤答の後: 選んだ誤答に「なぜ違うか」
    return { id: c.id, text: c.text, mark: on && !c.correct ? 'bad' : undefined, note: on && !c.correct ? c.whyNot : undefined };
  });

  return (
    <div className="question" data-testid="quiz-question" data-quiz={q.id}>
      <p className="stage-prompt"><Rich text={q.prompt} onTerm={onTerm} /></p>
      {q.context?.command ? <pre className="quiz-command" data-testid="quiz-command"><span className="quiz-prompt-mark">$</span> {q.context.command}</pre> : null}
      {q.context?.log ? <pre className="quiz-log" data-testid="quiz-log">{q.context.log}</pre> : null}

      {q.kind === 'order' ? (
        <OrderPicker label="手順を正しい順に並べる" pool={pool} order={order} onChange={(o) => { setOrder(o); if (!done) setJudge(null); }} wrong={judge && !judge.correct ? judge.misplaced : []} done={done} />
      ) : (
        <ChoiceList
          label="選択肢"
          choices={views}
          picked={picked}
          multi={multi}
          answered={done}
          onToggle={(id) => {
            if (judge && !judge.correct) setJudge(null);
            setPicked(multi ? (picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]) : [id]);
          }}
          onTerm={onTerm}
        />
      )}
      {multi && !done ? <p className="stage-hint">当てはまる物を全て選ぶ</p> : null}

      {!done ? (
        <button
          type="button"
          className="stage-check"
          data-testid="quiz-submit"
          disabled={q.kind === 'order' ? order.length !== pool.length : picked.length === 0 || judge !== null}
          onClick={submit}
        >
          答える
        </button>
      ) : null}

      {judge && !judge.correct ? (
        <Feedback ok={false} title={tries >= 3 ? 'ここは手掛かりを読んでから選ぼう' : 'もう一度考えてみよう'}>
          {judge.missed.length > 0 && judge.wrongPicked.length === 0 ? <p className="feedback-text">まだ選んでいない正しい物がある。</p> : null}
          {q.kind === 'order' ? <p className="feedback-text">印の付いた手順の位置が違う。札を押して外し、並べ直そう。</p> : <p className="feedback-text">選び直して、もう一度答えよう。</p>}
        </Feedback>
      ) : null}
      {done ? (
        <Feedback ok title={xp && xp > 0 ? `正解 +${String(xp)} XP` : '正解'}>
          <p className="feedback-text"><Rich text={q.explanation} onTerm={onTerm} /></p>
        </Feedback>
      ) : null}

      <Slot to={right}>
        <Figure id={q.context?.figure ?? lesson.explain.figures[0] ?? ''} />
      </Slot>
    </div>
  );
}
