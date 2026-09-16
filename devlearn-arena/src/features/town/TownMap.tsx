import { motion } from 'framer-motion';
import { useMemo, type KeyboardEvent } from 'react';
import type { Town } from '@/engines/lesson/town';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';
import { Sign } from '@/visual/game/scenery';
import { INK } from '@/visual/game/sprites';
import { FloorBuilding } from '@/visual/game/townArt';
import { TOWN_STYLE } from '@/visual/game/townStyle';
import { Viewport } from '@/visual/Viewport';
import { buildingName, townName } from './townName';
import { CELL_W, layoutTownMap } from './townLayout';

interface Props {
  town: Town;
  selectedId: string | null;
  onSelect: (buildingId: string) => void;
}

/**
 * 町の地図。地区（章）ごとに柵で囲い、建物（任務のまとまり）を並べる。
 * 空き地・工事中・完成・名所が見た目で分かり、次にやる依頼のある建物には「！」が出る。
 * 建物を押すと、右の欄にその建物の階（任務）が並ぶ。
 */
export function TownMap({ town, selectedId, onSelect }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const layout = useMemo(() => layoutTownMap(town), [town]);
  const style = TOWN_STYLE[town.track];
  const name = townName(t, town.track, town.stats.rank);

  return (
    <Viewport label={t('town.mapLabel', { name })}>
      <svg width={layout.width} height={layout.height} viewBox={`0 0 ${String(layout.width)} ${String(layout.height)}`} role="img" aria-label={t('town.mapLabel', { name })} className="block">
        <rect width={layout.width} height={layout.height} fill={style.ground} />
        {layout.roads.map((road, i) => (
          <g key={i} aria-hidden>
            <rect x={road.x} y={road.y} width={road.w} height={road.h} fill="#b79a6d" />
            <rect x={road.x + 4} y={road.y + 4} width={road.w - 8} height={road.h - 8} fill="#d9c39a" />
          </g>
        ))}

        {town.districts.map((district) => {
          const placed = layout.districts.find((d) => d.chapterId === district.chapterId);
          if (!placed) return null;
          const { box } = placed;
          return (
            <g key={district.chapterId} data-district={district.chapterId} data-opened={district.opened ? 'true' : 'false'}>
              <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="rgba(255,255,255,0.12)" stroke="#7a5230" strokeWidth={4} strokeDasharray={district.opened ? undefined : '12 8'} />
              <Sign
                cx={box.x + box.w / 2}
                y={box.y + 10}
                text={`${t('town.district', { no: district.no, title: district.title })}  ${String(district.built)} / ${String(district.floors)}`}
                maxWidth={box.w - 20}
                strong
              />

              {district.buildings.map((building) => {
                const spot = layout.buildings.get(building.id);
                if (!spot) return null;
                const selected = building.id === selectedId;
                const label = buildingName(t, town.track, district, building.index, building.landmark);
                const w = building.landmark ? 84 : 68;
                const x = spot.box.x + (CELL_W - w) / 2;
                return (
                  <g
                    key={building.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${label} ${String(building.built)}/${String(building.floors.length)}`}
                    aria-pressed={selected}
                    data-building={building.id}
                    data-state={building.state}
                    data-next={building.next ? 'true' : 'false'}
                    style={{ cursor: 'pointer' }}
                    onClick={() => {
                      onSelect(building.id);
                    }}
                    onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(building.id);
                      }
                    }}
                  >
                    <title>{label}</title>
                    <rect x={spot.box.x + 4} y={spot.box.y + 4} width={spot.box.w - 8} height={spot.box.h - 8} fill={selected ? 'rgba(242,193,78,0.35)' : 'transparent'} stroke={selected ? '#b8862b' : 'none'} strokeWidth={3} />
                    {building.state === 'lot' ? (
                      <g aria-hidden>
                        <rect x={x} y={spot.groundY - 8} width={w} height={14} fill="#a9855a" stroke={INK} strokeWidth={2} />
                        {[x + 4, x + w - 8].map((sx) => (
                          <rect key={sx} x={sx} y={spot.groundY - 22} width={4} height={16} fill="#7a5230" />
                        ))}
                        <line x1={x + 6} x2={x + w - 6} y1={spot.groundY - 18} y2={spot.groundY - 18} stroke="#f6e8cd" strokeWidth={2} strokeDasharray="4 3" />
                      </g>
                    ) : (
                      <FloorBuilding
                        track={town.track}
                        x={x}
                        y={spot.groundY}
                        w={w}
                        floors={building.floors.length}
                        built={building.built}
                        landmark={building.landmark}
                        animate={false}
                        working={building.state === 'construction'}
                      />
                    )}
                    <text x={spot.box.x + CELL_W / 2} y={spot.groundY + 22} fontSize={11} fontWeight={800} textAnchor="middle" fill={INK} stroke="#f6e8cd" strokeWidth={3} paintOrder="stroke" fontFamily="var(--f-mono)">
                      {building.state === 'lot' ? t('town.lot') : `${String(building.built)}/${String(building.floors.length)}`}
                    </text>
                    {building.next ? (
                      <motion.g
                        data-testid="next-marker"
                        animate={animate ? { y: [0, -6, 0] } : { y: 0 }}
                        transition={animate ? { repeat: Infinity, duration: 1 } : { duration: 0 }}
                      >
                        <circle cx={spot.box.x + CELL_W - 22} cy={spot.box.y + 24} r={13} fill="#f2c14e" stroke={INK} strokeWidth={2.5} />
                        <text x={spot.box.x + CELL_W - 22} y={spot.box.y + 25} fontSize={16} fontWeight={900} textAnchor="middle" dominantBaseline="middle" fill={INK}>
                          !
                        </text>
                      </motion.g>
                    ) : null}
                  </g>
                );
              })}

              {district.opened ? null : (
                <g aria-hidden style={{ pointerEvents: 'none' }}>
                  <rect x={box.x} y={box.y} width={box.w} height={box.h} fill="rgba(30,45,25,0.35)" />
                  <Sign cx={box.x + box.w / 2} y={box.y + box.h / 2 - 12} text={`🌲 ${t('town.unopened')}`} tone="#ddc79f" />
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </Viewport>
  );
}
