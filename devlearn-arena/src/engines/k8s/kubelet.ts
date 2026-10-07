import { backoffMs } from '@/engines/kernel/clock';
import { schedule } from './scheduler';
import { volumesReady } from './storage';
import type { ClusterState, ContainerSpec, ContainerStatus, EventRecord, Pod, Probe } from './types';

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

/** プローブが、起動から `elapsed` tick 経った時点で通っているか */
export function probePasses(probe: Probe, elapsed: number): boolean {
  if (elapsed < probe.initialDelaySeconds) return false;
  if (probe.succeedsAfter === null) return false;
  return elapsed >= probe.succeedsAfter;
}

/** 失敗し続けたプローブが、しきい値を超えたか */
function probeExhausted(probe: Probe, elapsed: number): boolean {
  if (probe.succeedsAfter !== null) return false;
  const attempts = Math.floor(
    Math.max(0, elapsed - probe.initialDelaySeconds) / Math.max(1, probe.periodSeconds),
  );
  return attempts >= probe.failureThreshold;
}

interface ContainerContext {
  spec: ContainerSpec;
  status: ContainerStatus;
  tick: number;
  elapsed: number;
}

/** 置き場での正式な名前（docker.io/library/nginx:latest の形。containerd の言い方） */
export function fullImageRef(image: string): string {
  const tagged = image.lastIndexOf(':') > image.lastIndexOf('/') ? image : `${image}:latest`;
  const parts = tagged.split('/');
  if (parts.length === 1) return `docker.io/library/${tagged}`;
  return /[.:]/.test(parts[0] ?? '') || parts[0] === 'localhost' ? tagged : `docker.io/${tagged}`;
}

/**
 * イメージが取れない理由（取れるなら null）。本物の containerd の文の形。
 * クラスタに取れるイメージの一覧（images）があれば、それに無い物は取れない。名前はあるがタグが無ければ not found、名前ごと無ければ断られる
 */
export function pullError(state: ClusterState, spec: ContainerSpec): string | null {
  const ref = fullImageRef(spec.image);
  const head = `failed to pull and unpack image "${ref}": failed to resolve reference "${ref}"`;
  if (spec.failing) return `${head}: ${ref}: not found`;
  if (state.images === undefined) return null;
  const known = new Set(state.images.map(fullImageRef));
  if (known.has(ref)) return null;
  const repo = ref.slice(0, ref.lastIndexOf(':'));
  if ([...known].some((k) => k.slice(0, k.lastIndexOf(':')) === repo)) return `${head}: ${ref}: not found`;
  return `${head}: pull access denied, repository does not exist or may require authorization: server message: insufficient_scope: authorization failed`;
}

/** コンテナを動かし始めた時の、本物の kubelet の知らせ（取った・作った・動かした） */
function startedEvents(events: EventRecord[], tick: number, pod: Pod, spec: ContainerSpec): void {
  record(events, tick, 'Normal', 'Pulled', pod, `Successfully pulled image "${spec.image}" in 1.2s (1.2s including waiting)`);
  record(events, tick, 'Normal', 'Created', pod, `Created container ${spec.name}`);
  record(events, tick, 'Normal', 'Started', pod, `Started container ${spec.name}`);
}

/** イメージが取れないコンテナ。待つほど間隔が伸びる */
function pullBackoff({ status, tick }: ContainerContext): ContainerStatus {
  if (status.restartAt !== null && tick < status.restartAt) return status;
  const pulls = (status.pulls ?? 0) + 1;
  const waitTicks = Math.ceil(backoffMs(pulls, 2 * TICK_MS, 60 * TICK_MS) / TICK_MS);
  return {
    ...status,
    ready: false,
    started: false,
    pulls,
    waitingReason: pulls >= 2 ? 'ImagePullBackOff' : 'ErrImagePull',
    restartAt: tick + waitTicks,
  };
}

/** 起動はするがすぐ落ちるコンテナ。CrashLoopBackOff に入る */
function crashBackoff({ status, tick }: ContainerContext): ContainerStatus {
  if (status.restartAt !== null && tick < status.restartAt) return status;
  const restartCount = status.restartCount + 1;
  const waitTicks = Math.ceil(backoffMs(restartCount, 1 * TICK_MS, 300 * TICK_MS) / TICK_MS);
  return {
    ...status,
    ready: false,
    started: false,
    restartCount,
    waitingReason: restartCount >= 2 ? 'CrashLoopBackOff' : 'Error',
    restartAt: tick + waitTicks,
  };
}

/**
 * kubelet 相当。1 tick ぶん Pod の状態を進める。
 *
 * Pending → ContainerCreating → Running。
 * startupProbe が通るまで liveness / readiness は見ない（本物と同じ順序）。
 * readiness が落ちれば Endpoints から外れ、liveness が落ちれば再起動する。
 */
export function tickPods(state: ClusterState): TickResult {
  const tick = state.tick + 1;
  const pods = new Map(state.pods);
  const events: EventRecord[] = [];
  let ipCounter = state.ipCounter;

  for (const [id, original] of state.pods) {
    const pod: Pod = {
      ...original,
      metadata: { ...original.metadata },
      spec: original.spec,
      status: {
        ...original.status,
        containerStatuses: original.status.containerStatuses.map((c) => ({ ...c })),
      },
    };

    if (pod.status.phase === 'Succeeded' || pod.status.phase === 'Failed') {
      pods.set(id, pod);
      continue;
    }

    // 未配置なら配置を試みる。その前にボリュームが揃っているかを見る
    if (pod.status.nodeName === null) {
      const volumes = volumesReady(state, pod);
      if (!volumes.ok) {
        if (pod.status.message !== volumes.reason) {
          record(events, tick, 'Warning', 'FailedScheduling', pod, volumes.reason ?? '');
        }
        pod.status = { ...pod.status, message: volumes.reason };
        pods.set(id, pod);
        continue;
      }

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
      record(events, tick, 'Normal', 'Scheduled', pod, `Successfully assigned ${pod.metadata.namespace}/${pod.metadata.name} to ${result.nodeName}`);
      for (const c of pod.spec.containers) record(events, tick, 'Normal', 'Pulling', pod, `Pulling image "${c.image}"`);
      pods.set(id, pod);
      continue;
    }

    const started = pod.status.startedAt ?? tick;
    const elapsed = tick - started;

    const containers = pod.status.containerStatuses.map((status, i) => {
      const spec = pod.spec.containers[i];
      if (!spec) return status;
      const ctx: ContainerContext = { spec, status, tick, elapsed };

      const pullFailure = pullError(state, spec);
      if (pullFailure !== null) {
        const next = pullBackoff(ctx);
        if (next.pulls !== status.pulls) {
          if (next.waitingReason === 'ErrImagePull') {
            record(events, tick, 'Warning', 'Failed', pod, `Failed to pull image "${spec.image}": ${pullFailure}`);
          } else {
            record(events, tick, 'Normal', 'BackOff', pod, `Back-off pulling image "${spec.image}"`);
          }
          record(events, tick, 'Warning', 'Failed', pod, `Error: ${next.waitingReason ?? 'ErrImagePull'}`);
        }
        return next;
      }

      if (spec.crashing) {
        const next = crashBackoff(ctx);
        if (next.restartCount !== status.restartCount) {
          record(
            events, tick, 'Warning', 'BackOff', pod,
            `Back-off restarting failed container ${spec.name}`,
          );
        }
        return next;
      }

      // startupProbe。通るまで他のプローブは見ない
      if (spec.startupProbe !== null && !status.started) {
        if (probeExhausted(spec.startupProbe, elapsed)) {
          record(
            events, tick, 'Warning', 'Unhealthy', pod,
            `Startup probe failed: container ${spec.name} did not start in time`,
          );
          return {
            ...status,
            ready: false,
            restartCount: status.restartCount + 1,
            waitingReason: 'CrashLoopBackOff',
            restartAt: tick + 5,
          };
        }
        if (!probePasses(spec.startupProbe, elapsed)) return { ...status, ready: false };
        startedEvents(events, tick, pod, spec);
        return { ...status, started: true, waitingReason: null, restartAt: null };
      }

      const running = status.started || spec.startupProbe === null;

      // livenessProbe。落ちたら再起動する
      if (running && spec.livenessProbe !== null && probeExhausted(spec.livenessProbe, elapsed)) {
        record(
          events, tick, 'Warning', 'Unhealthy', pod,
          `Liveness probe failed: container ${spec.name} will be restarted`,
        );
        return {
          ...status,
          ready: false,
          restartCount: status.restartCount + 1,
          waitingReason: 'CrashLoopBackOff',
          restartAt: tick + 5,
        };
      }

      // readinessProbe。落ちても再起動しないが Endpoints からは外れる
      if (running && spec.readinessProbe !== null) {
        const ok = probePasses(spec.readinessProbe, elapsed);
        if (ok && !status.ready) {
          record(events, tick, 'Normal', 'Started', pod, `Started container ${spec.name}`);
        }
        return { ...status, started: true, ready: ok, waitingReason: ok ? null : 'NotReady', restartAt: null };
      }

      if (status.ready) return status;
      if (elapsed >= spec.readyAfter) {
        startedEvents(events, tick, pod, spec);
        return { ...status, ready: true, started: true, waitingReason: null, restartAt: null };
      }
      return status;
    });

    const allReady = containers.length > 0 && containers.every((c) => c.ready);
    const anyWaiting = containers.some((c) => c.waitingReason !== null);

    // Job の Pod（restartPolicy が Always でない）は、Ready になったら終わったとみなす
    const isBatch = pod.spec.restartPolicy !== 'Always';
    if (isBatch && allReady) {
      pod.status = { ...pod.status, containerStatuses: containers, phase: 'Succeeded' };
      record(events, tick, 'Normal', 'Completed', pod, 'Pod completed');
      pods.set(id, pod);
      continue;
    }

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
