import type { CSSProperties } from 'react';
import { DOMAIN_DEFS, PRACTICE_NAMES, recommendedRank } from '@/content/catalog';
import { STATUS_NAMES, type EntryCard, type LessonLink } from '@/learning/library';
import { Icon } from '@/ui/icons/Icon';

/**
 * 入口の札（docs/ui-design.md 6 章）: 到達目標・目安時間・難易度・推奨前提（未修了なら「先に見ると分かりやすい」）・関連・次に学ぶとよい。
 * ボタンは「このまま始める」「先に〇〇を見る」。**禁止のボタンは作らない。**
 */

const domainName = (id: string): string => DOMAIN_DEFS.find((d) => d.id === id)?.name ?? id;
const LEVEL_SHORT = { beginner: '初級', intermediate: '中級', advanced: '上級' } as const;

export function EntryCardView({ card, onStart, onPick }: {
  card: EntryCard;
  onStart: (id: string) => void;
  /** 前提・関連・次のレッスンの札へ移る */
  onPick: (id: string) => void;
}) {
  const e = card.entry;
  const first = card.unmet[0];
  return (
    <article className="entry" data-testid="entry-card" style={{ '--c': `var(--domain-${e.domain})` } as CSSProperties}>
      <p className="entry-domain">
        <span className="entry-swatch" />
        <span>{domainName(e.domain)}</span>
        <span className="entry-theme">{e.theme}</span>
        <span className="num entry-id">{e.id}</span>
      </p>
      <h2 className="entry-title">{e.title}</h2>
      <p className="entry-goal">
        <span className="entry-label">到達目標</span>
        {e.goal}
      </p>

      <dl className="entry-facts">
        <div><dt>難易度</dt><dd>{card.levelName}</dd></div>
        <div><dt>目安</dt><dd className="num">{card.minutes}</dd></div>
        <div><dt>実戦</dt><dd>{e.practice.map((p) => PRACTICE_NAMES[p]).join('・')}</dd></div>
        <div><dt>推奨順</dt><dd className="num">{recommendedRank(e.id) + 1}<span className="entry-unit"> 番目</span></dd></div>
      </dl>

      {card.status !== 'not-started' ? (
        <p className={`entry-status is-${card.status}`} data-testid="entry-status">
          <Icon name={card.status === 'completed' ? 'check' : 'start'} size={14} />
          {card.status === 'completed' ? '修了した。もう一度学ぶこともできる' : '学習中。続きから学べる（進んだ段から始まる）'}
        </p>
      ) : null}

      {card.advice ? <p className="entry-advice" data-testid="entry-advice">{card.advice}</p> : null}

      <div className="entry-actions">
        <button type="button" className="entry-start" data-testid="entry-start" onClick={() => onStart(e.id)}>
          <Icon name="start" size={16} />
          {card.status === 'completed' ? 'もう一度学ぶ' : card.status === 'in-progress' ? '続きから学ぶ' : 'このまま始める'}
        </button>
        {first ? (
          <button type="button" className="entry-first" data-testid="entry-first" onClick={() => onPick(first.id)}>
            先に「{first.title}」を見る
          </button>
        ) : null}
      </div>

      <Links title="推奨前提" note="先に学ぶと分かりやすい（学ばなくても始められる）" links={card.prerequisites} empty={card.prerequisiteNote ?? 'なし（ここから始めてよい）'} onPick={onPick} />
      <Links title="次に学ぶとよい" links={card.next} empty="なし" onPick={onPick} />
      <Links title="関連" note="ほかの分野で同じ題材を扱うレッスン" links={card.related} empty="なし" onPick={onPick} />
    </article>
  );
}

function Links({ title, note, links, empty, onPick }: { title: string; note?: string; links: LessonLink[]; empty: string; onPick: (id: string) => void }) {
  return (
    <section className="entry-links" aria-label={title}>
      <h3 className="entry-heading">
        {title}
        {note ? <span className="entry-heading-note">{note}</span> : null}
      </h3>
      {links.length === 0 ? (
        <p className="entry-empty">{empty}</p>
      ) : (
        <ul>
          {links.map((l) => (
            <li key={l.id}>
              <button type="button" className={`entry-link is-${l.status}`} onClick={() => onPick(l.id)} style={{ '--c': `var(--domain-${l.domain})` } as CSSProperties}>
                <span className="entry-swatch" />
                <span className="entry-link-title">{l.title}</span>
                <span className="entry-link-level">{LEVEL_SHORT[l.level]}</span>
                <span className={`entry-link-status is-${l.status}`}>{l.status === 'completed' ? <Icon name="check" size={13} /> : STATUS_NAMES[l.status]}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** 何も選んでいない時の札（初めての人には IT 基礎の最初のレッスンを勧める。強制しない。docs/learning-design.md 8 章） */
export function EntryEmpty({ onPick, firstId, firstTitle }: { onPick: (id: string) => void; firstId: string; firstTitle: string }) {
  return (
    <article className="entry is-empty" data-testid="entry-empty">
      <h2 className="entry-title">レッスンを選ぶ</h2>
      <p className="entry-goal">一覧か知識グラフでレッスンを選ぶと、ここに入口の札が出る。どのレッスンからでも始められる。</p>
      <p className="entry-advice">初めてなら「IT 基礎」の最初のレッスンがおすすめ。</p>
      <div className="entry-actions">
        <button type="button" className="entry-first" onClick={() => onPick(firstId)}>「{firstTitle}」を見る</button>
      </div>
    </article>
  );
}
