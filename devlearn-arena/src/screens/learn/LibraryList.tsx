import { useEffect, useRef, type CSSProperties } from 'react';
import { LEVEL_NAMES, PRACTICE_NAMES } from '@/content/catalog';
import type { DomainId, Level } from '@/content/schema';
import { STATUS_NAMES, type LessonStatus, type LibraryDomain, type LibraryFilter } from '@/learning/library';
import { Icon } from '@/ui/icons/Icon';

/**
 * 学習ライブラリの一覧（docs/ui-design.md 6 章）。分野ごとにテーマとレッスンを、推奨学習順に並べる。
 * 左に分野の目次（押すとその分野へ）、上に検索と絞り込み。
 */

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced'];
const STATUSES: LessonStatus[] = ['not-started', 'in-progress', 'completed'];

export function LibraryList({ library, filter, onFilter, selected, onSelect, domainNames }: {
  library: LibraryDomain[];
  filter: LibraryFilter;
  onFilter: (f: LibraryFilter) => void;
  selected: string | null;
  onSelect: (id: string) => void;
  domainNames: Record<string, string>;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const count = library.reduce((s, d) => s + d.themes.reduce((t, th) => t + th.lessons.length, 0), 0);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // 選んでいるレッスンを一覧の見える所へ
  useEffect(() => {
    if (!selected) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-lesson="${selected}"]`);
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [selected]);

  const jump = (id: DomainId): void => {
    listRef.current?.querySelector<HTMLElement>(`[data-domain="${id}"]`)?.scrollIntoView?.({ block: 'start' });
  };
  const toggle = <T,>(list: readonly T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <>
      <nav className="lib-index" aria-label="分野（推奨学習順）">
        <p className="lib-index-head">分野<span>推奨学習順</span></p>
        <ol>
          {library.map((d) => (
            <li key={d.id}>
              <button type="button" className="lib-index-item" style={{ '--c': `var(--domain-${d.id})` } as CSSProperties} onClick={() => jump(d.id)} data-testid={`lib-index-${d.id}`}>
                <span className="lib-swatch" />
                <span className="lib-index-name">{d.name}</span>
                <span className="num lib-index-count">{d.completed}/{d.total}</span>
                <span className="lib-index-meter"><span style={{ width: `${String((d.completed / Math.max(1, d.total)) * 100)}%` }} /></span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <section className="lib-main" aria-label="レッスンの一覧">
        <div className="lib-filters">
          <label className="lib-search">
            <Icon name="search" size={16} />
            <input
              ref={searchRef}
              type="search"
              value={filter.query}
              placeholder="題名・目標・テーマ・分野で探す"
              aria-label="レッスンを探す"
              data-testid="lib-search"
              onChange={(e) => onFilter({ ...filter, query: e.target.value })}
            />
          </label>
          <div className="lib-chips" role="group" aria-label="難易度">
            {LEVELS.map((l) => (
              <button key={l} type="button" className="lib-chip" aria-pressed={filter.levels.includes(l)} onClick={() => onFilter({ ...filter, levels: toggle(filter.levels, l) })}>
                {LEVEL_NAMES[l]}
              </button>
            ))}
          </div>
          <div className="lib-chips" role="group" aria-label="修了状況">
            {STATUSES.map((s) => (
              <button key={s} type="button" className="lib-chip" aria-pressed={filter.statuses.includes(s)} onClick={() => onFilter({ ...filter, statuses: toggle(filter.statuses, s) })} data-testid={`lib-status-${s}`}>
                {STATUS_NAMES[s]}
              </button>
            ))}
          </div>
          {filter.domain ? (
            <button type="button" className="lib-chip is-domain" aria-pressed="true" onClick={() => onFilter({ ...filter, domain: undefined })} title="分野の絞り込みを外す">
              {domainNames[filter.domain]}
              <Icon name="close" size={12} />
            </button>
          ) : null}
          <span className="num lib-count" data-testid="lib-count">{count}<span> 本</span></span>
        </div>

        <div className="lib-list" ref={listRef} data-testid="lib-list">
          {count === 0 ? <p className="lib-none">当てはまるレッスンが無い。言葉を変えるか、絞り込みを外してみよう。</p> : null}
          {library.map((d) => (
            <section key={d.id} className="lib-domain" data-domain={d.id} style={{ '--c': `var(--domain-${d.id})` } as CSSProperties}>
              <header className="lib-domain-head">
                <span className="lib-swatch is-large" />
                <h2>{d.name}</h2>
                <p>{d.description}</p>
              </header>
              {d.themes.map((t, i) => (
                <div key={`${t.theme}-${String(i)}`} className="lib-theme">
                  <h3 className="lib-theme-name">{t.theme}</h3>
                  <ol>
                    {t.lessons.map((l) => (
                      <li key={l.entry.id}>
                        <button
                          type="button"
                          className={`lib-row is-${l.status}${l.entry.id === selected ? ' is-selected' : ''}`}
                          data-lesson={l.entry.id}
                          aria-current={l.entry.id === selected ? 'true' : undefined}
                          onClick={() => onSelect(l.entry.id)}
                        >
                          <span className="num lib-row-order">{l.order}</span>
                          <span className={`lib-row-level is-${l.entry.level}`}>{LEVEL_NAMES[l.entry.level]}</span>
                          <span className="lib-row-text">
                            <span className="lib-row-title">{l.entry.title}</span>
                            <span className="lib-row-goal">{l.entry.goal}</span>
                          </span>
                          <span className="lib-row-mode">{l.entry.practice.map((p) => PRACTICE_NAMES[p]).join('・')}</span>
                          <span className={`lib-row-status is-${l.status}`}>
                            {l.status === 'completed' ? <Icon name="check" size={14} /> : l.status === 'in-progress' ? '学習中' : ''}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ol>
                </div>
              ))}
            </section>
          ))}
        </div>
      </section>
    </>
  );
}
