import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { DOMAIN_DEFS, entryOf, LEVEL_NAMES } from '@/content/catalog';
import { TERMS, termOf, wordOf } from '@/content/glossary';
import { Icon } from '@/ui/icons/Icon';
import { HudWindow } from '@/ui/Window';
import { Rich } from '../Rich';
import '../learn/LearnScreen.css';
import './GlossaryScreen.css';

/**
 * 用語集（docs/ui-design.md 2 章・docs/learning-design.md 9 章）。
 * 各用語の簡単な説明・なぜ重要か・関連する用語・関係するレッスン。関係するレッスンを押すと入口の札へ。
 */

const domainName = (id: string): string => DOMAIN_DEFS.find((d) => d.id === id)?.name ?? id;
const normalize = (s: string): string => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

export function GlossaryScreen({ termId, onClose, onTerm, onLesson }: {
  termId?: string | undefined;
  onClose: () => void;
  /** 選んだ用語を道すじに写す */
  onTerm: (id: string) => void;
  onLesson: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(termId ?? TERMS[0]?.id ?? null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (termId) setSelected(termId);
  }, [termId]);
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  const list = useMemo(() => {
    const q = normalize(query);
    return q ? TERMS.filter((t) => [t.word, t.reading ?? '', t.plain].some((s) => normalize(s).includes(q))) : TERMS;
  }, [query]);
  const term = selected ? termOf(selected) : undefined;

  const pick = (id: string): void => {
    setSelected(id);
    onTerm(id);
  };

  return (
    <HudWindow testId="glossary-screen" icon="glossary" title="用語集" sub={`全 ${String(TERMS.length)} 語。本文の下線の言葉を押しても、ここと同じ説明が出る`} onClose={onClose} focusClose={false} className="glossary">
      <div className="glossary-body">
        <section className="glossary-list" aria-label="用語の一覧">
          <label className="lib-search glossary-search">
            <Icon name="search" size={16} />
            <input ref={searchRef} type="search" value={query} placeholder="言葉・読み・説明で探す" aria-label="用語を探す" data-testid="glossary-search" onChange={(e) => setQuery(e.target.value)} />
          </label>
          <ol>
            {list.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className={`glossary-item${t.id === selected ? ' is-selected' : ''}`}
                  style={{ '--c': `var(--domain-${t.domain})` } as CSSProperties}
                  aria-current={t.id === selected ? 'true' : undefined}
                  data-term={t.id}
                  onClick={() => pick(t.id)}
                >
                  <span className="lib-swatch" />
                  <span className="glossary-item-word">{t.word}</span>
                  {t.reading ? <span className="glossary-item-reading">{t.reading}</span> : null}
                </button>
              </li>
            ))}
            {list.length === 0 ? <li className="lib-none">当てはまる用語が無い</li> : null}
          </ol>
        </section>

        {term ? (
          <article className="glossary-term" data-testid="glossary-term" style={{ '--c': `var(--domain-${term.domain})` } as CSSProperties}>
            <p className="entry-domain"><span className="entry-swatch" />{domainName(term.domain)}</p>
            <h2 className="glossary-word">
              {term.word}
              {term.reading ? <span className="glossary-reading">{term.reading}</span> : null}
            </h2>
            <section>
              <h3 className="entry-heading">簡単な説明</h3>
              <p className="glossary-text"><Rich text={term.plain} onTerm={pick} /></p>
            </section>
            <section>
              <h3 className="entry-heading">なぜ重要か</h3>
              <p className="glossary-text"><Rich text={term.why} onTerm={pick} /></p>
            </section>
            {term.analogy ? (
              <section>
                <h3 className="entry-heading">例えると</h3>
                <p className="glossary-text is-sub"><Rich text={term.analogy} onTerm={pick} /></p>
              </section>
            ) : null}
            <section>
              <h3 className="entry-heading">関連する用語</h3>
              <p className="glossary-related">
                {term.related.map((r) => (
                  <button key={r} type="button" className="lib-chip" onClick={() => pick(r)}>{wordOf(r)}</button>
                ))}
              </p>
            </section>
            <section>
              <h3 className="entry-heading">関係するレッスン<span className="entry-heading-note">押すと入口の札</span></h3>
              <ul className="glossary-lessons">
                {term.lessons.map((id) => {
                  const e = entryOf(id);
                  if (!e) return null;
                  return (
                    <li key={id}>
                      <button type="button" className="entry-link" style={{ '--c': `var(--domain-${e.domain})` } as CSSProperties} onClick={() => onLesson(id)}>
                        <span className="entry-swatch" />
                        <span className="entry-link-title">{e.title}</span>
                        <span className="entry-link-level">{domainName(e.domain)}・{LEVEL_NAMES[e.level]}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </article>
        ) : null}
      </div>
    </HudWindow>
  );
}
