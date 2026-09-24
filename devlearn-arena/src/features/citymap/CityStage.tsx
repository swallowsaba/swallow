import type { City } from '@/city/model';
import type { InfoView } from '@/city3d/overlay';
import { CityView } from '@/city3d/CityView';
import type { Speed } from '@/features/park/hud/metrics';
import { SPEED_RATE } from '@/features/park/hud/metrics';
import { useMotionEnabled } from '@/ui/motion';

interface Props {
  city: City;
  label: string;
  /** いま選んでいる建物。光る輪と名札が立つ */
  selected?: string | null;
  onSelect?: ((id: string) => void) | undefined;
  /** 街を押したときに端末へ送る */
  onCommand?: ((line: string) => void) | undefined;
  /** 街の進み方。止める・そのまま・早送り */
  speed?: Speed;
  /** 街の上に色で重ねる情報表示 */
  view?: InfoView | null;
  /** 開いたときに寄せる区域。いま学んでいるカテゴリ */
  district?: string | null;
  /** 空いている区画を光らせるか */
  showSites?: boolean;
  /** 空いている区画を押したとき。建設メニューで選んだものを建てる */
  onSite?: ((id: string) => void) | undefined;
}

/**
 * 画面いっぱいの街。HUD の下に敷く。
 *
 * 枠も見出しも付けない。街の上に置くものは全て HUD 側が重ねる。
 */
export function CityStage({
  city, label, selected, onSelect, onCommand, speed = 'normal', view = null, district = null,
  showSites = true, onSite,
}: Props) {
  const motion = useMotionEnabled();
  const rate = SPEED_RATE[speed];
  return (
    <div data-testid="city-stage" className="absolute inset-0" data-speed={speed} data-view={view ?? undefined} data-sites={showSites ? 'on' : 'off'}>
      <CityView
        city={city}
        animate={motion && rate > 0}
        rate={rate}
        view={view}
        district={district}
        showSites={showSites}
        {...(onSite ? { onSite } : {})}
        label={label}
        selected={selected ?? null}
        {...(onSelect ? { onSelect } : {})}
        {...(onCommand ? { onCommand } : {})}
      />
    </div>
  );
}
