import { useMemo, type ReactNode } from 'react';
import type { ExperienceKind } from '@/engines/lesson/types';
import { HUD } from '@/features/park/hud/theme';
import { TOWNS, type ThingShape, type TownThing } from './towns';

/**
 * 体験の町の絵。斜め上から見下ろした模型を SVG で描く。
 *
 * 学びの流れの 1〜3 段（体験・登場・確かめ）で同じ町を使う。
 * 光は意味を運ぶ: 青=押せる当たりの見込み、金=新しく建った施設、緑=合っていた、赤=外れ・停電。
 * それ以外の所は光らせない。
 */

/** 格子 1 マスの横幅と縦幅（SVG の単位）。2:1 の斜め見下ろし */
const TW = 64;
const TH = 32;

export interface ThingMark {
  tone: 'hint' | 'ok' | 'miss' | 'gold' | 'dark' | 'chosen';
}

/** 登場の段の矢印。物から札へ線を引く */
export interface TownPointer {
  points: string;
  title: string;
  body: string;
}

interface Props {
  kind: ExperienceKind;
  /** 物ごとの、いま入っている数 */
  fill?: Readonly<Record<string, number>>;
  /** 物ごとの印 */
  marks?: Readonly<Record<string, ThingMark['tone']>>;
  /** 施設が建っているか（登場の段から） */
  facility?: boolean;
  /** 施設が建ち上がる途中か。建ち上がる動きを付ける */
  rising?: boolean;
  /** 住所などの札を見せるか（登場の段から） */
  plates?: boolean;
  /** 中身を見せるか（確かめの段） */
  notes?: boolean;
  /** カメラが寄っている物。null なら町全体 */
  focus?: string | null;
  /** 登場の段の矢印 */
  pointers?: readonly TownPointer[];
  /** 押せるか。押すと id を返す */
  onPress?: ((id: string) => void) | undefined;
  /** 印の横に添える一言（外れたときの理由など） */
  captions?: Readonly<Record<string, string>>;
  children?: ReactNode;
}

function screen(gx: number, gy: number): { x: number; y: number } {
  return { x: ((gx - gy) * TW) / 2, y: ((gx + gy) * TH) / 2 };
}

/** 形ごとの大きさ（マスに対する割合と、高さ）と色 */
const LOOK: Readonly<Record<ThingShape, { w: number; h: number; top: string; left: string; right: string }>> = {
  house: { w: 0.62, h: 16, top: '#b8c4d2', left: '#7d8a99', right: '#5b6776' },
  tower: { w: 0.72, h: 58, top: '#9fb2c8', left: '#61748b', right: '#45566b' },
  facility: { w: 0.95, h: 44, top: '#f3d68a', left: '#c79a3a', right: '#9c7426' },
  post: { w: 0.7, h: 22, top: '#c9b7a2', left: '#8b7a66', right: '#6c5d4c' },
  desk: { w: 0.66, h: 10, top: '#c7b89a', left: '#8e7f64', right: '#6f624b' },
  shelf: { w: 0.4, h: 26, top: '#aab7c4', left: '#6f7c8a', right: '#56616e' },
  bin: { w: 0.34, h: 12, top: '#7f8a96', left: '#59636e', right: '#454e58' },
  tray: { w: 0.5, h: 6, top: '#b3c2cf', left: '#7a8996', right: '#5e6b77' },
  gate: { w: 0.8, h: 14, top: '#a8b8c8', left: '#6c7c8c', right: '#52606e' },
  office: { w: 0.7, h: 24, top: '#b8c8d8', left: '#70849a', right: '#556679' },
  stop: { w: 0.36, h: 20, top: '#8fc9f2', left: '#4f86ad', right: '#3b6a8b' },
  junction: { w: 0.3, h: 18, top: '#c3cdd8', left: '#7d8a99', right: '#5b6776' },
  town: { w: 0.78, h: 20, top: '#bcc8b4', left: '#7c8a73', right: '#5f6b58' },
  plate: { w: 0.34, h: 8, top: '#c3cdd8', left: '#7d8a99', right: '#5b6776' },
  board: { w: 0.9, h: 12, top: '#d2dde8', left: '#8797a8', right: '#687787' },
  bench: { w: 0.6, h: 12, top: '#b5c9bd', left: '#71877a', right: '#56685d' },
};

const TONE: Readonly<Record<ThingMark['tone'], string>> = {
  hint: HUD.accent,
  ok: HUD.ok,
  miss: HUD.bad,
  gold: HUD.warn,
  dark: HUD.bad,
  chosen: HUD.accentText,
};

/** 箱を 1 つ描く。上面・左面・右面の 3 枚 */
function Box({ w, h, top, left, right, dim }: { w: number; h: number; top: string; left: string; right: string; dim: boolean }) {
  const hw = (TW * w) / 2;
  const hh = (TH * w) / 2;
  const opacity = dim ? 0.35 : 1;
  return (
    <g opacity={opacity}>
      <path d={`M ${-hw} ${-h} L 0 ${hh - h} L 0 ${hh} L ${-hw} 0 Z`} fill={left} />
      <path d={`M ${hw} ${-h} L 0 ${hh - h} L 0 ${hh} L ${hw} 0 Z`} fill={right} />
      <path d={`M 0 ${-hh - h} L ${hw} ${-h} L 0 ${hh - h} L ${-hw} ${-h} Z`} fill={top} />
    </g>
  );
}

/** 形ごとの飾り（屋根・窓・旗）。意味の無い光は付けない */
function Detail({ thing, lit }: { thing: TownThing; lit: number }) {
  const look = LOOK[thing.shape];
  const hw = (TW * look.w) / 2;
  if (thing.shape === 'house' || thing.shape === 'town') {
    // 切妻の屋根
    return (
      <path
        d={`M ${-hw} ${-look.h} L 0 ${-look.h - 14} L ${hw} ${-look.h} L 0 ${(TH * look.w) / 2 - look.h} Z`}
        fill="#8a5a4a"
        opacity={0.95}
      />
    );
  }
  if (thing.shape === 'tower') {
    // 窓。住人がいる階だけ灯る（住人が暮らしている、という意味の光）
    const rows = [0, 1, 2];
    return (
      <g>
        {rows.map((r) => (
          <g key={r}>
            {[-0.66, -0.33].map((f, i) => (
              <rect
                key={i}
                x={hw * f - 3}
                y={-12 - r * 16 + (hw * -f) / 2}
                width={6}
                height={8}
                fill={r < lit ? '#ffd98a' : '#2c3746'}
              />
            ))}
          </g>
        ))}
      </g>
    );
  }
  if (thing.shape === 'facility') {
    return (
      <g>
        <line x1={0} y1={-look.h - 18} x2={0} y2={-look.h - 44} stroke="#f0c35a" strokeWidth={2} />
        <path d={`M 0 ${-look.h - 44} L 16 ${-look.h - 38} L 0 ${-look.h - 32} Z`} fill="#f0c35a" />
      </g>
    );
  }
  if (thing.shape === 'stop') {
    return <rect x={-10} y={-look.h - 16} width={20} height={10} rx={2} fill="#5cc1ff" />;
  }
  if (thing.shape === 'junction') {
    return <path d={`M -10 ${-look.h - 4} L 10 ${-look.h - 10} L 10 ${-look.h - 2} L -10 ${-look.h + 4} Z`} fill="#c3cdd8" />;
  }
  return null;
}

/** 物の上に並ぶ、入っている数の点 */
function Dots({ n, room, y }: { n: number; room: number; y: number }) {
  return (
    <g>
      {Array.from({ length: room }, (_, i) => (
        <circle
          key={i}
          cx={(i - (room - 1) / 2) * 11}
          cy={y}
          r={4}
          fill={i < n ? '#7ee0b0' : 'none'}
          stroke={i < n ? '#7ee0b0' : 'rgba(255,255,255,0.35)'}
          strokeWidth={1.4}
        />
      ))}
    </g>
  );
}

export function TownView({
  kind, fill = {}, marks = {}, facility = false, rising = false, plates = false, notes = false,
  focus = null, pointers = [], onPress, captions = {}, children,
}: Props) {
  const town = TOWNS[kind];
  const things = useMemo(
    () =>
      town.things
        .filter((t) => facility || t.facility !== true)
        // 奥から手前へ描く（手前の物が奥の物を隠す）
        .slice()
        .sort((a, b) => a.gx + a.gy - (b.gx + b.gy)),
    [town, facility],
  );
  const at = useMemo(() => new Map(town.things.map((t) => [t.id, screen(t.gx, t.gy)])), [town]);

  // 地面。町全体を 1 マスずつ広げた菱形
  const corners = (() => {
    const gxs = town.things.map((t) => t.gx);
    const gys = town.things.map((t) => t.gy);
    const [x0, x1, y0, y1] = [Math.min(...gxs) - 1, Math.max(...gxs) + 1, Math.min(...gys) - 1, Math.max(...gys) + 1];
    return [screen(x0, y0), screen(x1, y0), screen(x1, y1), screen(x0, y1)];
  })();
  const ground = corners.map((q) => `${String(q.x)},${String(q.y)}`).join(' ');

  // 町全体（地面ごと）が収まる枠。上は高い建物のぶん、右は矢印の札を並べるぶんの余白を取る
  const xs = corners.map((q) => q.x);
  const ys = corners.map((q) => q.y);
  const minX = Math.min(...xs) - 10;
  const maxX = Math.max(...xs) + 10;
  // 札を積む分だけ上に余白を取る
  const minY = Math.min(...ys) - 90 - (pointers.length > 0 ? 70 : 0);
  const maxY = Math.max(...ys) + 20;
  const width = maxX - minX;
  const height = maxY - minY;

  // カメラ。寄る物があれば、そこを中心に 1.6 倍にする
  const target = focus === null ? null : at.get(focus);
  const zoom = target === undefined || target === null ? 1 : 1.6;
  const cx = target?.x ?? (minX + maxX) / 2;
  const cy = (target?.y ?? (minY + maxY) / 2) - (target ? 30 : 0);
  const camera = `translate(${String((minX + maxX) / 2)} ${String((minY + maxY) / 2)}) scale(${String(zoom)}) translate(${String(-cx)} ${String(-cy)})`;

  // 道
  const roads = town.roads
    .filter(([a, b]) => facility || (a !== 'facility' && b !== 'facility'))
    .map(([a, b]) => ({ a: at.get(a), b: at.get(b), key: `${a}-${b}` }));


  return (
    <svg
      data-testid="town"
      data-kind={kind}
      viewBox={`${String(minX)} ${String(minY)} ${String(width)} ${String(height)}`}
      className="h-full w-full select-none"
      role="group"
      aria-label="体験の町"
    >
      <g transform={camera} style={{ transition: 'transform 1.2s cubic-bezier(.3,.7,.2,1)' }}>
        <polygon points={ground} fill="#1b2430" stroke="rgba(255,255,255,0.06)" />
        {roads.map(({ a, b, key }) =>
          a === undefined || b === undefined ? null : (
            <g key={key}>
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#2e3a48" strokeWidth={14} strokeLinecap="round" />
              <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="rgba(255,255,255,0.14)" strokeWidth={1.2} strokeDasharray="6 7" />
            </g>
          ),
        )}
        {things.map((thing) => {
          const p = at.get(thing.id) ?? { x: 0, y: 0 };
          const look = LOOK[thing.shape];
          const tone = marks[thing.id];
          const dark = tone === 'dark';
          const n = fill[thing.id] ?? thing.holds ?? 0;
          const lit = thing.shape === 'tower' && !dark ? n : 0;
          const ring = tone === undefined || tone === 'dark' ? null : TONE[tone];
          const r = (TW * look.w) / 2 + 10;
          const pressable = onPress !== undefined;
          return (
            <g
              key={thing.id}
              data-thing={thing.id}
              data-mark={tone}
              transform={`translate(${String(p.x)} ${String(p.y)})`}
              onClick={pressable ? () => { onPress(thing.id); } : undefined}
              style={{ cursor: pressable ? 'pointer' : 'default' }}
            >
              {/* 足元の輪。意味のある印が付いた物だけに出す */}
              {ring === null ? null : (
                <ellipse cx={0} cy={0} rx={r} ry={r / 2} fill="none" stroke={ring} strokeWidth={3} opacity={0.95}>
                  {tone === 'hint' || tone === 'gold' ? (
                    <animate attributeName="opacity" values="0.95;0.4;0.95" dur="1.6s" repeatCount="indefinite" />
                  ) : null}
                </ellipse>
              )}
              {/* 押せる所を広く取る透明な的 */}
              <ellipse cx={0} cy={-look.h / 2} rx={TW * 0.5} ry={look.h / 2 + TH * 0.4} fill="transparent" />
              {/* 施設は登場の段で地面から建ち上がる */}
              <g className={thing.facility === true && rising ? 'town-rise' : undefined}>
                <Box {...look} dim={dark} />
                <Detail thing={thing} lit={lit} />
              </g>
              {thing.room === undefined ? null : <Dots n={n} room={thing.room} y={-look.h - (TH * look.w) / 2 - 10} />}
              {dark ? (
                <text x={0} y={-look.h - 30} textAnchor="middle" fontSize={11} fill={HUD.bad} fontWeight={700}>
                  停電
                </text>
              ) : null}
              <g transform={`translate(0 ${String((TH * look.w) / 2 + 16)})`}>
                <text textAnchor="middle" fontSize={11.5} fill={HUD.text} style={{ paintOrder: 'stroke' }} stroke="#10141b" strokeWidth={3.5}>
                  {thing.label}
                </text>
                {plates && thing.plate !== undefined ? (
                  <text y={14} textAnchor="middle" fontSize={11} fill={HUD.accentText} fontFamily="JetBrains Mono, monospace" style={{ paintOrder: 'stroke' }} stroke="#10141b" strokeWidth={3.5}>
                    {thing.plate}
                  </text>
                ) : null}
                {notes && thing.note !== undefined ? (
                  <text y={plates && thing.plate !== undefined ? 28 : 14} textAnchor="middle" fontSize={10.5} fill={HUD.muted} style={{ paintOrder: 'stroke' }} stroke="#10141b" strokeWidth={3.5}>
                    {thing.note}
                  </text>
                ) : null}
                {captions[thing.id] === undefined ? null : (
                  <text y={-look.h - 60} textAnchor="middle" fontSize={11} fill={ring ?? HUD.text} fontWeight={700} style={{ paintOrder: 'stroke' }} stroke="#10141b" strokeWidth={3.5}>
                    {captions[thing.id]}
                  </text>
                )}
              </g>
            </g>
          );
        })}

        {/*
          登場の段の矢印。用語の札を物の真上に立て、そこから物へ矢印を下ろす。
          同じ物を指す札が重なるときは、上へ積む。札には番号を振り、説明は横の欄に同じ番号で書く
        */}
        {pointers.map((pointer, i) => {
          const p = at.get(pointer.points);
          if (p === undefined) return null;
          const thing = town.things.find((t) => t.id === pointer.points);
          const top = p.y - (thing === undefined ? 20 : LOOK[thing.shape].h) - 8;
          const stack = pointers.slice(0, i).filter((q) => q.points === pointer.points).length;
          const tagY = top - 46 - stack * 30;
          const text = `${String(i + 1)} ${pointer.title}`;
          const w = Math.max(56, text.length * 11 + 18);
          return (
            <g
              key={`${pointer.title}-${String(i)}`}
              data-pointer={pointer.points}
              className="town-pointer"
              style={{ animationDelay: `${String(0.3 + i * 0.5)}s` }}
            >
              <line x1={p.x} y1={tagY + 12} x2={p.x} y2={top} stroke={HUD.warn} strokeWidth={2} markerEnd="url(#town-arrow)" />
              <rect x={p.x - w / 2} y={tagY - 12} width={w} height={24} rx={5} fill="rgba(16,20,27,0.95)" stroke={HUD.warn} strokeWidth={1.4} />
              <text x={p.x} y={tagY + 5} textAnchor="middle" fontSize={13} fontWeight={700} fill={HUD.warn}>
                {text}
              </text>
            </g>
          );
        })}
        {children}
      </g>
      <defs>
        <marker id="town-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={HUD.warn} />
        </marker>
      </defs>
    </svg>
  );
}
