import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { countTrack, TRACKS } from '@/content/catalog';
import { shellWarmup } from '@/engines/lesson/missions';
import { useT } from '@/i18n/useT';
import { xpProgress } from '@/lib/xp';
import { useStore } from '@/store';
import { Badge } from '@/ui/components/Badge';
import { ProgressBar } from '@/ui/components/ProgressBar';
import { useMotionEnabled } from '@/ui/motion';

export default function HomePage() {
  const t = useT();
  const xp = useStore((s) => s.profile.xp);
  const lessons = useStore((s) => s.lessons);
  const animate = useMotionEnabled();
  const progress = xpProgress(xp);
  const clearedCount = Object.values(lessons).filter((l) => l.cleared).length;

  return (
    <div className="flex flex-col gap-12">
      {/* 次の一手。ここだけ見れば何をすればいいか分かる */}
      <motion.section
        data-track="git"
        initial={animate ? { opacity: 0, y: 16 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="cut glow relative overflow-hidden border border-line bg-panel p-8 lg:p-12"
      >
        <p className="font-mono text-sm uppercase tracking-[0.2em] text-accent">
          {t('home.next')}
        </p>
        <h1 className="display mt-3 text-4xl text-ink lg:text-6xl">{shellWarmup.title}</h1>
        <p className="mt-5 max-w-2xl text-lg text-muted">{t('home.warmupLead')}</p>

        <ul className="mt-6 flex flex-wrap gap-3">
          {shellWarmup.objectives.map((objective) => (
            <li key={objective}>
              <Badge tone="muted">{objective}</Badge>
            </li>
          ))}
        </ul>

        <Link
          to="/sandbox"
          className="mt-8 inline-flex items-center gap-3 border-2 border-accent bg-accent/10 px-8 py-4 text-xl font-bold text-accent transition-colors hover:bg-accent hover:text-void"
        >
          {t('home.start')}
          <span aria-hidden>→</span>
        </Link>
      </motion.section>

      {/* 進み具合 */}
      <section className="grid gap-6 md:grid-cols-3">
        <div className="border border-line bg-panel/60 p-6">
          <p className="font-mono text-sm text-muted">{t('dash.rank')}</p>
          <p className="display mt-2 text-4xl text-accent">{progress.rank}</p>
          <p className="mt-3 font-mono text-sm text-muted">
            {t('dash.level', { n: progress.level })} · {String(xp)} XP
          </p>
          <div className="mt-3">
            <ProgressBar
              ratio={progress.ratio}
              label={t('dash.rank')}
              valueText={t('dash.xp', { a: progress.intoLevel, b: progress.levelSpan })}
            />
          </div>
        </div>
        <div className="border border-line bg-panel/60 p-6">
          <p className="font-mono text-sm text-muted">{t('dash.cleared', { n: clearedCount })}</p>
          <p className="display mt-2 text-4xl">{clearedCount}</p>
          <p className="mt-3 text-sm text-muted">{t('home.clearedLead')}</p>
        </div>
        <div className="border border-line bg-panel/60 p-6">
          <p className="font-mono text-sm text-muted">{t('home.buildStatus')}</p>
          <p className="display mt-2 text-4xl">P1</p>
          <p className="mt-3 text-sm text-muted">{t('home.buildLead')}</p>
        </div>
      </section>

      {/* 4つの世界 */}
      <section>
        <h2 className="display text-3xl">{t('home.worlds')}</h2>
        <p className="mt-2 text-muted">{t('home.worldsLead')}</p>

        <div className="mt-6 grid gap-5 md:grid-cols-2">
          {TRACKS.map((track, i) => {
            const counts = countTrack(track);
            return (
              <motion.div
                key={track.id}
                data-track={track.id}
                initial={animate ? { opacity: 0, y: 12 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: animate ? i * 0.06 : 0, duration: 0.3 }}
              >
                <Link
                  to={`/track/${track.id}`}
                  className="cut block h-full border border-line bg-panel p-7 transition-all hover:border-accent hover:bg-raised"
                >
                  <div className="flex items-center justify-between gap-4">
                    <h3 className="display text-3xl text-accent">{track.title}</h3>
                    <Badge tone="accent" size="sm">
                      {t('map.phase')} {track.phase}
                    </Badge>
                  </div>
                  <p className="mt-3 text-base text-muted">{track.goal}</p>
                  <p className="mt-5 font-mono text-sm text-muted">
                    {track.chapters.length} {t('map.chapters')} · {counts.lessons} {t('map.lessons')} ·{' '}
                    {counts.bosses} {t('map.bosses')}
                  </p>
                </Link>
              </motion.div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
