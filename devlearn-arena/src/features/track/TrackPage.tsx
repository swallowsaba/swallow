import { Link, useParams } from 'react-router-dom';
import { getTrack } from '@/content/catalog';
import { useT } from '@/i18n/useT';
import { useStore } from '@/store';
import NotFoundPage from '../NotFoundPage';
import { ChapterSection } from './ChapterSection';

export default function TrackPage() {
  const { trackId = '' } = useParams();
  const t = useT();
  const lessons = useStore((s) => s.lessons);
  const track = getTrack(trackId);
  if (!track) return <NotFoundPage />;

  const cleared = (id: string): boolean => lessons[id]?.cleared === true;

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
        <ChapterSection key={ch.id} chapter={ch} cleared={cleared} />
      ))}
    </div>
  );
}
