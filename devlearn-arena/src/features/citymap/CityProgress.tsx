import { motion } from 'framer-motion';
import type { CityState } from '@/content/city';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';
import { CITY_COLOR } from '@/visual/game/cityColor';
import { FacilityPlot, PLOT_H, PLOT_W } from '@/visual/game/cityArt';
import type { MissionTrack } from '@/engines/lesson/types';

const SLOT = 44;
const SCALE = SLOT / PLOT_W;

/**
 * 街の育ち。建てる施設を通り沿いに並べ、建った分だけ明かりが灯る。
 * 数字の一覧ではなく、通りが伸びていく絵にして、あと何軒で街が完成するのかを一目で分かるようにする。
 */
export function CityProgress({ city, track, currentId }: { city: CityState; track: MissionTrack; currentId: string | null }) {
  const t = useT();
  const animate = useMotionEnabled();
  const color = CITY_COLOR[track];
  const n = city.facilities.length;
  const width = Math.max(SLOT, n * SLOT);
  const height = PLOT_H * SCALE + 18;
  return (
    <figure data-testid="city-progress" className="border-4 border-wood-dark bg-[#eaf4df]">
      <figcaption className="flex items-center gap-2 bg-[var(--wood)] px-3 py-1 text-xs font-extrabold text-cream">
        <span className="min-w-0 flex-1 truncate">{t('board.growth', { name: city.plan.name })}</span>
        <span className="font-mono">{t('board.growthCount', { a: city.built, b: n })}</span>
      </figcaption>
      <div className="p-2">
        <svg viewBox={`0 0 ${String(width)} ${String(height)}`} className="h-auto w-full" role="img" aria-label={t('board.growthCount', { a: city.built, b: n })}>
          <rect x={0} y={0} width={width} height={height} fill={color.ground} />
          <rect x={0} y={height - 14} width={width} height={14} fill="#8a8f96" />
          <line x1={0} x2={width} y1={height - 7} y2={height - 7} stroke="#fff" strokeDasharray="7 6" strokeWidth={2} />
          {city.facilities.map((f, i) => (
            <motion.g
              key={f.facility.id}
              data-progress-facility={f.facility.id}
              data-progress-state={f.state}
              transform={`translate(${String(i * SLOT)} 0) scale(${String(SCALE)})`}
              animate={animate && f.facility.id === currentId ? { opacity: [1, 0.55, 1] } : { opacity: 1 }}
              transition={animate ? { repeat: Infinity, duration: 1.6 } : { duration: 0 }}
            >
              <FacilityPlot kind={f.facility.building} track={track} state={f.state} x={0} y={0} animate={false} />
            </motion.g>
          ))}
        </svg>
      </div>
    </figure>
  );
}
