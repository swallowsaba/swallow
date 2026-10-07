import { fromRegistry, normalizeRef, type Image } from '@/engines/container/container';
import { readTables, TABLES_FILE, type Tables } from '@/engines/container/pg';
import type { ClusterState, ContainerSpec, PersistentVolume, Pod } from './types';
import { key } from './types';

/**
 * Pod の中で書いた物の置き場所。本物と同じく、PVC で付けた場所に書けば PV（Pod の外）に残り、
 * それ以外はコンテナの書き込みの層に入って、Pod を作り直すと消える（docs/lessons/k8s.md k8s.i.03）
 */
export type Place = { kind: 'volume'; pv: string; rel: string } | { kind: 'layer'; path: string };

/** その場所（コンテナの中の絶対パス）に書く物が、どこに置かれるか */
export function placeOf(state: ClusterState, pod: Pod, spec: ContainerSpec, path: string): Place {
  const mount = spec.volumeMounts
    .filter((m) => path === m.mountPath || path.startsWith(`${m.mountPath.replace(/\/$/, '')}/`))
    .sort((a, b) => b.mountPath.length - a.mountPath.length)[0];
  const volume = mount === undefined ? undefined : pod.spec.volumes.find((v) => v.name === mount.name);
  if (mount !== undefined && volume?.kind === 'persistentVolumeClaim') {
    const pv = state.persistentVolumeClaims.get(key(pod.metadata.namespace, volume.claimName))?.status.volumeName;
    if (pv) return { kind: 'volume', pv, rel: path.slice(mount.mountPath.length).replace(/^\/+/, '') };
  }
  return { kind: 'layer', path };
}

/** その場所のファイルの中身（無ければ undefined）。volumes を渡せば、その PV の一覧から読む */
export function readAt(
  state: ClusterState, pod: Pod, index: number, path: string,
  volumes: ReadonlyMap<string, PersistentVolume> = state.persistentVolumes,
): string | undefined {
  const spec = pod.spec.containers[index];
  if (spec === undefined) return undefined;
  const place = placeOf(state, pod, spec, path);
  return place.kind === 'volume' ? volumes.get(place.pv)?.data?.[place.rel] : pod.status.containerStatuses[index]?.files?.[place.path];
}

/** ファイルを書いた後の Pod と PV の一覧（書き込みの層はその Pod の、PV は PV の中身に入る） */
export function writeAt(
  state: ClusterState, pod: Pod, index: number, files: Readonly<Record<string, string>>,
  volumes: ReadonlyMap<string, PersistentVolume> = state.persistentVolumes,
): { pod: Pod; volumes: Map<string, PersistentVolume> } {
  const spec = pod.spec.containers[index];
  const nextVolumes = new Map(volumes);
  let layer: Record<string, string> = { ...(pod.status.containerStatuses[index]?.files ?? {}) };
  for (const [path, content] of Object.entries(files)) {
    const place = spec === undefined ? ({ kind: 'layer', path } as const) : placeOf(state, pod, spec, path);
    if (place.kind === 'layer') {
      layer = { ...layer, [place.path]: content };
      continue;
    }
    const pv = nextVolumes.get(place.pv);
    if (pv !== undefined) nextVolumes.set(place.pv, { ...pv, data: { ...(pv.data ?? {}), [place.rel]: content } });
  }
  const statuses = pod.status.containerStatuses.map((c, i) => (i === index ? { ...c, files: layer } : c));
  return { pod: { ...pod, status: { ...pod.status, containerStatuses: statuses } }, volumes: nextVolumes };
}

/** DB（PostgreSQL）のイメージなら、その決まり（データを書く場所・DB の名前・最初の表）。置き場を持つクラスタだけ */
export function pgOf(state: ClusterState, spec: ContainerSpec): NonNullable<Image['pg']> | undefined {
  return state.images === undefined ? undefined : fromRegistry(normalizeRef(spec.image))?.pg;
}

/** DB の Pod の今の表（データを書く場所に無ければ、最初の表） */
export function pgTables(state: ClusterState, pod: Pod, index = 0): Tables | undefined {
  const spec = pod.spec.containers[index];
  const pg = spec === undefined ? undefined : pgOf(state, spec);
  if (pg === undefined) return undefined;
  const text = readAt(state, pod, index, `${pg.dataDir}/${TABLES_FILE}`);
  return text === undefined ? pg.seed : readTables(text);
}
