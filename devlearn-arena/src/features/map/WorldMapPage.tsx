import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { countAll, TRACKS } from '@/content/catalog';
import { CITIES, CITY_TRACKS, cityOf } from '@/content/city';
import { nextComplaint, voicesOf } from '@/engines/city/civic';
import { allMissions, mainMissions, recommendedNext } from '@/engines/lesson/registry';
import type { MissionTrack } from '@/engines/lesson/types';
import { civicFacilities } from '@/features/citymap/cityStore';
import { TRACK_ACCENT } from '@/features/citymap/isoDraw';
import { useT } from '@/i18n/useT';
import { xpProgress } from '@/lib/xp';
import { useStore } from '@/store';
import { RegionMap } from './RegionMap';
import type { RegionCity } from './regionDraw';
import { MoodFace } from '@/visual/game/MoodFace';

/**
 * 全体図。5 つの街を、実際に建てた施設の建ち具合で地方の地図に描く。
 * 街を押すと右の案内板にその街の様子（施設・苦情・評価・進み具合）が出て、「この街へ」で作業画面に入る。
 */
export default function WorldMapPage() {
  const t = useT();
  const lessons = useStore((s) => s.lessons);
  const facilitiesBuilt = useStore((s) => s.facilitiesBuilt);
  const xp = useStore((s) => s.profile.xp);
  const lastMissionId = useStore((s) => s.lastMissionId);

  const cleared = useMemo(() => new Set(Object.entries(lessons).filter(([, p]) => p.cleared).map(([id]) => id)), [lessons]);
  const built = useMemo(() => new Set(facilitiesBuilt), [facilitiesBuilt]);
  const recommended = useMemo(() => recommendedNext(cleared), [cleared]);
  const rank = xpProgress(xp);

  const summaries = useMemo(
    () =>
      CITY_TRACKS.map((track) => {
        const missions = mainMissions().filter((m) => m.track === track);
        const city = cityOf(CITIES[track], built, missions, cleared);
        const voices = voicesOf(civicFacilities(city));
        const done = missions.filter((m) => cleared.has(m.id)).length;
        return {
          track,
          title: TRACKS.find((tr) => tr.id === track)?.title ?? CITIES[track].name,
          goal: TRACKS.find((tr) => tr.id === track)?.goal ?? '',
          city,
          voices,
          next: nextComplaint(civicFacilities(city)),
          done,
          total: missions.length,
        };
      }),
    [built, cleared],
  );
  const regionCities = useMemo<RegionCity[]>(
    () =>
      summaries.map((s) => ({
        track: s.track,
        name: s.city.plan.name,
        complaints: s.voices.filter((v) => v.kind === 'complaint').length,
        progress: s.total === 0 ? 0 : s.done / s.total,
        facilities: s.city.facilities.map((f) => {
          const learned = f.state !== 'locked' && f.state !== 'available';
          return { kind: f.facility.building, built: learned, ratio: f.ratio, build: learned ? Math.min(1, f.missionsCleared) : 0 };
        }),
      })),
    [summaries],
  );

  const lastTrack = lastMissionId === null ? undefined : allMissions().find((m) => m.id === lastMissionId)?.track;
  const [selected, setSelected] = useState<MissionTrack>(lastTrack ?? 'kernel');
  const current = summaries.find((s) => s.track === selected) ?? summaries[0];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="sign inline-block px-6 py-2 text-3xl font-extrabold">{t('map.title')}</h1>
        <p className="font-mono text-base text-ink-soft">
          {t('map.rankLine', { rank: rank.rank, level: rank.level, a: cleared.size, b: countAll().lessons })}
        </p>
      </div>
      {recommended ? (
        <Link to={`/?mission=${encodeURIComponent(recommended.id)}`} className="sign flex w-fit flex-wrap items-center gap-3 px-5 py-2 text-base font-extrabold">
          <span aria-hidden>▶</span>
          {t(cleared.size === 0 ? 'map.startHere' : 'map.continueHere', { title: recommended.title })}
        </Link>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
        <div className="bevel h-[34rem] overflow-hidden p-1">
          <RegionMap
            cities={regionCities}
            selected={selected}
            onSelect={setSelected}
            label={t('map.regionLabel')}
          />
        </div>

        {current ? (
          <aside data-testid="city-guide" data-track={current.track} className="flex flex-col gap-3 border-4 border-wood-dark bg-cream p-4">
            <p className="w-fit rounded px-2 py-0.5 text-xs font-extrabold text-white" style={{ background: TRACK_ACCENT[current.track] }}>
              {t('map.guideLabel')}
            </p>
            <h2 className="text-2xl font-extrabold">{current.city.plan.name}</h2>
            <p className="border-l-4 border-[var(--gold-dark)] bg-white px-3 py-2 text-sm">{current.goal}</p>
            <div className="h-2 bg-[var(--cream-dark)]">
              <div className="h-full" style={{ width: `${String(current.total === 0 ? 0 : (current.done / current.total) * 100)}%`, background: TRACK_ACCENT[current.track] }} />
            </div>
            <ul className="grid grid-cols-2 gap-2 text-sm">
              <li className="bg-white px-2 py-1">{t('map.guideFacilities', { a: current.city.built, b: current.city.facilities.length })}</li>
              <li className="bg-white px-2 py-1">{t('map.guideMissions', { a: current.done, b: current.total })}</li>
              <li className="flex items-center gap-1 bg-white px-2 py-1">
                <MoodFace mood="angry" size={20} />
                {t('map.guideComplaints', { n: current.voices.filter((v) => v.kind === 'complaint').length })}
              </li>
              <li className="flex items-center gap-1 bg-white px-2 py-1">
                <MoodFace mood="happy" size={20} />
                {t('map.guidePraise', { n: current.voices.filter((v) => v.kind === 'praise').length })}
              </li>
            </ul>
            {current.voices.filter((v) => v.kind === 'complaint').slice(0, 2).map((v) => {
              const f = current.city.facilities.find((x) => x.facility.id === v.facilityId);
              return f ? (
                <p key={v.facilityId} className="rounded border-2 border-[var(--bad)] bg-[#fbe3de] px-2 py-1 text-xs leading-relaxed">
                  <b>{f.facility.trouble.who}</b>「{f.facility.trouble.text}」
                </p>
              ) : null;
            })}
            {current.next ? <p className="text-xs text-ink-soft">{t('board.nextSolve', { n: current.next.remaining })}</p> : null}
            <Link to={`/world/${current.track}`} data-testid="guide-enter" className="sign px-4 py-2 text-center text-base font-extrabold">
              {t('map.enterCity', { name: current.city.plan.name })}
            </Link>

            <p className="mt-2 text-xs font-extrabold text-ink-soft">{t('map.allCities')}</p>
            <ul className="flex flex-col gap-1">
              {summaries.map((s) => (
                <li key={s.track} className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={s.track === selected}
                    onClick={() => {
                      setSelected(s.track);
                    }}
                    className={`h-7 w-7 shrink-0 rounded-full border-2 text-xs font-extrabold ${s.track === selected ? 'border-[var(--gold-dark)] bg-gold' : 'border-wood-dark bg-white'}`}
                    aria-label={s.city.plan.name}
                  >
                    {s.voices.some((v) => v.kind === 'complaint') ? '!' : '・'}
                  </button>
                  <Link to={`/world/${s.track}`} className="flex min-w-0 flex-1 items-center justify-between gap-2 border-2 border-wood-dark bg-white px-2 py-1 text-sm hover:bg-[var(--gold)]/30">
                    <span className="truncate font-bold">
                      {s.title} {s.done}/{s.total}
                    </span>
                    <span className="shrink-0 text-xs text-ink-soft">{s.city.plan.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </div>
    </div>
  );
}
