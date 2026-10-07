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
export function appLog(state: ClusterState, spec: ContainerSpec, env: Readonly<Record<string, string>>, fresh?: boolean): string[] | null {
  const image = imageOf(state, spec);
  if (image === undefined) return null;
  const pg = image.pg === undefined || fresh === undefined ? [] : fresh ? PG_INIT : PG_SKIP;
  return [...(image.bootLog ?? []), ...pg, ...(appExit(state, spec, env) ?? image.startLog)];
}
