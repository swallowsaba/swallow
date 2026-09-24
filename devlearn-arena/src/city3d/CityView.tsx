import { Suspense, lazy, useMemo } from 'react';
import { CityCanvas } from '@/city/CityCanvas';
import { Viewport } from '@/city/Viewport';
import { TILE } from '@/city/palette';
import type { City } from '@/city/model';
import { Loading } from '@/ui/components/Loading';
import { layoutCity } from './model';
import type { InfoView } from './overlay';
import { hasWebGL } from './webgl';

/**
 * 街の絵。3D で描き、WebGL が使えないときは 2D に落とす。
 *
 * 3D は重いので `React.lazy` で後から読む。初回の読み込みに three を載せない。
 * 2D（`src/city`）は捨てずに落とし先として残してある。真っ白な画面を出さないため。
 */

const CityScene = lazy(() => import('./CityScene'));

interface Props {
  city: City;
  /** 動かしてよいか。prefers-reduced-motion のときと、止めているときは false */
  animate?: boolean;
  /** 街が進む速さの倍率。1 がそのまま、3 が早送り */
  rate?: number;
  /** 街の上に色で重ねる情報表示 */
  view?: InfoView | null;
  /** 開いたときに寄せる区域 */
  district?: string | null;
  /** 空いている区画を光らせるか */
  showSites?: boolean;
  /** 空いている区画を押したとき */
  onSite?: ((id: string) => void) | undefined;
  /** 街を押したときに端末へ送る */
  onCommand?: ((line: string) => void) | undefined;
  /** 建物を選んだとき。右の情報パネルを開くのに使う */
  onSelect?: ((id: string) => void) | undefined;
  /** いま選んでいる建物。光る輪と名札が立つ */
  selected?: string | null;
  label?: string;
}

export function CityView({
  city, animate = true, rate = 1, view = null, district = null, showSites = true, onSite,
  onCommand, onSelect, selected = null, label,
}: Props) {
  const able = hasWebGL();
  const layout = useMemo(() => (able ? layoutCity(city) : null), [city, able]);

  if (layout === null) {
    return (
      <div data-testid="city-2d" className="h-full w-full">
        <Viewport content={{ w: city.width * TILE, h: city.height * TILE }} label={label}>
          <CityCanvas
            city={city}
            animate={animate}
            selected={selected}
            {...(onSelect ? { onSelect } : {})}
            {...(onCommand ? { onCommand } : {})}
          />
        </Viewport>
      </div>
    );
  }

  return (
    <div className="h-full w-full" aria-label={label}>
      <Suspense fallback={<Loading />}>
        <CityScene
          layout={layout}
          animate={animate}
          rate={rate}
          view={view}
          district={district}
          showSites={showSites}
          onSite={onSite}
          onCommand={onCommand}
          onSelect={onSelect}
          selected={selected}
        />
      </Suspense>
    </div>
  );
}
