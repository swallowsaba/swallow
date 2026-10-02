import { PRACTICE_NAMES } from '@/content/catalog';
import type { Lesson } from '@/content/schema';
import { Icon } from '@/ui/icons/Icon';
import { Rich } from '../Rich';
import { Slot, StepButtons, type OnTerm } from './widgets';

/**
 * 実戦の入口（docs/learning-design.md 6 章）。目的と、この実戦でやること（手順ごとの目的）を、打つ前に示す。
 * 模擬環境（仮想端末など）につなぐのは docs/development-plan.md の Phase 7。それまでは、ここまでの進みを保存して止まる。
 */
export function PracticeStage({ lesson, onTerm, right, action, onBack, onExit }: {
  lesson: Lesson;
  onTerm: OnTerm;
  right: HTMLElement | null;
  action: HTMLElement | null;
  onBack: () => void;
  onExit: () => void;
}) {
  const p = lesson.practice;
  return (
    <section className="stage stage-practice" aria-label="実戦" data-testid="stage-practice">
      <p className="stage-count">
        <span className="stage-kind">{PRACTICE_NAMES[p.mode]}</span>
        <span className="stage-count-note">安全な模擬環境で操作する。本物の機械には何もしない</span>
      </p>
      <h2 className="stage-heading">目的</h2>
      <p className="stage-text"><Rich text={p.purpose} onTerm={onTerm} /></p>
      <h3 className="stage-subheading">やること</h3>
      <ol className="practice-steps">
        {p.steps.map((s) => (
          <li key={s.id}><Rich text={s.purpose} onTerm={onTerm} /></li>
        ))}
      </ol>
      <p className="stage-hint">手が止まったら、ヒントを 3 段まで見られる（方向 → 具体 → そのまま打てる答え）。使っても失敗にはならない。</p>
      <Slot to={right}>
        <div className="practice-wait" data-testid="practice-wait">
          <Icon name="alert" size={22} />
          <p className="practice-wait-title">実戦の{PRACTICE_NAMES[p.mode]}は、まだ準備中</p>
          <p className="practice-wait-text">ここまでの進みは保存した。都市へ戻っても、次に開くとこの段から続く。</p>
        </div>
      </Slot>
      <Slot to={action}>
        <StepButtons onBack={onBack} backLabel="クイズへ戻る" onNext={onExit} nextLabel="中断して都市へ" nextTestId="lesson-pause" />
      </Slot>
    </section>
  );
}
