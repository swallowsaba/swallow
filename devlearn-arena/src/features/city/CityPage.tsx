import { useCallback, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CITIES, CITY_TRACKS, cityOf } from '@/content/city';
import { allMissions } from '@/engines/lesson/registry';
import type { MissionTrack } from '@/engines/lesson/types';
import { useT } from '@/i18n/useT';
import { useStore } from '@/store';
import { flushSave } from '@/store/persistence';
import { useMotionEnabled } from '@/ui/motion';
import { Glossed } from '@/ui/Term';
import { CityPortrait } from '@/visual/game/cityArt';
import { CityMap } from './CityMap';
import { FacilityLesson } from './FacilityLesson';

const MISSIONS_SHOWN = 8;

function isTrack(value: string | undefined): value is MissionTrack {
  return CITY_TRACKS.includes(value as MissionTrack);
}

/**
 * トラックごとの街。
 * 施設（概念）を学んで建て、建てた施設を任務（コマンド）で動かすと、住民が増えて街が育つ。
 * 何を学べばよいかは、住民の困りごとと「次の目標」が教えてくれる。
 */
export default function CityPage() {
  const { trackId } = useParams();
  const [params, setParams] = useSearchParams();
  const t = useT();
  const animate = useMotionEnabled();
  const track: MissionTrack = isTrack(trackId) ? trackId : 'kernel';
  const plan = CITIES[track];
  const built = useStore((s) => s.facilitiesBuilt);
  const lessons = useStore((s) => s.lessons);
  const buildFacility = useStore((s) => s.buildFacility);

  const missions = useMemo(() => allMissions().filter((m) => m.track === track), [track]);
  const cleared = useMemo(() => new Set(Object.entries(lessons).filter(([, p]) => p.cleared).map(([id]) => id)), [lessons]);
  const city = useMemo(() => cityOf(plan, new Set(built), missions, cleared), [plan, built, missions, cleared]);

  const requested = params.get('facility');
  const [picked, setPicked] = useState<string | null>(requested);
  const selectedId = picked ?? city.nextFacilityId ?? plan.facilities[0]?.id ?? null;
  const selected = city.facilities.find((f) => f.facility.id === selectedId);
  // 「街で学ぶ」から来たときは、その施設の学習をすぐ開く
  const [learning, setLearning] = useState<string | null>(() => {
    if (requested === null) return null;
    return built.includes(requested) ? null : requested;
  });
  const lessonStatus = city.facilities.find((f) => f.facility.id === learning);

  const closeLesson = useCallback(() => {
    setLearning(null);
    if (params.has('facility')) {
      params.delete('facility');
      setParams(params, { replace: true });
    }
  }, [params, setParams]);

  const missionsOf = (facilityId: string) => missions.filter((m) => m.chapterId === facilityId);
  const firstOpenMission = (facilityId: string) => missionsOf(facilityId).find((m) => !cleared.has(m.id))?.id ?? missionsOf(facilityId)[0]?.id ?? null;
  const next = city.facilities.find((f) => f.facility.id === city.nextFacilityId);

  return (
    <div className="flex flex-col gap-4" data-testid="city-page" data-track={track}>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="sign px-5 py-2 text-3xl font-extrabold">🏙 {plan.name}</h1>
        <span className="plate px-3 py-1 text-sm font-extrabold" data-testid="city-rank">
          {t(`city.rank.${city.rank}`)}
        </span>
        <nav aria-label={t('city.others')} className="flex flex-wrap gap-1">
          {CITY_TRACKS.map((other) => (
            <Link
              key={other}
              to={`/city/${other}`}
              aria-current={other === track ? 'page' : undefined}
              className={`border-2 px-2 py-1 text-sm font-bold ${other === track ? 'border-[var(--gold-dark)] bg-gold' : 'border-wood-dark bg-cream'}`}
            >
              {CITIES[other].name}
            </Link>
          ))}
        </nav>
        <Link to="/map" className="ml-auto font-mono text-sm text-[var(--gold-dark)] underline underline-offset-4">
          {t('city.back')}
        </Link>
      </div>

      <div className="bevel flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3" data-testid="city-stats">
        <span className="text-lg font-extrabold">👪 {t('city.residents', { n: city.residents })}</span>
        <span className="font-bold">🏗 {t('city.built', { a: city.built, b: city.facilities.length })}</span>
        <span className="font-bold">⚙ {t('city.complete', { a: city.complete, b: city.facilities.length })}</span>
        <div className="flex min-w-[12rem] flex-1 items-center gap-2" aria-hidden>
          <div className="h-3 flex-1 border-2 border-wood-dark bg-white">
            <div className="h-full bg-gold" style={{ width: `${String(Math.round((city.built / Math.max(1, city.facilities.length)) * 100))}%` }} />
          </div>
        </div>
      </div>

      {/* はじめて来たときの案内 */}
      {city.built === 0 ? (
        <section className="bevel flex flex-col gap-3 p-4 sm:flex-row sm:items-center" data-testid="city-welcome">
          <CityPortrait track={track} size={5} talking animate={animate} />
          <div className="flex min-w-0 flex-col gap-2">
            <p className="text-lg font-extrabold">{t('city.welcomeTitle', { name: plan.name })}</p>
            <p className="text-base leading-relaxed">{plan.welcome}</p>
            {next ? (
              <button
                type="button"
                onClick={() => {
                  setPicked(next.facility.id);
                  setLearning(next.facility.id);
                }}
                className="sign w-fit px-5 py-2 text-base font-extrabold"
              >
                {t('city.learn')}：{next.facility.name}
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="bevel h-[70vh] min-h-[440px] overflow-hidden p-0">
          <CityMap city={city} selectedId={selectedId} onSelect={setPicked} />
        </div>

        <aside className="flex flex-col gap-4">
          {/* 次の目標 */}
          <section className="bevel p-3" data-testid="city-next">
            <p className="text-xs font-extrabold text-ink-soft">{t('city.next')}</p>
            <p className="mt-1 text-base font-bold leading-snug">
              {next === undefined
                ? t('city.allDone')
                : next.state === 'available'
                  ? t('city.nextBuild', { name: next.facility.name })
                  : t('city.nextRun', { name: next.facility.name })}
            </p>
          </section>

          {selected ? (
            <section className="bevel flex flex-col gap-3 p-3" data-testid="facility-detail" data-detail={selected.facility.id}>
              <div>
                <h2 className="text-xl font-extrabold">{selected.facility.name}</h2>
                <p className="text-sm text-ink-soft">{selected.facility.concept}</p>
                <p className="mt-1 w-fit border-2 border-wood-dark bg-cream px-2 text-xs font-bold">{t(`city.state.${selected.state}`)}</p>
              </div>

              <div className="border-l-4 border-[var(--warn)] bg-white px-3 py-2 text-sm leading-relaxed">
                <p className="text-xs font-extrabold text-ink-soft">💬 {selected.facility.trouble.who}</p>
                <p>「{selected.facility.trouble.text}」</p>
              </div>

              {selected.facility.needs.length > 0 ? (
                <div className="text-sm">
                  <p className="text-xs font-extrabold text-ink-soft">{t('city.needs')}</p>
                  <ul className="flex flex-wrap gap-1">
                    {selected.facility.needs.map((id) => {
                      const need = city.facilities.find((f) => f.facility.id === id);
                      const ok = built.includes(id);
                      return (
                        <li key={id}>
                          <button
                            type="button"
                            onClick={() => {
                              setPicked(id);
                            }}
                            className={`border-2 px-2 py-0.5 text-xs font-bold ${ok ? 'border-[var(--ok)] bg-[#dff0cf]' : 'border-wood-dark bg-cream'}`}
                          >
                            {ok ? '✓ ' : ''}
                            {need?.facility.name ?? id}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  data-testid="learn-facility"
                  onClick={() => {
                    setLearning(selected.facility.id);
                  }}
                  className={`${built.includes(selected.facility.id) ? 'knob' : 'sign'} px-4 py-2 text-sm font-extrabold`}
                >
                  {built.includes(selected.facility.id) ? t('city.relearn') : t('city.learn')}
                </button>
                {built.includes(selected.facility.id) && firstOpenMission(selected.facility.id) !== null ? (
                  <Link
                    to={`/?mission=${encodeURIComponent(firstOpenMission(selected.facility.id) ?? '')}`}
                    data-testid="run-facility"
                    className="sign px-4 py-2 text-sm font-extrabold"
                  >
                    {t('city.run', { a: selected.missionsCleared, b: selected.missionsTotal })}
                  </Link>
                ) : null}
              </div>

              <div>
                <p className="text-xs font-extrabold text-ink-soft">
                  {t('city.operation')} {selected.missionsCleared} / {selected.missionsTotal}
                </p>
                <div className="mt-1 h-3 border-2 border-wood-dark bg-white" aria-hidden>
                  <div className="h-full bg-[var(--ok)]" style={{ width: `${String(Math.round(selected.ratio * 100))}%` }} />
                </div>
              </div>

              <div>
                <p className="text-xs font-extrabold text-ink-soft">{t('city.missions')}</p>
                <ul className="mt-1 flex flex-col gap-1">
                  {missionsOf(selected.facility.id)
                    .slice(0, MISSIONS_SHOWN)
                    .map((m) => (
                      <li key={m.id}>
                        <Link
                          to={`/?mission=${encodeURIComponent(m.id)}`}
                          className={`flex items-center gap-2 border-2 px-2 py-1 text-sm hover:bg-white ${cleared.has(m.id) ? 'border-[var(--ok)] bg-[#dff0cf]' : 'border-wood-dark bg-cream'}`}
                        >
                          <span aria-hidden>{cleared.has(m.id) ? '✓' : m.kind === 'boss' ? '★' : '▶'}</span>
                          <span className="min-w-0 flex-1 truncate">{m.title}</span>
                        </Link>
                      </li>
                    ))}
                  {missionsOf(selected.facility.id).length > MISSIONS_SHOWN ? (
                    <li className="text-xs text-ink-soft">{t('city.missionsMore', { n: missionsOf(selected.facility.id).length - MISSIONS_SHOWN })}</li>
                  ) : null}
                </ul>
              </div>
            </section>
          ) : (
            <p className="text-sm text-ink-soft">
              <Glossed text={t('city.pick')} />
            </p>
          )}
        </aside>
      </div>

      {lessonStatus ? (
        <FacilityLesson
          key={lessonStatus.facility.id}
          facility={lessonStatus.facility}
          track={track}
          guide={plan.guide}
          built={built.includes(lessonStatus.facility.id)}
          firstMissionId={firstOpenMission(lessonStatus.facility.id)}
          onBuild={() => {
            buildFacility(lessonStatus.facility.id);
            flushSave();
          }}
          onClose={closeLesson}
        />
      ) : null}
    </div>
  );
}
