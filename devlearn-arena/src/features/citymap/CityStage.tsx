import type { City } from '@/city/model';
import { CityView } from '@/city3d/CityView';
import { useMotionEnabled } from '@/ui/motion';

interface Props {
  city: City;
  label: string;
  /** いま選んでいる建物。光る輪と名札が立つ */
  selected?: string | null;
  onSelect?: ((id: string) => void) | undefined;
  /** 街を押したときに端末へ送る */
  onCommand?: ((line: string) => void) | undefined;
}

/**
 * 画面いっぱいの街。HUD の下に敷く。
 *
 * 枠も見出しも付けない。街の上に置くものは全て HUD 側が重ねる。
 */
export function CityStage({ city, label, selected, onSelect, onCommand }: Props) {
  const animate = useMotionEnabled();
  return (
    <div data-testid="city-stage" className="absolute inset-0">
      <CityView
        city={city}
        animate={animate}
        label={label}
        selected={selected ?? null}
        {...(onSelect ? { onSelect } : {})}
        {...(onCommand ? { onCommand } : {})}
      />
    </div>
  );
}
