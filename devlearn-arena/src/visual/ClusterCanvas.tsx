import { AnimatePresence, motion } from 'framer-motion';
import { useMemo } from 'react';
import { isReady } from '@/engines/k8s/kubelet';
import type { ClusterState, Pod } from '@/engines/k8s/types';
import { useMotionEnabled } from '@/ui/motion';
import { useT } from '@/i18n/useT';
import { k8sCommands, type RunCommand } from './commands';

interface Props {
  cluster: ClusterState | null;
  /** 図の操作をコマンドとして端末に流す。無ければ見るだけの図になる */
  onCommand?: RunCommand;
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
export function ClusterCanvas({ cluster, onCommand }: Props) {
  const t = useT();
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
          <p className="text-lg font-bold">{t('viz.noCluster')}</p>
          <p className="mt-2 text-sm text-ink-soft">
            {t('viz.noClusterLead')}
          </p>
        </div>
      </div>
    );
  }

  const pending = pods.filter((p) => p.status.nodeName === null);

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-mono text-sm text-ink-soft">
          {t('viz.clusterSummary', {
            tick: cluster.tick,
            nodes: nodes.length,
            pods: pods.length,
          })}
        </p>
        {onCommand ? (
          <button
            type="button"
            className="knob ml-auto px-3 py-1 text-sm"
            onClick={() => {
              onCommand(k8sCommands.advance());
            }}
          >
            {t('viz.advance')}
          </button>
        ) : null}
      </div>
      {onCommand ? <p className="mt-1 text-xs text-ink-soft">{t('viz.clickHint')}</p> : null}

      {/* Deployment。± であるべき数を変える */}
      {cluster.deployments.size > 0 ? (
        <div className="mt-3 border-4 border-wood-dark bg-cream p-3">
          <p className="text-sm font-bold text-ink-soft">{t('viz.deployments')}</p>
          <ul className="mt-1 flex flex-col gap-1">
            {[...cluster.deployments.values()].map((d) => {
              const ready = pods.filter(
                (p) => isReady(p) && Object.entries(d.spec.selector).every(([k, v]) => p.metadata.labels[k] === v),
              ).length;
              return (
                <li key={d.metadata.name} className="flex items-center gap-2 font-mono text-sm">
                  <span className="sign px-2 py-0.5 text-xs font-extrabold">Deployment</span>
                  <span className="font-bold">{d.metadata.name}</span>
                  <span className="text-ink-soft">
                    {d.spec.replicas} / {ready}
                  </span>
                  {onCommand ? (
                    <span className="ml-auto flex gap-1">
                      <button
                        type="button"
                        aria-label={t('viz.scaleDown', { name: d.metadata.name })}
                        title={k8sCommands.scale(d.metadata.name, d.spec.replicas - 1)}
                        disabled={d.spec.replicas <= 0}
                        className="knob px-2 py-0.5 text-sm disabled:opacity-40"
                        onClick={() => {
                          onCommand(k8sCommands.scale(d.metadata.name, d.spec.replicas - 1));
                        }}
                      >
                        −
                      </button>
                      <button
                        type="button"
                        aria-label={t('viz.scaleUp', { name: d.metadata.name })}
                        title={k8sCommands.scale(d.metadata.name, d.spec.replicas + 1)}
                        className="knob px-2 py-0.5 text-sm"
                        onClick={() => {
                          onCommand(k8sCommands.scale(d.metadata.name, d.spec.replicas + 1));
                        }}
                      >
                        +
                      </button>
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

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
              {t('viz.noEndpoints')}
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
                {onCommand ? (
                  <button
                    type="button"
                    aria-label={t(node.spec.unschedulable ? 'viz.uncordon' : 'viz.cordon')}
                    title={k8sCommands.toggleCordon(node.metadata.name, node.spec.unschedulable)}
                    className="knob px-2 py-0.5 text-xs"
                    onClick={() => {
                      onCommand(k8sCommands.toggleCordon(node.metadata.name, node.spec.unschedulable));
                    }}
                  >
                    {node.spec.unschedulable ? '▶' : '⏸'}
                  </button>
                ) : null}
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
                        className="relative border-2 border-wood-dark"
                        style={{ backgroundColor: tone.bg }}
                        title={`${pod.metadata.name} / ${tone.label}`}
                      >
                        <button
                          type="button"
                          disabled={!onCommand}
                          aria-label={t('viz.describePod', { name: pod.metadata.name })}
                          className="block px-2 py-1 pr-6 text-left disabled:cursor-default"
                          onClick={() => {
                            onCommand?.(k8sCommands.describePod(pod.metadata.name));
                          }}
                        >
                          <span className="block max-w-[130px] truncate font-mono text-xs font-bold text-ink">
                            {pod.metadata.name.split('-').slice(-1)[0]}
                          </span>
                          <span className="block font-mono text-[11px] text-ink">{tone.label}</span>
                        </button>
                        {onCommand ? (
                          <button
                            type="button"
                            aria-label={t('viz.deletePod', { name: pod.metadata.name })}
                            title={k8sCommands.deletePod(pod.metadata.name)}
                            className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center border-2 border-wood-dark bg-cream text-xs font-extrabold leading-none"
                            onClick={() => {
                              onCommand(k8sCommands.deletePod(pod.metadata.name));
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                {mine.length === 0 ? (
                  <p className="text-sm text-ink-soft">{t('viz.noPods')}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {/* 配置できていない Pod */}
      {pending.length > 0 ? (
        <div className="mt-4 border-4 border-[var(--bad)] bg-cream p-3">
          <p className="font-bold text-[var(--bad)]">{t('viz.unplaced', { n: pending.length })}</p>
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
