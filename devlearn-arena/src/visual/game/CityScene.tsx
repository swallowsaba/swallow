import { AnimatePresence, motion } from 'framer-motion';
import { memo, useMemo, type KeyboardEvent } from 'react';
import type { BuildingKind, FacilityStatus } from '@/content/city';
import type { MissionTrack } from '@/engines/lesson/types';
import { useMotionEnabled } from '@/ui/motion';
import { Viewport } from '../Viewport';
import { clip, textWidth } from '../sceneKit';
import { CITY_COLOR } from './cityColor';
import { cellNoise } from './terrain';
import { BLOCK, buildIsoCity, INNER, type IsoBuilding, type IsoTile, type Zone } from './isoCity';

interface Props {
  track: MissionTrack;
  facilities: readonly FacilityStatus[];
  selectedId: string | null;
  onSelect?: (facilityId: string) => void;
  label: string;
}

/** 1 マスの横幅・縦幅（px）と、1 階の高さ */
const TW = 48;
const TH = 24;
const FLOOR = 9;
const PAD = 40;
/** 街のまわりの野原（マス） */
const RING = 5;
/** いちばん高い建物のぶん、上に空けておく */
const SKY = 150;

const TILE_FILL: Record<IsoTile['kind'], string> = {
  road: '#5f6468',
  grass: '#8cc26a',
  forest: '#6fa655',
  plan: '#cfdc9a',
  lot: '#a9cf8c',
  plaza: '#dcd3c2',
};

const ZONE_TINT: Record<Zone, string> = {
  residential: '#b6de98',
  commercial: '#a9cbe6',
  industrial: '#e6d596',
};

const ZONE_WALL: Record<Zone, { wall: string; roof: string; window: string }> = {
  residential: { wall: '#f4e6c8', roof: '#c96b4f', window: '#7fa9c9' },
  commercial: { wall: '#9fc3de', roof: '#e8eef3', window: '#fff3b0' },
  industrial: { wall: '#cdbb9b', roof: '#8f877a', window: '#6e6a62' },
};

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * (1 - amount))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

const pts = (list: readonly { x: number; y: number }[]) => list.map((p) => `${String(p.x)},${String(p.y)}`).join(' ');

/**
 * Cities: Skylines のように斜め上から見下ろす街。
 * 道路で区切られた地区ごとに、未開拓は森、建設できる地区は区画割りとクレーン、建てた地区は名所とビル群になる。
 * 稼働が進むほどビルが増えて高くなり、道路を走る車も増える。地区を押すとその施設を選ぶ。
 */
export function CityScene({ track, facilities, selectedId, onSelect, label }: Props) {
  const animate = useMotionEnabled();
  const model = useMemo(() => buildIsoCity(facilities), [facilities]);
  const span = model.cols + model.rows + RING * 4;
  const width = span * (TW / 2) + PAD * 2;
  const height = span * (TH / 2) + PAD * 2 + SKY;
  const toScreen = (gx: number, gy: number) => ({
    x: (gx - gy) * (TW / 2) + (model.rows + RING * 2) * (TW / 2) + PAD,
    y: (gx + gy + RING * 2) * (TH / 2) + PAD + SKY,
  });
  // いま取り組んでいる地区を、枠の真ん中に大きく映す
  const selected = model.districts.find((d) => d.facilityId === selectedId);
  const focusPoint = selected ? toScreen(selected.gx + INNER / 2, selected.gy + INNER / 2) : undefined;
  const ringTrees = useMemo(() => {
    const out: { gx: number; gy: number; size: number }[] = [];
    for (let gy = -RING; gy < model.rows + RING; gy += 1) {
      for (let gx = -RING; gx < model.cols + RING; gx += 1) {
        const inside = gx >= 0 && gy >= 0 && gx < model.cols && gy < model.rows;
        if (inside) continue;
        const n = cellNoise(gx + 101, gy + 57);
        if (n < 0.42) out.push({ gx: gx + 0.2 + n, gy: gy + 0.3 + cellNoise(gy, gx) * 0.5, size: 0.8 + n });
      }
    }
    return out;
  }, [model.cols, model.rows]);
  const byId = new Map(facilities.map((f) => [f.facility.id, f]));
  const color = CITY_COLOR[track];

  return (
    <Viewport label={label} focus={focusPoint ? { x: focusPoint.x, y: focusPoint.y - 40, zoom: 1.15 } : undefined}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${String(width)} ${String(height)}`}
        role="img"
        aria-label={label}
        className="block"
        data-testid="iso-city"
      >
        <rect width={width} height={height} fill="#6fb7d6" />
        {/* 海のさざ波 */}
        {Array.from({ length: 40 }, (_, i) => (
          <path
            key={`wave-${String(i)}`}
            d={`M ${String((i * 197) % width)} ${String((i * 131) % height)} q 8 -4 16 0 q 8 4 16 0`}
            fill="none"
            stroke="#a9d8ea"
            strokeWidth={2}
            aria-hidden
          />
        ))}
        {/* 街のまわりの野原 */}
        <polygon
          points={pts([toScreen(-RING, -RING), toScreen(model.cols + RING, -RING), toScreen(model.cols + RING, model.rows + RING), toScreen(-RING, model.rows + RING)])}
          fill="#86bd62"
          stroke="#d9c39a"
          strokeWidth={10}
          strokeLinejoin="round"
        />
        <polygon
          points={pts([toScreen(-RING, model.rows + RING), toScreen(model.cols + RING, model.rows + RING), { ...toScreen(model.cols + RING, model.rows + RING), y: toScreen(model.cols + RING, model.rows + RING).y + 22 }, { ...toScreen(-RING, model.rows + RING), y: toScreen(-RING, model.rows + RING).y + 22 }])}
          fill="#7a5a3a"
        />
        <polygon
          points={pts([toScreen(model.cols + RING, -RING), toScreen(model.cols + RING, model.rows + RING), { ...toScreen(model.cols + RING, model.rows + RING), y: toScreen(model.cols + RING, model.rows + RING).y + 22 }, { ...toScreen(model.cols + RING, -RING), y: toScreen(model.cols + RING, -RING).y + 22 }])}
          fill="#5f4630"
        />
        {ringTrees.map((tree) => {
          const p = toScreen(tree.gx, tree.gy);
          const r = 8 * tree.size;
          return (
            <g key={`rt-${String(tree.gx)}-${String(tree.gy)}`} aria-hidden>
              <rect x={p.x - 1.5} y={p.y - 6} width={3} height={7} fill="#6b4a2a" />
              <circle cx={p.x} cy={p.y - 10 * tree.size} r={r} fill="#4f8f3c" />
              <circle cx={p.x - r / 3} cy={p.y - 12 * tree.size} r={r / 2.2} fill="#69ab52" />
            </g>
          );
        })}
        <Ground tiles={model.tiles} toScreen={toScreen} />

        {/* 選んだ地区の縁取り */}
        {model.districts.map((d) => {
          if (d.facilityId !== selectedId) return null;
          const corners = [toScreen(d.gx, d.gy), toScreen(d.gx + INNER, d.gy), toScreen(d.gx + INNER, d.gy + INNER), toScreen(d.gx, d.gy + INNER)];
          return <polygon key="sel" points={pts(corners)} fill="rgba(242,193,78,0.18)" stroke="#f2c14e" strokeWidth={4} strokeDasharray="10 6" />;
        })}

        {/* 木 */}
        {model.trees.map((tree) => {
          const p = toScreen(tree.gx + tree.ox, tree.gy + tree.oy);
          const r = 7 * tree.size;
          return (
            <g key={`t-${String(tree.gx)}-${String(tree.gy)}-${String(tree.ox)}`} aria-hidden>
              <ellipse cx={p.x + 3} cy={p.y + 2} rx={r} ry={r / 2} fill="rgba(0,0,0,0.15)" />
              <rect x={p.x - 1.5} y={p.y - 6} width={3} height={7} fill="#6b4a2a" />
              <circle cx={p.x} cy={p.y - 10 * tree.size} r={r} fill="#4f8f3c" />
              <circle cx={p.x - r / 3} cy={p.y - 12 * tree.size} r={r / 2.2} fill="#69ab52" />
            </g>
          );
        })}

        {/* 建設できる地区のクレーンと足場 */}
        {model.districts
          .filter((d) => d.state === 'available')
          .map((d) => (
            <Crane key={`crane-${d.facilityId}`} base={toScreen(d.landmark.gx + 1, d.landmark.gy + 1)} animate={animate} accent={color.roof} />
          ))}

        {/* 建物。奥から手前の順に描く */}
        <AnimatePresence initial={false}>
          {model.buildings.map((b) => (
            <motion.g
              key={b.id}
              data-building={b.facilityId === undefined ? 'lot' : 'landmark'}
              initial={animate ? { opacity: 0, y: -30 } : false}
              animate={{ opacity: 1, y: 0 }}
              exit={animate ? { opacity: 0 } : undefined}
              transition={{ type: 'spring', stiffness: 140, damping: 16 }}
            >
              {b.facilityId === undefined ? (
                <ZoneBuilding b={b} toScreen={toScreen} />
              ) : (
                <Landmark b={b} toScreen={toScreen} roof={color.roof} accent={color.shirt} lit={(byId.get(b.facilityId)?.ratio ?? 0) > 0} />
              )}
            </motion.g>
          ))}
        </AnimatePresence>

        {/* 車 */}
        {model.cars.map((car) => {
          const path = [...car.loop, car.loop[0] ?? car.loop[0]].filter((p): p is { gx: number; gy: number } => p !== undefined).map((p) => toScreen(p.gx + 0.5, p.gy + 0.5));
          const duration = 18;
          const start = path[0] ?? { x: 0, y: 0 };
          return (
            <motion.g
              key={car.id}
              aria-hidden
              data-testid="car"
              initial={{ x: start.x, y: start.y }}
              animate={animate ? { x: path.map((p) => p.x), y: path.map((p) => p.y) } : { x: start.x, y: start.y }}
              transition={animate ? { duration, ease: 'linear', repeat: Infinity, delay: car.offset * duration } : { duration: 0 }}
            >
              <ellipse cx={0} cy={1} rx={6} ry={3} fill="rgba(0,0,0,0.25)" />
              <rect x={-5} y={-5} width={10} height={6} rx={2} fill={['#e8823c', '#f2f2f2', '#3f6f8f', '#c0392b'][car.id.length % 4]} stroke="#2c1d10" strokeWidth={0.8} />
              <rect x={-3} y={-7} width={6} height={3} rx={1} fill="#bfe3f5" stroke="#2c1d10" strokeWidth={0.6} />
            </motion.g>
          );
        })}

        {/* 地区の名札と、押せる範囲 */}
        {model.districts.map((d) => {
          const status = byId.get(d.facilityId);
          if (!status) return null;
          const corners = [toScreen(d.gx, d.gy), toScreen(d.gx + INNER, d.gy), toScreen(d.gx + INNER, d.gy + INNER), toScreen(d.gx, d.gy + INNER)];
          const top = toScreen(d.landmark.gx + 1, d.landmark.gy + 1);
          const floors = model.buildings.find((b) => b.facilityId === d.facilityId)?.floors ?? 3;
          const name = status.state === 'locked' ? '？' : status.facility.name;
          const text = clip(name, 150, 12);
          const w = textWidth(text, 12) + 16;
          const y = top.y - floors * FLOOR - 58;
          const tone = status.state === 'available' ? '#f2c14e' : status.state === 'locked' ? '#d9d2c3' : status.state === 'complete' ? '#a9d892' : '#f6e8cd';
          return (
            <g
              key={`d-${d.facilityId}`}
              role={onSelect ? 'button' : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={onSelect ? status.facility.name : undefined}
              data-district={d.facilityId}
              data-state={d.state}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
              onClick={() => {
                onSelect?.(d.facilityId);
              }}
              onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect?.(d.facilityId);
                }
              }}
            >
              <title>{`${status.facility.name} — ${status.facility.concept}`}</title>
              <polygon points={pts(corners)} fill="transparent" />
              {status.state === 'locked' ? null : (
                <g>
                  <line x1={top.x} x2={top.x} y1={y + 20} y2={top.y - floors * FLOOR - 16} stroke="#2c1d10" strokeWidth={1.5} />
                  <rect x={top.x - w / 2} y={y} width={w} height={20} rx={3} fill={tone} stroke="#2c1d10" strokeWidth={1.5} />
                  <text x={top.x} y={y + 11} fontSize={12} fontWeight={800} textAnchor="middle" dominantBaseline="middle" fill="#2c1d10">
                    {text}
                  </text>
                </g>
              )}
            </g>
          );
        })}
      </svg>
    </Viewport>
  );
}

type ToScreen = (gx: number, gy: number) => { x: number; y: number };

/** 地面のマス。数が多いので、変わったときだけ描き直す */
const Ground = memo(function Ground({ tiles, toScreen }: { tiles: readonly IsoTile[]; toScreen: ToScreen }) {
  return (
    <g aria-hidden>
      {tiles.map((tile) => {
        const corners = [toScreen(tile.gx, tile.gy), toScreen(tile.gx + 1, tile.gy), toScreen(tile.gx + 1, tile.gy + 1), toScreen(tile.gx, tile.gy + 1)];
        const base = tile.zone !== undefined && tile.kind === 'lot' ? ZONE_TINT[tile.zone] : TILE_FILL[tile.kind];
        const checker = (tile.gx + tile.gy) % 2 === 0 ? 0 : 0.03;
        const isRoad = tile.kind === 'road';
        const center = toScreen(tile.gx + 0.5, tile.gy + 0.5);
        const horizontal = tile.gy % BLOCK === 0 && tile.gx % BLOCK !== 0;
        const vertical = tile.gx % BLOCK === 0 && tile.gy % BLOCK !== 0;
        return (
          <g key={`${String(tile.gx)},${String(tile.gy)}`}>
            <polygon
              points={pts(corners)}
              fill={shade(base, checker)}
              stroke={isRoad ? '#4b4f53' : tile.kind === 'plan' ? '#a8b86a' : 'rgba(0,0,0,0.05)'}
              strokeWidth={tile.kind === 'plan' ? 1.2 : 0.6}
              strokeDasharray={tile.kind === 'plan' ? '4 3' : undefined}
            />
            {isRoad && (horizontal || vertical) ? (
              <line
                x1={center.x - (horizontal ? TW / 5 : -TW / 5)}
                y1={center.y - TH / 5}
                x2={center.x + (horizontal ? TW / 5 : -TW / 5)}
                y2={center.y + TH / 5}
                stroke="#f2e6b8"
                strokeWidth={1.2}
                strokeDasharray="4 4"
              />
            ) : null}
          </g>
        );
      })}
    </g>
  );
});

/** 足もと w×d マス、高さ h px の箱の 3 面 */
function box(toScreen: ToScreen, gx: number, gy: number, w: number, d: number, h: number, inset = 0) {
  const a = toScreen(gx + inset, gy + inset);
  const b = toScreen(gx + w - inset, gy + inset);
  const c = toScreen(gx + w - inset, gy + d - inset);
  const dd = toScreen(gx + inset, gy + d - inset);
  const up = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - h });
  return {
    top: [up(a), up(b), up(c), up(dd)],
    right: [b, c, up(c), up(b)],
    left: [dd, c, up(c), up(dd)],
    ground: { a, b, c, d: dd },
  };
}

function Box({ toScreen, gx, gy, w, d, h, wall, roof, inset = 0, windows }: {
  toScreen: ToScreen;
  gx: number;
  gy: number;
  w: number;
  d: number;
  h: number;
  wall: string;
  roof: string;
  inset?: number;
  windows?: { color: string; floors: number };
}) {
  const f = box(toScreen, gx, gy, w, d, h, inset);
  return (
    <g>
      <polygon points={pts(f.left)} fill={shade(wall, 0.08)} stroke="#2c1d10" strokeWidth={0.8} />
      <polygon points={pts(f.right)} fill={shade(wall, 0.28)} stroke="#2c1d10" strokeWidth={0.8} />
      {windows
        ? Array.from({ length: windows.floors }, (_, i) => {
            const y = (i + 0.55) * (h / windows.floors);
            const l0 = f.left[0];
            const l1 = f.left[1];
            const r0 = f.right[0];
            const r1 = f.right[1];
            if (!l0 || !l1 || !r0 || !r1) return null;
            return (
              <g key={i}>
                <line x1={l0.x + 3} y1={l0.y - y} x2={l1.x - 3} y2={l1.y - y} stroke={windows.color} strokeWidth={2.2} strokeDasharray="3 3" />
                <line x1={r0.x + 3} y1={r0.y - y} x2={r1.x - 3} y2={r1.y - y} stroke={shade(windows.color, 0.25)} strokeWidth={2.2} strokeDasharray="3 3" />
              </g>
            );
          })
        : null}
      <polygon points={pts(f.top)} fill={roof} stroke="#2c1d10" strokeWidth={0.8} />
    </g>
  );
}

/** 区画のビル（住宅・商業・工業） */
function ZoneBuilding({ b, toScreen }: { b: IsoBuilding; toScreen: ToScreen }) {
  const look = ZONE_WALL[b.zone ?? 'residential'];
  const h = b.floors * FLOOR;
  const shadow = box(toScreen, b.gx, b.gy, b.w, b.d, 0, 0.1).ground;
  return (
    <g aria-hidden>
      <polygon points={pts([shadow.a, shadow.b, { x: shadow.c.x + 8, y: shadow.c.y + 2 }, { x: shadow.d.x + 8, y: shadow.d.y + 2 }])} fill="rgba(0,0,0,0.12)" />
      <Box toScreen={toScreen} gx={b.gx} gy={b.gy} w={b.w} d={b.d} h={h} wall={look.wall} roof={look.roof} inset={0.14} windows={{ color: look.window, floors: b.floors }} />
      {b.zone === 'residential' && b.floors <= 3 ? (
        // 低い住宅には三角屋根
        <polygon
          points={pts([
            { x: toScreen(b.gx + 0.14, b.gy + 0.5).x, y: toScreen(b.gx + 0.14, b.gy + 0.5).y - h },
            { x: toScreen(b.gx + 0.86, b.gy + 0.5).x, y: toScreen(b.gx + 0.86, b.gy + 0.5).y - h },
            { x: toScreen(b.gx + 0.5, b.gy + 0.5).x, y: toScreen(b.gx + 0.5, b.gy + 0.5).y - h - 12 },
          ])}
          fill={shade(look.roof, 0.1)}
          stroke="#2c1d10"
          strokeWidth={0.8}
        />
      ) : null}
      {b.zone === 'industrial' ? (
        <g>
          <rect x={toScreen(b.gx + 0.7, b.gy + 0.3).x - 3} y={toScreen(b.gx + 0.7, b.gy + 0.3).y - h - 16} width={6} height={16} fill="#8f877a" stroke="#2c1d10" strokeWidth={0.8} />
        </g>
      ) : null}
      {b.zone === 'commercial' && b.floors >= 6 ? (
        <line x1={toScreen(b.gx + 0.5, b.gy + 0.5).x} x2={toScreen(b.gx + 0.5, b.gy + 0.5).x} y1={toScreen(b.gx + 0.5, b.gy + 0.5).y - h} y2={toScreen(b.gx + 0.5, b.gy + 0.5).y - h - 14} stroke="#2c1d10" strokeWidth={1.2} />
      ) : null}
    </g>
  );
}

/** 施設の名所。種類ごとに形を変える */
function Landmark({ b, toScreen, roof, accent, lit }: { b: IsoBuilding; toScreen: ToScreen; roof: string; accent: string; lit: boolean }) {
  const kind: BuildingKind = b.kind ?? 'hall';
  const h = b.floors * FLOOR;
  const windowColor = lit ? '#fff3b0' : '#7fa9c9';
  const center = toScreen(b.gx + 1, b.gy + 1);
  const shadow = box(toScreen, b.gx, b.gy, 2, 2, 0).ground;
  const common = { toScreen, gx: b.gx, gy: b.gy };
  return (
    <g>
      <polygon points={pts([shadow.a, shadow.b, { x: shadow.c.x + 14, y: shadow.c.y + 4 }, { x: shadow.d.x + 14, y: shadow.d.y + 4 }])} fill="rgba(0,0,0,0.15)" />
      {kind === 'tower' ? (
        <>
          <Box {...common} w={2} d={2} h={FLOOR * 2} wall="#d8d1c3" roof="#cfc6b6" inset={0.1} />
          <Box {...common} w={2} d={2} h={h} wall="#e9eef5" roof={roof} inset={0.55} windows={{ color: windowColor, floors: b.floors }} />
          <line x1={center.x} x2={center.x} y1={center.y - h} y2={center.y - h - 24} stroke="#2c1d10" strokeWidth={2} />
          <circle cx={center.x} cy={center.y - h - 24} r={3} fill={lit ? '#c0392b' : '#8f877a'} />
        </>
      ) : kind === 'castle' ? (
        <>
          <Box {...common} w={2} d={2} h={FLOOR * 3} wall="#cfd6dc" roof="#b9c2c9" inset={0.02} windows={{ color: windowColor, floors: 3 }} />
          <Box {...common} w={2} d={2} h={h + FLOOR * 3} wall="#9fc3de" roof="#e8eef3" inset={0.35} windows={{ color: windowColor, floors: b.floors + 3 }} />
          <line x1={center.x} x2={center.x} y1={center.y - h - FLOOR * 3} y2={center.y - h - FLOOR * 3 - 18} stroke="#2c1d10" strokeWidth={2} />
        </>
      ) : kind === 'factory' ? (
        <>
          <Box {...common} w={2} d={2} h={h} wall="#d0c3a8" roof="#9a9184" inset={0.08} windows={{ color: windowColor, floors: 2 }} />
          {[0.45, 1.25].map((x) => {
            const p = toScreen(b.gx + x, b.gy + 0.45);
            return (
              <g key={x}>
                <rect x={p.x - 4} y={p.y - h - 30} width={8} height={30} fill="#8f877a" stroke="#2c1d10" strokeWidth={0.8} />
                <ellipse cx={p.x} cy={p.y - h - 30} rx={4} ry={2} fill="#6e6a62" />
              </g>
            );
          })}
        </>
      ) : kind === 'station' || kind === 'bridge' || kind === 'farm' ? (
        <>
          <Box {...common} w={2} d={2} h={h} wall={kind === 'farm' ? '#c96b4f' : '#e8d9bd'} roof={kind === 'farm' ? '#7a5230' : roof} inset={0.1} windows={{ color: windowColor, floors: 1 }} />
          <Box toScreen={toScreen} gx={b.gx - 0.1} gy={b.gy + 0.8} w={2.2} d={0.5} h={h + 6} wall={shade(roof, -0.2)} roof={roof} />
        </>
      ) : kind === 'lab' ? (
        <>
          <Box {...common} w={2} d={2} h={h} wall="#eef2f6" roof="#dfe6ec" inset={0.12} windows={{ color: windowColor, floors: b.floors }} />
          <ellipse cx={center.x} cy={center.y - h - 4} rx={18} ry={12} fill="#bfe3f5" stroke="#2c1d10" strokeWidth={1} />
        </>
      ) : kind === 'gate' ? (
        <>
          <Box toScreen={toScreen} gx={b.gx} gy={b.gy} w={0.7} d={2} h={h} wall="#cfc6b6" roof={roof} windows={{ color: windowColor, floors: b.floors }} />
          <Box toScreen={toScreen} gx={b.gx + 1.3} gy={b.gy} w={0.7} d={2} h={h} wall="#cfc6b6" roof={roof} windows={{ color: windowColor, floors: b.floors }} />
          <Box toScreen={toScreen} gx={b.gx} gy={b.gy + 0.7} w={2} d={0.6} h={h + 10} wall={shade(roof, -0.3)} roof={roof} inset={0} />
        </>
      ) : (
        <>
          <Box {...common} w={2} d={2} h={h} wall={kind === 'post' ? '#f6e8cd' : kind === 'library' ? '#efe6d6' : '#f1e3c6'} roof={shade(roof, 0.05)} inset={0.08} windows={{ color: windowColor, floors: b.floors }} />
          {/* 寄棟の屋根 */}
          <polygon
            points={pts([
              { x: toScreen(b.gx + 0.08, b.gy + 0.08).x, y: toScreen(b.gx + 0.08, b.gy + 0.08).y - h },
              { x: toScreen(b.gx + 1.92, b.gy + 0.08).x, y: toScreen(b.gx + 1.92, b.gy + 0.08).y - h },
              { x: center.x, y: center.y - h - 22 },
            ])}
            fill={shade(roof, 0.15)}
            stroke="#2c1d10"
            strokeWidth={0.8}
          />
          <polygon
            points={pts([
              { x: toScreen(b.gx + 1.92, b.gy + 0.08).x, y: toScreen(b.gx + 1.92, b.gy + 0.08).y - h },
              { x: toScreen(b.gx + 1.92, b.gy + 1.92).x, y: toScreen(b.gx + 1.92, b.gy + 1.92).y - h },
              { x: center.x, y: center.y - h - 22 },
            ])}
            fill={shade(roof, 0.35)}
            stroke="#2c1d10"
            strokeWidth={0.8}
          />
          <polygon
            points={pts([
              { x: toScreen(b.gx + 0.08, b.gy + 1.92).x, y: toScreen(b.gx + 0.08, b.gy + 1.92).y - h },
              { x: toScreen(b.gx + 1.92, b.gy + 1.92).x, y: toScreen(b.gx + 1.92, b.gy + 1.92).y - h },
              { x: center.x, y: center.y - h - 22 },
            ])}
            fill={roof}
            stroke="#2c1d10"
            strokeWidth={0.8}
          />
        </>
      )}
      {/* 旗 */}
      <line x1={center.x + 20} x2={center.x + 20} y1={center.y - h + 6} y2={center.y - h - 30} stroke="#2c1d10" strokeWidth={1.2} />
      <polygon points={pts([{ x: center.x + 20, y: center.y - h - 30 }, { x: center.x + 36, y: center.y - h - 25 }, { x: center.x + 20, y: center.y - h - 20 }])} fill={accent} stroke="#2c1d10" strokeWidth={0.8} />
    </g>
  );
}

/** 工事のクレーンと足場 */
function Crane({ base, animate, accent }: { base: { x: number; y: number }; animate: boolean; accent: string }) {
  return (
    <g aria-hidden data-testid="crane">
      <polygon points={pts([{ x: base.x - 40, y: base.y }, { x: base.x, y: base.y - 20 }, { x: base.x + 40, y: base.y }, { x: base.x, y: base.y + 20 }])} fill="rgba(242,193,78,0.25)" stroke="#b8862b" strokeWidth={1.5} strokeDasharray="5 4" />
      {[-24, 0, 24].map((dx) => (
        <line key={dx} x1={base.x + dx} x2={base.x + dx} y1={base.y + (dx === 0 ? 10 : 0)} y2={base.y - 30} stroke="#b07f4a" strokeWidth={1.5} />
      ))}
      <line x1={base.x - 30} x2={base.x - 30} y1={base.y - 4} y2={base.y - 110} stroke={accent} strokeWidth={4} />
      <motion.g
        animate={animate ? { rotate: [0, 18, 0, -12, 0] } : { rotate: 0 }}
        transition={animate ? { repeat: Infinity, duration: 9, ease: 'easeInOut' } : { duration: 0 }}
        style={{ transformBox: 'view-box', transformOrigin: `${String(base.x - 30)}px ${String(base.y - 110)}px` }}
      >
        <line x1={base.x - 50} x2={base.x + 50} y1={base.y - 110} y2={base.y - 110} stroke={accent} strokeWidth={3} />
        <line x1={base.x + 30} x2={base.x + 30} y1={base.y - 110} y2={base.y - 60} stroke="#2c1d10" strokeWidth={1} />
        <rect x={base.x + 24} y={base.y - 60} width={12} height={8} fill="#8f877a" stroke="#2c1d10" strokeWidth={0.8} />
      </motion.g>
    </g>
  );
}
