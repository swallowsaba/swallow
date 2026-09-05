import { Link } from 'react-router-dom';
import { countAll, countTrack, TRACKS } from '@/content/catalog';
import { useT } from '@/i18n/useT';
import { useStore } from '@/store';
import { Badge } from '@/ui/components/Badge';
import { ProgressBar } from '@/ui/components/ProgressBar';
import { ChapterTile } from './ChapterTile';

export default function WorldMapPage() {
  const t = useT();
  const lessons = useStore((s) => s.lessons);
  const cleared = new Set(
    Object.entries(lessons)
      .filter(([, p]) => p.cleared)
      .map(([id]) => id),
  );
  const totals = countAll();

  return (
    <div className="flex flex-col gap-14">
      <header className="max-w-3xl">
        <h1 className="display text-5xl">{t('map.title')}</h1>
        <p className="mt-4 text-lg text-muted">{t('map.lead')}</p>
        <p className="mt-4 font-mono text-base text-muted">
          {totals.lessons} {t('map.lessons')} · {totals.bosses} {t('map.bosses')} · {totals.ready}{' '}
          {t('map.ready')}
        </p>
      </header>

      {TRACKS.map((track) => {
        const counts = countTrack(track);
        const done = track.chapters
          .flatMap((c) => c.lessons)
          .filter((l) => cleared.has(l.id)).length;
        return (
          <section key={track.id} data-track={track.id}>
            <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-accent pb-4">
              <div>
                <Link to={`/track/${track.id}`} className="display text-4xl text-accent hover:underline">
                  {track.title}
                </Link>
                <p className="mt-2 max-w-3xl text-base text-muted">{track.goal}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone="accent" size="sm">
                  {t('map.phase')} {track.phase}
                </Badge>
                <span className="font-mono text-sm text-muted">
                  {done}/{counts.lessons} {t('map.lessons')}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <ProgressBar
                ratio={counts.lessons === 0 ? 0 : done / counts.lessons}
                size="sm"
                label={track.title}
                valueText={`${String(done)}/${String(counts.lessons)}`}
              />
            </div>

            <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
              {track.chapters.map((chapter, i) => (
                <ChapterTile
                  key={chapter.id}
                  chapter={chapter}
                  index={i}
                  clearedLessonIds={cleared}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
