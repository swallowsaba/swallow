import { motion } from 'framer-motion';
import {
  BROW, EYE, EYE_ALMOND, EYE_CLOSED, EYE_SHAPE, HAIR, HAIR_PATH, HEAD_PATH, INK, LINE, MOUTH, SKIN,
  SKIN_SHADE, type Mood,
} from './faces';
import { iso, shade, TH, TW } from './isoMath';

/**
 * 説明に添える絵を組み立てる、斜め見下ろしの部品。
 *
 * 街の地図と同じ見え方（等角投影）でそろえ、平べったい記号の絵にしない。
 * 面ごとに陰を付け、物の下に影を落として、立体と地面の関係が分かるようにする。
 */

const pt = (p: { x: number; y: number }): string => `${p.x.toFixed(2)},${p.y.toFixed(2)}`;

/** 地面のマス（平らな面） */
export function IsoTile({ x, y, w, d, fill, stroke, opacity }: { x: number; y: number; w: number; d: number; fill: string; stroke?: string; opacity?: number }) {
  const points = [iso(x, y), iso(x + w, y), iso(x + w, y + d), iso(x, y + d)].map(pt).join(' ');
  return <polygon points={points} fill={fill} stroke={stroke} strokeWidth={stroke ? 1 : undefined} opacity={opacity} />;
}

/** 物の下に落ちる影 */
export function IsoShadow({ x, y, w, d, opacity = 0.18 }: { x: number; y: number; w: number; d: number; opacity?: number }) {
  const c = iso(x + w / 2, y + d / 2);
  return <ellipse cx={c.x} cy={c.y} rx={(w + d) * (TW / 4.6)} ry={(w + d) * (TH / 4.6)} fill="#204010" opacity={opacity} />;
}

/** 箱。上面・左手前・右手前の 3 面に陰を付ける */
export function IsoBox({ x, y, w, d, h, color, z = 0 }: { x: number; y: number; w: number; d: number; h: number; color: string; z?: number }) {
  const P = (px: number, py: number, pz: number) => iso(px, py, pz);
  return (
    <g>
      <polygon points={[P(x, y + d, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x, y + d, z + h)].map(pt).join(' ')} fill={shade(color, -0.24)} />
      <polygon points={[P(x + w, y, z), P(x + w, y + d, z), P(x + w, y + d, z + h), P(x + w, y, z + h)].map(pt).join(' ')} fill={shade(color, -0.1)} />
      <polygon points={[P(x, y, z + h), P(x + w, y, z + h), P(x + w, y + d, z + h), P(x, y + d, z + h)].map(pt).join(' ')} fill={shade(color, 0.1)} />
    </g>
  );
}

/** 切妻の屋根。棟は x 方向 */
export function IsoRoof({ x, y, w, d, z, rise, color }: { x: number; y: number; w: number; d: number; z: number; rise: number; color: string }) {
  const P = (px: number, py: number, pz: number) => iso(px, py, pz);
  const mid = y + d / 2;
  return (
    <g>
      <polygon points={[P(x, y, z), P(x + w, y, z), P(x + w, mid, z + rise), P(x, mid, z + rise)].map(pt).join(' ')} fill={shade(color, 0.06)} />
      <polygon points={[P(x, y + d, z), P(x + w, y + d, z), P(x + w, mid, z + rise), P(x, mid, z + rise)].map(pt).join(' ')} fill={shade(color, -0.16)} />
      <polygon points={[P(x + w, y, z), P(x + w, y + d, z), P(x + w, mid, z + rise)].map(pt).join(' ')} fill={shade(color, -0.3)} />
    </g>
  );
}

/** 家。壁・屋根・扉・窓・煙突までひと通り */
export function IsoHouse({ x, y, w = 1.6, d = 1.4, h = 1, wall, roof, lit = false }: { x: number; y: number; w?: number; d?: number; h?: number; wall: string; roof: string; lit?: boolean }) {
  const door = iso(x + w, y + d * 0.55, 0);
  const doorTop = iso(x + w, y + d * 0.55, h * 0.62);
  const doorR = iso(x + w, y + d * 0.2, 0);
  const doorRTop = iso(x + w, y + d * 0.2, h * 0.62);
  const win = (wy: number) => {
    const a = iso(x, y + d + 0.001, h * 0.45);
    void a;
    const p1 = iso(x + wy, y + d, h * 0.38);
    const p2 = iso(x + wy + 0.34, y + d, h * 0.38);
    const p3 = iso(x + wy + 0.34, y + d, h * 0.72);
    const p4 = iso(x + wy, y + d, h * 0.72);
    return [p1, p2, p3, p4].map(pt).join(' ');
  };
  return (
    <g>
      <IsoShadow x={x} y={y} w={w} d={d} />
      <IsoBox x={x} y={y} w={w} d={d} h={h} color={wall} />
      <polygon points={win(0.22)} fill={lit ? '#ffe39a' : '#9fc0d6'} stroke="rgba(40,35,28,0.35)" strokeWidth={1} />
      <polygon points={win(0.92)} fill={lit ? '#ffe39a' : '#9fc0d6'} stroke="rgba(40,35,28,0.35)" strokeWidth={1} />
      <polygon points={[doorR, door, doorTop, doorRTop].map(pt).join(' ')} fill={shade(roof, -0.25)} />
      <IsoRoof x={x - 0.12} y={y - 0.12} w={w + 0.24} d={d + 0.24} z={h} rise={Math.min(0.62, d * 0.45)} color={roof} />
      <IsoBox x={x + w * 0.2} y={y + d * 0.15} w={0.18} d={0.18} h={0.34} color="#9c8f7e" z={h + 0.1} />
    </g>
  );
}

/** きらめきの形（4 方向にとがった星） */
function star(cx: number, cy: number, r: number): string {
  const i = r * 0.28;
  return `M${String(cx)} ${String(cy - r)} L${String(cx + i)} ${String(cy - i)} L${String(cx + r)} ${String(cy)} L${String(cx + i)} ${String(cy + i)} L${String(cx)} ${String(cy + r)} L${String(cx - i)} ${String(cy + i)} L${String(cx - r)} ${String(cy)} L${String(cx - i)} ${String(cy - i)} Z`;
}

/** 建った施設。少し大きな建物に旗と、できたてのきらめきを添える */
export function IsoCivic({ x, y, w = 1.8, d = 1.5, h = 1.15, wall = '#f4ead6', roof, sparkle = true }: { x: number; y: number; w?: number; d?: number; h?: number; wall?: string; roof: string; sparkle?: boolean }) {
  const flagBase = iso(x + w * 0.5, y + d * 0.5, h + 0.62);
  const flagTop = iso(x + w * 0.5, y + d * 0.5, h + 1.35);
  const spark = iso(x, y, h + 1.1);
  return (
    <g>
      <IsoShadow x={x} y={y} w={w} d={d} opacity={0.2} />
      {/* 基壇 */}
      <IsoBox x={x - 0.12} y={y - 0.12} w={w + 0.24} d={d + 0.24} h={0.12} color="#d9d0bd" />
      <IsoBox x={x} y={y} w={w} d={d} h={h} color={wall} z={0.12} />
      {/* 窓と入口 */}
      {[0.22, 0.72, 1.22].map((wx) => {
        const p1 = iso(x + wx, y + d, 0.46);
        const p2 = iso(x + wx + 0.3, y + d, 0.46);
        const p3 = iso(x + wx + 0.3, y + d, 0.92);
        const p4 = iso(x + wx, y + d, 0.92);
        return (
          <polygon
            key={wx}
            points={[p1, p2, p3, p4].map((q) => `${String(q.x.toFixed(2))},${String(q.y.toFixed(2))}`).join(' ')}
            fill="#ffe39a"
            stroke="rgba(40,35,28,0.3)"
            strokeWidth={1}
          />
        );
      })}
      <IsoRoof x={x - 0.16} y={y - 0.16} w={w + 0.32} d={d + 0.32} z={h + 0.12} rise={0.62} color={roof} />
      {/* 旗 */}
      <line x1={flagBase.x} y1={flagBase.y} x2={flagTop.x} y2={flagTop.y} stroke="#6e6355" strokeWidth={2.2} strokeLinecap="round" />
      <polygon
        points={`${String(flagTop.x)},${String(flagTop.y)} ${String(flagTop.x + 20)},${String(flagTop.y + 5)} ${String(flagTop.x)},${String(flagTop.y + 10)}`}
        fill={roof}
      />
      {sparkle ? (
        <g fill="#ffd35c">
          <path d={star(spark.x - 2, spark.y + 4, 7)} opacity={0.95} />
          <path d={star(spark.x + 13, spark.y - 5, 4.4)} opacity={0.8} />
        </g>
      ) : null}
    </g>
  );
}

/** 舗装した道。歩道の縁と中央線を引く */
export function IsoRoad({ x, y, w, d, along = 'x' }: { x: number; y: number; w: number; d: number; along?: 'x' | 'y' }) {
  const dashes: string[] = [];
  if (along === 'x') {
    for (let i = 0.35; i < w - 0.2; i += 0.9) {
      dashes.push([iso(x + i, y + d / 2), iso(x + i + 0.45, y + d / 2)].map(pt).join(' '));
    }
  } else {
    for (let i = 0.35; i < d - 0.2; i += 0.9) {
      dashes.push([iso(x + w / 2, y + i), iso(x + w / 2, y + i + 0.45)].map(pt).join(' '));
    }
  }
  return (
    <g>
      <IsoTile x={x} y={y} w={w} d={d} fill="#8d939b" />
      {along === 'x' ? (
        <>
          <IsoTile x={x} y={y} w={w} d={0.14} fill="#cfc9bb" />
          <IsoTile x={x} y={y + d - 0.14} w={w} d={0.14} fill="#cfc9bb" />
        </>
      ) : (
        <>
          <IsoTile x={x} y={y} w={0.14} d={d} fill="#cfc9bb" />
          <IsoTile x={x + w - 0.14} y={y} w={0.14} d={d} fill="#cfc9bb" />
        </>
      )}
      {dashes.map((points) => (
        <polyline key={points} points={points} fill="none" stroke="#ffffff" strokeWidth={2} opacity={0.85} strokeLinecap="round" />
      ))}
    </g>
  );
}

/** 木 */
export function IsoTree({ x, y, scale = 1, seed = 0 }: { x: number; y: number; scale?: number; seed?: number }) {
  const base = iso(x, y);
  const hue = 104 + (seed % 22);
  return (
    <g>
      <ellipse cx={base.x} cy={base.y} rx={11 * scale} ry={5 * scale} fill="#204010" opacity={0.16} />
      <rect x={base.x - 2 * scale} y={base.y - 15 * scale} width={4 * scale} height={15 * scale} rx={1.6 * scale} fill="#7a5230" />
      <circle cx={base.x} cy={base.y - 22 * scale} r={11 * scale} fill={`hsl(${String(hue)}, 40%, 33%)`} />
      <circle cx={base.x - 4 * scale} cy={base.y - 26 * scale} r={6 * scale} fill={`hsl(${String(hue)}, 46%, 42%)`} />
    </g>
  );
}

/** 街灯 */
export function IsoLamp({ x, y }: { x: number; y: number }) {
  const b = iso(x, y);
  const t = iso(x, y, 1.5);
  return (
    <g>
      <ellipse cx={b.x} cy={b.y} rx={6} ry={3} fill="#204010" opacity={0.15} />
      <rect x={b.x - 1.6} y={t.y} width={3.2} height={b.y - t.y} rx={1.6} fill="#5a6470" />
      <circle cx={t.x} cy={t.y - 2} r={4} fill="#ffe8a8" stroke="#5a6470" strokeWidth={1.6} />
    </g>
  );
}

/** 縄張りだけの空き地。これから建てる場所 */
export function IsoVacantLot({ x, y, w = 2, d = 1.8, label }: { x: number; y: number; w?: number; d?: number; label?: string }) {
  const corners = [iso(x, y), iso(x + w, y), iso(x + w, y + d), iso(x, y + d)];
  const sign = iso(x + w / 2, y + d / 2, 0.85);
  const signBase = iso(x + w / 2, y + d / 2);
  return (
    <g>
      <IsoTile x={x} y={y} w={w} d={d} fill="#c9bda3" />
      <polygon points={corners.map(pt).join(' ')} fill="none" stroke="#ffffff" strokeWidth={2} strokeDasharray="7 5" opacity={0.9} />
      {corners.map((c) => (
        <rect key={`${String(c.x)}-${String(c.y)}`} x={c.x - 1.3} y={c.y - 7} width={2.6} height={7} rx={1.3} fill="#8d8172" />
      ))}
      <rect x={signBase.x - 1.6} y={sign.y} width={3.2} height={signBase.y - sign.y} rx={1.6} fill="#8d8172" />
      <g transform={`translate(${String(sign.x)} ${String(sign.y)})`}>
        <rect x={-13} y={-13} width={26} height={16} rx={3.5} fill="#fdfbf6" stroke="#8d8172" strokeWidth={1.8} />
        <text x={0} y={-1.6} fontSize={11} fontWeight={700} textAnchor="middle" fill="#6f6557">
          {label ?? '?'}
        </text>
      </g>
    </g>
  );
}

/* ---------------- 人 ---------------- */

/** 顔の中身を、体に載る大きさで描く（48 の枠を size に縮める） */
function SmallFace({ mood, size }: { mood: Mood; size: number }) {
  const k = size / 48;
  const eye = EYE_SHAPE[mood];
  const mouth = MOUTH[mood];
  return (
    <g transform={`scale(${String(k)}) translate(-24 -24)`}>
      <path d={HEAD_PATH} fill={SKIN} />
      <path d={HAIR_PATH} fill={HAIR} />
      {eye === 'closed' ? (
        <g fill="none" stroke={INK} strokeWidth={2.2} strokeLinecap="round">
          <path d={EYE_CLOSED} transform={`translate(${String(EYE.left)} ${String(EYE.y)})`} />
          <path d={EYE_CLOSED} transform={`translate(${String(EYE.right)} ${String(EYE.y)})`} />
        </g>
      ) : (
        ([['left', 1], ['right', -1]] as const).map(([side, dir]) => (
          <g key={side} transform={`translate(${String(EYE[side])} ${String(EYE.y)}) rotate(${String(eye.rotate * dir)}) scale(1 ${String(eye.scaleY)})`}>
            <path d={EYE_ALMOND} fill={INK} />
          </g>
        ))
      )}
      <g fill="none" stroke={LINE} strokeWidth={2.2} strokeLinecap="round">
        {BROW[mood].map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {mouth.stroke ? <path d={mouth.stroke} fill="none" stroke={INK} strokeWidth={2.4} strokeLinecap="round" /> : null}
      {mouth.fill ? <path d={mouth.fill} fill={INK} /> : null}
    </g>
  );
}

/**
 * 街の人。頭・胴・腕・脚をつないだ全身で、地面に立たせる。
 * 顔の作りは住民の顔（faces.ts）と同じなので、別人に見えない。
 */
export function Villager({
  x,
  y,
  mood,
  coat = '#5d6b7a',
  trousers = '#3c4653',
  animate = false,
  raiseArm = false,
  scale = 1,
}: {
  x: number;
  y: number;
  mood: Mood;
  coat?: string;
  trousers?: string;
  animate?: boolean;
  /** 片手を上げる（訴えている人） */
  raiseArm?: boolean;
  scale?: number;
}) {
  const base = iso(x, y);
  const s = scale;
  return (
    <g transform={`translate(${String(base.x)} ${String(base.y)})`}>
      <ellipse cx={0} cy={0} rx={10 * s} ry={4.4 * s} fill="#204010" opacity={0.18} />
      <motion.g
        animate={animate ? { y: [0, -1.6 * s, 0] } : undefined}
        transition={animate ? { repeat: Infinity, duration: 1.8, ease: 'easeInOut' } : undefined}
      >
        {/* 脚 */}
        <rect x={-6 * s} y={-15 * s} width={5 * s} height={15 * s} rx={2.4 * s} fill={trousers} />
        <rect x={1 * s} y={-15 * s} width={5 * s} height={15 * s} rx={2.4 * s} fill={trousers} />
        {/* 胴 */}
        <path
          d={`M${String(-8 * s)} ${String(-14 * s)} q0 ${String(-12 * s)} ${String(8 * s)} ${String(-12 * s)} q${String(8 * s)} 0 ${String(8 * s)} ${String(12 * s)} Z`}
          fill={coat}
        />
        {/* 腕 */}
        <rect x={-11 * s} y={-24 * s} width={4.2 * s} height={12 * s} rx={2.1 * s} fill={shade(coat, -0.12)} />
        {raiseArm ? (
          <rect
            x={7 * s}
            y={-33 * s}
            width={4.2 * s}
            height={13 * s}
            rx={2.1 * s}
            fill={shade(coat, -0.12)}
            transform={`rotate(24 ${String(9 * s)} ${String(-22 * s)})`}
          />
        ) : (
          <rect x={6.8 * s} y={-24 * s} width={4.2 * s} height={12 * s} rx={2.1 * s} fill={shade(coat, -0.12)} />
        )}
        {/* 襟 */}
        <path d={`M${String(-4 * s)} ${String(-26 * s)} L0 ${String(-21 * s)} L${String(4 * s)} ${String(-26 * s)} Z`} fill="#f4f1ea" />
        {/* 首 */}
        <rect x={-2.6 * s} y={-29 * s} width={5.2 * s} height={5 * s} fill={SKIN_SHADE} />
        {/* 頭 */}
        <g transform={`translate(0 ${String(-37 * s)})`}>
          <SmallFace mood={mood} size={20 * s} />
        </g>
      </motion.g>
    </g>
  );
}

/** ふきだし。しっぽが話し手を指す */
export function SpeechBubble({ x, y, text, width = 150 }: { x: number; y: number; text: string; width?: number }) {
  const h = 30;
  return (
    <g transform={`translate(${String(x)} ${String(y)})`}>
      <rect x={-width / 2} y={-h} width={width} height={h} rx={12} fill="#ffffff" stroke="#ded9d0" strokeWidth={1.5} />
      <path d="M-7 -1 L0 8 L5 -1 Z" fill="#ffffff" stroke="#ded9d0" strokeWidth={1.5} strokeLinejoin="round" />
      <path d="M-6 -1.6 L4 -1.6" stroke="#ffffff" strokeWidth={3} />
      <text x={0} y={-h / 2 + 4.5} fontSize={13} fontWeight={700} textAnchor="middle" fill="#2a2118">
        {text}
      </text>
    </g>
  );
}
