import { useMemo } from 'react';
import type { CityState } from '@/content/city';
import { nextComplaint, voicesOf } from '@/engines/city/civic';
import { useT } from '@/i18n/useT';
import { MoodFace } from '@/visual/game/MoodFace';
import { MOOD_OF_VOICE } from '@/visual/game/faces';
import type { MissionTrack } from '@/engines/lesson/types';
import { CityProgress } from './CityProgress';
import { Icon } from '@/ui/Icon';
import { civicFacilities } from './cityStore';

interface Props {
  city: CityState;
  /** どのカテゴリの街か。育ちの絵を描くのに使う */
  track: MissionTrack;
  /** 苦情や対応待ちに応える（その施設の学習・要望へ） */
  onHandle: (facilityId: string) => void;
}

/**
 * 市政ボード。住民から届いた苦情・対応待ち・評価をここで受け取る。
 * 街はコマンドでしか育たない。苦情に対応して要望を解決するたびに街が育ち、次の声が届く。
 */
export function CityBoard({ city, track, onHandle }: Props) {
  const t = useT();
  const civic = useMemo(() => civicFacilities(city), [city]);
  const voices = useMemo(() => voicesOf(civic), [civic]);
  const upcoming = useMemo(() => nextComplaint(civic), [civic]);
  const byId = (id: string) => city.facilities.find((f) => f.facility.id === id);

  return (
    <section data-testid="city-board" className="flex flex-col gap-3 p-4">
      <div className="ui-card p-4">
        <p className="flex items-center gap-2 text-[17px] font-bold tracking-tight">
          <Icon name="city" size={18} />
          {t('board.title', { name: city.plan.name })}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--u-text-2)]">{t('board.lead')}</p>
      </div>

      <CityProgress city={city} track={track} currentId={voices.find((v) => v.kind !== 'praise')?.facilityId ?? null} />

      {voices.length === 0 ? <p className="ui-note ui-note-info">{t('board.quiet')}</p> : null}

      <ul className="flex flex-col gap-2">
        {voices.map((v) => {
          const f = byId(v.facilityId);
          if (!f) return null;
          const tone =
            v.kind === 'complaint' ? 'bg-[var(--u-bad-soft)]' : v.kind === 'waiting' ? 'bg-[var(--u-warn-soft)]' : 'bg-[var(--u-ok-soft)]';
          return (
            <li key={`${v.kind}:${v.facilityId}`} data-voice={v.kind} data-facility={v.facilityId} className={`ui-card flex flex-col gap-2 p-3 ${tone}`}>
              <p className="ui-eyebrow">
                {v.kind === 'complaint' ? t('board.complaint') : v.kind === 'waiting' ? t('board.waiting') : t('board.praise')}
                {' — '}
                {f.facility.name}
              </p>
              <div className="flex items-start gap-2">
                <MoodFace mood={MOOD_OF_VOICE[v.kind]} size={40} animate />
                <p className="ui-card min-w-0 flex-1 px-3 py-2 text-[13px] leading-relaxed">
                  <span className="ui-eyebrow block">{f.facility.trouble.who}</span>
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
                  className="ui-btn ui-btn-primary h-9 w-fit px-4 text-[13px]"
                >
                  {v.kind === 'complaint' ? t('board.handle') : t('board.continue')}
                  <Icon name="next" size={15} />
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      {upcoming ? (
        <p data-testid="next-voice" className="ui-flat px-3 py-2 text-[12px] text-[var(--u-text-2)]">
          {t('board.nextSolve', { n: upcoming.remaining })}
        </p>
      ) : null}
    </section>
  );
}
