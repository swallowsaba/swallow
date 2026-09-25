import { motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { HUD } from '@/features/park/hud/theme';
import { DEVICES, type PacketHopsView as View } from '../packetHops';
import { MiniButton } from './parts';
import { type ViewProps } from './helpers';

const W = 460;
const H = 120;
const Y = 50;
const x = (i: number) => 50 + i * ((W - 100) / (DEVICES.length - 1));
const xOf = (device: string) => x(DEVICES.findIndex((d) => d === device));
/** 1 ホップ渡るのにかける時間（秒）。TTL が減るのを目で追える速さ */
const HOP_S = 0.7;

/**
 * 機器 4 台と、その間の線。送り先を選ぶと、荷物が 1 ホップずつ渡っていき、
 * 機器に入るたびに TTL の数字が変わる。線を押すと差し込み口を止めたりつないだりできる。
 */
export function PacketHopsView({ view, act, busy }: ViewProps<View>) {
  const trip = view.trip;
  const hops = trip?.hops ?? [];
  // 荷物がいまどの機器まで来たか。送るたびに 0 から数え直す
  const [at, setAt] = useState(0);
  useEffect(() => {
    setAt(0);
    const steps = trip?.hops ?? [];
    if (steps.length === 0) return;
    const timers = steps.map((_, i) =>
      setTimeout(() => {
        setAt(i);
      }, i * HOP_S * 1000),
    );
    return () => {
      timers.forEach(clearTimeout);
    };
  }, [trip]);
  const here = hops[at];
  const arrived = at === hops.length - 1;
  const stopped = trip !== null && !trip.delivered && arrived;

  return (
    <div className="flex flex-col gap-2">
      <svg viewBox={`0 0 ${String(W)} ${String(H)}`} width="100%" height={H} role="img" aria-label="機器と線と荷物">
        {view.links.map((link) => {
          const x1 = xOf(link.from) + 24;
          const x2 = xOf(link.to) - 24;
          return (
            <g
              key={`${link.from}-${link.to}`}
              role="button"
              data-link={`${link.from}:${link.ifname}`}
              data-up={link.up ? 'true' : undefined}
              onClick={() => {
                if (!busy) act(`link:${link.from}:${link.ifname}`);
              }}
              style={{ cursor: 'pointer' }}
            >
              {/* 押しやすいよう、見えない太い帯を敷く */}
              <line x1={x1} y1={Y} x2={x2} y2={Y} stroke="transparent" strokeWidth={18} />
              <line
                x1={x1}
                y1={Y}
                x2={x2}
                y2={Y}
                stroke={link.up ? HUD.accent : HUD.bad}
                strokeWidth={link.up ? 2.5 : 2}
                strokeDasharray={link.up ? undefined : '5 5'}
                style={{ filter: link.up ? `drop-shadow(0 0 3px ${HUD.accent})` : `drop-shadow(0 0 5px ${HUD.bad})` }}
              />
              {link.up ? null : (
                <text x={(x1 + x2) / 2} y={Y - 8} textAnchor="middle" fontSize={10} fill={HUD.bad}>切れている</text>
              )}
            </g>
          );
        })}

        {DEVICES.map((device, i) => {
          const router = device.startsWith('r');
          const failedHere = stopped && here?.device === device;
          return (
            <g key={device} data-device={device}>
              <rect
                x={x(i) - 24}
                y={Y - 18}
                width={48}
                height={36}
                rx={router ? 18 : 5}
                fill="rgba(30,44,62,0.95)"
                stroke={failedHere ? HUD.bad : HUD.lineStrong}
                strokeWidth={failedHere ? 2 : 1}
                style={failedHere ? { filter: `drop-shadow(0 0 6px ${HUD.bad})` } : undefined}
              />
              <text x={x(i)} y={Y + 4} textAnchor="middle" fontSize={11} fontWeight={700} fill={HUD.text}>{device}</text>
              <text x={x(i)} y={Y + 32} textAnchor="middle" fontSize={9} fill={HUD.dim}>{router ? 'ルータ' : '端末'}</text>
            </g>
          );
        })}

        {here === undefined ? null : (
          <g>
            <motion.circle
              data-testid="packet"
              r={7}
              cy={Y - 26}
              fill={stopped ? HUD.bad : HUD.warn}
              initial={false}
              animate={{ cx: xOf(here.device) }}
              transition={{ duration: HOP_S * 0.8, ease: 'easeInOut' }}
              style={{ filter: `drop-shadow(0 0 6px ${stopped ? HUD.bad : HUD.warn})` }}
            />
            <motion.text
              data-testid="packet-ttl"
              y={Y - 38}
              textAnchor="middle"
              fontSize={10}
              fill={HUD.text}
              initial={false}
              animate={{ x: xOf(here.device) }}
              transition={{ duration: HOP_S * 0.8, ease: 'easeInOut' }}
            >
              TTL {here.ttl}
            </motion.text>
          </g>
        )}
      </svg>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px]" style={{ color: HUD.muted }}>pc1 から送る:</span>
        {DEVICES.filter((d) => d !== 'pc1').map((d) => (
          <MiniButton key={d} testId={`send-${d}`} onClick={() => { act(`send:${d}`); }} disabled={busy}>
            {d} へ
          </MiniButton>
        ))}
        <span className="ml-auto text-[11px]" style={{ color: stopped ? HUD.bad : arrived && trip?.delivered === true ? HUD.okText : HUD.dim }}>
          {trip === null ? '線を押すと切ったりつないだりできる' : stopped ? `${here?.device ?? ''} で止まった` : arrived ? `${trip.to} に届いた` : '渡っている途中'}
        </span>
      </div>
    </div>
  );
}
