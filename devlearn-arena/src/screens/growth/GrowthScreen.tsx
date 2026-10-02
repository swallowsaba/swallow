import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { DOMAINS } from '@/city/facilityInfo';
import { stageProgress } from '@/city/overlay';
import type { DomainId } from '@/city/types';
import { nextRankOf, RANK_NAMES, RANKS, rankOf } from '@/game/rank';
import { SKILL_STAGE_NAMES, SKILL_WEIGHTS, type SkillDetail } from '@/game/skill';
import { STAGE_NAMES, STAGE_UNLOCKS } from '@/game/stage';
import { Icon } from '@/ui/icons/Icon';
import type { Session } from '../session';
import { skillBecause, skillTitle, useSkills } from '../skills';
import { historyOf } from './historyModel';
import './GrowthScreen.css';

/**
 * 成長画面（docs/ui-design.md 2 章: XP・スキル・学習履歴。上の帯の XP から入る）。
 * 都市の上に重ねる窓。左にエンジニア段階と都市の発展、中央に 16 分野のスキルの計器と内訳、右に学習履歴。
 */

const format = (n: number): string => n.toLocaleString('ja-JP');
const pct = (x: number): string => `${String(Math.round(x * 1000) / 10)}%`;
/** スキルの段階の境目（docs/game-design.md 4 章） */
const STAGE_TICKS = [10, 30, 50, 70, 90];

export function GrowthScreen({ session, onClose }: { session: Session; onClose: () => void }) {
  const progress = useStore(session.progress, (s) => s.progress);
  const city = useStore(session.city, (s) => s.city);
  const skills = useSkills(session.progress);
  const history = useMemo(() => historyOf(progress), [progress]);
  // 既定で選ぶ分野: 値の一番高い分野（記録が無ければ推奨学習順の最初）
  const [picked, setPicked] = useState<DomainId>(() => [...DOMAINS].sort((a, b) => skills[b.id].value - skills[a.id].value)[0]?.id ?? 'found');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const xp = progress.xp;
  const rank = rankOf(xp);
  const next = nextRankOf(xp);
  const stage = stageProgress(city);
  const detail = skills[picked];
  const domain = DOMAINS.find((d) => d.id === picked);

  return (
    <div className="growth-backdrop" data-testid="growth-screen">
      <section className="growth" role="dialog" aria-modal="true" aria-labelledby="growth-title">
        <header className="growth-head">
          <span className="growth-head-icon"><Icon name="xp" size={22} /></span>
          <h1 id="growth-title" className="growth-title">成長</h1>
          <p className="growth-sub">エンジニアとしての成長と、それが都市にどう表れているか</p>
          <button ref={closeRef} type="button" className="growth-close" onClick={onClose} title="都市へ戻る（Esc）">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
            <span>都市へ戻る</span>
          </button>
        </header>

        <div className="growth-body">
          {/* 左: エンジニア段階と都市の発展 */}
          <aside className="growth-col growth-rank" aria-label="エンジニア段階">
            <h2 className="growth-heading">エンジニア段階</h2>
            <p className="growth-rank-name" data-testid="growth-rank">{RANK_NAMES[rank]}</p>
            <p className="growth-hero">
              <span className="num growth-hero-value" data-testid="growth-xp">{format(xp)}</span>
              <span className="growth-hero-unit">XP（累計）</span>
            </p>
            <ol className="growth-ladder" aria-label="エンジニア段階の梯子">
              {RANKS.map((r, i) => {
                const upper = RANKS[i + 1]?.xp;
                const fill = xp >= (upper ?? Infinity) ? 1 : xp < r.xp ? 0 : upper === undefined ? 1 : (xp - r.xp) / (upper - r.xp);
                return (
                  <li key={r.rank} className={`growth-ladder-step${r.rank === rank ? ' is-current' : ''}`}>
                    <span className="growth-ladder-track"><span style={{ width: pct(fill) }} /></span>
                    <span className="growth-ladder-name">{r.name}</span>
                    <span className="num growth-ladder-xp">{format(r.xp)}</span>
                  </li>
                );
              })}
            </ol>
            <p className="growth-note">
              {next ? <>次の「{next.name}」まで あと <b className="num">{format(next.remaining)}</b> XP</> : '最高のエンジニア段階'}
            </p>
            <p className="growth-note is-sub">XP は使っても減らない。学習で得た XP と同じ量が開発資金に入る</p>

            <h2 className="growth-heading is-gap">都市の発展段階</h2>
            <p className="growth-stage-name">{STAGE_NAMES[city.stage]}</p>
            {stage.next ? (
              <>
                <Meter label="技術力（施設 Lv の合計）" value={stage.techPower[0]} goal={stage.techPower[1]} unit="" />
                <Meter label="都市規模" value={stage.population[0]} goal={stage.population[1]} unit="人" />
                <p className="growth-note">
                  「{STAGE_NAMES[stage.next]}」になると: {STAGE_UNLOCKS[stage.next]}
                </p>
                <p className="growth-note is-sub">施設のレベルは、対応する分野のスキルの段階で上げられる。どの分野からでも発展できる</p>
              </>
            ) : (
              <p className="growth-note">最高の発展段階</p>
            )}
          </aside>

          {/* 中央: 16 分野のスキルの計器と、選んだ分野の内訳 */}
          <section className="growth-col growth-skills" aria-label="スキル">
            <div className="growth-skills-head">
              <h2 className="growth-heading">スキル</h2>
              <p className="growth-note is-sub">分野ごとの習熟（0〜100）。XP の合計ではなく、学習の記録から計算する</p>
            </div>
            <div className="growth-scale" aria-hidden="true">
              <span />
              <span className="growth-scale-axis">
                {STAGE_TICKS.map((t, i) => (
                  <span key={t} className="growth-scale-tick" style={{ left: `${String(t)}%` }}>
                    {SKILL_STAGE_NAMES[(i + 1) as 1 | 2 | 3 | 4 | 5]}
                  </span>
                ))}
              </span>
              <span />
            </div>
            <ul className="growth-skill-list">
              {DOMAINS.map((d) => {
                const s = skills[d.id];
                return (
                  <li key={d.id}>
                    <button
                      type="button"
                      className={`growth-skill${d.id === picked ? ' is-picked' : ''}`}
                      style={{ '--c': `var(--domain-${d.id})` } as CSSProperties}
                      aria-pressed={d.id === picked}
                      data-testid={`skill-${d.id}`}
                      onClick={() => setPicked(d.id)}
                    >
                      <span className="growth-skill-name"><span className="growth-swatch" />{d.name}</span>
                      <span className="growth-skill-track">
                        {STAGE_TICKS.map((t) => <span key={t} className="growth-skill-tick" style={{ left: `${String(t)}%` }} />)}
                        {s.value > 0 ? <span className="growth-skill-fill" style={{ width: `${String(s.value)}%` }} /> : null}
                      </span>
                      <span className="num growth-skill-value">{s.value}</span>
                      <span className="growth-skill-stage">{SKILL_STAGE_NAMES[s.stage]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            {domain ? <Breakdown name={domain.name} skill={detail} id={picked} /> : null}
          </section>

          {/* 右: 学習履歴 */}
          <section className="growth-col growth-history" aria-label="学習履歴">
            <h2 className="growth-heading">学習履歴</h2>
            {history.length === 0 ? (
              <p className="growth-note is-sub" data-testid="history-empty">
                まだ学習の記録が無い。レッスンを学ぶと、いつ・何を・どれだけ理解したかがここに残る
              </p>
            ) : (
              <ol className="growth-days">
                {history.map((day) => (
                  <li key={day.day} className="growth-day">
                    <p className="growth-day-head">
                      <span>{day.label}</span>
                      <span className="num">+{format(day.xp)} XP</span>
                    </p>
                    <ol className="growth-entries">
                      {day.entries.map((e) => (
                        <li key={e.key} className="growth-entry" data-testid="history-entry">
                          <span className="num growth-entry-time">{e.time}</span>
                          <span className="growth-entry-main">
                            <span className="growth-entry-title">
                              {e.tag ? <span className="growth-entry-tag">{e.tag}</span> : null}
                              {e.title}
                            </span>
                            {e.details.length > 0 ? <span className="growth-entry-details">{e.details.join('・')}</span> : null}
                          </span>
                          <span className="num growth-entry-xp">{e.xp > 0 ? `+${format(e.xp)}` : '0'}</span>
                        </li>
                      ))}
                    </ol>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}

function Meter({ label, value, goal, unit }: { label: string; value: number; goal: number; unit: string }) {
  const fill = goal > 0 ? Math.min(1, value / goal) : 1;
  return (
    <div className="growth-meter">
      <p className="growth-meter-label">
        <span>{label}</span>
        <span className="num">{format(value)} / {format(goal)}{unit}</span>
      </p>
      <span className="growth-meter-track"><span className={fill >= 1 ? 'is-done' : ''} style={{ width: pct(fill) }} /></span>
    </div>
  );
}

/** 「何をしたからこの値か」（docs/game-design.md 4 章の式の 4 つの項） */
function Breakdown({ name, skill, id }: { name: string; skill: SkillDetail; id: DomainId }) {
  const c = skill.counts;
  const parts: { key: keyof typeof SKILL_WEIGHTS; label: string; ratio: number; note: string }[] = [
    { key: 'completion', label: '修了率', ratio: skill.breakdown.completion, note: `修了したレッスン ${String(c.completedLessons)} / ${String(c.totalLessons)} 本（初級 1・中級 2・上級 3 の重み）` },
    { key: 'quizFirstTry', label: 'クイズ', ratio: skill.breakdown.quizFirstTry, note: c.quizFirstTries > 0 ? `直近 ${String(c.quizFirstTries)} 問のうち ${String(c.quizFirstCorrect)} 問を初回で正解` : 'まだクイズに答えていない' },
    {
      key: 'practiceSuccess', label: '実戦', ratio: skill.breakdown.practiceSuccess,
      note: c.practices > 0 ? `直近 ${String(c.practices)} 回: ヒント無しで成功 ${String(c.practiceClean)}・ヒントありで成功 ${String(c.practiceHinted)}` : 'まだ実戦をしていない',
    },
    { key: 'retention', label: '定着度', ratio: skill.breakdown.retention, note: c.cards > 0 ? `復習カード ${String(c.cards)} 枚のうち ${String(c.cardsOnTime)} 枚が予定日を過ぎていない` : '復習カードはまだ無い（レッスンを修了するとできる）' },
  ];
  const overdue = c.cards - c.cardsOnTime;
  const title = skillTitle(name, skill.stage);
  return (
    <div className="growth-breakdown" data-testid="skill-breakdown" style={{ '--c': `var(--domain-${id})` } as CSSProperties}>
      <p className="growth-breakdown-head">
        <span className="growth-swatch" />
        <span className="growth-breakdown-name">{title || name}</span>
        <span className="growth-breakdown-title">{title ? `${name}・${SKILL_STAGE_NAMES[skill.stage]}` : '未修得'}</span>
        <span className="num growth-breakdown-value">{skill.value}</span>
      </p>
      <p className="growth-note is-sub">{skillBecause(skill)}</p>
      <div className="growth-parts">
        {parts.map((p) => {
          const max = SKILL_WEIGHTS[p.key];
          const points = Math.round(max * p.ratio * 10) / 10;
          return (
            <div key={p.key} className="growth-part" data-testid={`part-${p.key}`}>
              <span className="growth-part-label">{p.label}</span>
              {/* 項ごとの満点を横幅の比にする（40・25・25・10） */}
              <span className="growth-part-area">
                <span className="growth-part-track" style={{ width: `${String(max * 2.5)}%` }}>
                  <span style={{ width: pct(p.ratio) }} />
                </span>
              </span>
              <span className="num growth-part-points">{points} / {max}</span>
              <span className="growth-part-note">{p.note}</span>
            </div>
          );
        })}
      </div>
      {overdue > 0 ? (
        <p className="growth-note is-info" data-testid="review-notice">
          予定日を過ぎた復習が {overdue} 枚ある。復習すると定着度が戻る
        </p>
      ) : null}
    </div>
  );
}
