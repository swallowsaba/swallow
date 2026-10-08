import { fromRegistry, normalizeRef, type Image } from '@/engines/container/container';
import { routeFor } from '@/engines/http/http';
import type { ClusterState, ContainerSpec, ContainerStatus, EventRecord, Pod, Probe } from './types';

/**
 * 本物の確かめ（liveness・readiness の httpGet）の模型。純粋な関数（docs/lessons/k8s.md k8s.i.05）。
 *
 * 置き場のイメージのうち、動き出してから待ち受けるまでの秒数（serves.warmup）を持つアプリだけを、この形で動かす:
 * - プロセスが動き出しても、warmup 秒の間はポートで待ち受けない。止められている（kill -STOP 1）間は、頼みに答えない
 * - 確かめは、動き出してから initialDelaySeconds 後に始め、periodSeconds ごとに、その道とポートに HTTP で頼む（200〜399 で通る）
 * - readiness: 通れば Ready、failureThreshold 回続けて失敗すれば Ready でなくなる（Service の宛先から外れる）。確かめが無ければ、動き出した時から Ready
 * - liveness: failureThreshold 回続けて失敗すれば、コンテナを止めて作り直す（待つ時間は作り直すたびに延びる）
 * どちらの確かめも、失敗するたびに本物と同じ文の知らせ（Unhealthy）を出す
 */

type Serves = NonNullable<Image['serves']>;

/** この形で動かすアプリ（待ち受けるまでの秒数を持つ置き場のイメージ）の作り。それ以外は undefined */
export function liveApp(state: ClusterState, spec: ContainerSpec): (Serves & { warmup: number }) | undefined {
  if (state.images === undefined) return undefined;
  const serves = fromRegistry(normalizeRef(spec.image))?.serves;
  return serves?.warmup === undefined ? undefined : { ...serves, warmup: serves.warmup };
}

/** アプリが今、ポートで待ち受けて答えるか */
export function listening(app: { warmup: number }, status: ContainerStatus, tick: number): boolean {
  return status.started && status.runningSince !== undefined && status.frozen !== true && tick - status.runningSince >= app.warmup;
}

/** 1 回の確かめ。通れば null、通らなければ本物の kubelet の文 */
function probeOnce(app: Serves & { warmup: number }, status: ContainerStatus, probe: Probe, ip: string, tick: number): string | null {
  const get = probe.httpGet ?? { path: '/', port: app.port };
  const url = `http://${ip}:${String(get.port)}${get.path}`;
  if (status.frozen === true) return `Get "${url}": context deadline exceeded (Client.Timeout exceeded while awaiting headers)`;
  if (!listening(app, status, tick) || get.port !== app.port) return `Get "${url}": dial tcp ${ip}:${String(get.port)}: connect: connection refused`;
  const route = app.routes ? routeFor(app.routes, 'GET', get.path) : { status: get.path === '/' ? 200 : 404 };
  return route.status >= 200 && route.status < 400 ? null : `HTTP probe failed with statuscode: ${String(route.status)}`;
}

/** その tick に確かめを打つか（動き出してから initialDelaySeconds 後に始め、periodSeconds ごと） */
function due(probe: Probe, since: number): boolean {
  if (since < probe.initialDelaySeconds) return false;
  return (since - probe.initialDelaySeconds) % Math.max(1, probe.periodSeconds) === 0;
}

/** 止まったコンテナを作り直すまでの待ち（本物の kubelet と同じく、初めはすぐ。続くと 10 秒・20 秒…と延び、300 秒で止まる） */
export function restartWait(restartCount: number): number {
  return restartCount <= 1 ? 1 : Math.min(10 * 2 ** (restartCount - 2), 300);
}

/**
 * 1 tick ぶん、このアプリのコンテナを進める。elapsed は Pod を置いてからの tick 数。
 * 知らせは record で足す（object は Pod）
 */
export function advanceLive(
  app: Serves & { warmup: number },
  pod: Pod,
  spec: ContainerSpec,
  status: ContainerStatus,
  tick: number,
  elapsed: number,
  record: (type: EventRecord['type'], reason: string, message: string) => void,
): ContainerStatus {
  // 作り直しを待っている
  if (status.restartAt !== null && tick < status.restartAt) return status;
  // 動き出す（初めて・作り直し）
  if (!status.started) {
    if (status.restartAt === null && elapsed < spec.readyAfter) return status;
    if (status.restartCount > 0) record('Normal', 'Pulled', `Container image "${spec.image}" already present on machine`);
    else record('Normal', 'Pulled', `Successfully pulled image "${spec.image}" in 1.2s (1.2s including waiting)`);
    record('Normal', 'Created', `Created container ${spec.name}`);
    record('Normal', 'Started', `Started container ${spec.name}`);
    return {
      ...status, started: true, runningSince: tick, frozen: false, liveFails: 0, readyFails: 0, restartAt: null, waitingReason: null,
      ready: spec.readinessProbe === null,
    };
  }

  const since = tick - (status.runningSince ?? tick);
  const ip = pod.status.podIP ?? '';
  let next: ContainerStatus = { ...status };

  if (spec.readinessProbe === null) next.ready = true;
  else if (due(spec.readinessProbe, since)) {
    const failed = probeOnce(app, status, spec.readinessProbe, ip, tick);
    if (failed === null) next = { ...next, ready: true, readyFails: 0 };
    else {
      record('Warning', 'Unhealthy', `Readiness probe failed: ${failed}`);
      const fails = (status.readyFails ?? 0) + 1;
      next = { ...next, readyFails: fails, ready: fails >= spec.readinessProbe.failureThreshold ? false : status.ready };
    }
  }
  // 読み込みの途中（待ち受ける前）に Ready だった（頼みが送られて、答えられなかった）
  if (next.ready && since < app.warmup) next.early = (status.early ?? 0) + 1;

  if (spec.livenessProbe !== null && due(spec.livenessProbe, since)) {
    const failed = probeOnce(app, status, spec.livenessProbe, ip, tick);
    if (failed === null) next.liveFails = 0;
    else {
      record('Warning', 'Unhealthy', `Liveness probe failed: ${failed}`);
      const fails = (status.liveFails ?? 0) + 1;
      next.liveFails = fails;
      if (fails >= spec.livenessProbe.failureThreshold) {
        record('Normal', 'Killing', `Container ${spec.name} failed liveness probe, will be restarted`);
        const restartCount = status.restartCount + 1;
        const wait = restartWait(restartCount);
        if (wait > 1) record('Warning', 'BackOff', `Back-off restarting failed container ${spec.name} in pod ${pod.metadata.name}_${pod.metadata.namespace}`);
        return {
          ...next, started: false, ready: false, frozen: false, liveFails: 0, readyFails: 0, restartCount, lastRestartAt: tick,
          restartAt: tick + wait, waitingReason: wait > 1 ? 'CrashLoopBackOff' : null,
        };
      }
    }
  }
  return next;
}

/** これから状態が変わる途中か（確かめの失敗が続いている・止められている・作り直しを待っている・待ち受ける前） */
export function settling(state: ClusterState, pod: Pod): boolean {
  return pod.status.containerStatuses.some((status, i) => {
    // 止まって作り直しを待つコンテナ（CrashLoopBackOff。作り直すとまた止まる）
    if (status.lastTerminated !== undefined && status.restartAt !== null && status.restartAt > state.tick) return true;
    const spec = pod.spec.containers[i];
    const app = spec === undefined ? undefined : liveApp(state, spec);
    if (app === undefined || spec === undefined) return false;
    if (status.restartAt !== null || status.frozen === true || (status.liveFails ?? 0) > 0) return true;
    return status.started && !status.ready && spec.readinessProbe !== null;
  });
}
