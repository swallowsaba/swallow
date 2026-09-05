import { Link, useParams } from 'react-router-dom';
import { getTrack } from '@/content/catalog';
import type { LessonMeta } from '@/content/types';
import { useT } from '@/i18n/useT';
import { useStore } from '@/store';
import { Tag } from '@/ui/components/Tag';
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

  const lessonHref = (l: LessonMeta) => `/lesson/${l.trackId}/${l.chapterId.split('/')[1] ?? ''}/${l.slug}`;

  return (
    <div data-track={track.id} className="flex flex-col gap-8">
      <header>
        <Link to="/map" className="font-mono text-xs text-muted hover:text-ink">
          {t('track.back')}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{track.title}</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          <span className="font-mono text-xs text-accent">{t('track.goal')}: </span>
          {track.goal}
        </p>
      </header>

      <div className="flex flex-col gap-6">
        {track.chapters.map((ch) => (
          <section key={ch.id} id={ch.id.replace('/', '-')} className="border-l-2 border-line pl-4">
            <h2 className="flex flex-wrap items-baseline gap-3">
              <span className="font-mono text-xs text-accent">{t('track.chapter', { n: ch.no })}</span>
              <span className="text-lg font-semibold">{ch.title}</span>
            </h2>
            <p className="mt-1 text-sm text-muted">{ch.summary}</p>

            <ul className="mt-3 divide-y divide-line border-y border-line">
              {ch.lessons.map((l) => {
                const done = lessons[l.id]?.cleared === true;
                return (
                  <li key={l.id}>
                    <Link
                      to={lessonHref(l)}
                      className="flex flex-wrap items-center gap-3 px-1 py-2.5 hover:bg-raised"
                    >
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 ${done ? 'bg-accent' : 'bg-line'}`}
                      />
                      <span className="flex-1 text-sm">{l.title}</span>
                      {done ? <Tag tone="accent">{t('map.ready')}</Tag> : null}
                      <Tag tone={l.kind === 'boss' ? 'accent' : 'muted'}>{t(kindKey[l.kind])}</Tag>
                      <span className="font-mono text-[11px] text-muted">
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
    </div>
  );
}
