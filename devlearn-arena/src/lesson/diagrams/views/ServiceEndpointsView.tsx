import { motion } from 'framer-motion';
import { HUD } from '@/features/park/hud/theme';
import { LABELS, type ServiceEndpointsView as View } from '../serviceEndpoints';
import { Gear } from './parts';
import { type ViewProps } from './helpers';

const W = 460;
const H = 170;
const STOP = { x: 70, y: H / 2 };
/** バス停の箱の半分の幅。探す柄の札が収まる広さ */
const HALF = 48;
const PODS_X = 350;

/** 柄ごとの色。バス停が探す柄と住人の名札が同じ色なら、線がつながる */
const TINT: Readonly<Record<string, string>> = { web: HUD.accent, api: '#c79bff' };

function next(label: string): string {
  const i = LABELS.findIndex((l) => l === label);
  return LABELS[(i + 1) % LABELS.length] ?? label;
}

/**
 * バス停（Service）と住人。住人を押すと名札の柄が変わり、バス停を押すと探す柄が変わる。
 * 線は Endpoints に載った住人にだけ伸びる。
 */
export function ServiceEndpointsView({ view, act, busy }: ViewProps<View>) {
  const y = (i: number) => 32 + i * ((H - 64) / Math.max(1, view.pods.length - 1));
  const stopTint = TINT[view.selector] ?? HUD.muted;

  return (
    <div className="flex flex-col gap-1">
      <svg viewBox={`0 0 ${String(W)} ${String(H)}`} width="100%" height={H} role="img" aria-label="バス停と住人の路線">
        {view.pods.map((pod, i) => (
          <g key={`line-${pod.name}`}>
            <line x1={STOP.x + HALF} y1={STOP.y} x2={PODS_X - 18} y2={y(i)} stroke={HUD.lineStrong} strokeDasharray="3 5" />
            <motion.line
              data-link={pod.name}
              data-linked={pod.linked ? 'true' : undefined}
              x1={STOP.x + HALF}
              y1={STOP.y}
              x2={PODS_X - 18}
              y2={y(i)}
              stroke={stopTint}
              strokeWidth={2.5}
              style={{ filter: `drop-shadow(0 0 4px ${stopTint})` }}
              initial={false}
              animate={{ pathLength: pod.linked ? 1 : 0, opacity: pod.linked ? 1 : 0 }}
              transition={{ duration: 0.6 }}
            />
          </g>
        ))}

        {/* バス停。押すと探す柄が変わる */}
        <g
          role="button"
          data-testid="bus-stop"
          onClick={() => {
            if (!busy) act(`selector:${next(view.selector)}`);
          }}
          style={{ cursor: 'pointer' }}
        >
          <rect x={STOP.x - HALF} y={STOP.y - 30} width={HALF * 2} height={60} rx={6} fill="rgba(30,44,62,0.95)" stroke={stopTint} strokeWidth={1.5} />
          <text x={STOP.x} y={STOP.y - 12} textAnchor="middle" fontSize={11} fontWeight={700} fill={HUD.text}>バス停 web</text>
          <rect x={STOP.x - HALF + 6} y={STOP.y - 2} width={HALF * 2 - 12} height={20} rx={10} fill={`${stopTint}33`} stroke={stopTint} />
          <text x={STOP.x} y={STOP.y + 12} textAnchor="middle" fontSize={10} fill={stopTint}>探す: app={view.selector}</text>
        </g>

        {view.pods.map((pod, i) => {
          const tint = TINT[pod.label] ?? HUD.muted;
          return (
            <g
              key={pod.name}
              role="button"
              data-pod={pod.name}
              onClick={() => {
                if (!busy) act(`label:${pod.name}:${next(pod.label)}`);
              }}
              style={{ cursor: 'pointer' }}
            >
              <circle cx={PODS_X} cy={y(i)} r={14} fill={pod.linked ? `${HUD.ok}` : 'rgba(80,96,112,0.9)'} stroke={pod.linked ? HUD.okText : HUD.lineStrong} />
              <text x={PODS_X} y={y(i) + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill="#0b1118">{pod.name}</text>
              <rect x={PODS_X + 22} y={y(i) - 10} width={78} height={20} rx={10} fill={`${tint}22`} stroke={tint} />
              <text x={PODS_X + 61} y={y(i) + 4} textAnchor="middle" fontSize={10} fill={tint}>名札 app={pod.label}</text>
            </g>
          );
        })}
      </svg>
      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: HUD.muted }}>
        <Gear spinning={busy} size={13} />
        <span>
          {busy ? '監督が路線を引き直している' : '住人を押すと名札が、バス停を押すと探す柄が変わる'}
        </span>
        <span className="ml-auto" data-testid="endpoint-count" style={{ color: HUD.soft }}>
          Endpoints {view.pods.filter((p) => p.linked).length} 件
        </span>
      </div>
    </div>
  );
}
