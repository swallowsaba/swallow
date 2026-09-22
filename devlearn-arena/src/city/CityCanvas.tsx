import { useState } from 'react';
import { motion } from 'framer-motion';
import type { Building, City, CityPlot, Occupant } from './model';
import {
  BUILDING, CART, GROUND, INK, LABEL, LOCKED, OCCUPANT, OUTLINE_WIDTH, ROAD, SHADOW, SHADOW_STEP, STATE, TILE,
} from './palette';

/**
 * 街の絵。`buildCity` の結果を描くだけ。
 *
 * - 真上から見た 2D。斜め45度にしない
 * - 建物は SVG の図形。高層ビルは階を線で表し、level が上がると階が増える
 * - 住人は小さな丸。色で状態を示し、引っ越しは座標の補間で歩かせる
 * - 道路は太い帯。使われている道は明るく、切れている道は途切れる
 * - 未解放の区域は暗く沈め、輪郭だけ見せる
 * - 絵文字は使わない
 */
interface Props {
  city: City;
  /** 押されたら、対応するコマンドを端末に入力して実行する */
  onCommand?: (line: string) => void;
  /** 歩かせるか。設定で動きを止めているときは false */
  animate?: boolean;
}

const px = (tiles: number): number => tiles * TILE;

/** 建物の真ん中（px） */
function centerOf(b: { x: number; y: number; w: number; h: number }): { x: number; y: number } {
  return { x: px(b.x + b.w / 2), y: px(b.y + b.h / 2) };
}

export function CityCanvas({ city, onCommand, animate = true }: Props) {
  // なぜそのコマンドなのかを、押した直後に一行だけ出す
  const [why, setWhy] = useState<string | null>(null);
  const at = new Map(city.buildings.map((b) => [b.id, centerOf(b)]));

  const run = (line: string | undefined, reason: string | undefined): void => {
    if (line === undefined) return;
    setWhy(reason ?? null);
    onCommand?.(line);
  };

  return (
    <svg
      data-testid="city-canvas"
      viewBox={`0 0 ${String(px(city.width))} ${String(px(city.height))}`}
      width={px(city.width)}
      height={px(city.height)}
      shapeRendering="crispEdges"
      role="img"
      aria-label="街"
    >
      <rect x={0} y={0} width={px(city.width)} height={px(city.height)} fill={GROUND.grass} />

      <g data-layer="ground">
        {city.tiles
          .filter((t) => t.kind !== 'grass')
          .map((t) => (
            <rect
              key={`${String(t.x)}:${String(t.y)}`}
              data-tile={t.kind}
              x={px(t.x)}
              y={px(t.y)}
              width={TILE}
              height={TILE}
              fill={GROUND[t.kind]}
            />
          ))}
      </g>

      <g data-layer="plot">
        {city.plots.map((plot) => (
          <Plot key={plot.id} plot={plot} onPick={run} />
        ))}
      </g>

      <g data-layer="road" shapeRendering="geometricPrecision">
        {city.roads.map((road) => {
          const from = at.get(road.from);
          const to = at.get(road.to);
          if (from === undefined || to === undefined) return null;
          return (
            <line
              key={`${road.from}>${road.to}`}
              data-road={road.active ? 'active' : 'broken'}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={road.active ? ROAD.active : ROAD.broken}
              strokeWidth={road.active ? 5 : 3}
              // 切れている道は途切れさせる
              strokeDasharray={road.active ? undefined : '4 5'}
              onClick={road.command === undefined ? undefined : () => { run(road.command, road.why); }}
              style={road.command === undefined ? undefined : { cursor: 'pointer' }}
            />
          );
        })}
      </g>

      <g data-layer="building">
        {city.buildings.map((b) => (
          <BuildingShape key={b.id} building={b} at={at} animate={animate} onPick={run} />
        ))}
      </g>

      <g data-layer="cart" shapeRendering="geometricPrecision">
        {city.carts.map((cart) => (
          <Cart key={cart.id} path={cart.path.map((id) => at.get(id)).filter((p) => p !== undefined)} animate={animate} />
        ))}
      </g>

      {/* 未解放の区域は暗く沈め、輪郭だけ見せる */}
      <g data-layer="fog">
        {city.districts
          .filter((d) => !d.unlocked)
          .map((d) => (
            <g key={d.track} data-locked={d.track}>
              <rect x={px(d.x)} y={px(d.y)} width={px(d.w)} height={px(d.h)} fill={LOCKED.fill} />
              <rect
                x={px(d.x) + 1}
                y={px(d.y) + 1}
                width={px(d.w) - 2}
                height={px(d.h) - 2}
                fill="none"
                stroke={LOCKED.edge}
                strokeWidth={OUTLINE_WIDTH}
                strokeDasharray="6 4"
              />
            </g>
          ))}
      </g>

      {why === null ? null : (
        <g data-testid="city-why" shapeRendering="geometricPrecision">
          <rect x={0} y={px(city.height) - 16} width={px(city.width)} height={16} fill="rgba(47,52,64,0.86)" />
          <text x={6} y={px(city.height) - 5} fill="#eef1f6" fontSize={9}>
            {why}
          </text>
        </g>
      )}
    </svg>
  );
}

/** 区画（ディレクトリ）。地面に線を引くだけ */
function Plot({ plot, onPick }: { plot: CityPlot; onPick: (line: string | undefined, why: string | undefined) => void }) {
  return (
    <g
      data-plot={plot.id}
      onClick={() => { onPick(plot.command, plot.why); }}
      style={plot.command === undefined ? undefined : { cursor: 'pointer' }}
    >
      <rect
        x={px(plot.x)}
        y={px(plot.y)}
        width={px(plot.w)}
        height={px(plot.h)}
        fill="none"
        stroke={INK}
        strokeWidth={OUTLINE_WIDTH}
        strokeDasharray="3 3"
        opacity={0.5}
      />
      <text x={px(plot.x) + 2} y={px(plot.y) + LABEL.size + 1} fill={LABEL.fill} fontSize={LABEL.size} opacity={0.75}>
        {plot.label}
      </text>
    </g>
  );
}

function BuildingShape({
  building,
  at,
  animate,
  onPick,
}: {
  building: Building;
  at: ReadonlyMap<string, { x: number; y: number }>;
  animate: boolean;
  onPick: (line: string | undefined, why: string | undefined) => void;
}) {
  const b = building;
  const x = px(b.x);
  const y = px(b.y);
  const w = px(b.w);
  const h = px(b.h);
  // 基礎だけの間は地面の枠、骨組みでは中身の無い箱、完成で塗る
  const solid = b.phase === 'done';

  return (
    <g
      data-building={b.id}
      data-kind={b.kind}
      data-state={b.state}
      data-phase={b.phase}
      data-level={b.level}
      role={b.command === undefined ? undefined : 'button'}
      aria-label={b.command === undefined ? undefined : `${b.label}: ${b.command}`}
      onClick={() => { onPick(b.command, b.why); }}
      style={b.command === undefined ? undefined : { cursor: 'pointer' }}
    >
      {/* 影は右下に 1 段だけ */}
      {solid ? <rect x={x + SHADOW_STEP} y={y + SHADOW_STEP} width={w} height={h} fill={SHADOW} /> : null}
      <rect
        data-body={b.phase}
        x={x}
        y={y}
        width={w}
        height={h}
        fill={solid ? BUILDING[b.kind] : b.phase === 'frame' ? 'rgba(255,255,255,0.35)' : 'none'}
        stroke={STATE[b.state]}
        strokeWidth={OUTLINE_WIDTH}
        strokeDasharray={solid ? undefined : '3 2'}
      />
      {solid ? <Marks building={b} /> : null}
      <Residents building={b} at={at} animate={animate} />
      <text x={x} y={y - 2} fill={LABEL.fill} fontSize={LABEL.size}>
        {b.label.length > 14 ? `${b.label.slice(0, 13)}…` : b.label}
      </text>
    </g>
  );
}

/** 種類ごとの印。高層ビルは階、倉庫は間口、記念碑は碑、というように図形だけで描き分ける */
function Marks({ building: b }: { building: Building }) {
  const x = px(b.x);
  const y = px(b.y);
  const w = px(b.w);
  const h = px(b.h);
  const line = { stroke: INK, strokeWidth: OUTLINE_WIDTH, fill: 'none' } as const;

  switch (b.kind) {
    case 'tower':
      // 階を線で表す。level が上がると階が増える
      return (
        <g data-mark="floors">
          {Array.from({ length: b.level }, (_, i) => (
            <line key={i} x1={x + 2} x2={x + w - 2} y1={y + ((i + 1) * h) / (b.level + 1)} y2={y + ((i + 1) * h) / (b.level + 1)} {...line} />
          ))}
        </g>
      );
    case 'office':
      return <rect data-mark="door" x={x + w / 2 - 2} y={y + h - 4} width={4} height={4} fill={INK} />;
    case 'stop':
      return (
        <g data-mark="post">
          <line x1={x + w / 2} x2={x + w / 2} y1={y + 1} y2={y + h - 1} {...line} />
          <rect x={x + w / 2} y={y + 1} width={w / 2 - 1} height={3} fill={INK} />
        </g>
      );
    case 'monument':
      return (
        <g data-mark="stone">
          <rect x={x + w / 2 - 2} y={y + 2} width={4} height={h - 4} fill={INK} />
        </g>
      );
    case 'flag':
      return (
        <g data-mark="flag">
          <line x1={x + 1} x2={x + 1} y1={y} y2={y + h} {...line} />
          <polygon points={`${String(x + 1)},${String(y)} ${String(x + w)},${String(y + 3)} ${String(x + 1)},${String(y + 6)}`} fill={BUILDING.flag} stroke={INK} strokeWidth={OUTLINE_WIDTH} />
        </g>
      );
    case 'depot':
      return <rect data-mark="gateway" x={x + 2} y={y + h - 5} width={w - 4} height={5} fill="none" stroke={INK} strokeWidth={OUTLINE_WIDTH} />;
    case 'hut':
      return <line data-mark="ridge" x1={x + 1} x2={x + w - 1} y1={y + h / 2} y2={y + h / 2} {...line} />;
    case 'house':
      return <line data-mark="ridge" x1={x + w / 2} x2={x + w / 2} y1={y + 1} y2={y + h - 1} {...line} />;
    case 'relay':
      return (
        <g data-mark="mast">
          <line x1={x + 2} x2={x + w - 2} y1={y + h - 2} y2={y + 2} {...line} />
          <line x1={x + w - 2} x2={x + 2} y1={y + h - 2} y2={y + 2} {...line} />
        </g>
      );
    case 'gate':
      return (
        <g data-mark="bar">
          <line x1={x + 1} x2={x + w - 1} y1={y + h / 3} y2={y + h / 3} {...line} />
          <line x1={x + 1} x2={x + w - 1} y1={(y + h * 2) / 3} y2={(y + h * 2) / 3} {...line} />
        </g>
      );
    case 'window':
      return (
        <g data-mark="counter">
          <line x1={x + 1} x2={x + w - 1} y1={y + h - 4} y2={y + h - 4} {...line} />
          {Array.from({ length: b.level }, (_, i) => (
            <rect key={i} x={x + 2 + i * 4} y={y + 2} width={3} height={3} fill={OCCUPANT.settled} />
          ))}
        </g>
      );
    case 'line':
      return <line data-mark="belt" x1={x} x2={x + w} y1={y + h / 2} y2={y + h / 2} stroke={INK} strokeWidth={OUTLINE_WIDTH} strokeDasharray="2 2" />;
  }
}

/** 住人。小さな丸で、色が状態を示す。引っ越してきた住人は元の建物から歩いて入る */
function Residents({
  building: b,
  at,
  animate,
}: {
  building: Building;
  at: ReadonlyMap<string, { x: number; y: number }>;
  animate: boolean;
}) {
  const perRow = Math.max(1, b.w);
  return (
    <g data-layer="residents">
      {b.occupants.slice(0, b.w * b.h).map((o, i) => {
        const spot = {
          x: px(b.x) + 4 + (i % perRow) * (TILE - 2),
          y: px(b.y) + 5 + Math.floor(i / perRow) * (TILE - 2),
        };
        return <Resident key={o.id} occupant={o} spot={spot} from={o.from === undefined ? undefined : at.get(o.from)} animate={animate} />;
      })}
    </g>
  );
}

function Resident({
  occupant,
  spot,
  from,
  animate,
}: {
  occupant: Occupant;
  spot: { x: number; y: number };
  from: { x: number; y: number } | undefined;
  animate: boolean;
}) {
  const walk = animate && from !== undefined;
  return (
    <motion.circle
      data-resident={occupant.id}
      data-resident-state={occupant.state}
      r={3}
      fill={OCCUPANT[occupant.state]}
      stroke={INK}
      strokeWidth={OUTLINE_WIDTH}
      shapeRendering="geometricPrecision"
      initial={walk ? { cx: from.x, cy: from.y } : false}
      animate={{ cx: spot.x, cy: spot.y }}
      transition={walk ? { duration: 0.9, ease: 'easeInOut' } : { duration: 0 }}
    >
      <title>{occupant.label}</title>
    </motion.circle>
  );
}

/** 荷車。道を 1 ホップずつ走る */
function Cart({ path, animate }: { path: { x: number; y: number }[]; animate: boolean }) {
  const first = path[0];
  if (first === undefined) return null;
  return (
    <motion.rect
      data-cart="on"
      width={6}
      height={4}
      fill={CART.body}
      stroke={CART.edge}
      strokeWidth={OUTLINE_WIDTH}
      initial={{ x: first.x - 3, y: first.y - 2 }}
      animate={animate ? { x: path.map((p) => p.x - 3), y: path.map((p) => p.y - 2) } : { x: first.x - 3, y: first.y - 2 }}
      transition={{ duration: Math.max(1, path.length * 0.5), ease: 'linear' }}
    />
  );
}
