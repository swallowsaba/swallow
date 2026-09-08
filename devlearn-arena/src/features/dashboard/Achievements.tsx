import { useT } from '@/i18n/useT';
import { achievements, streakStrip, type Badge } from '@/lib/achievements';
import { dayKey } from '@/lib/date';
import { useStore } from '@/store';

const TIER_CLASS: Record<Badge['tier'], string> = {
  bronze: 'border-[var(--bronze)] text-[var(--bronze)]',
  silver: 'border-[var(--silver)] text-ink-soft',
  gold: 'border-[var(--gold-dark)] text-[var(--gold-dark)]',
};

/** 実績と、取り組んだ日の並び。どちらも進捗から毎回導く */
export function Achievements({ today }: { today?: string }) {
  const t = useT();
  const profile = useStore((s) => s.profile);
  const lessons = useStore((s) => s.lessons);
  const missionProgress = useStore((s) => s.missionProgress);

  const badges = achievements({ profile, lessons, missionProgress });
  const earned = badges.filter((b) => b.earned);
  const strip = streakStrip(profile.activeDays, today ?? dayKey(Date.now()));

  return (
    <section className="flex flex-col gap-6">
      <div>
        <h2 className="font-mono text-base text-ink-soft">{t('dash.streakTitle')}</h2>
        <p className="mt-1 text-lg">{t('dash.streak', { n: profile.streakDays })}</p>
        <ol className="mt-3 flex flex-wrap gap-1.5" aria-label={t('dash.streakTitle')}>
          {strip.map((day) => (
            <li
              key={day.day}
              className={`h-6 w-6 border ${
                day.active ? 'border-[var(--gold-dark)] bg-[var(--gold)]' : 'border-wood-dark bg-cream'
              }`}
              title={day.active ? t('dash.dayActive', { d: day.day }) : t('dash.dayIdle', { d: day.day })}
            >
              <span className="sr-only">
                {day.active ? t('dash.dayActive', { d: day.day }) : t('dash.dayIdle', { d: day.day })}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div>
        <h2 className="font-mono text-base text-ink-soft">
          {t('dash.badges', { a: earned.length, b: badges.length })}
        </h2>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {badges.map((b) => (
            <li
              key={b.id}
              className={`border-l-4 bg-cream px-4 py-3 ${
                b.earned ? TIER_CLASS[b.tier] : 'border-wood-dark text-ink-soft'
              }`}
            >
              <p className="text-base">
                {b.earned ? '★ ' : '☆ '}
                {b.requirement}
              </p>
              <p className="mt-1 font-mono text-sm">
                {b.earned ? t('dash.badgeEarned') : `${String(b.done)} / ${String(b.total)}`}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
