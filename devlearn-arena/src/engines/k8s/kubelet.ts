import { backoffMs } from '@/engines/kernel/clock';
import { initFiles, TABLES_FILE } from '@/engines/container/pg';
import { appExit } from './apps';
import { advanceLive, liveApp } from './probes';
import { pgOf, readAt, writeAt } from './volumes';
import { schedule } from './scheduler';
import { liveEnv, missingEnvRef, volumesReady } from './storage';
import type { ClusterState, ContainerSpec, ContainerStatus, EventRecord, PersistentVolume, Pod, Probe } from './types';

/** 1 tick の長さ（ミリ秒）。バックオフの計算に使う */
export const TICK_MS = 1000;

export interface TickResult {
  pods: Map<string, Pod>;
  events: EventRecord[];
  ipCounter: number;
  /** DB が動き出す時に、データを書く場所（PVC で付けた PV）に最初の表を作った後の PV */
  persistentVolumes?: Map<string, PersistentVolume>;
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

/** Node の番号（node-2 なら 2。制御の側などは 0） */
function nodeIndex(name: string): number {
  const m = /-(\d+)$/.exec(name);
  return m && !name.startsWith('cp-') ? Number(m[1]) : 0;
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
  let volumes = new Map(state.persistentVolumes);

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

      // 同じ時刻に先に置いた Pod も数に入れる（入れないと、全てが同じ Node に寄る）
      const result = schedule({ ...state, pods }, pod);
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
        // 本物は Node ごとに Pod の網（10.244.<Node の番号>.0/24）を持つ。本物の形の名前を使うクラスタだけ、その形にする
        podIP: state.server === undefined ? `10.244.0.${String(ipCounter)}` : `10.244.${String(nodeIndex(result.nodeName))}.${String(ipCounter + 1)}`,
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

    const advance = (status: ContainerStatus, i: number): ContainerStatus => {
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

      // 環境変数の参照先（ConfigMap・Secret とそのキー）が無ければ、コンテナを作れずに待つ（作られれば動き出す）
      const configFailure = missingEnvRef(state, pod, spec);
      if (configFailure !== null) {
        if (status.waitingReason !== 'CreateContainerConfigError') {
          record(events, tick, 'Normal', 'Pulled', pod, `Successfully pulled image "${spec.image}" in 1.2s (1.2s including waiting)`);
          record(events, tick, 'Warning', 'Failed', pod, `Error: ${configFailure}`);
        }
        return { ...status, ready: false, started: false, waitingReason: 'CreateContainerConfigError', restartAt: null };
      }

      // 起動はするがすぐ落ちる（壊れた設定の再現か、イメージのアプリが要る環境変数が無くて止まる）
      if (spec.crashing || appExit(state, spec, liveEnv(state, pod, spec)) !== null) {
        const next = crashBackoff(ctx);
        if (next.restartCount !== status.restartCount) {
          record(
            events, tick, 'Warning', 'BackOff', pod,
            `Back-off restarting failed container ${spec.name}`,
          );
        }
        return next;
      }

      // 待ち受けるまでの時間を持つアプリは、本物の確かめ（httpGet）で見る（src/engines/k8s/probes.ts）
      const app = liveApp(state, spec);
      if (app !== undefined) return advanceLive(app, pod, spec, status, tick, elapsed, (type, reason, message) => record(events, tick, type, reason, pod, message));

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
    };
    // 動かし始めた時（作り直した時）に環境変数を引いて持つ。後から ConfigMap を変えても、作り直すまで変わらない（本物と同じ）
    let containers = pod.status.containerStatuses.map((status, i) => {
      const next = advance(status, i);
      const spec = pod.spec.containers[i];
      if (!spec || !next.started) return next;
      const kept = status.started && status.env !== undefined && next.restartCount === status.restartCount;
      return kept ? next : { ...next, env: liveEnv(state, pod, spec) };
    });
    // DB のイメージは、動き出す時にデータを書く場所を見て、空なら最初の表を作る（init）。あればそのまま使う
    for (const [i, spec] of pod.spec.containers.entries()) {
      const pg = pgOf(state, spec);
      const was = pod.status.containerStatuses[i];
      const now = containers[i];
      if (pg === undefined || now === undefined || !now.started || was?.started === true) continue;
      const fresh = readAt(state, pod, i, `${pg.dataDir}/${TABLES_FILE}`, volumes) === undefined;
      let next = { ...now, fresh };
      if (fresh) {
        const files = Object.fromEntries(Object.entries(initFiles(pg.seed)).map(([rel, text]) => [`${pg.dataDir}/${rel}`, text]));
        const written = writeAt(state, { ...pod, status: { ...pod.status, containerStatuses: containers } }, i, files, volumes);
        volumes = written.volumes;
        next = { ...(written.pod.status.containerStatuses[i] ?? now), fresh };
      }
      containers = containers.map((c, j) => (j === i ? next : c));
    }

    const allReady = containers.length > 0 && containers.every((c) => c.ready);
    const anyWaiting = containers.some((c) => c.waitingReason !== null);
    const liveStarted = containers.some((c, i) => c.runningSince !== undefined && pod.spec.containers[i] !== undefined && liveApp(state, pod.spec.containers[i]) !== undefined);

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
      // 本物の確かめで見るアプリは、一度動き出せば Running（Ready でなくても、作り直しを待っていても）
      phase: allReady || liveStarted ? 'Running' : anyWaiting ? 'Pending' : 'ContainerCreating',
    };
    pods.set(id, pod);
  }

  return { pods, events, ipCounter, persistentVolumes: volumes };
}

/** Pod が Ready か（Service の Endpoints に載る条件） */
export function isReady(pod: Pod): boolean {
  return (
    pod.status.phase === 'Running' &&
    pod.status.containerStatuses.length > 0 &&
    pod.status.containerStatuses.every((c) => c.ready)
  );
}
