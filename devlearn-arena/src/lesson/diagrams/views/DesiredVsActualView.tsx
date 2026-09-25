import { AnimatePresence, motion } from 'framer-motion';
import { HUD } from '@/features/park/hud/theme';
import { REPLICA_CHOICES, type DesiredVsActualView as View } from '../desiredVsActual';
import { Gear } from './parts';
import { phaseColor, type ViewProps } from './helpers';

/**
 * 注文書（replicas）といまの住人。住人を押すと消え、監督が歯車を回して作り直す。
 * つまみで注文の数を変えると、監督が増やしたり減らしたりする。
 */
export function DesiredVsActualView({ view, act, busy }: ViewProps<View>) {
  const missing = Math.max(0, view.desired - view.pods.length);
  const short = view.running !== view.desired || view.pods.length !== view.desired;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-3 rounded-md px-2.5 py-2" style={{ background: HUD.fill, border: `1px solid ${HUD.lineStrong}` }}>
        <div className="text-[11px]" style={{ color: HUD.muted }}>
          注文書
          <div className="text-[18px] font-bold leading-none" style={{ color: HUD.text }}>
            {view.desired} 人
          </div>
        </div>
        <label className="flex min-w-0 flex-1 flex-col text-[10px]" style={{ color: HUD.dim }}>
          replicas のつまみ
          <input
            data-testid="replicas"
            type="range"
            min={REPLICA_CHOICES[0]}
            max={REPLICA_CHOICES[REPLICA_CHOICES.length - 1]}
            step={1}
            value={view.desired}
            disabled={busy}
            onChange={(event) => {
              act(`scale:${event.target.value}`);
            }}
            style={{ accentColor: HUD.accent }}
          />
        </label>
        <div className="flex flex-col items-center text-[10px]" style={{ color: busy ? HUD.accentText : HUD.dim }}>
          <Gear spinning={busy} size={26} />
          監督
        </div>
      </div>

      <div className="flex min-h-[64px] flex-wrap items-center gap-2 rounded-md px-2.5 py-2" style={{ background: 'rgba(30,42,58,0.6)' }}>
        <AnimatePresence>
          {view.pods.map((pod) => (
            <motion.button
              key={pod.name}
              type="button"
              data-pod={pod.name}
              title={`${pod.name} を消す`}
              onClick={() => {
                act(`delete:${pod.name}`);
              }}
              disabled={busy}
              layout
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0, y: -12 }}
              transition={{ duration: 0.35 }}
              className="flex flex-col items-center gap-0.5"
            >
              <span
                className="block h-7 w-7 rounded-full"
                style={{
                  background: `radial-gradient(circle at 35% 30%, #fff5, ${phaseColor(pod.phase)})`,
                  boxShadow: pod.phase === 'Running' ? `0 0 10px ${HUD.ok}` : 'none',
                }}
              />
              <span className="max-w-[64px] truncate text-[9px]" style={{ color: HUD.muted }}>{pod.name.split('-').slice(-1)[0]}</span>
            </motion.button>
          ))}
          {Array.from({ length: missing }, (_, i) => (
            <motion.span
              key={`missing-${String(i)}`}
              className="block h-7 w-7 rounded-full"
              style={{ border: `1.5px dashed ${HUD.warn}` }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ repeat: Infinity, duration: 1.2 }}
              title="足りない分"
            />
          ))}
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between text-[12px]">
        <span style={{ color: HUD.muted }}>住人を押すと消える</span>
        <span data-testid="desired-count" style={{ color: short ? HUD.warn : HUD.okText }}>
          いま動いている {view.running} 人 / 注文 {view.desired} 人
        </span>
      </div>
    </div>
  );
}
