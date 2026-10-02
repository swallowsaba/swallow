import type { CSSProperties } from 'react';
import { domainDef } from '@/content/catalog';
import type { Lesson } from '@/content/schema';
import { SKILL_STAGE_NAMES, type SkillDetail, type SkillStage } from '@/game/skill';
import type { XpEvent, XpSource } from '@/game/types';
import { XP_TABLE } from '@/game/xp';
import { Icon } from '@/ui/icons/Icon';
import { skillBecause, skillTitle } from '../skills';
import { Rich } from '../Rich';
import { Slot, StepButtons } from './widgets';

/**
 * XP / スキル（docs/learning-design.md 2 章: 得た XP とスキルの変化、都市への影響。XP だけを大きく見せない）。
 * 報酬には何ができるようになったかを添える（docs/game-design.md 10 章）。
 */

const SOURCE_NAMES: Record<XpSource, string> = {
  'lesson-complete': 'まとめまで到達',
  quiz: 'クイズの正解',
  practice: '実戦の成功',
  troubleshoot: 'エラーから自力で立て直した',
  mission: 'ミッション',
  'skill-up': 'スキルの段階が上がった',
  review: '復習',
};

export function DoneStage({ lesson, events, skill, right, action, onExit }: {
  lesson: Lesson;
  /** この回で得た XP（レッスンの行動と、この分野のスキルの段階の上がり） */
  events: readonly XpEvent[];
  skill: SkillDetail;
  right: HTMLElement | null;
  action: HTMLElement | null;
  onExit: () => void;
}) {
  const bySource = new Map<XpSource, number>();
  for (const e of events) bySource.set(e.source, (bySource.get(e.source) ?? 0) + e.amount);
  const total = events.reduce((s, e) => s + e.amount, 0);
  const ups = events.filter((e) => e.source === 'skill-up').reduce((n, e) => n + e.amount / XP_TABLE.skillUp, 0);
  const from = Math.max(0, skill.stage - ups) as SkillStage;
  const domainName = domainDef(lesson.domain)?.name ?? lesson.domain;
  const title = skillTitle(domainName, skill.stage);

  return (
    <section className="stage stage-done" aria-label="XP とスキル" data-testid="stage-done" style={{ '--c': `var(--domain-${lesson.domain})` } as CSSProperties}>
      <h2 className="stage-heading">できるようになったこと</h2>
      <p className="done-goal"><Icon name="check" size={18} /><span><Rich text={lesson.goal} /></span></p>

      <h3 className="stage-subheading">{domainName} のスキル</h3>
      <div className="done-skill" data-testid="done-skill">
        <p className="done-skill-stage">
          {ups > 0 ? (
            <>
              <span className="done-skill-from">{SKILL_STAGE_NAMES[from]}</span>
              <Icon name="start" size={14} />
            </>
          ) : null}
          <span className="done-skill-to">{SKILL_STAGE_NAMES[skill.stage]}</span>
          <span className="done-skill-value num">{skill.value}</span>
          <span className="done-skill-unit">/ 100</span>
        </p>
        <div className="done-skill-meter" aria-hidden="true"><span style={{ width: `${String(skill.value)}%` }} /></div>
        {title ? <p className="done-skill-title">称号: {title}</p> : null}
        <p className="done-skill-because">{skillBecause(skill)}</p>
      </div>

      <h3 className="stage-subheading">都市への影響</h3>
      <p className="stage-text" data-testid="done-funds">
        開発資金が <span className="num done-funds">+{total}</span> 増えた。都市に戻って、道路・区画・施設に使える。
      </p>

      <Slot to={right}>
        <div className="done-xp" data-testid="done-xp">
          <p className="done-xp-total"><span className="num">+{total}</span><span className="done-xp-unit">XP</span></p>
          <ul className="done-xp-list">
            {[...bySource].map(([source, amount]) => (
              <li key={source}><span>{SOURCE_NAMES[source]}</span><span className="num">+{amount}</span></li>
            ))}
            {bySource.size === 0 ? <li><span>この回で得た XP は無い（同じ日の 2 回目など）</span><span className="num">0</span></li> : null}
          </ul>
        </div>
      </Slot>
      <Slot to={action}>
        <StepButtons onNext={onExit} nextLabel="都市へ戻る" nextTestId="lesson-to-city" />
      </Slot>
    </section>
  );
}
