import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { useStore } from 'zustand';
import { FACILITY_DEFS, landmarkOf } from '@/city/facilities';
import { svgView } from '@/city/generate/svg';
import { monumentAsset } from '@/city/render/sprites';
import { DOMAIN_DEFS, entryOf, LEVEL_NAMES } from '@/content/catalog';
import { MISSIONS, missionOf } from '@/content/missions';
import type { Mission } from '@/content/schema';
import type { Progress } from '@/game/types';
import { statusOf, STATUS_NAMES } from '@/learning/library';
import { MISSION_STATUS_NAMES, missionFacility, missionStatus, type MissionStatus } from '@/learning/missions';
import { Icon } from '@/ui/icons/Icon';
import { HudWindow } from '@/ui/Window';
import { TermPopover } from '../lesson/TermPopover';
import { Rich } from '../Rich';
import type { Session } from '../session';
import './MissionsScreen.css';

/**
 * ミッション一覧（docs/ui-design.md 2 章・docs/game-design.md 8 章）。都市の上に重ねる大きな窓。
 * 左に都市の依頼の一覧、右に選んだ依頼の中身（都市の課題・必要な知識・おすすめのレッスン・報酬と、できるようになること）。
 * どのミッションも前提なしで受けられる（docs/decisions.md D-14）。おすすめのレッスンは前提ではない。
 */

const domainName = (id: string): string => DOMAIN_DEFS.find((d) => d.id === id)?.name ?? id;

export function MissionsScreen({ session, missionId, onClose, onSelect, onStart, onLesson, onGlossary }: {
  session: Session;
  missionId?: string | undefined;
  onClose: () => void;
  /** 選んだミッションを道すじに写す */
  onSelect: (id: string) => void;
  /** 受ける（ミッションの実戦へ） */
  onStart: (id: string) => void;
  /** おすすめのレッスンの入口の札へ */
  onLesson: (id: string) => void;
  onGlossary: (termId: string) => void;
}) {
  const progress = useStore(session.progress, (s) => s.progress);
  const [selected, setSelected] = useState<string>(missionId && missionOf(missionId) ? missionId : (MISSIONS[0]?.id ?? ''));
  const [pop, setPop] = useState<{ id: string; x: number; y: number } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (missionId && missionOf(missionId)) setSelected(missionId);
  }, [missionId]);

  const onTerm = useCallback((id: string, el: HTMLElement): void => {
    const root = bodyRef.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    if (!root) return;
    const x = Math.min(Math.max(8, r.left - root.left), root.width - 380);
    const below = r.bottom - root.top + 6;
    setPop({ id, x, y: below + 300 > root.height ? Math.max(8, r.top - root.top - 306) : below });
  }, []);

  const m = missionOf(selected);
  const done = MISSIONS.filter((x) => missionStatus(progress, x.id) === 'completed').length;

  const pick = (id: string): void => {
    setSelected(id);
    setPop(null);
    onSelect(id);
  };

  return (
    <HudWindow
      testId="missions-screen"
      icon="mission"
      title="ミッション"
      sub={`都市の課題。どれも前提なしで受けられる（達成 ${String(done)} / ${String(MISSIONS.length)}）`}
      onClose={onClose}
      className="missions"
    >
      <div className="missions-body" ref={bodyRef}>
        <nav className="mission-board" aria-label="依頼の一覧">
          <h2 className="mission-board-head">市役所からの依頼</h2>
          <ol>
            {MISSIONS.map((x) => {
              const status = missionStatus(progress, x.id);
              const facility = missionFacility(x);
              return (
                <li key={x.id}>
                  <button
                    type="button"
                    className={`mission-row is-${status}${x.id === selected ? ' is-selected' : ''}`}
                    aria-current={x.id === selected ? 'true' : undefined}
                    data-testid={`mission-row-${x.id}`}
                    data-status={status}
                    onClick={() => pick(x.id)}
                  >
                    <span className="mission-row-mark">{status === 'completed' ? <Icon name="check" size={14} /> : <Icon name="mission" size={14} />}</span>
                    <span className="mission-row-title">{x.title}</span>
                    <span className="mission-row-from">{facility ? FACILITY_DEFS[facility].name : ''}</span>
                    <span className="mission-row-domains">
                      {x.domains.map((d) => <span key={d} className="mission-swatch" style={{ '--c': `var(--domain-${d})` } as CSSProperties} title={domainName(d)} />)}
                    </span>
                    <span className={`mission-row-status is-${status}`}>{MISSION_STATUS_NAMES[status]}</span>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="mission-board-note">施設の Lv が上がると、その施設の情報パネルに並ぶ依頼が増える。ここには全ての依頼がある。</p>
        </nav>
        {m ? <MissionDetail mission={m} status={missionStatus(progress, m.id)} progress={progress} onStart={onStart} onLesson={onLesson} onTerm={onTerm} /> : null}
        {pop ? (
          <TermPopover termId={pop.id} at={pop} onTerm={(id) => setPop({ ...pop, id })} onClose={() => setPop(null)} onGlossary={onGlossary} />
        ) : null}
      </div>
    </HudWindow>
  );
}

function MissionDetail({ mission: m, status, progress, onStart, onLesson, onTerm }: {
  mission: Mission;
  status: MissionStatus;
  progress: Progress;
  onStart: (id: string) => void;
  onLesson: (id: string) => void;
  onTerm: (id: string, el: HTMLElement) => void;
}) {
  const facility = missionFacility(m);
  const landmark = m.rewards.landmark ? landmarkOf(m.rewards.landmark) : undefined;
  const art = m.rewards.landmark ? monumentAsset(m.rewards.landmark)?.svg : undefined;
  const image = art ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgView(art, 'front').svg)}` : null;
  const attempts = progress.missions[m.id]?.practice?.length ?? 0;
  return (
    <article className="mission-detail" data-testid="mission-detail" data-mission={m.id}>
      <p className="mission-from">
        <Icon name="facility" size={16} />
        {facility ? `${FACILITY_DEFS[facility].name}からの依頼` : '都市の依頼'}
        <span className="mission-domains">{m.domains.map((d) => (
          <span key={d} className="mission-domain" style={{ '--c': `var(--domain-${d})` } as CSSProperties}><span className="mission-swatch" />{domainName(d)}</span>
        ))}</span>
      </p>
      <h2 className="mission-title" data-testid="mission-title">{m.title}</h2>
      <p className="mission-story"><Rich text={m.story} onTerm={onTerm} /></p>

      <div className="mission-columns">
        <section aria-label="必要な知識">
          <h3 className="mission-heading">必要な知識</h3>
          <ul className="mission-knowledge" data-testid="mission-knowledge">
            {m.knowledge.map((k, i) => <li key={i}><Rich text={k} onTerm={onTerm} /></li>)}
          </ul>
          <h3 className="mission-heading">おすすめのレッスン<span className="mission-heading-note">先に学ぶと取り組みやすい（学ばなくても受けられる）</span></h3>
          <ul className="mission-lessons" data-testid="mission-lessons">
            {m.recommended.map((id) => {
              const e = entryOf(id);
              if (!e) return null;
              const st = statusOf(id, progress);
              return (
                <li key={id}>
                  <button type="button" className={`mission-lesson is-${st}`} style={{ '--c': `var(--domain-${e.domain})` } as CSSProperties} onClick={() => onLesson(id)} title="入口の札を開く">
                    <span className="mission-swatch" />
                    <span className="mission-lesson-title">{e.title}</span>
                    <span className="mission-lesson-level">{LEVEL_NAMES[e.level]}</span>
                    <span className="mission-lesson-status">{st === 'completed' ? <Icon name="check" size={13} /> : STATUS_NAMES[st]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="mission-reward" aria-label="報酬" data-testid="mission-reward">
          <h3 className="mission-heading">報酬</h3>
          {image ? <img className="mission-monument" src={image} alt="" /> : null}
          <dl className="mission-reward-list">
            <div><dt><Icon name="xp" size={16} />XP</dt><dd className="num">+{m.rewards.xp}</dd></div>
            <div><dt><Icon name="funds" size={16} />開発資金</dt><dd className="num">+{(m.rewards.xp + m.rewards.funds).toLocaleString('ja-JP')}</dd></div>
            {landmark ? <div><dt><Icon name="park" size={16} />記念碑</dt><dd>{landmark.name}</dd></div> : null}
          </dl>
          <p className="mission-reward-note">資金は{facility ? `${FACILITY_DEFS[facility].name}を Lv2 に上げられるほど` : '施設を 1 つ上げられるほど'}。記念碑は都市に置ける（建設メニューの公園）。</p>
          <h3 className="mission-heading">できるようになること</h3>
          <p className="mission-can"><Rich text={m.practice.purpose} onTerm={onTerm} /></p>
        </section>
      </div>

      <div className="mission-actions">
        {status === 'completed' ? (
          <p className="mission-done" data-testid="mission-done"><Icon name="check" size={16} />達成した。報酬は受け取り済み。もう一度挑戦して確かめることもできる</p>
        ) : status === 'in-progress' ? (
          <p className="mission-done is-progress"><Icon name="start" size={16} />挑戦中（実戦 {attempts} 回）。続きから挑戦できる</p>
        ) : null}
        <button type="button" className="mission-start" data-testid="mission-start" onClick={() => onStart(m.id)}>
          <Icon name="start" size={16} />
          {status === 'completed' ? 'もう一度挑戦する' : status === 'in-progress' ? '続きから挑戦する' : 'このミッションを受ける'}
        </button>
      </div>
    </article>
  );
}
