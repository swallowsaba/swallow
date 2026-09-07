import { backoffMs } from '@/engines/kernel/clock';
import { schedule } from './scheduler';
import type { ClusterState, EventRecord, Pod } from './types';

/** 1 tick の長さ（ミリ秒）。バックオフの計算に使う */
export const TICK_MS = 1000;

export interface TickResult {
  pods: Map<string, Pod>;
  events: EventRecord[];
  ipCounter: number;
}

function record(
  events: EventRecord[],
  tick: number,
  type: EventRecord['type'],
  reason: string,
  pod: Pod,
  message: string,
): void {
  events.push({ tick, type, reason, object: `pod/${pod.metadata.name}`, message });
}

/**
 * kubelet 相当。1 tick ぶん Pod の状態を進める。
 * Pending → ContainerCreating → Running。失敗すれば再起動し、
 * 繰り返すほど待ち時間が伸びる（CrashLoopBackOff の指数バックオフ）。
 */
export function tickPods(state: ClusterState): TickResult {
  const tick = state.tick + 1;
  const pods = new Map(state.pods);
  const events: EventRecord[] = [];
  let ipCounter = state.ipCounter;

  for (const [id, original] of state.pods) {
    let pod: Pod = {
      ...original,
      metadata: { ...original.metadata },
      spec: original.spec,
      status: { ...original.status, containerStatuses: original.status.containerStatuses.map((c) => ({ ...c })) },
    };

    if (pod.status.phase === 'Succeeded' || pod.status.phase === 'Failed') {
      pods.set(id, pod);
      continue;
    }

    // 未配置なら配置を試みる
    if (pod.status.nodeName === null) {
      const result = schedule(state, pod);
      if (result.nodeName === null) {
        if (pod.status.message !== result.reason) {
          record(events, tick, 'Warning', 'FailedScheduling', pod, result.reason ?? '');
        }
        pod.status = { ...pod.status, message: result.reason };
        pods.set(id, pod);
        continue;
      }
      ipCounter += 1;
      pod.status = {
        ...pod.status,
        nodeName: result.nodeName,
        podIP: `10.244.0.${String(ipCounter)}`,
        phase: 'ContainerCreating',
        message: null,
        startedAt: tick,
      };
      record(events, tick, 'Normal', 'Scheduled', pod, `Successfully assigned to ${result.nodeName}`);
      pods.set(id, pod);
      continue;
    }

    const started = pod.status.startedAt ?? tick;
    const containers = pod.status.containerStatuses.map((status, i) => {
      const spec = pod.spec.containers[i];
      if (!spec) return status;

      // 失敗するイメージは待機し続け、再試行のたびに間隔が伸びる
      if (spec.failing) {
        if (status.restartAt !== null && tick < status.restartAt) return status;
        const restartCount = status.restartCount + 1;
        const waitTicks = Math.ceil(backoffMs(restartCount, 2 * TICK_MS, 60 * TICK_MS) / TICK_MS);
        record(
          events,
          tick,
          'Warning',
          'Failed',
          pod,
          `Failed to pull image "${spec.image}": not found`,
        );
        return {
          ...status,
          ready: false,
          restartCount,
          waitingReason: restartCount >= 2 ? 'ImagePullBackOff' : 'ErrImagePull',
          restartAt: tick + waitTicks,
        };
      }

      if (status.ready) return status;
      if (tick - started >= spec.readyAfter) {
        record(events, tick, 'Normal', 'Started', pod, `Started container ${spec.name}`);
        return { ...status, ready: true, waitingReason: null, restartAt: null };
      }
      return status;
    });

    const allReady = containers.length > 0 && containers.every((c) => c.ready);
    const anyWaiting = containers.some((c) => c.waitingReason !== null);
    pod.status = {
      ...pod.status,
      containerStatuses: containers,
      phase: allReady ? 'Running' : anyWaiting ? 'Pending' : 'ContainerCreating',
    };
    pods.set(id, pod);
  }

  return { pods, events, ipCounter };
}

/** Pod が Ready か（Service の Endpoints に載る条件） */
export function isReady(pod: Pod): boolean {
  return (
    pod.status.phase === 'Running' &&
    pod.status.containerStatuses.length > 0 &&
    pod.status.containerStatuses.every((c) => c.ready)
  );
}
