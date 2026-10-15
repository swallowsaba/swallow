import type { ReadState, SimState } from '@/engines/sim/types';
import { wrongAnswers } from '@/engines/sim/sim';
import { Icon } from '@/ui/icons/Icon';
import { AssignBoard } from './AssignBoard';
import type { BoardProps } from './boardTypes';
import { ConnectBoard } from './ConnectBoard';
import { OrderBoard } from './OrderBoard';

/**
 * 模擬環境（模）の型の画面（docs/ui-design.md 7.1）。どの操作も SimAction にして act に渡す。状態を変えるのは模擬（src/engines/sim）だけ。
 * 画面の操作は、ドラッグして置く・つなぐ・並べ替える と、押すだけの選択（REWORK-PRACTICE.txt 原則 3）
 */

export function SimView({ s, act, expr }: BoardProps<SimState>) {
  switch (s.type) {
    case 'connect': return <ConnectBoard s={s} act={act} expr={expr} />;
    case 'order': return <OrderBoard s={s} act={act} expr={expr} />;
    case 'assign': return <AssignBoard s={s} act={act} expr={expr} />;
    case 'read': return <ReadView s={s} act={act} expr={expr} />;
  }
}

/* ---------- 読み取って答える ---------- */

function ReadView({ s, act, expr }: BoardProps<ReadState>) {
  // 手順の問いに全て答えて合っていない時は、違う答えの問いを赤く示す
  let wrong: string[] = [];
  try {
    wrong = wrongAnswers(s, expr);
  } catch {
    wrong = [];
  }
  return (
    <div className="sim-read" data-testid="sim-read">
      <p className="sim-how">情報を読み、問いの答えを押して選ぶ。読む所を押すと、その部分が大きく出る。答え直してもよい。</p>
      {s.setup.questions.map((q) => (
        <div key={q.id} className={`sim-question${wrong.includes(q.id) ? ' is-wrong' : ''}`}>
          <p className="sim-question-prompt">{q.prompt}</p>
          <div className="sim-question-options" role="group" aria-label={q.prompt}>
            {q.options.map((o) => (
              <button key={o} type="button" className={`sim-option${s.answers[q.id] === o ? ' is-picked' : ''}`} aria-pressed={s.answers[q.id] === o} onClick={() => act({ op: 'answer', question: q.id, value: o })}>
                {s.answers[q.id] === o ? <Icon name="check" size={12} /> : null}{o}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
