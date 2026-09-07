import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLesson, getTrack } from '@/content/catalog';
import { useT } from '@/i18n/useT';
import { appendJournal } from '@/lib/storage/idb';
import { Badge } from '@/ui/components/Badge';
import NotFoundPage from '../NotFoundPage';

export default function LessonPage() {
  const { trackId = '', chapterNo = '', lessonSlug = '' } = useParams();
  const t = useT();
  const lessonId = `${trackId}/${chapterNo}/${lessonSlug}`;
  const lesson = getLesson(lessonId);
  const track = getTrack(trackId);

  useEffect(() => {
    if (!lesson) return;
    void appendJournal({ at: Date.now(), kind: 'lesson_opened', lessonId: lesson.id });
  }, [lesson]);

  if (!lesson || !track) return <NotFoundPage />;

  return (
    <div data-track={track.id} className="flex flex-col gap-6">
      <header>
        <Link to={`/track/${track.id}`} className="font-mono text-xs text-ink-soft hover:text-ink">
          {t('lesson.back')}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="title text-3xl">{lesson.title}</h1>
          <Badge tone="accent">{lesson.kind}</Badge>
          <span className="font-mono text-xs text-ink-soft">{lessonId}</span>
        </div>
      </header>

      {lesson.status === 'ready' ? (
        <section className="border-l-4 border-[var(--gold-dark)] bg-cream px-5 py-4">
          <p className="text-lg">{t('lesson.readyTitle')}</p>
          <p className="mt-1 text-base text-ink-soft">{t('lesson.readyBody')}</p>
          <Link
            to={`/?mission=${encodeURIComponent(lesson.id)}`}
            className="mt-3 inline-block border border-wood-dark px-4 py-2 font-mono text-base text-[var(--gold-dark)] hover:bg-cream-dark"
          >
            {t('lesson.play')} →
          </Link>
        </section>
      ) : (
        <section className="border-l-4 border-wood-dark bg-cream px-5 py-4">
          <p className="text-lg">{t('lesson.plannedTitle')}</p>
          <p className="mt-1 max-w-2xl text-base leading-relaxed text-ink-soft">
            {t('lesson.plannedBody', { phase: track.phase })}
          </p>
        </section>
      )}

      <section>
        <h2 className="font-mono text-xs text-ink-soft">{t('lesson.docs')}</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {lesson.docs.map((d) => (
            <li key={d.url}>
              <a
                href={d.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-[var(--gold-dark)] underline underline-offset-4"
              >
                {d.label}
              </a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
