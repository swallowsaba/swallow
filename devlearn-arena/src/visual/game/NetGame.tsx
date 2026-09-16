import { motion } from 'framer-motion';
import { useMemo, useState } from 'react';
import type { Topology } from '@/engines/net/types';
import { useT } from '@/i18n/useT';
import { useMotionEnabled } from '@/ui/motion';
import { netCommands, type RunCommand } from '../commands';
import { HopInspector } from '../HopInspector';
import { HOP_MS, useHopPlayer } from '../useHopPlayer';
import { layoutNet, stoppedAt, type PlacedDevice } from '../netModel';
import { clip, type Box, type Point } from '../sceneKit';
import { EmptyWorld, GameStage } from './GameStage';
import { Sprite } from './pixel';
import { HERO, heroPalette, INK, LETTER, LETTER_PALETTE } from './sprites';
import { BAD, Bubble, Clickable, House, Kiosk, OK, Road, Sign, Tower } from './scenery';

interface Props {
  net: Topology | null;
  self: string;
  onCommand?: RunCommand;
}

const SPREAD_X = 1.25;
const SPREAD_Y = 1.4;
const OFFSET = { x: 40, y: 70 };
export const TOWN_W = 130;
export const TOWN_H = 92;

/** 構成図の置き場所を広げ、道を通す余白を作る */
function townBox(node: PlacedDevice): Box {
  return { x: OFFSET.x + node.x * SPREAD_X, y: OFFSET.y + node.y * SPREAD_Y, w: TOWN_W, h: TOWN_H };
}

const centerOf = (box: Box): Point => ({ x: box.x + box.w / 2, y: box.y + box.h - 14 });

/**
 * ネットワークの街道。
 * 機器は建物（ホスト＝家、ルーター＝塔、スイッチ＝分かれ道の小屋）、ケーブルは道。切れた道は赤い破線と通行止めの柵。
 * 直前に送ったパケットは手紙になって、deliver が返したホップの順に道を1区間ずつ運ばれる。手紙を押すとヘッダが見える。
 * 届かなかったときは止まった建物が赤く光り、吹き出しで理由を言う。
 * 建物を押すとそこへ ping、道を押すと ip link set で切る／繋ぐ、旗で操作する機器を切り替える。
 */
export function NetGame({ net, self, onCommand }: Props) {
  const t = useT();
  const animate = useMotionEnabled();
  const placed = useMemo(() => (net === null ? null : layoutNet(net)), [net]);
  const trace = net?.trace;
  const hops = trace?.hops ?? [];
  const [step, setStep] = useHopPlayer(trace?.id, hops.length, animate);
  const [inspecting, setInspecting] = useState(false);

  if (net === null || placed === null) {
    return <EmptyWorld title={t('game.net.title')} lead={t('game.net.noNet')} testId="game-net" />;
  }

  const boxes = new Map(placed.nodes.map((n) => [n.name, townBox(n)]));
  const hop = hops[step];
  const hopBox = hop === undefined ? undefined : boxes.get(hop.device);
  const letterAt = hopBox === undefined ? null : centerOf(hopBox);
  const walked = new Set(hops.slice(1, step + 1).map((h, i) => [hops[i]?.device ?? '', h.device].sort().join('>')));
  const stopped = stoppedAt(trace);
  const finished = step >= hops.length - 1;
  const width = Math.max(...[...boxes.values()].map((b) => b.x + b.w), 400) + 80;
  const height = Math.max(...[...boxes.values()].map((b) => b.y + b.h), 200) + 110;
  const occupied: Box[] = [...boxes.values()].map((b) => ({ x: b.x - 40, y: b.y - 50, w: b.w + 80, h: b.h + 110 }));
  const lastDevice = hops[hops.length - 1]?.device;

  return (
    <GameStage
      title={t('game.net.title')}
      testId="game-net"
      width={width}
      height={height}
      occupied={[
        ...occupied,
        ...placed.edges.map((e) => {
          const a = centerOf(boxes.get(e.from.name) ?? { x: 0, y: 0, w: 0, h: 0 });
          const b = centerOf(boxes.get(e.to.name) ?? { x: 0, y: 0, w: 0, h: 0 });
          return { x: Math.min(a.x, b.x) - 20, y: Math.min(a.y, b.y) - 20, w: Math.abs(a.x - b.x) + 40, h: Math.abs(a.y - b.y) + 40 };
        }),
      ]}
      interactive={onCommand !== undefined}
      hud={
        <span className="knob px-2 py-0.5 font-mono text-xs" data-testid="game-self">
          🧑 {self}
        </span>
      }
      footer={
        <>
          <HopInspector
            hops={hops}
            step={step}
            onStep={setStep}
            inspecting={inspecting}
            onInspect={() => {
              setInspecting(true);
            }}
          />
          {net.dns.size > 0 ? (
            <div className="mt-3">
              <p className="text-sm font-bold">{t('viz.dns')}</p>
              <ul>
                {[...net.dns.entries()].map(([name, ip]) => (
                  <li key={name} className="font-mono text-xs">
                    {name} → {ip}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      }
    >
      {/* 道（ケーブル） */}
      {placed.edges.map((edge) => {
        const a = centerOf(boxes.get(edge.from.name) ?? { x: 0, y: 0, w: 0, h: 0 });
        const b = centerOf(boxes.get(edge.to.name) ?? { x: 0, y: 0, w: 0, h: 0 });
        const onPath = walked.has([edge.from.name, edge.to.name].sort().join('>'));
        const toggle = netCommands.toggleLink(net, edge.link, self);
        const d = `M ${String(a.x)} ${String(a.y)} L ${String(b.x)} ${String(b.y)}`;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        return (
          <Clickable key={`${edge.link.a}-${edge.link.b}`} command={toggle} onCommand={onCommand} label={t('viz.toggleLink')} data-link={`${edge.link.a}-${edge.link.b}`} data-up={edge.up ? 'true' : 'false'}>
            <Road d={d} lit={onPath} broken={!edge.up} mid={mid} />
            <path d={d} stroke="transparent" strokeWidth={34} fill="none" style={{ pointerEvents: 'stroke' }} />
            <text x={mid.x} y={mid.y + (edge.up ? 26 : 30)} fontSize={10} fontWeight={700} textAnchor="middle" fontFamily="var(--f-mono)" fill={INK} stroke="#f6e8cd" strokeWidth={3} paintOrder="stroke">
              {`${edge.link.a.split(':')[1] ?? ''} ⇄ ${edge.link.b.split(':')[1] ?? ''}`}
            </text>
          </Clickable>
        );
      })}

      {/* 建物（機器） */}
      {placed.nodes.map((node) => {
        const box = boxes.get(node.name);
        if (!box) return null;
        const isSelf = node.name === self;
        const isStop = finished && stopped === node.name;
        const ping = isSelf ? null : netCommands.pingTo(net, node.name);
        const Building = node.kind === 'router' ? Tower : node.kind === 'switch' ? Kiosk : House;
        const inner = node.kind === 'router' ? { ...box, x: box.x + 30, w: box.w - 60 } : node.kind === 'switch' ? { ...box, y: box.y + 26, h: box.h - 26 } : box;
        return (
          <g key={node.name} data-device={node.name} data-stopped={isStop ? 'true' : 'false'} data-self={isSelf ? 'true' : 'false'}>
            <Clickable command={ping} onCommand={onCommand} label={node.name}>
              <Building {...inner} lit={isSelf} alarm={isStop} dim={!node.up} />
              <Sign cx={box.x + box.w / 2} y={box.y - 46} text={`${node.kind === 'router' ? '🔀' : node.kind === 'switch' ? '🔗' : '💻'} ${node.name}`} tone={isSelf ? '#f2c14e' : '#f6e8cd'} strong={isSelf} maxWidth={box.w + 40} />
              {node.ips.slice(0, 2).map((ip, i) => (
                <text key={ip} x={box.x + box.w / 2} y={box.y + box.h + 18 + i * 14} fontSize={11} fontWeight={700} textAnchor="middle" fontFamily="var(--f-mono)" fill={INK} stroke="#f6e8cd" strokeWidth={3} paintOrder="stroke">
                  {clip(ip, box.w + 30, 11)}
                </text>
              ))}
            </Clickable>
            {isSelf ? (
              <g aria-hidden>
                <Sprite map={HERO} palette={heroPalette('#c0604a')} x={box.x - 30} y={box.y + box.h - 44} scale={3} />
              </g>
            ) : onCommand && node.kind !== 'switch' ? (
              <Clickable command={netCommands.operateOn(node.name)} onCommand={onCommand} label={t('game.net.operate')} data-operate={node.name}>
                <rect x={box.x - 26} y={box.y + box.h - 30} width={24} height={26} fill="transparent" />
                <rect x={box.x - 16} y={box.y + box.h - 30} width={3} height={28} fill={INK} />
                <polygon points={`${String(box.x - 13)},${String(box.y + box.h - 30)} ${String(box.x + 2)},${String(box.y + box.h - 24)} ${String(box.x - 13)},${String(box.y + box.h - 18)}`} fill="#3f6f8f" stroke={INK} strokeWidth={1.5} />
              </Clickable>
            ) : null}
            {isStop && trace?.error ? (
              <g data-testid="stop-reason">
                <Bubble x={box.x + box.w / 2} y={box.y - 48} text={`✗ ${trace.error}`} color={BAD} maxWidth={260} right={width} />
              </g>
            ) : null}
            {finished && trace?.delivered && node.name === lastDevice ? (
              <Bubble x={box.x + box.w / 2} y={box.y - 48} text={t('game.net.delivered')} color={OK} right={width} />
            ) : null}
          </g>
        );
      })}

      {/* 手紙（パケット）。いまのホップの建物から、次の建物へ運ばれる */}
      {letterAt !== null ? (
        <motion.g
          key={`letter-${String(trace?.id ?? 0)}`}
          data-testid="packet"
          role="button"
          tabIndex={0}
          aria-label={t('viz.inspectPacket')}
          style={{ cursor: 'pointer' }}
          initial={{ x: letterAt.x - 18, y: letterAt.y - 48 }}
          animate={{ x: letterAt.x - 18, y: letterAt.y - 48 }}
          transition={{ duration: animate ? (HOP_MS * 0.8) / 1000 : 0, ease: 'easeInOut' }}
          onClick={() => {
            setInspecting(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') setInspecting(true);
          }}
        >
          <title>{t('viz.inspectPacket')}</title>
          <circle cx={18} cy={14} r={22} fill="#fff6c9" stroke={INK} strokeWidth={2} opacity={0.85} />
          <Sprite map={LETTER} palette={LETTER_PALETTE} scale={3} />
        </motion.g>
      ) : null}
    </GameStage>
  );
}
