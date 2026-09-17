import { useMemo } from 'react';
import type { CityState } from '@/content/city';
import { nextComplaint, voicesOf } from '@/engines/city/civic';
import { analyze, createCity, HIGHWAY_LENGTH, isValidCity, terrainOf } from '@/engines/city/sim';
import type { MissionTrack } from '@/engines/lesson/types';
import { useT } from '@/i18n/useT';
import { useStore } from '@/store';
import { civicFacilities, facilityInfos } from './cityStore';

interface Props {
  track: MissionTrack;
  city: CityState;
  /** 苦情や対応待ちに応える（その施設の学習・要望へ） */
  onHandle: (facilityId: string) => void;
}

/**
 * 市政ボード。まず街を作り、住民から届いた苦情・対応待ち・評価をここで受け取る。
 * 苦情が届くまでは、街づくりの手引きと「次の声が届くまで」を見せる。
 */
export function CityBoard({ track, city, onHandle }: Props) {
  const t = useT();
  const stored = useStore((s) => s.cities[track]);
  const save = useMemo(() => (stored !== undefined && isValidCity(stored) ? stored : createCity()), [stored]);
  const terrain = useMemo(() => terrainOf(track), [track]);
  const infos = useMemo(() => facilityInfos(city), [city]);
  const analysis = useMemo(() => analyze(save, terrain, infos), [save, terrain, infos]);
  const civic = useMemo(() => civicFacilities(city), [city]);
  const voices = useMemo(() => voicesOf(civic, analysis.population, save.day), [civic, analysis.population, save.day]);
  const upcoming = useMemo(() => nextComplaint(civic, analysis.population, save.day), [civic, analysis.population, save.day]);
  const byId = (id: string) => city.facilities.find((f) => f.facility.id === id);

  const guide = [
    { done: analysis.roads > HIGHWAY_LENGTH, text: t('board.guide.road') },
    { done: analysis.zones > 0, text: t('board.guide.zone') },
    { done: analysis.population > 0, text: t('board.guide.people') },
    { done: city.built > 0, text: t('board.guide.facility') },
  ];

  return (
    <section data-testid="city-board" className="flex flex-col gap-3">
      <div className="border-4 border-wood-dark bg-white p-3">
        <p className="text-lg font-extrabold">🏛 {t('board.title', { name: city.plan.name })}</p>
        <p className="mt-1 text-sm leading-relaxed">{t('board.lead')}</p>
        <ol className="mt-2 grid gap-1 sm:grid-cols-2">
          {guide.map((g, i) => (
            <li key={g.text} data-guide-done={g.done ? 'true' : 'false'} className={`flex items-center gap-2 border-2 px-2 py-1 text-sm ${g.done ? 'border-[var(--ok)] bg-[#dff0cf]' : 'border-[var(--cream-dark)] bg-cream'}`}>
              <span className="sign px-1.5 text-xs font-extrabold">{g.done ? '済' : String(i + 1)}</span>
              {g.text}
            </li>
          ))}
        </ol>
      </div>

      {voices.length === 0 ? (
        <p className="border-l-4 border-[var(--gold-dark)] bg-[var(--gold)]/20 px-3 py-2 text-sm">{t('board.quiet')}</p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {voices.map((v) => {
          const f = byId(v.facilityId);
          if (!f) return null;
          const tone =
            v.kind === 'complaint' ? 'border-[var(--bad)] bg-[#fbe3de]' : v.kind === 'waiting' ? 'border-[var(--gold-dark)] bg-[#fff4d6]' : 'border-[var(--ok)] bg-[#dff0cf]';
          return (
            <li key={`${v.kind}:${v.facilityId}`} data-voice={v.kind} data-facility={v.facilityId} className={`flex flex-col gap-2 border-4 p-3 ${tone}`}>
              <p className="text-xs font-extrabold">
                {v.kind === 'complaint' ? t('board.complaint') : v.kind === 'waiting' ? t('board.waiting') : t('board.praise')}
                {' — '}
                {f.facility.name}
              </p>
              <div className="flex items-start gap-2">
                <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-full border-2 border-wood-dark bg-white text-xl">
                  {v.kind === 'complaint' ? '😠' : v.kind === 'waiting' ? '🙄' : '😊'}
                </span>
                <p className="relative rounded-lg border-2 border-wood-dark bg-white px-3 py-2 text-sm leading-relaxed">
                  <span className="block text-xs font-bold text-ink-soft">{f.facility.trouble.who}</span>
                  {v.kind === 'complaint'
                    ? `「${f.facility.trouble.text}」`
                    : v.kind === 'waiting'
                      ? t('board.waitingText', { name: f.facility.name, a: Math.floor(f.missionsCleared), b: f.missionsTotal })
                      : t('board.praiseText', { name: f.facility.name })}
                </p>
              </div>
              {v.kind !== 'praise' ? (
                <button
                  type="button"
                  data-handle={v.facilityId}
                  onClick={() => {
                    onHandle(v.facilityId);
                  }}
                  className="sign w-fit px-4 py-1.5 text-sm font-extrabold"
                >
                  {v.kind === 'complaint' ? t('board.handle') : t('board.continue')}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {upcoming ? (
        <div data-testid="next-voice" className="border-2 border-dashed border-wood-dark bg-cream px-3 py-2 text-sm">
          <p className="font-bold">{t('board.next')}</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="text-xs">👪</span>
            <div className="h-2 flex-1 bg-[var(--cream-dark)]">
              <div className="h-full bg-[var(--gold-dark)]" style={{ width: `${String(Math.min(100, (analysis.population / Math.max(1, upcoming.population)) * 100))}%` }} />
            </div>
            <span className="font-mono text-xs">{t('board.nextWhen', { pop: upcoming.population, day: upcoming.day })}</span>
          </div>
        </div>
      ) : null}
    </section>
  );
}
