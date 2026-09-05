import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { countAll, countTrack, TRACKS } from '@/content/catalog';
import { useT } from '@/i18n/useT';
import { useStore } from '@/store';
import { Tag } from '@/ui/components/Tag';
import { useMotionEnabled } from '@/ui/motion';
import { ChapterRail } from './ChapterRail';

export default function WorldMapPage() {
  const t = useT();
  const lessons = useStore((s) => s.lessons);
  const animate = useMotionEnabled();
  const cleared = new Set(
    Object.entries(lessons)
      .filter(([, p]) => p.cleared)
      .map(([id]) => id),
  );
  const totals = countAll();

  return (
    <div className="flex flex-col gap-10">
      <section className="max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight">{t('map.title')}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{t('map.lead')}</p>
        <p className="mt-3 font-mono text-xs text-muted">
          {totals.lessons} {t('map.lessons')} / {totals.bosses} {t('map.bosses')} / {totals.ready}{' '}
          {t('map.ready')}
        </p>
      </section>

      <div className="flex flex-col gap-8">
        {TRACKS.map((track, i) => {
          const counts = countTrack(track);
          return (
            <motion.section
              key={track.id}
              data-track={track.id}
              initial={animate ? { opacity: 0, y: 8 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: animate ? i * 0.06 : 0, duration: 0.3 }}
              className="border border-line bg-panel/70 p-5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="flex items-baseline gap-3 text-lg font-semibold">
                  <span aria-hidden className="inline-block h-3 w-3 bg-accent" />
                  {track.title}
                </h2>
                <div className="flex items-center gap-2">
                  <Tag tone="muted">
                    {track.chapters.length} {t('map.chapters')}
                  </Tag>
                  <Tag tone="muted">
                    {counts.lessons} {t('map.lessons')}
                  </Tag>
                  <Tag tone="accent">
                    {t('map.phase')} {track.phase}
                  </Tag>
                </div>
              </div>
              <p className="mt-2 max-w-3xl text-sm text-muted">{track.goal}</p>

              <div className="mt-5">
                <ChapterRail chapters={track.chapters} clearedLessonIds={cleared} />
              </div>

              <Link
                to={`/track/${track.id}`}
                className="mt-4 inline-block border border-accent px-3 py-1.5 font-mono text-xs text-accent hover:bg-accent hover:text-void"
              >
                {t('map.openTrack')}
              </Link>
            </motion.section>
          );
        })}
      </div>
    </div>
  );
}
