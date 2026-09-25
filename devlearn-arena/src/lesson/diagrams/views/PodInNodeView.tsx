import { motion } from 'framer-motion';
import { useState } from 'react';
import { HUD } from '@/features/park/hud/theme';
import type { PodInNodeView as View } from '../podInNode';
import { Gear, Shake } from './parts';
import { dragSource, dropTarget, phaseColor, type ViewProps } from './helpers';

/**
 * ビル 3 棟と住人。住人をドラッグして別のビルへ落とすと引っ越す。
 * ドラッグできないときのために、住人を押してからビルを押しても同じことができる。
 */
export function PodInNodeView({ view, act, busy, refused }: ViewProps<View>) {
  const [held, setHeld] = useState<string | null>(null);
  const moveTo = (pod: string, node: string) => {
    setHeld(null);
    act(`move:${pod}:${node}`);
  };
  const refusedAt = refused?.moveId.split(':')[2] ?? null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: HUD.muted }}>
        <Gear spinning={busy} size={14} />
        <span>{busy ? '配置係が部屋を割り当てている' : '住人をドラッグして、別のビルへ落とす'}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {view.nodes.map((node) => {
          const full = node.used >= node.capacity;
          const shake = refusedAt === node.name ? (refused?.key ?? null) : null;
          return (
            <Shake key={node.name} shake={shake}>
              <div
                data-node={node.name}
                {...dropTarget((pod) => {
                  moveTo(pod, node.name);
                })}
                onClick={() => {
                  if (held !== null) moveTo(held, node.name);
                }}
                className="flex h-[150px] flex-col rounded-t-md p-1.5"
                style={{
                  background: 'linear-gradient(180deg, rgba(40,56,76,0.9), rgba(22,30,42,0.95))',
                  border: `1px solid ${shake !== null ? HUD.bad : held !== null ? HUD.accentEdge : HUD.lineStrong}`,
                  boxShadow: shake !== null ? `0 0 12px ${HUD.bad}` : 'inset 0 -12px 20px rgba(0,0,0,0.3)',
                  cursor: held === null ? 'default' : 'pointer',
                }}
              >
                <div className="flex items-baseline justify-between text-[11px]">
                  <span className="font-bold" style={{ color: HUD.text }}>{node.name}</span>
                  <span style={{ color: full ? HUD.warn : HUD.muted }}>{full ? '満員' : '空きあり'}</span>
                </div>
                {/* CPU の空き。申告の合計が、貸し出せる量のどこまで来ているか */}
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded" style={{ background: HUD.fill }}>
                  <motion.div
                    className="h-full"
                    style={{ background: full ? HUD.warn : HUD.accent }}
                    animate={{ width: `${String(Math.min(100, (node.used / Math.max(1, node.capacity)) * 100))}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <div className="mt-0.5 text-[10px]" style={{ color: HUD.dim }}>
                  CPU {node.used}/{node.capacity}m
                </div>
                <div className="mt-auto flex flex-col gap-1">
                  {node.pods.map((pod) => (
                    <motion.div layoutId={`pod-${pod.name}`} key={pod.name} transition={{ duration: 0.45 }}>
                      <button
                        type="button"
                        data-pod={pod.name}
                        {...dragSource(pod.name)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setHeld((was) => (was === pod.name ? null : pod.name));
                        }}
                        className="flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px]"
                        style={{
                          background: held === pod.name ? HUD.accentFill : 'rgba(255,214,120,0.08)',
                          border: `1px solid ${held === pod.name ? HUD.accent : HUD.line}`,
                          cursor: 'grab',
                        }}
                      >
                        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: phaseColor(pod.phase), boxShadow: `0 0 6px ${phaseColor(pod.phase)}` }} />
                        <span style={{ color: HUD.text }}>{pod.name}</span>
                        <span className="ml-auto" style={{ color: HUD.dim }}>100m</span>
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>
            </Shake>
          );
        })}
      </div>
      {/* 道。ビルが決まるまで住人はここで待つ */}
      <div className="flex min-h-[28px] items-center gap-1.5 rounded px-2 py-1" style={{ background: 'rgba(80,90,100,0.25)', borderTop: `2px dashed ${HUD.lineStrong}` }}>
        <span className="text-[10px]" style={{ color: HUD.dim }}>道（部屋待ち）</span>
        {view.waiting.map((pod) => (
          <motion.span
            layoutId={`pod-${pod.name}`}
            key={pod.name}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px]"
            style={{ border: `1px solid ${HUD.warn}`, color: HUD.warn }}
          >
            {pod.name} · {pod.phase}
          </motion.span>
        ))}
      </div>
    </div>
  );
}
