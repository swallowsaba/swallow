import { countAll, TRACKS } from '@/content/catalog';
import { missions } from '@/engines/lesson/missions';
import { useT } from '@/i18n/useT';
import { useStore } from '@/store';
import { Badge } from '@/ui/components/Badge';
import { ProgressBar } from '@/ui/components/ProgressBar';
import { WorldPath, type MapNode } from './WorldPath';

export default function WorldMapPage() {
  const t = useT();
  const lessons = useStore((s) => s.lessons);
  const cleared = new Set(
    Object.entries(lessons)
      .filter(([, p]) => p.cleared)
      .map(([id]) => id),
  );
  const totals = countAll();

  // 序章。いま実際に戦える場所はここだけ
  let firstOpen = true;
  const prologue: MapNode[] = missions.map((m, i) => {
    const done = cleared.has(m.id);
    const current = !done && firstOpen;
    if (current) firstOpen = false;
    return {
      id: m.id,
      mark: m.kind === 'boss' ? '★' : String(i + 1),
      label: m.title,
      state: done ? 'clear' : current ? 'current' : 'open',
      boss: m.kind === 'boss',
      to: `/quest/${m.id.split('/').pop() ?? ''}`,
    };
  });

  return (
    <div className="flex flex-col gap-16">
      <header className="max-w-3xl">
        <h1 className="display text-5xl">{t('map.title')}</h1>
        <p className="mt-4 text-lg text-muted">{t('map.lead')}</p>
        <p className="mt-4 font-mono text-base text-muted">
          {totals.lessons} {t('map.lessons')} · {totals.bosses} {t('map.bosses')} · {totals.ready}{' '}
          {t('map.ready')}
        </p>
      </header>

      <section data-track="git">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-accent pb-4">
          <h2 className="display text-4xl text-accent">序章 — 端末を手に入れる</h2>
          <Badge tone="accent" size="sm">挑戦できます</Badge>
        </div>
        <div className="mt-6">
          <WorldPath nodes={prologue} />
        </div>
      </section>

      {TRACKS.map((track) => {
        const allLessons = track.chapters.flatMap((c) => c.lessons);
        const done = allLessons.filter((l) => cleared.has(l.id)).length;
        const nodes: MapNode[] = track.chapters.map((ch) => {
          const chDone = ch.lessons.filter((l) => cleared.has(l.id)).length;
          const complete = chDone === ch.lessons.length && ch.lessons.length > 0;
          return {
            id: ch.id,
            mark: String(ch.no).padStart(2, '0'),
            label: ch.title,
            state: complete ? 'clear' : 'locked',
            boss: ch.lessons.some((l) => l.kind === 'boss'),
            to: `/track/${track.id}#${ch.id.replace('/', '-')}`,
          };
        });

        return (
          <section key={track.id} data-track={track.id}>
            <div className="flex flex-wrap items-end justify-between gap-4 border-b-2 border-accent pb-4">
              <div>
                <h2 className="display text-4xl text-accent">{track.title}</h2>
                <p className="mt-2 max-w-3xl text-base text-muted">{track.goal}</p>
              </div>
              <div className="flex items-center gap-3">
                <Badge tone="muted" size="sm">
                  {t('map.phase')} {track.phase}
                </Badge>
                <span className="font-mono text-sm text-muted">
                  {done}/{allLessons.length}
                </span>
              </div>
            </div>
            <div className="mt-4">
              <ProgressBar
                ratio={allLessons.length === 0 ? 0 : done / allLessons.length}
                size="sm"
                label={track.title}
                valueText={`${String(done)}/${String(allLessons.length)}`}
              />
            </div>
            <div className="mt-6">
              <WorldPath nodes={nodes} />
            </div>
          </section>
        );
      })}
    </div>
  );
}
