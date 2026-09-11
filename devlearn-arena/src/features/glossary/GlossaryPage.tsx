import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { glossaryIndex, matchesGlossary } from '@/engines/lesson/glossaryIndex';
import { useT } from '@/i18n/useT';
import { Glossed } from '@/ui/Term';

/** 1つの語に添える任務の数。それ以上は「ほか n 本」とだけ出す */
const SHOWN = 3;

/**
 * 用語集。全任務の「学ぶ」画面に出てくる語を、専門用語を使わない言い換えと一緒に並べる。
 * 語から、その語を説明している任務へ飛べる。
 */
export default function GlossaryPage() {
  const t = useT();
  const rows = useMemo(() => glossaryIndex(), []);
  const [query, setQuery] = useState('');
  const hits = useMemo(() => rows.filter((row) => matchesGlossary(row, query)), [rows, query]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="sign inline-block px-6 py-2 text-3xl font-extrabold">{t('glossary.title')}</h1>
        <p className="text-base text-ink-soft">{t('glossary.count', { n: rows.length })}</p>
      </div>
      <p className="text-base text-ink-soft">{t('glossary.lead')}</p>

      <label className="flex max-w-xl flex-col gap-1">
        <span className="text-sm font-bold">{t('glossary.search')}</span>
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
          }}
          placeholder={t('glossary.placeholder')}
          className="border-4 border-wood-dark bg-white px-3 py-2 text-base"
        />
      </label>

      {hits.length === 0 ? (
        <p className="text-base text-ink-soft">{t('glossary.none')}</p>
      ) : (
        <dl className="grid gap-3">
          {hits.map((row) => (
            <div key={row.term} id={`term-${row.term}`} className="border-4 border-wood-dark bg-cream p-4">
              <dt className="flex flex-wrap items-baseline gap-2">
                <span className="plate px-3 py-1 text-lg font-extrabold">{row.term}</span>
                {row.aliases.length > 0 ? (
                  <span className="font-mono text-sm text-ink-soft">{row.aliases.join(' / ')}</span>
                ) : null}
              </dt>
              <dd className="mt-2 flex flex-col gap-2">
                <p className="text-base leading-relaxed">
                  <Glossed text={row.plain} />
                </p>
                <p className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-ink-soft">{t('glossary.usedIn')}</span>
                  {row.missions.slice(0, SHOWN).map((m) => (
                    <Link
                      key={m.id}
                      to={`/?mission=${encodeURIComponent(m.id)}`}
                      className="border-2 border-wood-dark bg-white px-2 py-0.5 hover:bg-[var(--cream-dark)]"
                    >
                      {m.title}
                    </Link>
                  ))}
                  {row.missions.length > SHOWN ? (
                    <span className="text-ink-soft">{t('glossary.more', { n: row.missions.length - SHOWN })}</span>
                  ) : null}
                </p>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
