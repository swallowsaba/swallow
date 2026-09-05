import { Link, useParams } from 'react-router-dom';
import { getTrack } from '@/content/catalog';
import type { LessonMeta } from '@/content/types';
import { useT } from '@/i18n/useT';
import { useStore } from '@/store';
import { Badge } from '@/ui/components/Badge';
import NotFoundPage from '../NotFoundPage';

const kindKey = {
  concept: 'lesson.kind.concept',
  drill: 'lesson.kind.drill',
  challenge: 'lesson.kind.challenge',
  boss: 'lesson.kind.boss',
} as const;

export default function TrackPage() {
  const { trackId = '' } = useParams();
  const t = useT();
  const lessons = useStore((s) => s.lessons);
  const track = getTrack(trackId);
  if (!track) return <NotFoundPage />;

  const lessonHref = (l: LessonMeta): string =>
    `/lesson/${l.trackId}/${l.chapterId.split('/')[1] ?? ''}/${l.slug}`;

  return (
    <div data-track={track.id} className="flex flex-col gap-12">
      <header>
        <Link to="/map" className="font-mono text-base text-muted hover:text-ink">
          ← {t('track.back')}
        </Link>
        <h1 className="display mt-3 text-5xl text-accent">{track.title}</h1>
        <p className="mt-4 max-w-3xl text-lg text-muted">
          <span className="font-mono text-base text-accent">{t('track.goal')}: </span>
          {track.goal}
        </p>
      </header>

      {track.chapters.map((ch) => (
        <section key={ch.id} id={ch.id.replace('/', '-')}>
          <div className="flex items-baseline gap-5">
            <span className="display text-5xl text-accent/40">{String(ch.no).padStart(2, '0')}</span>
            <div>
              <h2 className="display text-2xl">{ch.title}</h2>
              <p className="mt-1 text-base text-muted">{ch.summary}</p>
            </div>
          </div>

          <ul className="mt-5 flex flex-col gap-2">
            {ch.lessons.map((l) => {
              const done = lessons[l.id]?.cleared === true;
              const boss = l.kind === 'boss';
              return (
                <li key={l.id}>
                  <Link
                    to={lessonHref(l)}
                    className={`flex flex-wrap items-center gap-4 border-l-4 bg-panel/60 px-5 py-4 transition-colors hover:bg-raised ${
                      boss ? 'border-[var(--c-warn)]' : done ? 'border-accent' : 'border-line'
                    }`}
                  >
                    <span className="flex-1 text-lg">{l.title}</span>
                    {done ? <Badge tone="ok" size="sm">{t('map.ready')}</Badge> : null}
                    <Badge tone={boss ? 'warn' : 'muted'} size="sm">
                      {t(kindKey[l.kind])}
                    </Badge>
                    <span className="font-mono text-sm text-muted">
                      {t('track.minutes', { n: l.minutes })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
