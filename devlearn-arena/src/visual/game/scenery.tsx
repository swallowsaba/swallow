import { motion } from 'framer-motion';
import type { KeyboardEvent, ReactNode } from 'react';
import type { RunCommand } from '../commands';
import { clip, textWidth, type Box } from '../sceneKit';
import { Sprite } from './pixel';
import { BUSH, FLOWER, INK, TREE, TREE_PALETTE } from './sprites';
import { cellNoise, decorations, signWidth } from './terrain';

/**
 * ゲーム画面の背景と建物。
 * どれも位置と大きさを受け取って描くだけで、状態は持たない。
 * 飾り（木や花）の置き場所は座標から決まるので、描くたびに同じ景色になる。
 */

export const GRASS = '#77b356';
export const GRASS_DARK = '#5c8f42';
export const PATH = '#d9c39a';
export const PATH_EDGE = '#b79a6d';
export const STONE = '#b9b2a4';
export const STONE_DARK = '#8f877a';
export const WALL = '#f1dfbc';
export const ROOF = '#8f4b3f';
export const GOLD = '#f2c14e';
export const BAD = '#c0392b';
export const OK = '#5aa344';

/** 草地。飾りは建物に重ならないところにだけ置く */
export function Terrain({ width, height, avoid }: { width: number; height: number; avoid: readonly Box[] }) {
  const decos = decorations(width, height, avoid);
  return (
    <g aria-hidden data-terrain="true">
      <rect width={width} height={height} fill={GRASS} />
      {decos.map((d) => {
        const key = `${d.kind}-${String(d.x)}-${String(d.y)}`;
        if (d.kind === 'tree') return <Sprite key={key} map={TREE} palette={TREE_PALETTE} x={d.x} y={d.y} scale={3} />;
        if (d.kind === 'bush') return <Sprite key={key} map={BUSH} palette={TREE_PALETTE} x={d.x + 8} y={d.y + 20} scale={3} />;
        if (d.kind === 'flower') {
          const petal = cellNoise(d.x, d.y) < 0.5 ? '#f7f1e3' : '#f28fb1';
          return <Sprite key={key} map={FLOWER} palette={{ r: petal, y: GOLD, g: GRASS_DARK }} x={d.x + 14} y={d.y + 18} scale={3} />;
        }
        return (
          <g key={key} fill={GRASS_DARK} shapeRendering="crispEdges">
            <rect x={d.x + 10} y={d.y + 24} width={3} height={6} />
            <rect x={d.x + 15} y={d.y + 21} width={3} height={9} />
            <rect x={d.x + 20} y={d.y + 25} width={3} height={5} />
          </g>
        );
      })}
    </g>
  );
}

/* ---------------- 押せる部品 ---------------- */

interface ClickableProps {
  /** 押したときに打つコマンド。null なら押せない */
  command: string | null;
  onCommand?: RunCommand;
  /** 押せないときに読み上げる名前 */
  label: string;
  children: ReactNode;
  [data: `data-${string}`]: string | number | undefined;
}

/**
 * 押すとコマンドを端末に流す部品。
 * 読み上げの名前はコマンドそのものにする（押すと何が打たれるかが分かる）。Enter / Space でも押せる。
 */
export function Clickable({ command, onCommand, label, children, ...data }: ClickableProps) {
  const active = command !== null && onCommand !== undefined;
  const run = () => {
    if (active) onCommand(command);
  };
  return (
    <g
      {...data}
      role={active ? 'button' : undefined}
      tabIndex={active ? 0 : undefined}
      aria-label={active ? command : undefined}
      style={{ cursor: active ? 'pointer' : 'default' }}
      onClick={run}
      onKeyDown={(e: KeyboardEvent<SVGGElement>) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          run();
        }
      }}
    >
      <title>{active ? command : label}</title>
      {children}
    </g>
  );
}

/* ---------------- 看板・吹き出し ---------------- */

/** 木の看板。中央ぞろえで (cx, y) に置く */
export function Sign({ cx, y, text, size = 12, tone = WALL, maxWidth = 200, strong = false }: {
  cx: number;
  y: number;
  text: string;
  size?: number;
  tone?: string;
  maxWidth?: number;
  strong?: boolean;
}) {
  const shown = clip(text, maxWidth - 16, size);
  const w = signWidth(shown, size);
  const h = size + 10;
  return (
    <g aria-hidden>
      <rect x={cx - w / 2 + 3} y={y + 3} width={w} height={h} fill="rgba(0,0,0,0.25)" />
      <rect x={cx - w / 2} y={y} width={w} height={h} fill={tone} stroke={INK} strokeWidth={strong ? 3 : 2} />
      <text
        x={cx}
        y={y + h / 2 + 1}
        fontSize={size}
        fontWeight={800}
        fontFamily="var(--f-mono)"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={INK}
      >
        {shown}
      </text>
    </g>
  );
}

/** 吹き出し。(x, y) は尻尾の先 */
export function Bubble({ x, y, text, tone = '#fffaf0', color = INK, maxWidth = 220, right }: {
  x: number;
  /** 世界の右端。吹き出しがはみ出さないよう左へ寄せる */
  right?: number;
  y: number;
  text: string;
  tone?: string;
  color?: string;
  maxWidth?: number;
}) {
  const shown = clip(text, maxWidth - 16, 11);
  const w = textWidth(shown, 11) + 16;
  const h = 24;
  const left = right === undefined ? x - 18 : Math.max(4, Math.min(x - 18, right - w - 4));
  const top = y - h - 8;
  return (
    <g aria-hidden>
      <rect x={left} y={top} width={w} height={h} fill={tone} stroke={color} strokeWidth={2.5} rx={2} />
      <polygon points={`${String(x - 6)},${String(top + h - 1)} ${String(x + 6)},${String(top + h - 1)} ${String(x)},${String(y)}`} fill={tone} stroke={color} strokeWidth={2.5} />
      <rect x={x - 5} y={top + h - 3} width={10} height={4} fill={tone} />
      <text x={left + 8} y={top + h / 2 + 1} fontSize={11} fontWeight={700} fontFamily="var(--f-mono)" dominantBaseline="middle" fill={color}>
        {shown}
      </text>
    </g>
  );
}

/* ---------------- 建物 ---------------- */

interface BuildingProps {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 光らせる（いまいる場所・動いたところ） */
  lit?: boolean;
  /** 赤く光らせる（止まった場所） */
  alarm?: boolean;
  /** 薄く出す（使えない・止まっている） */
  dim?: boolean;
}

function Halo({ x, y, w, h, lit, alarm }: BuildingProps) {
  if (!lit && !alarm) return null;
  return (
    <rect
      x={x - 8}
      y={y - 8}
      width={w + 16}
      height={h + 16}
      fill="none"
      stroke={alarm ? BAD : GOLD}
      strokeWidth={6}
      strokeDasharray={alarm ? '10 6' : undefined}
      opacity={0.9}
    />
  );
}

/** 家。屋根・壁・窓・扉 */
export function House({ x, y, w, h, lit, alarm, dim, wall = WALL, roof = ROOF }: BuildingProps & { wall?: string; roof?: string }) {
  const roofH = Math.min(34, h * 0.42);
  const wallY = y + roofH;
  const wallH = h - roofH;
  const doorW = 16;
  const doorH = Math.min(26, wallH - 6);
  return (
    <g opacity={dim ? 0.55 : 1}>
      <Halo x={x} y={y} w={w} h={h} lit={lit} alarm={alarm} />
      <rect x={x + 5} y={wallY + 5} width={w} height={wallH} fill="rgba(0,0,0,0.22)" />
      <rect x={x} y={wallY} width={w} height={wallH} fill={wall} stroke={INK} strokeWidth={3} />
      {/* 壁の板目 */}
      {Array.from({ length: Math.floor(wallH / 10) }, (_, i) => (
        <line key={i} x1={x + 2} x2={x + w - 2} y1={wallY + 10 * (i + 1)} y2={wallY + 10 * (i + 1)} stroke="rgba(0,0,0,0.08)" strokeWidth={2} />
      ))}
      <polygon
        points={`${String(x - 8)},${String(wallY)} ${String(x + 14)},${String(y)} ${String(x + w - 14)},${String(y)} ${String(x + w + 8)},${String(wallY)}`}
        fill={roof}
        stroke={INK}
        strokeWidth={3}
        strokeLinejoin="round"
      />
      {Array.from({ length: 3 }, (_, i) => {
        const ly = y + ((i + 1) * roofH) / 4;
        const inset = 14 - ((i + 1) * 22) / 4;
        return <line key={i} x1={x + inset} x2={x + w - inset} y1={ly} y2={ly} stroke="rgba(0,0,0,0.22)" strokeWidth={2} />;
      })}
      {/* 窓 */}
      {w > 70
        ? [x + 12, x + w - 30].map((wx) => (
            <g key={wx}>
              <rect x={wx} y={wallY + 10} width={18} height={14} fill={lit ? '#ffe69a' : '#9cc9e6'} stroke={INK} strokeWidth={2} />
              <line x1={wx + 9} x2={wx + 9} y1={wallY + 10} y2={wallY + 24} stroke={INK} strokeWidth={1.5} />
            </g>
          ))
        : null}
      <rect x={x + w / 2 - doorW / 2} y={wallY + wallH - doorH} width={doorW} height={doorH} fill="#7a5230" stroke={INK} strokeWidth={2} />
      <rect x={x + w / 2 + 3} y={wallY + wallH - doorH / 2} width={3} height={3} fill={GOLD} />
    </g>
  );
}

/** オフィスビル。ガラスの窓が並び、屋上に設備がある（管理棟や本部に使う） */
export function Castle({ x, y, w, h, lit, alarm, dim }: BuildingProps) {
  const cols = Math.max(3, Math.floor((w - 12) / 18));
  const rows = Math.max(2, Math.floor((h - 26) / 16));
  return (
    <g opacity={dim ? 0.55 : 1}>
      <Halo x={x} y={y} w={w} h={h} lit={lit} alarm={alarm} />
      <rect x={x + 6} y={y + 18} width={w} height={h - 12} fill="rgba(0,0,0,0.22)" />
      {/* 屋上の設備 */}
      <rect x={x + 10} y={y + 2} width={Math.min(40, w / 4)} height={12} fill="#b9b2a4" stroke={INK} strokeWidth={2} />
      <rect x={x + w - 34} y={y + 4} width={22} height={10} fill="#9fb0bd" stroke={INK} strokeWidth={2} />
      <rect x={x} y={y + 12} width={w} height={h - 12} fill="#dfe6ec" stroke={INK} strokeWidth={3} />
      <rect x={x} y={y + 12} width={w} height={6} fill="#9fb0bd" />
      {Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => (
          <rect
            key={`${String(r)}-${String(c)}`}
            x={x + 8 + c * 18}
            y={y + 24 + r * 16}
            width={12}
            height={10}
            fill={lit ? '#ffe69a' : '#8fb8d8'}
            stroke="#5f7f99"
            strokeWidth={1}
          />
        )),
      )}
    </g>
  );
}

/** 中継局（ルーター）。鉄塔とアンテナのある局舎 */
export function Tower({ x, y, w, h, lit, alarm, dim }: BuildingProps) {
  const mx = x + w / 2;
  return (
    <g opacity={dim ? 0.55 : 1}>
      <Halo x={x} y={y} w={w} h={h} lit={lit} alarm={alarm} />
      {/* 鉄塔 */}
      <line x1={mx - 10} x2={mx} y1={y + h * 0.45} y2={y - 26} stroke="#6e7a84" strokeWidth={3} />
      <line x1={mx + 10} x2={mx} y1={y + h * 0.45} y2={y - 26} stroke="#6e7a84" strokeWidth={3} />
      {[0.1, 0.25, 0.4].map((k) => (
        <line key={k} x1={mx - 10 + k * 18} x2={mx + 10 - k * 18} y1={y - 26 + (h * 0.45 + 26) * (1 - k)} y2={y - 26 + (h * 0.45 + 26) * (1 - k)} stroke="#6e7a84" strokeWidth={2} />
      ))}
      <circle cx={mx} cy={y - 28} r={4} fill={lit || alarm ? BAD : '#c9c9c9'} stroke={INK} strokeWidth={1.5} />
      {/* 局舎 */}
      <rect x={x + 5} y={y + h * 0.45 + 5} width={w} height={h * 0.55} fill="rgba(0,0,0,0.22)" />
      <rect x={x} y={y + h * 0.45} width={w} height={h * 0.55} fill="#e9eef5" stroke={INK} strokeWidth={3} />
      <rect x={x + w / 2 - 10} y={y + h - 22} width={20} height={22} fill="#5f7f99" stroke={INK} strokeWidth={2} />
      <rect x={x + 6} y={y + h * 0.45 + 8} width={w - 12} height={8} fill="#8fb8d8" stroke="#5f7f99" strokeWidth={1} />
    </g>
  );
}

/** 配電・交換所の小屋（スイッチ） */
export function Kiosk({ x, y, w, h, lit, alarm, dim }: BuildingProps) {
  return (
    <g opacity={dim ? 0.55 : 1}>
      <Halo x={x} y={y} w={w} h={h} lit={lit} alarm={alarm} />
      <rect x={x + 5} y={y + 25} width={w} height={h - 20} fill="rgba(0,0,0,0.22)" />
      <rect x={x} y={y + 20} width={w} height={h - 20} fill="#c9a36b" stroke={INK} strokeWidth={3} />
      <polygon points={`${String(x - 6)},${String(y + 22)} ${String(x + w / 2)},${String(y)} ${String(x + w + 6)},${String(y + 22)}`} fill="#3f7a2b" stroke={INK} strokeWidth={3} />
      {Array.from({ length: Math.max(2, Math.floor((w - 16) / 20)) }, (_, i) => (
        <rect key={i} x={x + 10 + i * 20} y={y + 32} width={12} height={10} fill={GOLD} stroke={INK} strokeWidth={2} />
      ))}
    </g>
  );
}

/** 荷車 */
export function Cart({ x, y, w, h, lit }: BuildingProps) {
  return (
    <g>
      <Halo x={x} y={y} w={w} h={h} lit={lit} />
      <rect x={x + 5} y={y + 5} width={w} height={h - 14} fill="rgba(0,0,0,0.2)" />
      <rect x={x} y={y} width={w} height={h - 14} fill="#b07f4a" stroke={INK} strokeWidth={3} />
      {Array.from({ length: Math.floor(w / 24) }, (_, i) => (
        <line key={i} x1={x + 24 * (i + 1)} x2={x + 24 * (i + 1)} y1={y + 2} y2={y + h - 16} stroke="rgba(0,0,0,0.18)" strokeWidth={2} />
      ))}
      {[x + 22, x + w - 22].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy={y + h - 12} r={12} fill="#7a5230" stroke={INK} strokeWidth={3} />
          <circle cx={cx} cy={y + h - 12} r={3} fill={INK} />
        </g>
      ))}
    </g>
  );
}

/** コンクリートの埠頭（ノード）。gateOpen が false なら入口の遮断機が下りる */
export function Field({ x, y, w, h, lit, dim, gateOpen }: BuildingProps & { gateOpen: boolean }) {
  const bays = Math.max(2, Math.floor(w / 64));
  return (
    <g opacity={dim ? 0.7 : 1}>
      <Halo x={x} y={y} w={w} h={h} lit={lit} />
      <rect x={x + 5} y={y + 5} width={w} height={h} fill="rgba(0,0,0,0.2)" />
      <rect x={x} y={y} width={w} height={h} fill="#c9c6bf" stroke={INK} strokeWidth={3} />
      {/* 置き場の白線 */}
      {Array.from({ length: bays - 1 }, (_, i) => (
        <line key={i} x1={x + ((i + 1) * w) / bays} x2={x + ((i + 1) * w) / bays} y1={y + 54} y2={y + h - 6} stroke="#f6f6f0" strokeWidth={2} strokeDasharray="8 6" />
      ))}
      {/* 岸壁の係船柱 */}
      {Array.from({ length: bays + 1 }, (_, i) => (
        <rect key={`b-${String(i)}`} x={x + (i * w) / bays - 3} y={y + h - 6} width={6} height={8} fill="#f2c14e" stroke={INK} strokeWidth={1.5} />
      ))}
      {/* 入口の遮断機 */}
      <rect x={x - 8} y={y + h / 2 - 20} width={8} height={40} fill="#8f877a" stroke={INK} strokeWidth={2} />
      {gateOpen ? (
        <line x1={x - 4} x2={x - 4} y1={y + h / 2 - 20} y2={y + h / 2 - 52} stroke="#f6f6f0" strokeWidth={5} />
      ) : (
        <g>
          <line x1={x - 4} x2={x + 40} y1={y + h / 2 - 18} y2={y + h / 2 - 18} stroke="#f6f6f0" strokeWidth={6} />
          <line x1={x + 6} x2={x + 16} y1={y + h / 2 - 18} y2={y + h / 2 - 18} stroke={BAD} strokeWidth={6} />
          <line x1={x + 26} x2={x + 36} y1={y + h / 2 - 18} y2={y + h / 2 - 18} stroke={BAD} strokeWidth={6} />
        </g>
      )}
    </g>
  );
}

/* ---------------- 道と線路 ---------------- */

/** 土の道。broken なら赤い破線と通行止めの柵 */
export function Road({ d, lit = false, broken = false, mid }: { d: string; lit?: boolean; broken?: boolean; mid?: { x: number; y: number } }) {
  return (
    <g aria-hidden>
      <path d={d} fill="none" stroke={PATH_EDGE} strokeWidth={30} strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} fill="none" stroke={broken ? '#e7c8b8' : PATH} strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" />
      {lit && !broken ? <path d={d} fill="none" stroke={GOLD} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 10" /> : null}
      {broken ? (
        <>
          <path d={d} fill="none" stroke={BAD} strokeWidth={5} strokeDasharray="12 9" />
          {mid ? (
            <g>
              <rect x={mid.x - 22} y={mid.y - 10} width={44} height={10} fill="#f7f1e3" stroke={INK} strokeWidth={2} />
              <rect x={mid.x - 16} y={mid.y - 10} width={9} height={10} fill={BAD} />
              <rect x={mid.x + 2} y={mid.y - 10} width={9} height={10} fill={BAD} />
              <rect x={mid.x - 20} y={mid.y} width={4} height={12} fill={INK} />
              <rect x={mid.x + 16} y={mid.y} width={4} height={12} fill={INK} />
            </g>
          ) : null}
        </>
      ) : null}
    </g>
  );
}

/** 線路。枕木・2本のレール */
export function Rails({ d, faded = false }: { d: string; faded?: boolean }) {
  return (
    <g aria-hidden opacity={faded ? 0.4 : 1}>
      <path d={d} fill="none" stroke="#7a5230" strokeWidth={22} strokeDasharray="5 7" />
      <path d={d} fill="none" stroke="#6b6b6b" strokeWidth={14} strokeDasharray={faded ? '8 8' : undefined} />
      <path d={d} fill="none" stroke="#9e8a6a" strokeWidth={8} strokeDasharray={faded ? '8 8' : undefined} />
    </g>
  );
}

/** 旗。ブランチ名などに使う */
export function Flag({ x, y, text, tone = GOLD, strong = false }: { x: number; y: number; text: string; tone?: string; strong?: boolean }) {
  const shown = clip(text, 120, 11);
  const w = textWidth(shown, 11) + 14;
  return (
    <g aria-hidden>
      <rect x={x - 2} y={y} width={4} height={40} fill={INK} />
      <rect x={x + 2} y={y + 1} width={w} height={20} fill={tone} stroke={INK} strokeWidth={strong ? 3 : 2} />
      <text x={x + 9} y={y + 12} fontSize={11} fontWeight={800} fontFamily="var(--f-mono)" dominantBaseline="middle" fill={INK}>
        {shown}
      </text>
    </g>
  );
}

/** きらきら。新しくできたもの・変わったものに付ける */
export function Sparkle({ x, y, animate, delay = 0 }: { x: number; y: number; animate: boolean; delay?: number }) {
  const star = (cx: number, cy: number, s: number) =>
    `M ${String(cx)} ${String(cy - s)} L ${String(cx + s / 3)} ${String(cy - s / 3)} L ${String(cx + s)} ${String(cy)} L ${String(cx + s / 3)} ${String(cy + s / 3)} L ${String(cx)} ${String(cy + s)} L ${String(cx - s / 3)} ${String(cy + s / 3)} L ${String(cx - s)} ${String(cy)} L ${String(cx - s / 3)} ${String(cy - s / 3)} Z`;
  return (
    <motion.g
      aria-hidden
      data-sparkle="true"
      initial={animate ? { opacity: 0, scale: 0.4 } : false}
      animate={animate ? { opacity: [0, 1, 1, 0.75], scale: [0.4, 1.2, 1, 1] } : { opacity: 0.85 }}
      transition={{ duration: 1.1, delay }}
      style={{ transformBox: 'fill-box', transformOrigin: 'center' }}
    >
      <path d={star(x, y, 9)} fill="#fff6c9" stroke={GOLD} strokeWidth={2} />
      <path d={star(x + 14, y - 10, 5)} fill="#fff6c9" stroke={GOLD} strokeWidth={1.5} />
    </motion.g>
  );
}

/** 煙。消えたものの跡に出す */
export function Smoke({ x, y }: { x: number; y: number }) {
  return (
    <g aria-hidden>
      <circle cx={x} cy={y} r={12} fill="#e9e4da" stroke={INK} strokeWidth={2} />
      <circle cx={x + 12} cy={y - 6} r={9} fill="#e9e4da" stroke={INK} strokeWidth={2} />
      <circle cx={x - 10} cy={y - 8} r={8} fill="#e9e4da" stroke={INK} strokeWidth={2} />
    </g>
  );
}
