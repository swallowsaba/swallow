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

  // 遊べるものは学習画面へ直接、まだのものは目次の説明ページへ送る
  const lessonHref = (l: LessonMeta): string =>
    l.status === 'ready'
      ? `/?mission=${encodeURIComponent(l.id)}`
      : `/lesson/${l.trackId}/${l.chapterId.split('/')[1] ?? ''}/${l.slug}`;

  return (
    <div data-track={track.id} className="flex flex-col gap-12">
      <header>
        <Link to="/map" className="font-mono text-base text-ink-soft hover:text-ink">
          ← {t('track.back')}
        </Link>
        <h1 className="title mt-3 text-5xl text-[var(--gold-dark)]">{track.title}</h1>
        <p className="mt-4 max-w-3xl text-lg text-ink-soft">
          <span className="font-mono text-base text-[var(--gold-dark)]">{t('track.goal')}: </span>
          {track.goal}
        </p>
      </header>

      {track.chapters.map((ch) => (
        <section key={ch.id} id={ch.id.replace('/', '-')}>
          <div className="flex items-baseline gap-5">
            <span className="title text-5xl text-[var(--gold-dark)]/40">{String(ch.no).padStart(2, '0')}</span>
            <div>
              <h2 className="title text-2xl">{ch.title}</h2>
              <p className="mt-1 text-base text-ink-soft">{ch.summary}</p>
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
                    className={`flex flex-wrap items-center gap-4 border-l-4 bg-cream px-5 py-4 transition-colors hover:bg-cream-dark ${
                      boss ? 'border-[var(--warn)]' : done ? 'border-wood-dark' : 'border-wood-dark'
                    }`}
                  >
                    <span className="flex-1 text-lg">{l.title}</span>
                    {done ? <Badge tone="ok" size="sm">{t('track.cleared')}</Badge> : null}
                    <Badge tone={l.status === 'ready' ? 'accent' : 'muted'} size="sm">
                      {t(l.status === 'ready' ? 'map.ready' : 'map.planned')}
                    </Badge>
                    <Badge tone={boss ? 'warn' : 'muted'} size="sm">
                      {t(kindKey[l.kind])}
                    </Badge>
                    <span className="font-mono text-sm text-ink-soft">
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
