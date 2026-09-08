import { useEffect, useState } from 'react';
import { getLesson } from '@/content/catalog';
import { useT } from '@/i18n/useT';
import { readJournal, type JournalEntry } from '@/lib/storage/idb';
import { xpProgress } from '@/lib/xp';
import { useStore } from '@/store';
import { ProgressBar } from '@/ui/components/ProgressBar';
import { Achievements } from './Achievements';
import { ReviewQueue } from './ReviewQueue';

export default function DashboardPage() {
  const t = useT();
  const profile = useStore((s) => s.profile);
  const lessons = useStore((s) => s.lessons);
  const [entries, setEntries] = useState<JournalEntry[]>([]);

  useEffect(() => {
    let alive = true;
    void readJournal(12)
      .then((rows) => {
        if (alive) setEntries(rows);
      })
      .catch(() => {
        if (alive) setEntries([]);
      });
    return () => {
      alive = false;
    };
  }, []);

  const progress = xpProgress(profile.xp);
  const clearedCount = Object.values(lessons).filter((l) => l.cleared).length;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="title text-5xl">{t('dash.title')}</h1>

      <section className="border border-wood-dark bg-cream p-5">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2">
          <p className="font-mono text-3xl">{progress.rank}</p>
          <p className="text-sm text-ink-soft">{t('dash.level', { n: progress.level })}</p>
          <p className="font-mono text-xs text-ink-soft">
            {t('dash.xp', { a: progress.intoLevel, b: progress.levelSpan })}
          </p>
        </div>
        <div className="mt-4">
          <ProgressBar
            ratio={progress.ratio}
            label={t('dash.rank')}
            valueText={t('dash.xp', { a: progress.intoLevel, b: progress.levelSpan })}
          />
        </div>
        <p className="mt-3 font-mono text-xs text-ink-soft">
          {t('dash.streak', { n: profile.streakDays })} · {t('dash.cleared', { n: clearedCount })}
        </p>
      </section>

      <Achievements />

      <ReviewQueue />

      <section>
        <h2 className="font-mono text-xs text-ink-soft">{t('dash.recent')}</h2>
        {entries.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">{t('dash.empty')}</p>
        ) : (
          <ul className="mt-2 divide-y divide-wood-dark border-y border-wood-dark">
            {entries.map((e, i) => (
              <li key={e.id ?? i} className="flex items-baseline gap-3 py-2 text-sm">
                <span className="font-mono text-[11px] text-ink-soft">
                  {new Date(e.at).toLocaleString()}
                </span>
                <span>{e.lessonId === undefined ? e.kind : (getLesson(e.lessonId)?.title ?? e.lessonId)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
