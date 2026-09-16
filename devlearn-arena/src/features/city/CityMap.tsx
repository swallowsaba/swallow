import { motion } from 'framer-motion';
import { useMemo, type KeyboardEvent } from 'react';
import type { CityState } from '@/content/city';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';
import { CITY_COLOR } from '@/visual/game/cityColor';
import { FacilityPlot, PLOT_W } from '@/visual/game/cityArt';
import { Sprite } from '@/visual/game/pixel';
import { Sign } from '@/visual/game/scenery';
import { HERO, heroPalette, INK } from '@/visual/game/sprites';
import { Viewport } from '@/visual/Viewport';
import { layoutCity, STREET_H } from './cityLayout';

interface Props {
  city: CityState;
  selectedId: string | null;
  onSelect: (facilityId: string) => void;
}

const SHIRTS = ['#c0604a', '#3f6f8f', '#6f8f3f', '#8a66c0', '#e8823c', '#2fa396'];

/**
 * 街の地図。学ぶ順に施設の区画が通りに沿って並ぶ。
 * 建てた施設には住民が集まり、通りを歩く人が増えていく。次に取り組む施設には「！」が出る。
 */
export function CityMap({ city, selectedId, onSelect }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const layout = useMemo(() => layoutCity(city.plan), [city.plan]);
  const track = city.plan.track;
  const walkers = Math.min(10, Math.floor(city.residents / 25));
  const mainStreets = layout.streets.filter((s) => s.w > s.h);

  return (
    <Viewport label={t('city.mapLabel', { name: city.plan.name })}>
      <svg
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`}
        role="img"
        aria-label={t('city.mapLabel', { name: city.plan.name })}
        className="block"
        style={{ imageRendering: 'pixelated' }}
      >
        <rect width={layout.width} height={layout.height} fill={CITY_COLOR[track].ground} />
        {layout.streets.map((s, i) => (
          <g key={i} aria-hidden>
            <rect x={s.x} y={s.y} width={s.w} height={s.h} fill="#8f877a" />
            <rect x={s.x + 3} y={s.y + 3} width={s.w - 6} height={s.h - 6} fill="#b9b2a4" />
            {s.w > s.h ? <line x1={s.x + 10} x2={s.x + s.w - 10} y1={s.y + s.h / 2} y2={s.y + s.h / 2} stroke="#f6e8cd" strokeWidth={2} strokeDasharray="14 10" /> : null}
          </g>
        ))}

        {city.facilities.map(({ facility, state }) => {
          const plot = layout.byId.get(facility.id);
          if (!plot) return null;
          const selected = facility.id === selectedId;
          const next = facility.id === city.nextFacilityId;
          return (
            <g
              key={facility.id}
              role="button"
              tabIndex={0}
              aria-label={`${facility.name}（${t(`city.state.${state}`)}）`}
              aria-pressed={selected}
              data-facility={facility.id}
              data-state={state}
              data-next={next ? 'true' : 'false'}
              style={{ cursor: 'pointer' }}
              onClick={() => {
                onSelect(facility.id);
              }}
              onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect(facility.id);
                }
              }}
            >
              <title>{`${facility.name} — ${facility.concept}`}</title>
              <rect
                x={plot.box.x - 6}
                y={plot.box.y - 6}
                width={plot.box.w + 12}
                height={plot.box.h + 44}
                fill={selected ? 'rgba(242,193,78,0.35)' : 'transparent'}
                stroke={selected ? '#b8862b' : 'none'}
                strokeWidth={3}
              />
              <FacilityPlot kind={facility.building} track={track} state={state} x={plot.box.x} y={plot.box.y} animate={animate} />
              <Sign
                cx={plot.box.x + PLOT_W / 2}
                y={plot.labelY}
                text={facility.name}
                size={12}
                maxWidth={PLOT_W + 20}
                tone={state === 'locked' ? '#ddc79f' : state === 'available' ? '#f2c14e' : '#f6e8cd'}
                strong={selected}
              />
              {next ? (
                <motion.g
                  data-testid="next-marker"
                  animate={animate ? { y: [0, -6, 0] } : { y: 0 }}
                  transition={animate ? { repeat: Infinity, duration: 1 } : { duration: 0 }}
                >
                  <circle cx={plot.box.x + PLOT_W - 10} cy={plot.box.y + 10} r={14} fill="#f2c14e" stroke={INK} strokeWidth={2.5} />
                  <text x={plot.box.x + PLOT_W - 10} y={plot.box.y + 11} fontSize={17} fontWeight={900} textAnchor="middle" dominantBaseline="middle" fill={INK}>
                    !
                  </text>
                </motion.g>
              ) : null}
            </g>
          );
        })}

        {/* 住民。建てた施設が増えるほど、通りを歩く人が増える */}
        {Array.from({ length: walkers }, (_, i) => {
          const street = mainStreets[i % Math.max(1, mainStreets.length)];
          if (!street) return null;
          const from = street.x + 20 + ((i * 97) % Math.max(1, street.w - 60));
          const to = street.x + street.w - 40 - ((i * 53) % Math.max(1, street.w - 80));
          return (
            <motion.g
              key={`walker-${String(i)}`}
              aria-hidden
              data-testid="resident"
              initial={{ x: from, y: street.y - 20 + STREET_H / 2 }}
              animate={animate ? { x: [from, to, from] } : { x: from }}
              transition={animate ? { repeat: Infinity, duration: 14 + (i % 5) * 3, ease: 'linear' } : { duration: 0 }}
            >
              <Sprite map={HERO} palette={heroPalette(SHIRTS[i % SHIRTS.length] ?? '#c0604a')} scale={2} />
            </motion.g>
          );
        })}
      </svg>
    </Viewport>
  );
}
