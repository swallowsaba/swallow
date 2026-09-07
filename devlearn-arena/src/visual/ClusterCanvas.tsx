import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { isReady } from '@/engines/k8s/kubelet';
import type { ClusterState, Pod } from '@/engines/k8s/types';
import { useMotionEnabled } from '@/ui/motion';

interface Props {
  cluster: ClusterState | null;
}

function podTone(pod: Pod): { bg: string; label: string } {
  if (pod.status.nodeName === null) return { bg: 'var(--cream-dark)', label: 'Pending' };
  const waiting = pod.status.containerStatuses.find((c) => c.waitingReason !== null);
  if (waiting?.waitingReason != null) return { bg: 'var(--bad)', label: waiting.waitingReason };
  if (isReady(pod)) return { bg: 'var(--ok)', label: 'Running' };
  return { bg: 'var(--warn)', label: 'Creating' };
}

/**
 * クラスタの様子。ノードを区画として並べ、Pod をその中の粒として置く。
 * 配置されると Pod がノードへ飛んで着地し、Ready になると色が変わる。
 * Service からは、Endpoints に載っている Pod にだけ線が伸びる。
 */
export function ClusterCanvas({ cluster }: Props) {
  const animate = useMotionEnabled();

  const nodes = useMemo(
    () =>
      cluster === null
        ? []
        : [...cluster.nodes.values()].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1)),
    [cluster],
  );
  const pods = useMemo(
    () =>
      cluster === null
        ? []
        : [...cluster.pods.values()].sort((a, b) => (a.metadata.name < b.metadata.name ? -1 : 1)),
    [cluster],
  );

  if (cluster === null) {
    return (
      <div className="grid h-full place-items-center p-6 text-center">
        <div>
          <p className="text-lg font-bold">クラスタがありません</p>
          <p className="mt-2 text-sm text-ink-soft">
            Kubernetes の任務を選ぶと、ここにノードと Pod が並びます。
          </p>
        </div>
      </div>
    );
  }

  const pending = pods.filter((p) => p.status.nodeName === null);

  return (
    <div className="h-full overflow-auto p-4">
      <p className="font-mono text-sm text-ink-soft">
        tick {cluster.tick} / ノード {nodes.length} / Pod {pods.length}
      </p>

      {/* Service と Endpoints */}
      {[...cluster.services.values()].map((svc) => (
        <div key={svc.metadata.name} className="mt-3 border-4 border-wood-dark bg-cream p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="sign px-2 py-0.5 text-sm font-extrabold">Service</span>
            <span className="font-bold">{svc.metadata.name}</span>
            <span className="font-mono text-sm text-ink-soft">
              selector: {Object.entries(svc.spec.selector).map(([k, v]) => `${k}=${v}`).join(',') || '<none>'}
            </span>
            <span
              className={`ml-auto border-2 px-2 font-mono text-sm ${
                svc.status.endpoints.length > 0
                  ? 'border-[var(--ok)] text-[var(--ok)]'
                  : 'border-[var(--bad)] text-[var(--bad)]'
              }`}
            >
              Endpoints {svc.status.endpoints.length}
            </span>
          </div>
          {svc.status.endpoints.length === 0 ? (
            <p className="mt-1 text-sm text-[var(--bad)]">
              条件に合う Ready な Pod がありません。ラベルと Ready の状態を確かめてください。
            </p>
          ) : null}
        </div>
      ))}

      {/* ノードと Pod */}
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {nodes.map((node) => {
          const mine = pods.filter((p) => p.status.nodeName === node.metadata.name);
          const used = mine.reduce(
            (sum, p) => sum + p.spec.containers.reduce((n, c) => n + c.requests.cpu, 0),
            0,
          );
          const ratio = Math.min(1, used / Math.max(1, node.status.allocatable.cpu));
          return (
            <div key={node.metadata.name} className="border-4 border-wood-dark bg-cream">
              <div className="plate flex items-center gap-2 px-3 py-1.5 text-sm font-extrabold">
                <span aria-hidden>🖳</span>
                {node.metadata.name}
                <span className="ml-auto font-mono text-xs">
                  {node.spec.unschedulable ? 'SchedulingDisabled' : 'Ready'}
                </span>
              </div>

              <div className="px-3 pt-2">
                <div className="h-3 w-full border-2 border-wood-dark bg-white">
                  <div className="h-full bg-gold" style={{ width: `${String(ratio * 100)}%` }} />
                </div>
                <p className="mt-1 font-mono text-xs text-ink-soft">
                  cpu {used} / {node.status.allocatable.cpu}m
                </p>
              </div>

              <div className="flex min-h-[86px] flex-wrap gap-2 p-3">
                <AnimatePresence initial={false}>
                  {mine.map((pod) => {
                    const tone = podTone(pod);
                    return (
                      <motion.div
                        key={pod.metadata.name}
                        layout={animate}
                        initial={animate ? { scale: 0.3, y: -40, opacity: 0 } : false}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={animate ? { scale: 0.4, opacity: 0 } : undefined}
                        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
                        className="border-2 border-wood-dark px-2 py-1"
                        style={{ backgroundColor: tone.bg }}
                        title={`${pod.metadata.name} / ${tone.label}`}
                      >
                        <p className="max-w-[130px] truncate font-mono text-xs font-bold text-ink">
                          {pod.metadata.name.split('-').slice(-1)[0]}
                        </p>
                        <p className="font-mono text-[11px] text-ink">{tone.label}</p>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {mine.length === 0 ? (
                  <p className="text-sm text-ink-soft">Pod なし</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* 配置できていない Pod */}
      {pending.length > 0 ? (
        <div className="mt-4 border-4 border-[var(--bad)] bg-cream p-3">
          <p className="font-bold text-[var(--bad)]">配置できていない Pod ({pending.length})</p>
          <ul className="mt-2 flex flex-col gap-1">
            {pending.map((pod) => (
              <li key={pod.metadata.name} className="font-mono text-sm">
                {pod.metadata.name}
                <span className="ml-2 text-ink-soft">{pod.status.message ?? 'Pending'}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
