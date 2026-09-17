import { useMemo } from 'react';
import type { CityState } from '@/content/city';
import { nextComplaint, voicesOf } from '@/engines/city/civic';
import { useT } from '@/i18n/useT';
import { civicFacilities } from './cityStore';

interface Props {
  city: CityState;
  /** 苦情や対応待ちに応える（その施設の学習・要望へ） */
  onHandle: (facilityId: string) => void;
}

/**
 * 市政ボード。住民から届いた苦情・対応待ち・評価をここで受け取る。
 * 街はコマンドでしか育たない。苦情に対応して要望を解決するたびに街が育ち、次の声が届く。
 */
export function CityBoard({ city, onHandle }: Props) {
  const t = useT();
  const civic = useMemo(() => civicFacilities(city), [city]);
  const voices = useMemo(() => voicesOf(civic), [civic]);
  const upcoming = useMemo(() => nextComplaint(civic), [civic]);
  const byId = (id: string) => city.facilities.find((f) => f.facility.id === id);

  return (
    <section data-testid="city-board" className="flex flex-col gap-3">
      <div className="border-4 border-wood-dark bg-white p-3">
        <p className="text-lg font-extrabold">🏛 {t('board.title', { name: city.plan.name })}</p>
        <p className="mt-1 text-sm leading-relaxed">{t('board.lead')}</p>
      </div>

      {voices.length === 0 ? <p className="border-l-4 border-[var(--gold-dark)] bg-[var(--gold)]/20 px-3 py-2 text-sm">{t('board.quiet')}</p> : null}

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
                <p className="rounded-lg border-2 border-wood-dark bg-white px-3 py-2 text-sm leading-relaxed">
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
        <p data-testid="next-voice" className="border-2 border-dashed border-wood-dark bg-cream px-3 py-2 text-sm">
          {t('board.nextSolve', { n: upcoming.remaining })}
        </p>
      ) : null}
    </section>
  );
}
