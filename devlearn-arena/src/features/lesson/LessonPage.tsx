import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getLesson, getTrack } from '@/content/catalog';
import { useT } from '@/i18n/useT';
import { appendJournal } from '@/lib/storage/idb';
import { Tag } from '@/ui/components/Tag';
import NotFoundPage from '../NotFoundPage';
import { SplitLayout } from './SplitLayout';

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
        <Link to={`/track/${track.id}`} className="font-mono text-xs text-muted hover:text-ink">
          {t('lesson.back')}
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight">{lesson.title}</h1>
          <Tag tone="accent">{lesson.kind}</Tag>
          <span className="font-mono text-xs text-muted">{lessonId}</span>
        </div>
      </header>

      <SplitLayout
        terminalLabel={t('lesson.terminal')}
        visualLabel={t('lesson.visualizer')}
        terminal={
          <pre className="h-full overflow-auto p-3 font-mono text-xs leading-relaxed text-muted">
{`$ # シェルは P1 で有効になります
$ # ここに xterm.js とシェルパーサが入ります`}
          </pre>
        }
        visual={
          <div className="grid h-full place-items-center p-6 text-center">
            <div>
              <p className="text-sm">{t('lesson.plannedTitle')}</p>
              <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted">
                {t('lesson.plannedBody', { phase: track.phase })}
              </p>
            </div>
          </div>
        }
      />

      <section>
        <h2 className="font-mono text-xs text-muted">{t('lesson.docs')}</h2>
        <ul className="mt-2 flex flex-col gap-1">
          {lesson.docs.map((d) => (
            <li key={d.url}>
              <a
                href={d.url}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-accent underline underline-offset-4"
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
