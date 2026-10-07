import type {
  AccessMode, ClusterState, ContainerSpec, EventRecord, PersistentVolume, PersistentVolumeClaim, Pod,
} from './types';
import { key } from './types';
import { meta } from './factory';

export interface BindResult {
  persistentVolumes: Map<string, PersistentVolume>;
  persistentVolumeClaims: Map<string, PersistentVolumeClaim>;
  events: EventRecord[];
  nameCounter: number;
}

function fits(volume: PersistentVolume, claim: PersistentVolumeClaim): boolean {
  if (volume.status.phase !== 'Available') return false;
  if (volume.spec.storageClassName !== claim.spec.storageClassName) return false;
  if (volume.spec.capacityGi < claim.spec.requestGi) return false;
  return claim.spec.accessModes.every((mode: AccessMode) => volume.spec.accessModes.includes(mode));
}

/**
 * PV と PVC を束ねる。
 *
 * 手で用意した PV があれば、条件（容量・アクセスモード・StorageClass）を満たす中で
 * 一番小さいものを選ぶ。無ければ、StorageClass が動的provisioning に対応していれば
 * その場で PV を作る。どちらも駄目なら Pending のまま理由を残す。
 */
export function bindClaims(state: ClusterState): BindResult {
  const volumes = new Map(state.persistentVolumes);
  const claims = new Map(state.persistentVolumeClaims);
  const events: EventRecord[] = [];
  let nameCounter = state.nameCounter;
  const tick = state.tick;

  for (const [id, claim] of [...claims].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (claim.status.phase === 'Bound') continue;

    const candidates = [...volumes.values()]
      .filter((v) => fits(v, claim))
      .sort((a, b) =>
        a.spec.capacityGi !== b.spec.capacityGi
          ? a.spec.capacityGi - b.spec.capacityGi
          : a.metadata.name < b.metadata.name
            ? -1
            : 1,
      );

    let chosen = candidates[0];

    if (chosen === undefined) {
      const storageClass = state.storageClasses.get(claim.spec.storageClassName);
      if (storageClass === undefined) {
        claims.set(id, {
          ...claim,
          status: {
            phase: 'Pending',
            volumeName: null,
            message: `storageclass.storage.k8s.io "${claim.spec.storageClassName}" not found`,
          },
        });
        continue;
      }
      if (!storageClass.dynamic) {
        claims.set(id, {
          ...claim,
          status: {
            phase: 'Pending',
            volumeName: null,
            message: 'no persistent volumes available for this claim and no storage class is set',
          },
        });
        continue;
      }
      nameCounter += 1;
      const name = `pvc-${nameCounter.toString(36).padStart(5, '0')}`;
      chosen = {
        kind: 'PersistentVolume',
        metadata: meta(name, { namespace: '', createdAt: tick }),
        spec: {
          capacityGi: claim.spec.requestGi,
          accessModes: [...claim.spec.accessModes],
          storageClassName: claim.spec.storageClassName,
          reclaimPolicy: storageClass.reclaimPolicy,
          nodeName: null,
        },
        status: { phase: 'Available', claim: null },
      };
      volumes.set(name, chosen);
      events.push({
        tick,
        type: 'Normal',
        reason: 'ProvisioningSucceeded',
        object: `persistentvolumeclaim/${claim.metadata.name}`,
        message: `Successfully provisioned volume ${name}`,
      });
    }

    volumes.set(chosen.metadata.name, {
      ...chosen,
      status: { phase: 'Bound', claim: id },
    });
    claims.set(id, {
      ...claim,
      status: { phase: 'Bound', volumeName: chosen.metadata.name, message: null },
    });
    events.push({
      tick,
      type: 'Normal',
      reason: 'Bound',
      object: `persistentvolumeclaim/${claim.metadata.name}`,
      message: `Bound to ${chosen.metadata.name}`,
    });
  }

  return { persistentVolumes: volumes, persistentVolumeClaims: claims, events, nameCounter };
}

/**
 * その Pod が要求しているボリュームが、全て使える状態になっているか。
 * PVC が Bound でない、参照している ConfigMap / Secret が無い、のどちらかなら配置できない。
 */
export function volumesReady(state: ClusterState, pod: Pod): { ok: boolean; reason: string | null } {
  for (const volume of pod.spec.volumes) {
    if (volume.kind === 'persistentVolumeClaim') {
      const claim = state.persistentVolumeClaims.get(key(pod.metadata.namespace, volume.claimName));
      if (claim === undefined) {
        return { ok: false, reason: `persistentvolumeclaim "${volume.claimName}" not found` };
      }
      if (claim.status.phase !== 'Bound') {
        return { ok: false, reason: `pod has unbound immediate PersistentVolumeClaims` };
      }
      continue;
    }
    if (volume.kind === 'configMap') {
      if (!state.configMaps.has(key(pod.metadata.namespace, volume.configMap))) {
        return { ok: false, reason: `configmap "${volume.configMap}" not found` };
      }
      continue;
    }
    if (volume.kind === 'secret') {
      if (!state.secrets.has(key(pod.metadata.namespace, volume.secret))) {
        return { ok: false, reason: `secret "${volume.secret}" not found` };
      }
    }
  }
  return { ok: true, reason: null };
}

/** 今の ConfigMap / Secret から、そのコンテナに入る環境変数を引く（コンテナを動かす時に kubelet が使う） */
export function liveEnv(state: ClusterState, pod: Pod, spec: ContainerSpec): Record<string, string> {
  const out: Record<string, string> = {};

  for (const ref of spec.envFrom) {
    const id = key(pod.metadata.namespace, ref.name);
    const source =
      ref.kind === 'ConfigMap' ? state.configMaps.get(id)?.data : state.secrets.get(id)?.data;
    if (source === undefined) continue;
    // Secret は base64 で持っているが、環境変数に入るときは復号される
    const decode = (value: string) => (ref.kind === 'Secret' ? atob(value) : value);
    if (ref.key !== undefined) {
      const value = source[ref.key];
      if (value !== undefined) out[ref.as ?? ref.key] = decode(value);
      continue;
    }
    for (const [k, v] of Object.entries(source)) out[k] = decode(v);
  }
  // 直接書いた env が最後に勝つ（本物と同じ）
  return { ...out, ...spec.env };
}

/**
 * 環境変数の参照先が無い時の、本物の kubelet の文（揃っていれば null）。
 * 無ければコンテナを作れず、CreateContainerConfigError で待つ
 */
export function missingEnvRef(state: ClusterState, pod: Pod, spec: ContainerSpec): string | null {
  for (const ref of spec.envFrom) {
    const ns = pod.metadata.namespace;
    const source = ref.kind === 'ConfigMap' ? state.configMaps.get(key(ns, ref.name))?.data : state.secrets.get(key(ns, ref.name))?.data;
    const word = ref.kind === 'ConfigMap' ? 'configmap' : 'secret';
    if (source === undefined) return `${word} "${ref.name}" not found`;
    if (ref.key !== undefined && source[ref.key] === undefined) return `couldn't find key ${ref.key} in ${ref.kind} ${ns}/${ref.name}`;
  }
  return null;
}

/**
 * そのコンテナの環境変数。本物と同じく、コンテナを動かした時に引いた値のまま（後から ConfigMap を変えても変わらない）。
 * まだ動いていなければ、今の値を引く
 */
export function resolveEnv(state: ClusterState, pod: Pod, containerName: string): Record<string, string> {
  const spec = pod.spec.containers.find((c) => c.name === containerName);
  if (spec === undefined) return {};
  return pod.status.containerStatuses.find((c) => c.name === containerName)?.env ?? liveEnv(state, pod, spec);
}
