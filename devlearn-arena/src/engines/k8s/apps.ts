import { fromRegistry, normalizeRef, PG_INIT, PG_SKIP, type Image } from '@/engines/container/container';
import type { ClusterState, ContainerSpec } from './types';

/**
 * クラスタの Pod の中で動くアプリの振る舞い。置き場（state.images）を持つクラスタ（クラスタを操作する機械）では、
 * コンテナの模擬（src/engines/container）と同じイメージの定義を使う: 起動の行・要る環境変数・動き出した時のログ
 */
function imageOf(state: ClusterState, spec: ContainerSpec): Image | undefined {
  return state.images === undefined ? undefined : fromRegistry(normalizeRef(spec.image));
}

/** 動き出してすぐ止まる時の、原因の行（要る環境変数が無いか空）。止まらなければ null */
export function appExit(state: ClusterState, spec: ContainerSpec, env: Readonly<Record<string, string>>): readonly string[] | null {
  const need = imageOf(state, spec)?.requiresEnv;
  if (need === undefined) return null;
  return (env[need.name] ?? '') === '' ? need.error : null;
}

/**
 * 最後に動かした時のログ（起動の行と、止まった原因か動き出した時の行）。置き場のイメージでなければ null。
 * DB のイメージは、データを書く場所が空だった（fresh）なら最初の表を作った行、あれば作らずに使った行を先に出す
 */
export function appLog(state: ClusterState, spec: ContainerSpec, env: Readonly<Record<string, string>>, fresh?: boolean, warming = false): string[] | null {
  const image = imageOf(state, spec);
  if (image === undefined) return null;
  const pg = image.pg === undefined || fresh === undefined ? [] : fresh ? PG_INIT : PG_SKIP;
  // 待ち受けるまでの読み込みの途中なら、起動の行だけ。メモリの上限で止められるアプリは、最初の行の途中で止まる（コンテナの模擬と同じ）
  const started = overMemory(state, spec) ? image.startLog.slice(0, 1) : warming ? [] : image.startLog;
  return [...(image.bootLog ?? []), ...pg, ...(appExit(state, spec, env) ?? started)];
}

/** 何もしていないコンテナが使うメモリ（Mi） */
const IDLE_MEMORY = 3;

/** そのコンテナのアプリが使うメモリ（Mi）。イメージの中のプロセスの合計（無ければ少し） */
export function appMemory(spec: ContainerSpec): number {
  const procs = fromRegistry(normalizeRef(spec.image))?.procs;
  return procs === undefined ? IDLE_MEMORY : procs.reduce((a, p) => a + p.memory, 0);
}

/** メモリの上限より多く使うアプリか（本物は、上限を超えた所でカーネルが止める: OOMKilled・終了コード 137） */
export function overMemory(state: ClusterState, spec: ContainerSpec): boolean {
  const limit = spec.limits?.memory ?? 0;
  return state.images !== undefined && limit > 0 && appMemory(spec) > limit;
}
