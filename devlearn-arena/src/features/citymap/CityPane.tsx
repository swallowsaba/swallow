import type { CityState } from '@/content/city';
import type { ShellState } from '@/engines/kernel/registry';
import type { MissionTrack } from '@/engines/lesson/types';
import { useT } from '@/i18n/useT';
import { Icon } from '@/ui/Icon';

/** 地図の上に流す出来事（正解・手順・完了・建設） */
export interface CityEvent {
  id: number;
  facilityId: string | null;
  text: string;
  color: string;
}

interface Props {
  track: MissionTrack;
  city: CityState;
  state: ShellState;
  events?: CityEvent[] | undefined;
}

/**
 * 右側の枠。街を映す場所。
 *
 * 斜め45度の旧い街と、絵文字で描いていた建物は捨てた。
 * 新しい街（真上から見た SVG の街）ができるまでは、いまの居場所と出来事だけを出す。
 */
export function CityPane({ city, state, events }: Props) {
  const t = useT();
  return (
    <section data-testid="city-pane" className="flex h-full min-h-0 flex-col bg-cream">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--u-line)] bg-[var(--u-card)] px-3 py-2 text-[13px] font-semibold">
        <Icon name="city" size={15} />
        {city.plan.name}
        <span className="ml-auto font-mono text-[11px] text-[var(--u-text-2)]" data-testid="city-cwd">
          {state.cwd}
        </span>
      </div>
      <div className="grid min-h-0 flex-1 place-items-center p-4">
        <p className="text-[13px] text-[var(--u-text-2)]">{t('world.stats', { a: city.built, b: city.facilities.length })}</p>
      </div>
      {events && events.length > 0 ? (
        <ul className="shrink-0 border-t border-[var(--u-line)] px-3 py-2">
          {events.slice(-3).map((e) => (
            <li key={e.id} data-city-event={e.id} className="text-[12px]" style={{ color: e.color }}>
              {e.text}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
