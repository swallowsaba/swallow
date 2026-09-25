import type { DiagramId } from '@/content/glossary';
import { HUD } from './theme';

/**
 * 語に添える小さな図解（REWORK 5-3）。
 *
 * 遊べる図解（`src/lesson/diagrams`）の縮図。ここでは触れないが、
 * 「この語はこの図で遊べる」と形で分かるようにしておく。
 * 線は HUD と同じ青、止まっている物は灰色。色は意味で決める。
 */

const LINE = HUD.accent;
const SOFT = HUD.muted;

function box(x: number, y: number, w: number, h: number, fill: string) {
  return <rect x={x} y={y} width={w} height={h} rx={2} fill="none" stroke={fill} strokeWidth={1.4} />;
}

function dot(cx: number, cy: number, fill: string) {
  return <circle cx={cx} cy={cy} r={3} fill={fill} />;
}

function line(x1: number, y1: number, x2: number, y2: number, stroke: string, dashed = false) {
  return (
    <line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={stroke}
      strokeWidth={1.4}
      strokeDasharray={dashed ? '3 3' : undefined}
    />
  );
}

/** 図解 1 つぶんの中身 */
function shapesOf(id: DiagramId) {
  switch (id) {
    case 'pod-in-node':
      // ビル 2 棟と、片方に入っている住人
      return (
        <>
          {box(4, 10, 32, 28, SOFT)}
          {box(46, 10, 32, 28, SOFT)}
          {dot(14, 30, LINE)}
          {dot(26, 30, LINE)}
          {dot(56, 30, SOFT)}
        </>
      );
    case 'desired-vs-actual':
      // 注文の数と、いまの数。足りない分が点線
      return (
        <>
          {box(4, 6, 74, 14, SOFT)}
          {dot(16, 13, LINE)}
          {dot(30, 13, LINE)}
          {dot(44, 13, LINE)}
          {box(4, 26, 74, 14, SOFT)}
          {dot(16, 33, LINE)}
          {dot(30, 33, LINE)}
          <circle cx={44} cy={33} r={3} fill="none" stroke={SOFT} strokeWidth={1.2} strokeDasharray="2 2" />
        </>
      );
    case 'pod-lifecycle':
      // 3 段の階段。いまは 2 段目まで灯っている
      return (
        <>
          {dot(12, 24, LINE)}
          {line(15, 24, 37, 24, LINE)}
          {dot(40, 24, LINE)}
          {line(43, 24, 65, 24, SOFT, true)}
          {dot(68, 24, SOFT)}
        </>
      );
    case 'service-endpoints':
      // バス停から 2 つの部屋へ線。1 つは札が合わず切れている
      return (
        <>
          {box(4, 16, 20, 16, LINE)}
          {line(24, 20, 56, 12, LINE)}
          {line(24, 28, 56, 36, SOFT, true)}
          {dot(60, 12, LINE)}
          {dot(60, 36, SOFT)}
        </>
      );
    case 'git-three-areas':
      // 3 つの台。札が真ん中まで来ている
      return (
        <>
          {box(4, 14, 20, 20, SOFT)}
          {box(30, 14, 20, 20, LINE)}
          {box(56, 14, 20, 20, SOFT)}
          {line(24, 24, 30, 24, LINE)}
          {line(50, 24, 56, 24, SOFT, true)}
        </>
      );
    case 'packet-hops':
      // 機器を渡り歩く荷物。最後の一歩はまだ
      return (
        <>
          {box(4, 16, 16, 16, SOFT)}
          {box(32, 16, 16, 16, SOFT)}
          {box(60, 16, 16, 16, SOFT)}
          {line(20, 24, 32, 24, LINE)}
          {line(48, 24, 60, 24, SOFT, true)}
          {dot(30, 24, LINE)}
        </>
      );
  }
}

export function MiniDiagram({ id }: { id: DiagramId }) {
  return (
    <svg data-diagram={id} viewBox="0 0 82 48" width={82} height={48} aria-hidden role="presentation">
      {shapesOf(id)}
    </svg>
  );
}
